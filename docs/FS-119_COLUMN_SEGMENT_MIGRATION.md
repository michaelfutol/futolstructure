# FS-119 Column Segment Migration Contract

FutolStructure v3.16.119 introduces FSTR schema `0.2.0` for canonical
storey-by-storey column intent.

## Compatibility

- Minimum compatible application: FutolStructure `3.16.119`.
- Current FSTR schema: `0.2.0`.
- Current file payload version: `2.9`.
- Older project files remain loadable and are migrated in memory before
  calculation or save.
- Opening schema `0.2.0` projects in older FutolStructure builds is not
  guaranteed.
- A project with a schema newer than `0.2.0`, or with a higher declared
  minimum application version, is rejected. The current build will not
  silently open and downgrade it.

## Canonical Truth

`columnOverrides[].segmentOverrides[floorId]` is authoritative for each
physical column segment. Each entry records a stable segment ID, active state,
and intent.

When floor IDs are reindexed, segment IDs and termination-level references are
reconciled to the new IDs. A floor inserted above a governed termination, or
into a line removed on every storey, inherits the inactive canonical intent
instead of creating a new active segment.

The following legacy fields are migration inputs only:

- `columnOverrides[].active`
- `columnOverrides[].activePerFloor`
- `columnOverrides[].floorActive`
- `columnOverrides[].startFloor`
- `floors[].deletedColumns`

New schema `0.2.0` writes do not independently persist the competing legacy
visibility maps or floor deletion lists. Runtime `active` may remain as a
derived compatibility value while older internal consumers are migrated.

## Legacy Omission Rule

A legacy regular column line explicitly inactive on every saved floor is
migrated as `legacy_omitted_column_line`. This preserves the existing model
without inventing a new termination or solver blocker. Its retained framing
geometry is disclosed as a coordination warning.

An inactive segment on only part of the vertical line remains a termination or
segment-removal condition. Retained beams at that unsupported level are marked
unresolved, and STAAD/ETABS analytical export is blocked.

## Saved Provenance

Every schema `0.2.0` save includes:

- `compatibility.schemaVersion`
- `compatibility.minimumAppVersion`
- `compatibility.olderBuildCompatibilityGuaranteed`
- `compatibility.warning`
- `migrationMeta.sourceSchemaVersion`
- `migrationMeta.sourceFileVersion`
- `migrationMeta.loadedSchemaVersion`
- `migrationMeta.migrationApplied`
- `migrationMeta.migratedToSchemaVersion`
- `migrationMeta.minimumCompatibleAppVersion`

Report, DXF, and IFC metadata disclose the governed schema and migration
source. Release identity is governed separately by `v3/release-manifest.json`.
