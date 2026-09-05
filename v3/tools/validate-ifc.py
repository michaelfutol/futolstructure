#!/usr/bin/env python3
"""Validate FutolStructure IFC2X3 datums, metadata, and physical geometry."""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate
from ifcopenshell.util.element import get_psets
from ifcopenshell.util.placement import get_local_placement


PSET_NAME = "Pset_FutolStructure"
PRODUCT_TYPES = ("IfcColumn", "IfcBeam", "IfcSlab", "IfcFooting", "IfcOpeningElement")


def parse_level(value: str) -> tuple[str, float]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("Expected NAME=ELEVATION, for example GF=101.2")
    name, elevation = value.split("=", 1)
    try:
        return name.strip(), float(elevation)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"Invalid level elevation: {value}") from exc


def pset_for(entity) -> dict:
    return get_psets(entity).get(PSET_NAME, {})


def number(value, fallback: float | None = None) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) else fallback


def world_geometry(settings, product) -> tuple[float, float, tuple[float, ...]]:
    shape = ifcopenshell.geom.create_shape(settings, product)
    vertices = tuple(float(value) for value in shape.geometry.verts)
    if len(vertices) < 3:
        raise ValueError("No tessellated vertices")
    z_values = vertices[2::3]
    return min(z_values), max(z_values), vertices


def geometry_key(vertices: tuple[float, ...], digits: int = 6) -> tuple[float, ...]:
    points = [
        tuple(round(value, digits) for value in vertices[index:index + 3])
        for index in range(0, len(vertices), 3)
    ]
    return tuple(value for point in sorted(points) for value in point)


def category_for(product, pset: dict) -> str:
    member_type = str(pset.get("MemberType") or "")
    if product.is_a("IfcFooting"):
        return "footings"
    if product.is_a("IfcColumn") and member_type == "Pedestal":
        return "pedestals"
    if product.is_a("IfcColumn"):
        return "columns"
    if product.is_a("IfcBeam") and member_type == "Foundation Tie Beam":
        return "tieBeams"
    if product.is_a("IfcBeam") and member_type in {"stair_beam", "landing_beam"}:
        return "stairBeams"
    if product.is_a("IfcBeam"):
        return "beams"
    if product.is_a("IfcSlab") and member_type in {"stair_flight_slab", "landing_slab"}:
        return "stairSlabs"
    if product.is_a("IfcSlab"):
        return "slabs"
    return "openings"


