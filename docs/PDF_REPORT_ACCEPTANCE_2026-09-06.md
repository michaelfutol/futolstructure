# PDF Report Acceptance

**Date:** 2026-09-06  
**Scope:** A4 structural computation report and solver-status boundary  
**Project:** Bacacay 2-Storey Mix-use, dated frozen `.fstr` source

## Result

The FutolStructure report path now produces a real PDF in the desktop build through the Electron `printToPDF` bridge. The browser build uses the same report HTML and opens the system print-to-PDF flow as a fallback.

Validated artifact:

```text
output/pdf/Bacacay_Structural_Computation_Report_2026-09-06.pdf
```

| Check | Result |
| --- | --- |
| PDF signature | `%PDF-` |
| File size | 72,816 bytes |
| Paper | A4 portrait |
| Font declaration | Arial |
| Rendered pages | 3 |
| Visual inspection | Passed; no clipping, overlap, or unreadable tables |
| Report contents | Provenance, levels, readiness warnings, columns, footings, beams, stairs, and load governance |

Rendered inspection images are retained under `output/pdf/rendered/`.

## Analysis button contract

The top toolbar action is now named **Recalculate**. It calls the internal `calculate()` pipeline to regenerate geometry, gravity-load paths, preliminary sizing/check values, foundations, dashboard totals, and views. It does not silently run ETABS, STAAD, PyNite, or OpenSees.

The Analysis workspace prepares governed solver requests. PyNite can execute through the controlled desktop Python runner and has passed the Bacacay gravity comparison gate. OpenSees is registered as a planned adapter only; no OpenSees result is currently applied to the FutolStructure model.

## Acceptance boundary

The report is an engineering computation and coordination output. It must not be treated as a permit-ready final design without the responsible engineer's review, native solver checks, lateral/seismic design, detailing, and project-specific code verification.
