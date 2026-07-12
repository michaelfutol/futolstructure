# FutolStructure Launch Plan

This is the working launch path for publishing FutolStructure at:

```text
futolstructure.futoltech.com
```

## Repository Decision

Use the existing GitHub repository first:

```text
https://github.com/michaelfutol/futolstructure
```

Do not create a second repository yet. A new repository is only useful if we later want a fully clean public history with no legacy development artifacts. For now, the faster and safer route is:

1. Keep the existing repo as the source of truth.
2. Stage only intentional public-facing changes.
3. Push a stable branch.
4. Merge reviewed release changes to `main`, which is the Vercel production branch.

## Local Folder Decision

Do not delete old local files while active development is ongoing. The current folder contains recovery scripts, old upgrade scripts, and logs that may still help diagnose model-history issues.

For public presentation, use one of these approaches:

| Approach | Use when | Notes |
| --- | --- | --- |
| Same repo, clean README | Fastest launch | Good for private/portfolio review now. |
| `release/web` branch | Public demo branch | Stage only `README.md`, `index.html`, `v3/`, `docs/`, and deploy config. |
| New clean repo | Later portfolio polish | Use after the app stabilizes and we want a smaller public history. |

Current decision: keep `main` as the reviewed production branch. Pull requests receive Vercel previews and merge to production only after validation passes.

## Deployment Options

### Option A - Vercel

Recommended for fast preview links, GitHub integration, and easy custom-domain setup.

Current Vercel project:

```text
scope: ikel-eidras-projects
project: futolstructure
production: https://futolstructure.vercel.app
production branch: main
validated deployment: dpl_6BPVUFHxE7NqPEUSdQXCmUXkziiB
custom domain target: futolstructure.futoltech.com
```

1. Push the selected branch to GitHub.
2. Import `michaelfutol/futolstructure` into Vercel.
3. Framework preset: Other.
4. Build command: leave blank.
5. Output directory: leave blank.
6. Add custom domain:

```text
futolstructure.futoltech.com
```

7. In DNS, point the subdomain to the Vercel target shown in the project domain settings.

Current DNS action required, as reported by Vercel on 2026-07-13:

```text
type: A
name/host: futolstructure
value: 76.76.21.21
```

Create this record at the DNS provider currently serving `futoltech.com`. Do not replace the domain's nameservers merely for this subdomain. After changing DNS, verify with:

```bash
npx --yes vercel@latest domains verify futolstructure.futoltech.com
```

The included `vercel.json` rewrites the domain root to:

```text
/v3/index.html
```

After GitHub integration is connected, Vercel will redeploy automatically:

- Pushes to the production branch update the live production site.
- Pull requests and non-production branches get preview URLs.
- Rollback can be done from the Vercel dashboard if a release is bad.

### Option B - cPanel or traditional hosting

Use this if `futoltech.com` is already hosted on cPanel and we want direct control.

1. Create the subdomain in cPanel:

```text
futolstructure.futoltech.com
```

2. Upload these repo contents to that subdomain document root:

```text
index.html
v3/
README.md
docs/
```

3. Confirm this opens:

```text
https://futolstructure.futoltech.com/v3/index.html
```

4. Confirm the root redirects:

```text
https://futolstructure.futoltech.com
```

## Pre-Launch Checklist

- [x] README uses the FutolStructure name and current build.
- [x] Screenshots are stored under `v3/assets/screenshots/`.
- [x] Root `index.html` no longer references old `v3.10` wording.
- [x] Repository license, contribution, security, issue, and pull-request policies exist.
- [x] GitHub validation workflow runs the source/engine smoke check.
- [ ] Full browser smoke passes for the release commit.
- [x] No private `.fstr` project files are committed.
- [x] No personal native-solver project files are committed.
- [x] Public README does not claim permit-ready design without engineer review.
- [ ] DNS resolves `futolstructure.futoltech.com` to Vercel.

## Recommended Git Staging

For a portfolio update, stage only the intentional public and launch files:

```bash
git add README.md LICENSE SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md
git add .github/ index.html robots.txt sitemap.xml vercel.json docs/LAUNCH_PLAN.md
git add v3/index.html v3/assets/screenshots/ v3/tools/check-fs.js
```

Review before commit:

```bash
git diff --cached --stat
git diff --cached -- README.md index.html docs/LAUNCH_PLAN.md vercel.json
```

Suggested commit message:

```text
Prepare FutolStructure portfolio launch
```

## Next Product Goals

1. Add pre-save backups and save health gates for `.fstr` protection.
2. Complete custom-domain DNS and switch canonical metadata to the verified custom domain.
3. Add accounts and cloud project storage using the architecture in `docs/AUTH_SECURITY_PLAN.md`.
4. Add a short demo video or GIF to the README.
5. Continue export validation for ETABS, STAAD, IFC, SAFE, and Revit review.
6. Improve stair export from visual geometry to solver-ready shell/frame connectivity.
7. Replace client-only experimental AI with an authenticated, consent-based server integration if it returns.
