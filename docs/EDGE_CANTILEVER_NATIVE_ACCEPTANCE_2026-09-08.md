# FS-125 Edge/Cantilever Native Solver Acceptance

**Date:** 2026-09-08  
**Scope:** FutolStructure canonical-to-analytical export acceptance for the larger edge/cantilever fixture  
**Status:** Native ETABS and STAAD engine runs passed; no repository release performed

## Candidate

- Fixture: `canonical-edge-cantilever-v3`
- Source counts: 40 columns, 124 beams, 50 slabs
- Slab roles: 24 regular slabs, 26 cantilever slabs
- Cantilever edges represented: top, bottom, left, and right
- Analytical column cardinal: `5` (middle-center)
- Analytical beam cardinal: `8` (top-center)
- Canonical slab boundary retention: `50/50`
- Native solver geometry remains analytical; canonical slab boundaries and roles are retained for parity and traceability.

## ETABS 22 Native Acceptance

Artifacts:

```text
output/acceptance/fs125-edge-cantilever-2026-09-08/etabs-native-v3/FutolStructure_ETABS_Untitled-project_2026-09-08_175112.edb
output/acceptance/fs125-edge-cantilever-2026-09-08/etabs-native-v3/FutolStructure_ETABS_Untitled-project_2026-09-08_175112.e2k
output/acceptance/fs125-edge-cantilever-2026-09-08/etabs-native-v3/FutolStructure_ETABS_Untitled-project_2026-09-08_175112_audit.json
output/acceptance/fs125-edge-cantilever-2026-09-08/etabs-native-v3/FutolStructure_ETABS_Untitled-project_2026-09-08_175112_modal_participation.csv
```

| Check | Result |
| --- | --- |
| ETABS API model creation | PASS |
| Analysis return code | `0` |
| Source columns / native frames | `40 / 164 total frames` |
| Source beams / native areas | `124 / 50 areas` |
| Grid definition and grid-line round trip | PASS |
| FSTR story/beam/slab level contract | PASS |
| Column coordinate placement | PASS |
| Columnation/orientation parity | PASS |
| Column cardinal | `5` for all audited columns |
| Beam cardinal | `8` for all audited beams |
| Physical joint offsets | PASS; `29` distinct beam offset variants retained |
| Native frame section/cardinal/axis audit | PASS |
| Canonical slab boundary comparison | PASS; `0` failures |
| Modal participation output | PASS; 6 modes written |

The ETABS audit reports no geometry, placement, level, columnation, cardinal, offset, or canonical slab-boundary failures. The initial attempt using a relative output directory returned ETABS Save code `1` before creating artifacts; the repeat with an absolute output directory succeeded. This was an invocation-path issue, not a model-geometry result.

## STAAD.Pro 2024 Native Acceptance

Artifacts:

```text
output/acceptance/fs125-edge-cantilever-2026-09-08/staad-native-v3/FutolStructure_Edge_Cantilever_FS125_RC3_2026-09-08.std
output/acceptance/fs125-edge-cantilever-2026-09-08/staad-native-v3/FutolStructure_Edge_Cantilever_FS125_RC3_2026-09-08.anl
output/acceptance/fs125-edge-cantilever-2026-09-08/staad-native-v3/FutolStructure_Edge_Cantilever_FS125_RC3_2026-09-08.log
```

| Check | Result |
| --- | --- |
| Native STAAD engine | PASS |
| Exit code | `100` |
| Engine errors | `0` |
| Engine warnings | `26` design/cover warnings |
| Joints read by engine | `140` |
| Members read by engine | `164` |
| Shell plates read by engine | `50` |
| `ELEMENT INCIDENCES SHELL` | Present |
| `MEMBER OFFSET` | Present |
| Canonical slab metadata comments | `50/50` |
| Analysis completion | Reached `FINISH` |

Exit code `100` is the existing STAAD completion convention for this run; the log explicitly reports `Error Count: 0`. The 26 warnings are design/cover warnings and do not invalidate the geometry read or analysis completion. They remain a separate design-quality item for later cleanup.

`FS_CANONICAL_SLAB` comments are traceability metadata for the source FSTR boundary, role, edge, and source ID. STAAD analyses the same transformed shared solver points; the comments do not replace the shell geometry.

## Acceptance Conclusion

The current FS-125 canonical/analytical contract is accepted for this native fixture:

1. Canonical FSTR slab and cantilever boundaries are retained without replacing them with centroid/cardinal frame geometry.
2. ETABS analytical joints, cardinals, levels, columnation, offsets, and slab-area boundary comparisons pass native readback.
3. STAAD reads and analyses the corresponding frames and 50 shell plates, including physical member offsets and canonical slab metadata.
4. Foundation geometry remains intentionally outside the ETABS superstructure export and is handed off through IFC / SAFE / STAAD Foundation paths, while governed base restraints remain in the ETABS model.

This is acceptance evidence for the local candidate only. It does not authorize a commit, push, Vercel deployment, or installed-build update. A visual review inside ETABS and STAAD is still useful for presentation, but the native API/engine gates have passed.
