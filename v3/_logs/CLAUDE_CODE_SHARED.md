# Claude Code Advisory Handoff

Status as of 2026-05-11: historical context only.

The user does not plan to renew Claude Code soon. Do not treat Claude Code as an active collaborator, dependency, or required review path unless the user explicitly reactivates it. Continue FutolStructure work from `AGENT_RAG.md`, the local repo state, and user-provided summaries.

Current branch: `claude/audit-repository-JyTBB`

Rules for this shared file:

- Codex owns repo edits unless the user explicitly changes that.
- Claude Code is advisory/read-only for this phase.
- Do not commit, push, or create PRs from this stabilization pass.
- Keep fixes narrow and testable.

## Current Stabilization Target

FutolStructure is in live-test stabilization for a real residential framing model. The current blocker is cantilever/slab/member display truth across Layout, Tributary, and 3D.

## Active Issues To Review

1. 3D solids overlap around cantilever slabs, CB beams, EB beams, columns, and main beams.
2. Plan and 3D can disagree: Layout may show a slab, but 3D may visually miss or hide the slab because of inset, opacity, or overlapping solid priority.
3. Tributary view can still show deleted/void red areas from stale or unintended slab state.
4. Slab solids in 3D should be more solid and readable; cantilever slabs should use a distinct but professional color.
5. Deleted/cantilever-cleared areas should not reappear in normal Tributary view after refresh.
6. Corner/crossing cantilever cases can overlap slabs at small side projections.
7. Corner cantilever regions bounded by CB/EB members should still include slab where the model intent says slab exists.
8. Cantilever edge beams are optional; EB on means boundary member, not an empty gap. EB off means visible slab-only edge.

## Locked Cantilever Doctrine

- Cantilever input value is outward projection depth.
- `Run = 0` means full adjacent bay/span.
- `Run > 0` creates a local landing/stub patch.
- `Off` only applies when `Run > 0`.
- Deleted beams are not valid cantilever supports.
- If an original perimeter support beam is deleted, resolve inward to the next available parallel support beam.
- Available support means beam is not deleted and both endpoint columns are active on the floor.
- CB = cantilever beam / side continuation.
- EB = cantilever edge beam.
- EB sits inside the slab projection with outside face at the slab edge.
- EB does not remove the slab body.
- In 2D, CB/EB may be visually face-trimmed for drafting clarity.
- In 3D, CB solids should read as real concrete members reaching the slab edge.

## Current Preferred Fix Direction

- Use active-only geometry collectors for rendering/calculation/export.
- Keep normal views free of deleted ghost objects.
- Recompute slabs/beams from current floor intent instead of relying on stale rendered artifacts.
- For 3D, avoid fake solver changes; adjust visual geometry/materials only unless load-path data is explicitly wrong.
- Avoid broad renderer redesign while user is live-testing.

## What Claude Should Advise On

- Whether current cantilever slab and member render rules are internally consistent.
- Where stale deleted/void/cantilever geometry can leak into Tributary or 3D.
- Whether 3D slab/beam overlap should be solved by material/render order, small visual gaps, or geometry clipping.
- Any obvious small-code fix that avoids destabilizing load calculations.

## Codex Patch Notes - 2026-05-01

- Normal Layout/Tributary view now suppresses red void/deleted slab ghost panels.
- `SC-*` cantilever slabs are guarded from `voidSlabs`; cantilever deletion clears cantilever intent instead of creating regular slab void state.
- 3D slabs now render above beam tops with stronger opacity and separate cantilever slab color.
- 3D cantilever beam rendering now trusts explicit generated CB/EB render endpoints instead of re-extending every CB blindly.
- Added exterior corner cantilever slab infill IDs:
  - `SC-C-TL`
  - `SC-C-TR`
  - `SC-C-BL`
  - `SC-C-BR`
- Corner infill currently generates only when both adjacent cantilever strips resolve to exterior support beams. If support fallback resolves inward after a deleted perimeter beam, corner infill is intentionally skipped until a safer support doctrine is defined.
- Corner infill load is preliminary: area is shared to the two adjacent support beams only. Do not treat this as final corner-cantilever RC design.
