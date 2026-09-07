# FutolStructure Windows Desktop

This directory packages the existing FutolStructure `v3` application as a Windows desktop application. It is intentionally a thin shell: the structural model, persistence, reports, DXF, IFC, STAAD, ETABS, SAFE, and round-trip code remain in `v3/`.

The installer and Windows shortcuts use `desktop/assets/futolstructure.ico`, generated from the canonical FutolStructure mark in `v3/assets/futolstructure-icon.png`. The browser UI and packaged window continue to use the same mark for consistent branding.

## Build locally

Requirements:

- Windows 10 or newer
- Node.js and npm
- Network access for the first dependency install and Electron runtime download

```powershell
cd desktop
npm ci
npm run dist:installer
```

For a local development launch, use `npm start`. The script clears the `ELECTRON_RUN_AS_NODE` flag sometimes inherited by IDE terminals before starting Electron.

Outputs are written outside source control:

- `output/desktop/FutolStructure-Setup-3.16.125-rc.3-x64.exe` is the release-candidate NSIS installer.
- `output/desktop/FutolStructure-Portable-3.16.125-rc.3-x64.exe` is the matching portable build when the portable target is built.

The installer creates a Start Menu entry, a desktop shortcut, and an `.fstr` file association. It does not move or rewrite project files. User data remains in the location selected through FutolStructure's project save controls.

When the installed Windows app's **ETABS** action is used, it writes the current model's dated PowerShell/OAPI builder into `Documents/FutolStructure ETABS Exports`, runs it through Windows PowerShell, and waits for a dated `.edb`. ETABS 20, 21, or 22 must be installed and licensed. The OAPI session leaves the generated model open in ETABS; the matching `.e2k`, mass/modal audit JSON, and modal participation CSV are saved beside it. Browser builds retain the manual `.ps1` download fallback.

## Update model

The installed app is update-ready through `electron-updater` and the public GitHub Releases channel:

1. Make and test the source change in `v3/`.
2. Increment `desktop/package.json` to a new SemVer version.
3. Run `npm ci`, the FutolStructure regression suite, and `npm run dist`.
4. Publish the generated Windows installer, `latest.yml`, and blockmap files in a GitHub Release for the new version. For an authenticated release machine, `npm run dist:publish` uses `GH_TOKEN` to publish to `michaelfutol/futolstructure`.
5. The installed application can then check for the release from **FutolStructure > Check for Updates**.

The update process replaces only the installed application package. It does not replace `.fstr` project files or browser/IndexedDB project history. Do not publish a release until the corresponding GitHub Actions, local browser smoke, export checks, and project acceptance evidence are complete.

## Runtime boundary

The desktop package includes the application source and the exact Three.js renderer files under `v3/vendor/three/`, so the core modeling and 3D view do not require a web server or CDN. Optional AI integrations remain network-dependent and are unchanged from the browser build.
