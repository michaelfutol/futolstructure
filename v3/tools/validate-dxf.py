#!/usr/bin/env python3
"""Strict parser and round-trip acceptance check for FutolStructure DXF output."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import tempfile

import ezdxf


def audit_entries(entries):
    return [
        {
            "code": getattr(entry, "code", None),
            "message": str(getattr(entry, "message", entry)),
        }
        for entry in entries
    ]


def document_snapshot(document):
    auditor = document.audit()
    modelspace = document.modelspace()
    entity_counts = Counter(entity.dxftype() for entity in modelspace)
    entity_layer_counts = Counter(str(entity.dxf.layer) for entity in modelspace)
    return {
        "dxfVersion": document.dxfversion,
        "layers": sorted(str(layer.dxf.name) for layer in document.layers),
        "linetypes": sorted(str(linetype.dxf.name) for linetype in document.linetypes),
        "entityCount": len(modelspace),
        "entityCounts": dict(sorted(entity_counts.items())),
        "entityLayerCounts": dict(sorted(entity_layer_counts.items())),
        "auditErrors": audit_entries(auditor.errors),
        "auditFixes": audit_entries(auditor.fixes),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--expected-version", default="AC1009")
    args = parser.parse_args()

    raw = args.path.read_bytes()
    lf_count = raw.count(b"\n")
    crlf_count = raw.count(b"\r\n")
    result = {
        "path": str(args.path.resolve()),
        "bytes": len(raw),
        "lineEndings": {
            "lf": lf_count,
            "crlf": crlf_count,
            "bareLf": lf_count - crlf_count,
            "bareCr": raw.count(b"\r") - crlf_count,
        },
        "validTerminator": raw.endswith(b"0\r\nEOF\r\n"),
    }

    try:
        document = ezdxf.readfile(args.path)
        original = document_snapshot(document)
        result["original"] = original

        with tempfile.TemporaryDirectory(prefix="futolstructure-dxf-roundtrip-") as temp_dir:
            roundtrip_path = Path(temp_dir) / "roundtrip.dxf"
            document.saveas(roundtrip_path)
            reopened = ezdxf.readfile(roundtrip_path)
            roundtrip = document_snapshot(reopened)
            result["roundTrip"] = roundtrip

        result["retained"] = {
            "entityCount": original["entityCount"] == roundtrip["entityCount"],
            "entityCounts": original["entityCounts"] == roundtrip["entityCounts"],
            "entityLayerCounts": original["entityLayerCounts"] == roundtrip["entityLayerCounts"],
            "layers": original["layers"] == roundtrip["layers"],
        }
        result["ok"] = all(
            (
                original["dxfVersion"] == args.expected_version,
                not original["auditErrors"],
                not original["auditFixes"],
                not roundtrip["auditErrors"],
                not roundtrip["auditFixes"],
                all(result["retained"].values()),
                result["lineEndings"]["bareLf"] == 0,
                result["lineEndings"]["bareCr"] == 0,
                result["validTerminator"],
            )
        )
    except Exception as error:  # Return machine-readable diagnostics to the Node gate.
        result["ok"] = False
        result["exception"] = f"{type(error).__name__}: {error}"

    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
