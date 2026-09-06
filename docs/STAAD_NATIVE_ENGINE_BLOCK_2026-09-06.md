# STAAD Native Engine Gate

**Date:** 2026-09-06  
**Scope:** FutolStructure only  
**Source branch:** `feature/fs-125-shared-analytical-inputs`  
**STAAD installation:** STAAD.Pro 2024 (`24.00.02.354`)

## Result

The native STAAD readback gate is **blocked by the local STAAD analysis runtime**. This is not currently attributable to FutolStructure geometry, column orientation, cardinal points, or member offsets.

## Evidence

| Test | Input | Result |
| --- | --- | --- |
| FutolStructure Bacacay export | 33 nodes, 52 frame members, 34 `MEMBER OFFSET` members | Exit code `8`; no native artifact |
| Same Bacacay export without design block | Dated copy | Exit code `8`; no native artifact |
| Same Bacacay export without offset block | Dated copy | Exit code `8`; no native artifact |
| Independent minimal STAAD model | 2 joints, 1 concrete member, fixed support, selfweight, `PERFORM ANALYSIS` | Exit code `8`; no native artifact |

The independent minimal model rules out the FutolStructure export payload as the primary cause. All runs used Bentley's documented batch form:

```text
SProStaad.exe STAAD <input_file.std> /s
```

The installed executable is:

```text
C:\Program Files\Bentley\Engineering\STAAD.Pro 2024\STAAD\SProStaad\SProStaad.exe
```

The dated test copies and their empty stdout/stderr captures are under:

```text
output\acceptance\fs125-bacacay-2026-09-06\staad-native-rerun\
```

## Current interpretation

- FutolStructure's internal STAAD gate still confirms the expected shared model counts and `MEMBER OFFSET` records.
- ETABS native acceptance remains passed for the same Bacacay geometry.
- STAAD native acceptance must remain **pending**, not passed.
- The likely next diagnostic is the local STAAD engine/licensing/runtime setup, including Bentley Connection Client licensing, analysis-engine startup, and the installed STAAD paging/runtime environment.

No source model, original `.fstr`, original `.std`, or SolverLink material was modified.
