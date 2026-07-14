# FS-118 Protected Project Revisions

- **Release:** FutolStructure v3.16.118
- **Build:** FS-118
- **Date:** 2026-07-14

## Purpose

FS-118 protects user-authored structural intent before an existing `.fstr` file is overwritten. It builds on the production FS-117 R12 DXF baseline without changing the DXF envelope, structural analysis formulas, solver exporters, or active-model geometry rules.

## Included

- Immutable IndexedDB revision records containing a cloned project payload, source identity, schema/build provenance, structural summary, health assessment, and model delta.
- Automatic pre-overwrite capture for browser file-handle saves.
- A guarded save review when floors, members, locks, offsets, cantilevers, or corner slabs are removed, or when void/deletion counts increase.
- A health gate that quarantines implausible autosaves and can restore the last known healthy browser snapshot.
- Recovery UI for revision history, restore, and `.fstr` download.
- Per-project retention of the newest 50 protected revisions.
- Project and source-revision identity embedded in new `.fstr` saves and report provenance.
- A legacy v2.8 two-floor fixture proving hidden geometry, member locks, and beam offsets survive migration and repeated round trips.

## Storage Boundary

Protected revisions are local to the browser profile and device through IndexedDB. They are not cloud backups and do not replace dated external `.fstr` files. Clearing site data or using another browser/profile removes access to that local revision history.

## Acceptance Gates

- Inline and external JavaScript syntax checks.
- Full Chrome/Edge browser regression.
- Pre-overwrite capture, destructive-delta detection, invalid-health blocking, restore, and revision download.
- Exact retention of revisions 5 through 54 after 55 ordered writes, proving a 50-record cap.
- Legacy v2.8 `.fstr` load, migration, and two successive round trips.
- Current Olango three-floor project smoke.
- Unchanged FS-117 strict AutoCAD R12 parser round trip and native AutoCAD read gate.

## Excluded

- Cloud synchronization, user accounts, shared project history, and server-side backup.
- Historical helper scripts and unrelated workspace edits.
- Structural solver, stair, IFC, STAAD, ETABS, SAFE, or broad UI changes.
- Changes to the FS-117 DXF R12 writer.

## Rollback

If FS-118 fails in production, revert only the FS-118 merge commit. FS-117 remains the known-good DXF production baseline.
