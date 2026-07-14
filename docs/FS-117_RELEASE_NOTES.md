# FS-117 DXF R12 Hotfix

## Scope

FS-117 repairs the coordinated DXF package envelope without changing structural model geometry, analysis behavior, schedules, or BOQ generation.

## DXF Contract

- AutoCAD R12 ASCII (`AC1009`).
- Windows-safe CRLF line endings and a valid EOF terminator.
- Mandatory layer `0`.
- Standard `BYBLOCK`, `BYLAYER`, and `CONTINUOUS` linetypes.
- Corrected `CENTER2` pattern length and `HIDDEN2` support.
- `txt.shx` standard text style.
- No R2000-only layer lineweight group `370`.
- No unsupported R12 linetype alignment group `74`.

## Acceptance

Release acceptance requires:

1. Source and full browser regression.
2. Current three-floor Olango project regression.
3. Strict `ezdxf` open, audit, save, and reopen with zero errors or fixes.
4. Exact layer and entity retention after round trip.
5. AutoCAD 2025 Core Engine open/regenerate without recovery.
6. Visual inspection of the complete coordinated drawing package.

## Exclusions

Protected Project Revisions, historical helper scripts, broad UI changes, solver changes, and unrelated modeling changes are not part of FS-117.
