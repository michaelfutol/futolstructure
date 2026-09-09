# ETABS Self-Weight Acceptance

**Project:** Bacacay P2 / `Bacacay 2-Storey Mix-use_2026-09-03_COLUMNATION-FROZEN.fstr`
**Evidence date:** 2026-09-09
**Scope:** FutolStructure ETABS export load-pattern ownership

## Decision

Option A is implemented:

- `FS_DEAD` owns structural self-weight with multiplier `1.0`.
- ETABS default `Dead` remains available but has self-weight multiplier `0.0`.
- No ULS combination references the `Dead` load case. ULS dead load is carried by `FS_DEAD` plus the explicitly exported dead-load patterns.

This prevents a later user-created or imported combination from counting the same structural self-weight through both default `Dead` and FutolStructure `FS_DEAD`.

## Source change

The native ETABS OAPI export disables the seeded `Dead` pattern after `NewBlank()` and before adding the FutolStructure patterns. The older E2K text path is governed by the same `Dead=0.0` policy.

## Native artifact

Output directory:

`D:\Users\mfutol\Documents\FutolStructure ETABS Exports\LOAD_CLEANUP_RERUN\INCOMING_FUTOLSTRUCTURE`

Generated files:

- `FutolStructure_ETABS_Bacacay-2-Storey-Mix-use_2026-09-03_COLUMNATION-FROZEN_2026-09-09_202849.EDB`
- Matching `.e2k` source export and `_audit.json` evidence

EDB SHA-256:

`DC312B38E39E340968042FCE33E0D94CF377862C7DCD811EAEBD32038F110678`

## Acceptance evidence

The saved native ETABS E2K representation contains:

```text
LOADPATTERN "Dead"    TYPE "Dead"  SELFWEIGHT 0
LOADPATTERN "FS_DEAD" TYPE "Dead"  SELFWEIGHT 1
```

The exported ULS combinations reference `FS_DEAD` and do not reference the `Dead` load case. Therefore exactly one of the two candidate patterns owns structural self-weight, and the seed design combinations do not double-apply it.

Native ETABS evidence:

- analysis return code: `0`
- frame objects: `52`
- area objects: `12`
- modal case: `Modal`

Source validation:

```text
node v3/tools/check-fs.js --no-browser
```

Result: passed, including the source contract `FS_DEAD=1; Dead=0`.

## Scope boundary

This acceptance covers self-weight ownership only. Column orientation, SCWB, beam reinforcement, Phase-1 design, and wall/SDL magnitudes are unchanged and remain outside this fix.

No commit or push was performed.
