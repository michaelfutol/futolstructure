#!/usr/bin/env python3
"""Run the governed FutolStructure PyNite gravity adapter.

This runner consumes a FutolStructure.AnalysisRequest.v1 wrapped in
FutolStructure.PyNiteRunRequest.v1. It writes a read-only result JSON and
never edits an FSTR project or applies solver results back to the source model.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
import math
import signal
import sys
import traceback
from pathlib import Path


RUN_REQUEST_CONTRACT = "FutolStructure.PyNiteRunRequest.v1"
REQUEST_CONTRACT = "FutolStructure.AnalysisRequest.v1"
RESULT_CONTRACT = "FutolStructure.PyNiteResult.v1"
MATERIAL_NAME = "FS_CONCRETE"
PINNED_PYNITE_VERSION = "3.0.0"


class RunnerError(RuntimeError):
    pass


class RunnerCancelled(RuntimeError):
    pass


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def append_event(events, name, **details):
    events.append({"at": utc_now(), "event": name, **details})


def check_cancelled(cancel_file, events):
    if cancel_file and Path(cancel_file).exists():
        append_event(events, "cancellation_detected", source="cancel_file")
        raise RunnerCancelled(f"Cancellation marker detected: {cancel_file}")


def as_list(value):
    return value if isinstance(value, list) else []


def finite(value, fallback=None):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if math.isfinite(number) else fallback


def positive(value, fallback=0.0):
    return max(0.0, finite(value, fallback) or 0.0)


def nonzero(value):
    parsed = finite(value)
    return parsed is not None and abs(parsed) > 1e-9


def consolidate_unsupported_features(findings):
    """Keep one blocker per feature/member while retaining all source paths."""
    consolidated = {}
    for finding in findings:
        feature = finding.get("feature") or "unknown_feature"
        element_id = finding.get("elementId") or ""
        key = (feature, element_id)
        existing = consolidated.get(key)
        if existing is None:
            path = finding.get("path") or ""
            consolidated[key] = {
                "feature": feature,
                "elementId": element_id,
                "path": path,
                "paths": [path] if path else [],
            }
        else:
            path = finding.get("path") or ""
            if path and path not in existing["paths"]:
                existing["paths"].append(path)
    return list(consolidated.values())


def summarize_unsupported_features(findings):
    counts = {}
    for finding in findings:
        feature = finding.get("feature") or "unknown_feature"
        counts[feature] = counts.get(feature, 0) + 1
    return ", ".join(
        f"{feature}={count} {'member' if count == 1 else 'members'}"
        for feature, count in counts.items()
    )


def collect_unsupported_features(model):
    """Return features the current PyNite mapping cannot preserve mechanically."""
    findings = []

    def inspect_offset_map(item, path, feature):
        offset = item.get(path) if isinstance(item, dict) else None
        if not isinstance(offset, dict):
            return
        for end in ("start", "end"):
            value = offset.get(end)
            if isinstance(value, dict) and any(nonzero(value.get(axis)) for axis in ("dx", "dy", "dz")):
                findings.append({
                    "feature": feature,
                    "elementId": item.get("id") or item.get("sourceId") or "",
                    "path": f"{path}.{end}",
                })

    for item in as_list(model.get("beams")):
        inspect_offset_map(item, "jointOffsets", "physical_member_joint_offsets")
        nested = item.get("jointOffsets") if isinstance(item, dict) else None
        if isinstance(nested, dict):
            for path in ("sharedSolverPlan", "sourcePlan"):
                plan = nested.get(path)
                if not isinstance(plan, dict):
                    continue
                for end in ("start", "end"):
                    value = plan.get(end)
                    if isinstance(value, dict) and any(nonzero(value.get(axis)) for axis in ("dx", "dy", "dz")):
                        findings.append({
                            "feature": "physical_member_joint_offsets",
                            "elementId": item.get("id") or item.get("sourceId") or "",
                            "path": f"jointOffsets.{path}.{end}",
                        })
        if nonzero(item.get("verticalInsertionOffsetM")):
            findings.append({
                "feature": "vertical_member_insertion_offsets",
                "elementId": item.get("id") or item.get("sourceId") or "",
                "path": "verticalInsertionOffsetM",
            })
        z1 = finite(item.get("z1", item.get("startZ")))
        z2 = finite(item.get("z2", item.get("endZ")))
        if z1 is not None and z2 is not None and abs(z2 - z1) > 1e-9:
            findings.append({
                "feature": "sloped_members",
                "elementId": item.get("id") or item.get("sourceId") or "",
                "path": "z1/z2",
            })

    for item in as_list(model.get("columns")):
        x1 = finite(item.get("x1", item.get("startX")))
        y1 = finite(item.get("y1", item.get("startY")))
        x2 = finite(item.get("x2", item.get("endX")))
        y2 = finite(item.get("y2", item.get("endY")))
        if all(value is not None for value in (x1, y1, x2, y2)) and (abs(x2 - x1) > 1e-9 or abs(y2 - y1) > 1e-9):
            findings.append({
                "feature": "sloped_members",
                "elementId": item.get("id") or item.get("sourceId") or "",
                "path": "x/y endpoints",
            })
    return consolidate_unsupported_features(findings)


def load_payload(path):
    try:
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as error:
        raise RunnerError(f"Could not read PyNite request JSON: {error}") from error
    if payload.get("contract") == RUN_REQUEST_CONTRACT and payload.get("request"):
        return payload, payload["request"]
    return {}, payload


def preflight(request):
    if request.get("contract") != REQUEST_CONTRACT:
        raise RunnerError("PyNite requires FutolStructure.AnalysisRequest.v1.")
    blockers = list(as_list(request.get("readiness", {}).get("blockers")))
    model = request.get("canonicalModel") or {}
    validation = model.get("analysisInputValidation") or {}
    blockers.extend(as_list(validation.get("blockers")))
    if validation.get("solverReady") is not True:
        blockers.append("Shared analytical inputs are not solver-ready.")
    if not as_list(request.get("loads", {}).get("combinations")):
        blockers.append("No governed load combinations are available.")
    if not as_list(model.get("supports")):
        blockers.append("No explicit base supports are available.")
    unsupported = collect_unsupported_features(model)
    if unsupported:
        blockers.append(
            "PyNite feature scope is unsupported until Phase 1B mapping is implemented: "
            + summarize_unsupported_features(unsupported)
            + "."
        )
    unique = list(dict.fromkeys(str(item) for item in blockers if item))
    if unique:
        raise RunnerError("PyNite request is blocked: " + " | ".join(unique))
    return model


class NodeRegistry:
    def __init__(self, model):
        self.model = model
        self.nodes = {}
        self.names = {}

    @staticmethod
    def key(x, y, z):
        return f"{x:.6f}|{y:.6f}|{z:.6f}"

    def add(self, x, y, z):
        x = finite(x)
        y = finite(y)
        z = finite(z)
        if x is None or y is None or z is None:
            raise RunnerError("A PyNite node has an invalid coordinate.")
        key = self.key(x, y, z)
        if key not in self.names:
            name = f"N{len(self.names) + 1}"
            self.names[key] = name
            self.nodes[name] = {"id": name, "x": x, "y": y, "z": z}
            self.model.add_node(name, x, y, z)
        return self.names[key]


def section_dimensions(section):
    b = max(0.075, finite(section.get("bMm"), 250.0) / 1000.0)
    h = max(0.075, finite(section.get("hMm"), 400.0) / 1000.0)
    area = b * h
    iy = b * h ** 3 / 12.0
    iz = h * b ** 3 / 12.0
    torsion = b * h * (b * b + h * h) / 12.0
    return area, iy, iz, max(torsion, 1e-9)


def build_material_and_sections(model, source_model):
    fc = max(1.0, finite(source_model.get("fcMPa"), 21.0))
    elastic_mpa = 4700.0 * math.sqrt(fc)
    poisson = 0.2
    shear_mpa = elastic_mpa / (2.0 * (1.0 + poisson))
    # Geometry and loads are kN/m, so PyNite must receive stiffness in kN/m2.
    elastic = elastic_mpa * 1000.0
    shear = shear_mpa * 1000.0
    density = max(0.001, finite(source_model.get("concreteDensity"), 24.0))
    model.add_material(MATERIAL_NAME, elastic, shear, poisson, density)
    sections = {}
    for item in as_list(source_model.get("frameSections")):
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        area, iy, iz, torsion = section_dimensions(item)
        model.add_section(name, area, iy, iz, torsion)
        sections[name] = {
            "name": name,
            "bMm": finite(item.get("bMm"), 250.0),
            "hMm": finite(item.get("hMm"), 400.0),
            "areaM2": area,
            "iyM4": iy,
            "izM4": iz,
            "jM4": torsion,
        }
    return {
        "name": MATERIAL_NAME,
        "fcMPa": fc,
        "elasticModulusMPa": elastic_mpa,
        "elasticModulusKNM2": elastic,
        "poisson": poisson,
        "shearModulusMPa": shear_mpa,
        "shearModulusKNM2": shear,
        "densityKNM3": density,
    }, sections


def frame_endpoints(item, kind):
    if kind == "column":
        x = finite(item.get("x"))
        y = finite(item.get("y"))
        return x, y, finite(item.get("z1")), x, y, finite(item.get("z2"))
    return (
        finite(item.get("x1")),
        finite(item.get("y1")),
        finite(item.get("z", item.get("floorElevationM"))),
        finite(item.get("x2")),
        finite(item.get("y2")),
        finite(item.get("z", item.get("floorElevationM"))),
    )


def add_frame_members(model, source_model, registry, sections, warnings, mapping_audit=None):
    mapping_audit = mapping_audit if mapping_audit is not None else {"skipped": []}
    member_names = {}
    source_names = {}
    members = []

    def add_member(item, kind, prefix):
        source_id = str(item.get("id") or item.get("sourceId") or "")
        if not source_id:
            warnings.append(f"{kind} without an ID was skipped.")
            mapping_audit["skipped"].append({"kind": kind, "reason": "missing_id"})
            return
        x1, y1, z1, x2, y2, z2 = frame_endpoints(item, kind)
        coords = (x1, y1, z1, x2, y2, z2)
        if any(value is None for value in coords):
            warnings.append(f"{source_id}: invalid frame coordinates; skipped.")
            mapping_audit["skipped"].append({"kind": kind, "elementId": source_id, "reason": "invalid_coordinates"})
            return
        length = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2)
        if length <= 1e-6:
            warnings.append(f"{source_id}: zero-length frame; skipped.")
            mapping_audit["skipped"].append({"kind": kind, "elementId": source_id, "reason": "zero_length"})
            return
        start = registry.add(x1, y1, z1)
        end = registry.add(x2, y2, z2)
        name = f"{prefix}-{len(members) + 1}"
        section_name = str(item.get("section") or "FS_DEFAULT_250x400")
        if section_name not in sections:
            default_section = {
                "name": section_name,
                "bMm": finite(item.get("sourceSizeBmm"), 250.0),
                "hMm": finite(item.get("sourceSizeHmm"), 400.0),
            }
            area, iy, iz, torsion = section_dimensions(default_section)
            model.add_section(section_name, area, iy, iz, torsion)
            sections[section_name] = {
                "name": section_name,
                "bMm": default_section["bMm"],
                "hMm": default_section["hMm"],
                "areaM2": area,
                "iyM4": iy,
                "izM4": iz,
                "jM4": torsion,
            }
        rotation = finite(item.get("orientationDeg"), 0.0) if kind == "column" else 0.0
        model.add_member(name, start, end, MATERIAL_NAME, section_name, rotation=rotation)
        record = {
            "id": name,
            "sourceId": source_id,
            "kind": kind,
            "startNode": start,
            "endNode": end,
            "section": section_name,
            "sourceOrientationDeg": rotation,
        }
        members.append(record)
        member_names[source_id] = name
        source_names[str(item.get("sourceId") or source_id)] = name

    for item in as_list(source_model.get("columns")):
        add_member(item, "column", "C")
    for item in as_list(source_model.get("beams")):
        add_member(item, "beam", "B")

    for item in as_list(source_model.get("stairBeams")):
        if item.get("solverExportReadiness") == "solver-ready":
            add_member(item, "stair_beam", "SB")
        else:
            warnings.append(f"{item.get('id', 'stair beam')}: stair frame is not solver-ready and was skipped.")

    return members, member_names, source_names


def add_quad_members(model, source_model, registry, warnings, mapping_audit=None):
    mapping_audit = mapping_audit if mapping_audit is not None else {"skipped": []}
    slab_names = {}
    slabs = []
    for item in as_list(source_model.get("slabs")):
        points = as_list(item.get("points"))
        if len(points) != 4:
            warnings.append(f"{item.get('id', 'slab')}: slab does not have four points; skipped.")
            mapping_audit["skipped"].append({"kind": "slab", "elementId": item.get("id"), "reason": "not_four_points"})
            continue
        node_ids = []
        try:
            for point in points:
                z = finite(point.get("z"), finite(item.get("z", item.get("floorElevationM")), 0.0))
                node_ids.append(registry.add(point.get("x"), point.get("y"), z))
        except RunnerError as error:
            warnings.append(f"{item.get('id', 'slab')}: {error}; skipped.")
            mapping_audit["skipped"].append({"kind": "slab", "elementId": item.get("id"), "reason": "invalid_coordinates"})
            continue
        name = f"Q{len(slabs) + 1}"
        thickness = max(0.075, finite(item.get("thicknessMm"), 150.0) / 1000.0)
        model.add_quad(name, node_ids[0], node_ids[1], node_ids[2], node_ids[3], thickness, MATERIAL_NAME)
        record = {"id": name, "sourceId": str(item.get("id") or item.get("sourceId") or ""), "thicknessM": thickness}
        slabs.append(record)
        slab_names[record["sourceId"]] = name

    for item in as_list(source_model.get("stairSlabs")):
        if item.get("solverExportReadiness") != "solver-ready":
            warnings.append(f"{item.get('id', 'stair slab')}: stair shell is not solver-ready and was skipped.")
            mapping_audit["skipped"].append({"kind": "stair_slab", "elementId": item.get("id"), "reason": "not_solver_ready"})
            continue
        points = as_list(item.get("points"))
        if len(points) != 4:
            warnings.append(f"{item.get('id', 'stair slab')}: stair shell is not a four-node quad; skipped.")
            mapping_audit["skipped"].append({"kind": "stair_slab", "elementId": item.get("id"), "reason": "not_four_points"})
            continue
        try:
            node_ids = [
                registry.add(point.get("x"), point.get("y"), finite(point.get("z"), 0.0))
                for point in points
            ]
        except RunnerError as error:
            warnings.append(f"{item.get('id', 'stair slab')}: {error}; skipped.")
            mapping_audit["skipped"].append({"kind": "stair_slab", "elementId": item.get("id"), "reason": "invalid_coordinates"})
            continue
        name = f"SQ{len(slabs) + 1}"
        thickness = max(0.075, finite(item.get("thicknessMm"), 150.0) / 1000.0)
        model.add_quad(name, node_ids[0], node_ids[1], node_ids[2], node_ids[3], thickness, MATERIAL_NAME)
        record = {"id": name, "sourceId": str(item.get("id") or ""), "thicknessM": thickness}
        slabs.append(record)
        slab_names[record["sourceId"]] = name
    return slabs, slab_names


def add_supports(model, source_model, registry, warnings, mapping_audit=None):
    mapping_audit = mapping_audit if mapping_audit is not None else {"skipped": []}
    records = []
    for support in as_list(source_model.get("supports")):
        try:
            node = registry.add(support.get("nodeX"), support.get("nodeY"), support.get("elevation"))
        except RunnerError as error:
            warnings.append(f"{support.get('id', 'support')}: {error}; skipped.")
            mapping_audit["skipped"].append({"kind": "support", "elementId": support.get("id"), "reason": "invalid_coordinates"})
            continue
        restraints = as_list(support.get("restraint"))
        flags = (restraints + [False] * 6)[:6]
        model.def_support(
            node,
            support_DX=bool(flags[0]),
            support_DY=bool(flags[1]),
            support_DZ=bool(flags[2]),
            support_RX=bool(flags[3]),
            support_RY=bool(flags[4]),
            support_RZ=bool(flags[5]),
        )
        records.append({"id": support.get("id"), "node": node, "restraint": flags})
    if not records:
        raise RunnerError("No valid supports could be mapped into PyNite.")
    return records


def add_loads(model, request, source_model, member_names, slab_names, warnings):
    inputs = source_model.get("analyticalInputs") or {}
    assignments = inputs.get("assignments") or {}
    applied = []
    unresolved = []

    model.add_member_self_weight("FZ", -1.0, "FS_DEAD")
    density = max(0.001, finite(source_model.get("concreteDensity"), 24.0))
    for slab in as_list(source_model.get("slabs")):
        element_id = str(slab.get("id") or slab.get("sourceId") or "")
        quad_name = slab_names.get(element_id)
        if not quad_name:
            continue
        thickness = max(0.075, finite(slab.get("thicknessMm"), 150.0) / 1000.0)
        pressure = density * thickness
        model.add_quad_surface_pressure(quad_name, -pressure, "FS_DEAD")
        applied.append({"elementId": element_id, "modelId": quad_name, "caseId": "FS_DEAD", "valueKPa": pressure, "source": "element_self_weight"})

    for assignment in as_list(assignments.get("beamLine")):
        element_id = str(assignment.get("elementId") or "")
        member_name = member_names.get(element_id)
        if not member_name:
            unresolved.append({"elementId": element_id, "caseId": assignment.get("caseId"), "reason": "member_not_mapped"})
            continue
        value = positive(assignment.get("value"))
        if value <= 0:
            continue
        case_id = str(assignment.get("caseId") or "FS_WALL")
        model.add_member_dist_load(member_name, "FZ", -value, -value, case=case_id)
        applied.append({"elementId": element_id, "modelId": member_name, "caseId": case_id, "valueKNm": value})

    for assignment in as_list(assignments.get("slabArea")) + as_list(assignments.get("stairArea")):
        element_id = str(assignment.get("elementId") or "")
        quad_name = slab_names.get(element_id)
        if not quad_name:
            unresolved.append({"elementId": element_id, "caseId": assignment.get("caseId"), "reason": "quad_not_mapped"})
            continue
        value = positive(assignment.get("value"))
        if value <= 0:
            continue
        case_id = str(assignment.get("caseId") or "FS_SDL")
        model.add_quad_surface_pressure(quad_name, -value, case_id)
        applied.append({"elementId": element_id, "modelId": quad_name, "caseId": case_id, "valueKPa": value})

    for item in unresolved:
        warnings.append(
            f"{item['elementId']}: {item['caseId']} load was not applied because its target geometry was not mapped."
        )

    combinations = []
    for combo in as_list(request.get("loads", {}).get("combinations")):
        factors = {
            str(factor.get("caseId")): finite(factor.get("factor"), 0.0)
            for factor in as_list(combo.get("factors"))
            if factor.get("caseId")
        }
        if not factors:
            warnings.append(f"{combo.get('id', 'combination')}: no factors; skipped.")
            continue
        combo_id = str(combo.get("id") or f"Combo-{len(combinations) + 1}")
        model.add_load_combo(combo_id, factors)
        combinations.append({"id": combo_id, "factors": factors})

    if not combinations:
        raise RunnerError("No valid load combinations could be mapped into PyNite.")
    return {"applied": applied, "unresolved": unresolved, "combinations": combinations}


def value_from(result_object, attribute, combo):
    values = getattr(result_object, attribute, {})
    if isinstance(values, dict):
        return finite(values.get(combo))
    return None


def collect_results(model, members, supports, combinations):
    combo_ids = [item["id"] for item in combinations]
    nodes = []
    for name, node in model.nodes.items():
        nodes.append({
            "id": name,
            "x": finite(getattr(node, "X", None)),
            "y": finite(getattr(node, "Y", None)),
            "z": finite(getattr(node, "Z", None)),
            "results": {
                combo: {
                    "DX": value_from(node, "DX", combo),
                    "DY": value_from(node, "DY", combo),
                    "DZ": value_from(node, "DZ", combo),
                    "RX": value_from(node, "RX", combo),
                    "RY": value_from(node, "RY", combo),
                    "RZ": value_from(node, "RZ", combo),
                    "RxnFX": value_from(node, "RxnFX", combo),
                    "RxnFY": value_from(node, "RxnFY", combo),
                    "RxnFZ": value_from(node, "RxnFZ", combo),
                    "RxnMX": value_from(node, "RxnMX", combo),
                    "RxnMY": value_from(node, "RxnMY", combo),
                    "RxnMZ": value_from(node, "RxnMZ", combo),
                }
                for combo in combo_ids
            },
        })

    member_results = []
    for item in members:
        member = model.members.get(item["id"])
        if member is None:
            continue
        result = {"id": item["id"], "sourceId": item["sourceId"], "kind": item["kind"], "section": item["section"], "combinations": {}}
        for combo in combo_ids:
            try:
                result["combinations"][combo] = {
                    "maxAxialKN": finite(member.max_axial(combo)),
                    "maxShearFyKN": finite(member.max_shear("Fy", combo)),
                    "maxShearFzKN": finite(member.max_shear("Fz", combo)),
                    "maxMomentMyKNm": finite(member.max_moment("My", combo)),
                    "maxMomentMzKNm": finite(member.max_moment("Mz", combo)),
                    "maxDeflectionDyM": finite(member.max_deflection("dy", combo)),
                    "maxDeflectionDzM": finite(member.max_deflection("dz", combo)),
                }
            except Exception as error:
                result["combinations"][combo] = {"error": str(error)}
        member_results.append(result)

    reaction_sums = {}
    for combo in combo_ids:
        reaction_sums[combo] = {
            "FX": sum(value_from(model.nodes[support["node"]], "RxnFX", combo) or 0.0 for support in supports),
            "FY": sum(value_from(model.nodes[support["node"]], "RxnFY", combo) or 0.0 for support in supports),
            "FZ": sum(value_from(model.nodes[support["node"]], "RxnFZ", combo) or 0.0 for support in supports),
            "MX": sum(value_from(model.nodes[support["node"]], "RxnMX", combo) or 0.0 for support in supports),
            "MY": sum(value_from(model.nodes[support["node"]], "RxnMY", combo) or 0.0 for support in supports),
            "MZ": sum(value_from(model.nodes[support["node"]], "RxnMZ", combo) or 0.0 for support in supports),
        }

    return {"nodes": nodes, "members": member_results, "reactionSums": reaction_sums}


def run(request, raw_wrapper, events, cancel_file=None):
    check_cancelled(cancel_file, events)
    try:
        from Pynite import FEModel3D
    except ImportError as error:
        return {
            "contract": RESULT_CONTRACT,
            "status": "BLOCKED_DEPENDENCY",
            "solver": "PyNite",
            "message": "Install the pinned PyNiteFEA dependency before execution.",
            "error": str(error),
        }, 2

    try:
        solver_version = importlib.metadata.version("PyNiteFEA")
    except importlib.metadata.PackageNotFoundError:
        return {
            "contract": RESULT_CONTRACT,
            "status": "BLOCKED_DEPENDENCY",
            "solver": "PyNite",
            "message": f"Install the pinned PyNiteFEA dependency ({PINNED_PYNITE_VERSION}) before execution.",
        }, 2
    if solver_version != PINNED_PYNITE_VERSION:
        return {
            "contract": RESULT_CONTRACT,
            "status": "BLOCKED_DEPENDENCY",
            "solver": "PyNite",
            "solverVersion": solver_version,
            "requiredVersion": PINNED_PYNITE_VERSION,
            "message": f"PyNiteFEA {solver_version} is installed; the governed runner requires {PINNED_PYNITE_VERSION}.",
        }, 2

    source_model = preflight(request)
    append_event(events, "preflight_completed")
    check_cancelled(cancel_file, events)
    warnings = list(dict.fromkeys(as_list(request.get("readiness", {}).get("warnings"))))
    model = FEModel3D()
    registry = NodeRegistry(model)
    material, sections = build_material_and_sections(model, source_model)
    mapping_audit = {"skipped": []}
    frame_members, member_names, source_names = add_frame_members(model, source_model, registry, sections, warnings, mapping_audit)
    slab_members, slab_names = add_quad_members(model, source_model, registry, warnings, mapping_audit)
    supports = add_supports(model, source_model, registry, warnings, mapping_audit)
    load_audit = add_loads(model, request, source_model, member_names | source_names, slab_names, warnings)
    if mapping_audit["skipped"] or load_audit["unresolved"]:
        details = {
            "skippedGeometry": mapping_audit["skipped"],
            "unresolvedLoads": load_audit["unresolved"],
        }
        raise RunnerError("PyNite mapping is incomplete; no analysis was run: " + json.dumps(details, separators=(",", ":")))
    append_event(
        events,
        "model_assembled",
        nodes=len(model.nodes),
        members=len(frame_members),
        quads=len(slab_members),
        supports=len(supports),
        appliedLoads=len(load_audit["applied"]),
        unresolvedLoads=len(load_audit["unresolved"]),
    )
    check_cancelled(cancel_file, events)
    model.merge_duplicate_nodes(tolerance=0.000001)
    try:
        append_event(events, "analysis_started", mode="linear_static_gravity")
        model.analyze_linear(log=False, check_stability=True, check_statics=True)
    except Exception as error:
        raise RunnerError(f"PyNite linear gravity analysis failed: {error}") from error
    results = collect_results(model, frame_members, supports, load_audit["combinations"])
    append_event(events, "analysis_completed", combinations=len(load_audit["combinations"]))
    return {
        "contract": RESULT_CONTRACT,
        "status": "COMPLETED",
        "solver": "PyNite",
        "solverVersion": solver_version,
        "mode": "linear_static_gravity",
        "source": {
            "contract": request.get("contract"),
            "provenance": request.get("source", {}),
            "rawWrapperContract": raw_wrapper.get("contract"),
        },
        "policy": {
            "resultPolicy": "compare-only-until-validated",
            "applyResults": False,
            "memberSelfWeightCase": "FS_DEAD",
            "surfaceLoadCases": ["FS_SDL", "FS_WALL", "FS_LIVE", "FS_STAIR_DL", "FS_STAIR_LL"],
            "foundation": "base restraints only; foundation geometry is not analyzed by this runner",
        },
        "assumptions": {
            "concreteElasticModulus": "E = 4700 * sqrt(fc) MPa, converted to kN/m2 for PyNite",
            "poisson": material["poisson"],
            "slabSelfWeight": "added explicitly as FS_DEAD quad surface pressure because PyNite member self-weight does not include plates/quads",
            "unmappedLoads": "block the run and are reported with source IDs; never guessed onto nearby members",
        },
        "counts": {
            "nodes": len(model.nodes),
            "members": len(frame_members),
            "quads": len(slab_members),
            "supports": len(supports),
            "combinations": len(load_audit["combinations"]),
            "appliedLoads": len(load_audit["applied"]),
            "unresolvedLoads": len(load_audit["unresolved"]),
        },
        "material": material,
        "sections": list(sections.values()),
        "loadAudit": load_audit,
        "mappingAudit": mapping_audit,
        "warnings": list(dict.fromkeys(warnings)),
        "results": results,
    }, 0


def main():
    parser = argparse.ArgumentParser(description="Run a governed FutolStructure PyNite gravity request.")
    parser.add_argument("--input", required=True, help="PyNite run-request JSON")
    parser.add_argument("--output", required=True, help="Result JSON path")
    parser.add_argument("--log", help="Optional structured execution-log JSON path")
    parser.add_argument("--cancel-file", help="Optional marker file; if present, stop without running analysis")
    args = parser.parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    events = []
    append_event(events, "runner_started", input=str(args.input), output=str(args.output))

    def request_cancellation(signum, _frame):
        append_event(events, "cancellation_detected", source="signal", signal=signum)
        raise RunnerCancelled(f"Cancellation signal received: {signum}")

    signal.signal(signal.SIGINT, request_cancellation)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_cancellation)
    try:
        wrapper, request = load_payload(args.input)
        append_event(events, "request_loaded", contract=request.get("contract", ""))
        result, code = run(request, wrapper, events, args.cancel_file)
    except RunnerCancelled as error:
        result, code = {
            "contract": RESULT_CONTRACT,
            "status": "CANCELLED",
            "solver": "PyNite",
            "message": str(error),
            "policy": {"applyResults": False},
        }, 130
    except RunnerError as error:
        result, code = {
            "contract": RESULT_CONTRACT,
            "status": "BLOCKED",
            "solver": "PyNite",
            "message": str(error),
        }, 2
    except Exception as error:
        result, code = {
            "contract": RESULT_CONTRACT,
            "status": "FAILED",
            "solver": "PyNite",
            "message": str(error),
            "traceback": traceback.format_exc(),
        }, 1
    output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    append_event(events, "runner_finished", status=result.get("status"), exitCode=code)
    if args.log:
        log_path = Path(args.log)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps({
            "contract": "FutolStructure.PyNiteExecutionLog.v1",
            "result": str(output),
            "events": events,
        }, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"status": result.get("status"), "output": str(output), "message": result.get("message", "")}))
    return code


if __name__ == "__main__":
    sys.exit(main())
