# Revit Concrete-Only and Fabrication Authority Decision

**Decision date:** 2026-09-09  
**Scope:** FutolStructure, Revit 2027, ETABS, STAAD/RCDC, and future Tekla Structures handoff

## Decision

FutolStructure will use Revit Structure as a **concrete BIM and coordination/documentation target** for the current release train. Revit rebar modeling, bar bending schedules, and fabrication shop drawings are intentionally out of the current Revit import scope.

ETABS and STAAD remain the analysis and design authorities for engineering submittals. Tekla Structural Designer is a future solver/design option and is not currently available in the project environment. Tekla Structures is the future fabrication/detailing authority when production-grade reinforcement and shop drawings are required.

RCDC / STAAD Advanced Concrete remains an optional STAAD-side concrete design and detailing route. It is not a mandatory bridge for ETABS projects and must not become a second ungoverned source of reinforcement truth.

## Controlled Workflow

```text
FutolStructure canonical model
        |
        +--> concrete IFC / Revit concrete coordination model
        |
        +--> ETABS or STAAD analysis and design authority
                    |
                    +--> approved design and reinforcement handoff
                                  |
                                  +--> FutolStructure revision/audit
                                  +--> Tekla Structures fabrication model
                                  +--> optional Revit native rebar/documentation
```

The current Revit package is therefore allowed to carry:

- governed levels and grids;
- concrete columns, beams, slabs, footings, pedestals, tie beams, and stairs;
- exact FS coordinates, elevations, orientations, cardinal/insertion policy, and stable IDs;
- project, revision, build, section, material, and foundation metadata.

It is not required to carry:

- solver-approved bar layouts;
- hooks, bends, laps, couplers, or anchorage;
- bar marks, cut lengths, BBS, rebar BOM, or fabrication assemblies.

## Rebar Source of Truth

Reinforcement must enter the downstream workflow through a versioned structured handoff, not by reconstructing bars from IFC, DXF, PDF, or screenshots. The future handoff must preserve host member ID, bar mark, diameter, quantity, spacing, shape, cut length, cover, hooks, laps, source solver, design status, and source revision.

Until that handoff exists and is approved, FS remains concrete-only for Revit. No reinforcement is invented from preliminary member sizes or gravity-load assumptions.

## Acceptance Boundary

The current acceptance order is:

1. Revit levels/grids and native concrete member slices.
2. IFC concrete coordination readback and property visibility.
3. ETABS/STAAD native analysis/design acceptance.
4. Solver result and approved reinforcement handoff back to FS.
5. Tekla Structures fabrication/detailing bridge.
6. Optional Revit rebar/documentation import after the member/foundation bridge is stable.

This decision does not claim that an IFC opened in Revit is automatically a fully editable native Revit structural model. IFC remains a coordination channel; the FS Revit add-in is the controlled native-model path.
