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
- `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`
- `.github/` validation and contribution templates
- `index.html`
- `v3/index.html`
- `v3/assets/futolstructure-icon.png`
- `v3/assets/screenshots/`
- `v3/engine/`
- `v3/dxf-export.js`
- `v3/tools/check-fs.js`
- `v3/tools/check-dxf-autocad.ps1`
- `v3/tools/validate-dxf.py`
- `v3/tools/requirements-dxf.txt`
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
python -m pip install -r v3/tools/requirements-dxf.txt
node v3/tools/check-fs.js
```

For a DXF release on a workstation with AutoCAD 2025:

```powershell
powershell -File v3/tools/check-dxf-autocad.ps1 -DxfPath "path/to/package.dxf"
```

## If The Working Tree Is Dirty

This repo often has historical or recovery edits. Do not stage everything blindly.

Use targeted staging:

```bash
git add README.md index.html vercel.json docs/
git add LICENSE SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md .github/
git add v3/assets/screenshots/
```

Then inspect:

```bash
git diff --cached --stat
```

Only commit once the staged set is intentional.
