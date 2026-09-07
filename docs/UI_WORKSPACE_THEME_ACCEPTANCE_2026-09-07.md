# Workspace Theme Acceptance

**Candidate:** FS-125-RC2  
**Date:** 2026-09-07  
**Scope:** Paper and Dark CAD drawing workspace modes

## Decision

The application theme and the engineering drawing workspace theme are separate
settings. The existing paper canvas remains the default for continuity. Users
can select `Dark CAD canvas` from the application menu; the choice is persisted
in local storage as `tributaryWorkspaceTheme`.

## Dark CAD palette

The dark workspace uses a dedicated drawing palette rather than a CSS image
filter. The canvas is `#111827`; beams and columns use high-contrast light
strokes; text, dimensions, grid bubbles, hatches, slabs, and reactions retain
distinct readable colors. This preserves drawing semantics and avoids changing
the meaning of warning, selection, and load-reaction colors.

## Verification

`node v3/tools/check-super-improvement.cjs` passed. The browser workspace
regression passed at desktop, tablet, and phone viewports with:

- dark workspace mode applied and persisted;
- computed canvas background `rgb(17, 24, 39)`;
- painted canvas pixels above the visibility threshold;
- geometry preserved before and after workspace navigation;
- no page errors.

The workspace setting affects visualization only. It does not change the
canonical model, analytical coordinates, solver offsets, saved project data,
or export styles.