def validate_file(
    path: Path,
    expected_levels: list[tuple[str, float]],
    exact_level_set: bool,
    tolerance: float,
) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    model = ifcopenshell.open(str(path))

    schema_logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, schema_logger)
    for statement in schema_logger.statements:
        errors.append(f"IFC schema validation: {statement.get('message', statement)}")

    storeys = model.by_type("IfcBuildingStorey")
    level_names = [str(storey.Name or "") for storey in storeys]
    duplicate_level_names = sorted(
        name for name, count in Counter(level_names).items() if name and count > 1
    )
    if duplicate_level_names:
        errors.append(f"Duplicate level names: {duplicate_level_names}")

    levels: dict[str, float] = {}
    level_placements: dict[str, float] = {}
    for storey in storeys:
        name = str(storey.Name or "")
        elevation = number(storey.Elevation)
        placement_elevation = float(get_local_placement(storey.ObjectPlacement)[2][3])
        if elevation is None:
            errors.append(f"Storey {name!r} has no finite Elevation")
            continue
        levels[name] = elevation
        level_placements[name] = placement_elevation
        if abs(elevation - placement_elevation) > tolerance:
            errors.append(
                f"Storey {name!r} Elevation {elevation:.6f} differs from placement "
                f"{placement_elevation:.6f}"
            )

    expected_level_map = dict(expected_levels)
    for name, elevation in expected_levels:
        if name not in levels:
            errors.append(f"Expected storey {name!r} is missing")
        elif abs(levels[name] - elevation) > tolerance:
            errors.append(
                f"Storey {name!r} is at {levels[name]:.6f}; expected {elevation:.6f}"
            )
    if exact_level_set and set(levels) != set(expected_level_map):
        errors.append(
            f"Exported level set {sorted(levels)} differs from expected "
            f"{sorted(expected_level_map)}"
        )

    products = [
        product
        for product_type in PRODUCT_TYPES
        for product in model.by_type(product_type)
    ]
    global_ids = [str(product.GlobalId) for product in products]
    duplicate_global_ids = sorted(
        global_id for global_id, count in Counter(global_ids).items() if count > 1
    )
    if duplicate_global_ids:
        errors.append(f"Duplicate product GlobalIds: {duplicate_global_ids}")

    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    classifications: Counter[str] = Counter()
    geometry_created = 0
    foundation_geometry: dict[tuple[str, tuple[float, ...]], list[str]] = {}
    foundation_ids: list[str] = []
    records: list[dict] = []

    for product in products:
        pset = pset_for(product)
        member_type = str(pset.get("MemberType") or "")
        source_id = str(pset.get("FutolStructureId") or product.Name or product.GlobalId)
        category = category_for(product, pset)
        classifications[category] += 1
        if not pset:
            errors.append(f"{product.is_a()} {source_id!r} has no {PSET_NAME}")
        for metadata_name in (
            "FS_ProjectId",
            "FS_RevisionId",
            "FS_BuildId",
            "FS_SchemaVersion",
        ):
            if not str(pset.get(metadata_name) or "").strip():
                errors.append(
                    f"{product.is_a()} {source_id!r} is missing {metadata_name}"
                )

        bottom = number(pset.get("FS_BottomElevation"))
        top = number(pset.get("FS_TopElevation"))
        try:
            z_min, z_max, vertices = world_geometry(settings, product)
            geometry_created += 1
            if bottom is not None and abs(z_min - bottom) > tolerance:
                errors.append(
                    f"{category}:{source_id} geometry bottom {z_min:.6f} "
                    f"!= property {bottom:.6f}"
                )
            if top is not None and abs(z_max - top) > tolerance:
                errors.append(
                    f"{category}:{source_id} geometry top {z_max:.6f} "
                    f"!= property {top:.6f}"
                )
            if category in {"footings", "pedestals", "tieBeams"}:
                foundation_ids.append(source_id)
                key = (category, geometry_key(vertices))
                foundation_geometry.setdefault(key, []).append(source_id)
        except Exception as exc:  # pragma: no cover - runtime-specific detail
            errors.append(f"Geometry generation failed for {product.is_a()} {source_id}: {exc}")

        records.append({
            "ifcType": product.is_a(),
            "category": category,
            "id": source_id,
            "memberType": member_type,
            "bottomElevation": bottom,
            "topElevation": top,
            "supportedColumnId": str(pset.get("FS_SupportedColumnId") or ""),
            "projectId": str(pset.get("FS_ProjectId") or ""),
            "revisionId": str(pset.get("FS_RevisionId") or ""),
            "buildId": str(pset.get("FS_BuildId") or ""),
        })

    duplicate_foundation_ids = sorted(
        source_id for source_id, count in Counter(foundation_ids).items() if count > 1
    )
    if duplicate_foundation_ids:
        errors.append(f"Duplicate foundation IDs: {duplicate_foundation_ids}")
    duplicate_foundation_geometry = [
        ids for ids in foundation_geometry.values() if len(ids) > 1
    ]
    if duplicate_foundation_geometry:
        errors.append(f"Duplicate foundation geometry: {duplicate_foundation_geometry}")

    building_psets = [pset_for(building) for building in model.by_type("IfcBuilding")]
    project_metadata = next(
        (pset for pset in building_psets if pset.get("MemberType") == "Project Metadata"),
        {},
    )
    grade = number(project_metadata.get("FS_GradeElevation"))
    ground_floor = number(project_metadata.get("FS_GroundFloorElevation"))
    base_support = number(project_metadata.get("FS_BaseSupportElevation"))
    footing_bottom = number(project_metadata.get("FS_FootingBottomElevation"))
    footing_top = number(project_metadata.get("FS_FootingTopElevation"))
    for label, value in (
        ("FS_GradeElevation", grade),
        ("FS_GroundFloorElevation", ground_floor),
        ("FS_BaseSupportElevation", base_support),
        ("FS_FootingBottomElevation", footing_bottom),
        ("FS_FootingTopElevation", footing_top),
    ):
        if value is None:
            errors.append(f"Building metadata has no finite {label}")

    super_columns = [record for record in records if record["category"] == "columns"]
    lowest_column_bottom = min(
        (
            record["bottomElevation"]
            for record in super_columns
            if record["bottomElevation"] is not None
        ),
        default=None,
    )
    if base_support is not None and lowest_column_bottom is not None:
        if abs(lowest_column_bottom - base_support) > tolerance:
            errors.append(
                f"Lowest column bottom {lowest_column_bottom:.6f} does not match "
                f"base support {base_support:.6f}"
            )
        if abs(base_support) > tolerance and abs(lowest_column_bottom) <= tolerance:
            errors.append("A nonzero base support produced a column bottom at 0.00")

    footing_records = [record for record in records if record["category"] == "footings"]
    pedestal_records = [record for record in records if record["category"] == "pedestals"]
    footing_by_column = {
        record["supportedColumnId"]: record for record in footing_records
    }
    pedestal_by_column = {
        record["supportedColumnId"]: record for record in pedestal_records
    }
    if footing_records:
        if len(pedestal_records) != len(footing_records):
            errors.append("Every isolated footing must have exactly one pedestal")
        for column_id, footing in footing_by_column.items():
            pedestal = pedestal_by_column.get(column_id)
            if not pedestal:
                errors.append(f"Footing support {column_id!r} has no matching pedestal")
                continue
            if (
                footing["topElevation"] is not None
                and pedestal["bottomElevation"] is not None
                and abs(footing["topElevation"] - pedestal["bottomElevation"]) > tolerance
            ):
                errors.append(f"Footing/pedestal vertical gap at {column_id!r}")
            if (
                base_support is not None
                and pedestal["topElevation"] is not None
                and abs(pedestal["topElevation"] - base_support) > tolerance
            ):
                errors.append(f"Pedestal at {column_id!r} does not end at BASE")
    elif pedestal_records or classifications["tieBeams"]:
        errors.append("Pedestals or tie beams exist without isolated footings")

    if footing_top is not None:
        for record in records:
            if (
                record["category"] == "tieBeams"
                and record["bottomElevation"] is not None
                and abs(record["bottomElevation"] - footing_top) > tolerance
            ):
                errors.append(
                    f"Tie beam {record['id']!r} is not seated at the governed footing top"
                )

    build_ids = sorted({record["buildId"] for record in records})
    project_ids = sorted({record["projectId"] for record in records})
    revision_ids = sorted({record["revisionId"] for record in records})
    if len(build_ids) != 1:
        errors.append(f"Products do not share one FS_BuildId: {build_ids}")
    if len(project_ids) != 1:
        errors.append(f"Products do not share one FS_ProjectId: {project_ids}")
    if len(revision_ids) != 1:
        errors.append(f"Products do not share one FS_RevisionId: {revision_ids}")

    return {
        "ok": not errors,
        "file": str(path.resolve()),
        "schema": model.schema,
        "schemaValidationStatements": len(schema_logger.statements),
        "levels": levels,
        "levelPlacements": level_placements,
        "verticalDatums": {
            "gradeElevation": grade,
            "groundFloorElevation": ground_floor,
            "baseSupportElevation": base_support,
            "footingBottomElevation": footing_bottom,
            "footingTopElevation": footing_top,
            "lowestColumnBottomElevation": lowest_column_bottom,
        },
        "counts": {
            "storeys": len(storeys),
            **{name: classifications[name] for name in (
                "columns",
                "beams",
                "slabs",
                "footings",
                "pedestals",
                "tieBeams",
                "stairBeams",
                "stairSlabs",
                "openings",
            )},
            "products": len(products),
            "geometryCreated": geometry_created,
        },
        "metadata": {
            "buildIds": build_ids,
            "projectIds": project_ids,
            "revisionIds": revision_ids,
        },
        "duplicateGlobalIds": duplicate_global_ids,
        "duplicateLevelNames": duplicate_level_names,
        "duplicateFoundationIds": duplicate_foundation_ids,
        "duplicateFoundationGeometry": duplicate_foundation_geometry,
        "warnings": warnings,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ifc", type=Path, help="IFC file to validate")
    parser.add_argument(
        "--expect-level",
        action="append",
        default=[],
        type=parse_level,
        metavar="NAME=ELEVATION",
        help="Require an exact named level elevation; may be repeated",
    )
    parser.add_argument(
        "--exact-level-set",
        action="store_true",
        help="Reject additional or missing level names",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=1e-5,
        help="Elevation and geometry tolerance in metres",
    )
    args = parser.parse_args()
    if not args.ifc.is_file():
        parser.error(f"IFC file not found: {args.ifc}")
    result = validate_file(
        args.ifc,
        args.expect_level,
        args.exact_level_set,
        args.tolerance,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
