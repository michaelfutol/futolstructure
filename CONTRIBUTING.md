# Contributing to FutolStructure

FutolStructure accepts focused bug reports and carefully scoped pull requests.
Before proposing code, open an issue that explains the engineering behavior,
the affected model or export surface, and the expected result.

## Development Rules

- Preserve `.fstr` backward compatibility or document and test a migration.
- Use the active floor-aware geometry and member-state helpers; do not revive
  legacy global flags as a second source of truth.
- Keep analysis, schedules, 3D geometry, and exports coordinated from the same
  active-model payload.
- Do not describe preliminary calculations as final design or solver truth.
- Do not commit project files, native solver files, credentials, client data,
  or generated validation artifacts.
- Keep unrelated formatting and refactoring out of behavioral fixes.

## Validation

Run the local smoke check before opening a pull request:

```bash
node v3/tools/check-fs.js --no-browser
```

For geometry, persistence, rendering, or export changes, also run:

```bash
node v3/tools/check-fs.js
```

Describe the tested model, affected counts, and any validation boundary that
remains unverified. Pull requests must pass the repository validation workflow.
