# Fixed Column Geometry Authority

Date: 2026-10-04
Candidate: FS-125-RC12 / 3.16.125-rc.12
Status: FS-side focused acceptance passed; native mixed-orientation acceptance pending.

## Geometry Contract

- The column centroid, section B/H, and plan rotation are the source of truth. Beam alignment never relocates or resizes a column.
- Existing project centroids are captured at their current resolved positions during migration. They are not silently recentered on the grid.
- Resizing or rotating an unlocked column leaves its captured centroid unchanged. Explicit Move/Nudge or unlocked grid editing changes placement deliberately.
- The retained `columnAlignment` project key now switches beam framing between centroid-centered and exterior-face modes after centroid capture.
- Analytical beam endpoints remain on the supporting column centroids. Physical/canonical framing uses the requested face alignment, exact rotated-rectangle centerline intersection, and beam transverse nudge.
- Canvas and DXF share the oriented beam polygon; 3D, IFC, and Revit handoff continue using the shared physical axes.
- ETABS and STAAD export automatically lock column positions, B/H, rotations, inventory, and grid spans. A changed or stale payload is rejected rather than silently substituted.
- The lock snapshot (`FutolStructure.ColumnGeometryLock.v1`) and centroid references persist in `.fstr` saves and undo snapshots. Unlock explicitly before intentional changes and review the next export.

## Local Evidence

Commands, run from the repository root:

```powershell
node v3/tools/check-fs.js --no-browser
$env:FS_HEADLESS='1'
$env:FS_CDP_PORT='9342'
node v3/tools/check-column-geometry.js --viewport-width 1920 --viewport-height 1080
node v3/tools/validate-ifc-lite.js output/acceptance/rc12-column-authority/column-authority.ifc
python v3/tools/validate-dxf.py output/acceptance/rc12-column-authority/column-authority.dxf
```

- Source/syntax contracts: passed.
- Frame geometry: 8 unit checks passed, including rotated rectangular intersection, tangent/missed support, reverse direction, and skew polygon width.
- Focused browser: 33 assertions passed for legacy centroid preservation, mixed rectangular orientation, independent beam alignment, physical-minus-analytical offsets, visible blocked edits, frozen recalculation, save/load, undo, tamper rejection, automatic export locking, stale payload rejection, and nonfinite endpoint rejection.
- Canonical/analytical baseline: 30 existing checks passed without modifying expected fixture geometry.
- DXF: ezdxf strict parser/audit and roundtrip passed; 1,245 entities, no LINE entities, and oriented closed beam POLYLINE outlines.
- IFC lightweight envelope/property gate: passed; 27 columns including pedestals, 36 beams including tie beams, 8 slabs, 9 footings, and 4 levels. This is not native Revit property acceptance or strict IFC schema certification.
- Generated artifacts: `output/acceptance/rc12-column-authority/acceptance.json`, `.std`, ETABS `.ps1`, `.ifc`, `.dxf`, and `plan.png`.
- The broad monolithic browser regression did not complete; it is not claimed as passed. Its stale release/toolbar expectations were updated. Focused geometry, baseline, and packaged desktop tests are the candidate's bounded evidence.

## Remaining Gates

1. Native ETABS/STAAD run of the new mixed-orientation fixture, with readback of column B/H, rotations, centroid coordinates, beam nodes, cardinal points, and offsets consumed exactly once.
2. Visually compare physical endpoints in FS 2D/3D, DXF, IFC/Revit, and reconstructed solver framing. Record dimensional/property evidence, not only screenshots.
3. Rotated faces that cannot share one straight flush beam remain review cases. A straight square-ended beam is not a universal beveled connection; the exterior-flush ledger must retain skew/missed-face warnings. This milestone does not claim perfect construction joints for every arbitrary rotation.
4. Test orientation/size changes returned from approved solver design through a reviewed new revision. Automatic native model application remains outside this milestone.

No new GitHub publication or production website deployment is included in this local candidate.
