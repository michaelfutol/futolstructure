# Release Hygiene

Use this checklist before pushing a public FutolStructure update.

## Do Not Commit

- Private `.fstr` client/project files.
- Solver output folders from ETABS, STAAD.Pro, SAFE, SAP2000, or Revit.
- Local screenshots outside `v3/assets/screenshots/`.
- Temporary browser profiles, cache folders, and generated debug output.
- Personal notes unless intentionally public.

## Keep In The Public Repo

- `README.md`
- `index.html`
- `v3/index.html`
- `v3/assets/futolstructure-icon.png`
- `v3/assets/screenshots/`
- `v3/engine/`
- `v3/tools/check-fs.js`
- `docs/`
- deployment config such as `vercel.json`

## Before Each Commit

```bash
git status --short
node v3/tools/check-fs.js --no-browser
git diff --check
```

For browser-sensitive changes, also run:

```bash
node v3/tools/check-fs.js
```

## If The Working Tree Is Dirty

This repo often has historical or recovery edits. Do not stage everything blindly.

Use targeted staging:

```bash
git add README.md index.html vercel.json docs/
git add v3/assets/screenshots/
```

Then inspect:

```bash
git diff --cached --stat
```

Only commit once the staged set is intentional.
