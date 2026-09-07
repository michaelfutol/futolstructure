# STAAD Native Engine Gate

**Date:** 2026-09-06  
**Scope:** FutolStructure only  
**Source branch:** `feature/fs-125-shared-analytical-inputs`  
**STAAD installation:** STAAD.Pro 2024 (`24.00.02.354`)

## Result

The native STAAD analysis/readback gate is **passed with two concrete-design cover warnings** after the user activated the installed Bentley license. The earlier exit-code `8` condition was an environment/licensing startup failure, not a FutolStructure geometry failure.

## Evidence

| Test | Input | Result |
| --- | --- | --- |
| FutolStructure Bacacay export | 33 joints, 52 frame members, 12 plates, 34 `MEMBER OFFSET` members | STAAD exit code `100`; 0 errors; 2 design warnings; `.ANL` and native result files generated |
| Same Bacacay export without design block | Dated copy | Exit code `8`; no native artifact |
| Same Bacacay export without offset block | Dated copy | Exit code `8`; no native artifact |
| Independent minimal STAAD model | 2 joints, 1 concrete member, fixed support, selfweight, `PERFORM ANALYSIS` | STAAD exit code `100`; 0 warnings; 0 errors; `.ANL` and native result files generated |

The successful reruns used Bentley's documented batch form:

```text
SProStaad.exe STAAD <input_file.std> /s
```

The installed executable is:

```text
C:\Program Files\Bentley\Engineering\STAAD.Pro 2024\STAAD\SProStaad\SProStaad.exe
```

The licensed dated test copies and native result files are under:

```text
output\acceptance\fs125-bacacay-2026-09-06\staad-native-rerun\licensed-20260906\
```

## Native Bacacay readback

| Check | Result |
| --- | --- |
| Problem statistics | 33 joints, 52 members, 12 plates, 9 supports |
| Primary/combinations | 2 primary load cases, 2 load combinations |
| Dead applied/reaction Y | `-1134.89 / +1134.89 kN` |
| Live applied/reaction Y | `-180.36 / +180.36 kN` |
| Analysis engine | 64-bit in-core advanced math solver |
| Analysis errors | 0 |
| Analysis warnings | 2 |
| Concrete design | Completed through `END CONCRETE DESIGN` |

The two warnings concern STAAD's default side clear cover for narrow edge-beam members 50 and 52. STAAD reset those values to its default. This does not invalidate the analysis run, but explicit governed beam-cover parameters must be added and separately accepted before concrete-design results are treated as final.

## Current interpretation

- FutolStructure's shared geometry, plate, support, load, and `MEMBER OFFSET` payload is accepted by STAAD.Pro 2024.
- ETABS and STAAD native analysis acceptance now both pass for the dated Bacacay geometry.
- Native concrete-design acceptance remains conditional on governing clear-cover parameters and reviewing member design results.
- Revit IFC inspection remains a separate native coordination gate.

No source model, original `.fstr`, original `.std`, or SolverLink material was modified.
