# GitHub Runner and Lum Handoff

Date: 2026-09-06 (Asia/Singapore)

## Current Capability

FutolStructure can use the GitHub-hosted `ubuntu-latest` runner for:

- Node source and engine smoke;
- Python `ezdxf` and IFC parser acceptance;
- browser regression through the existing `check-fs.js` path;
- fixture, export-contract, and deployment-configuration checks;
- downloadable evidence under `output/playwright` and `output/acceptance`.

The validation workflow supports:

- push validation on `main`;
- pull-request validation into `main`;
- manual `workflow_dispatch` for a maintainer or Lum;
- a fast `source-only` manual scope;
- a full `source-browser-parser` manual scope;
- 14-day acceptance artifact retention.

Workflow:

`/.github/workflows/validate.yml`

## How Lum Uses It

1. Lum works on a dedicated branch or pull request.
2. Opening or updating the pull request automatically runs the validation workflow.
3. A maintainer or Lum can also open Actions, select `Validate FutolStructure`, choose `Run workflow`, and select an acceptance scope.
4. Lum reads the workflow result and downloads the `futolstructure-<run-id>-acceptance` artifact.
5. A maintainer reviews the evidence before merging.
6. Vercel may create a preview from the pull request, but production remains on `main`.

The workflow is a validation runner, not an autonomous merge or deployment authority.

## Local Dry-Run Note

The local source/engine gate passes. The full browser acceptance command currently stops on this PC before the DXF parser gate because Python with `ezdxf` is not installed. GitHub Actions installs Python 3.12 and `v3/tools/requirements-dxf.txt` before running that same acceptance lane, so the hosted result is the authoritative cloud parser check until the local Python environment is provisioned.

## Native Software Boundary

The hosted Ubuntu runner cannot provide licensed native acceptance for:

- ETABS;
- STAAD.Pro or STAAD Foundation;
- Revit;
- AutoCAD Core Engine;
- Tekla Structural Designer.

Those checks require a controlled Windows machine with the licensed applications installed. A future native workflow must use a private repository or a protected self-hosted runner with labels such as:

`self-hosted`, `windows`, `futolstructure-native`

It must be manual or environment-approved only. Do not attach a self-hosted Windows runner with licensed engineering software to untrusted pull requests in this public repository. Do not place license files, credentials, project files, EDB files, or client data in GitHub artifacts.

## Current Access Blocker

The local GitHub CLI credential is expired. `gh auth status` reports an invalid token for account `ikel-eidra`.

The current branch is also local-only:

`feature/fs-125-shared-analytical-inputs`

The latest local commits are not visible to Lum or GitHub Actions until the GitHub credential is repaired and the candidate branch is pushed.

Re-authentication command:

`gh auth login -h github.com`

After authentication, verify:

`gh auth status`

Then push only the reviewed candidate branch and open a draft PR. Do not push directly to `main`.

## Evidence Policy

Passing hosted CI means the source and declared cloud-test scope passed. It does not prove:

- native ETABS or STAAD model acceptance;
- native Revit IFC inspection;
- AutoCAD visual sheet quality;
- final structural adequacy or permit readiness.

Those require dated native evidence and engineer review.
