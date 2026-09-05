'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron: electron } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'v3/release-manifest.json'), 'utf8'));

async function main() {
    const executablePath = process.argv[2];
    assert.ok(executablePath && fs.existsSync(executablePath), 'Pass the packaged FutolStructure executable path');
    const output = path.join(root, 'output/playwright/desktop');
    fs.mkdirSync(output, { recursive: true });
    const profile = fs.mkdtempSync(path.join(output, 'profile-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ executablePath, args: ['--user-data-dir=' + profile], env, timeout: 60000 });
    try {
        const page = await app.firstWindow();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.waitForFunction(() => typeof collectCSIExportModelData === 'function' && !!window.FutolStructureDesktop);
        const info = await page.evaluate(() => window.FutolStructureDesktop.getInfo());
        assert.equal(info.appVersion, expected.appVersion);
        assert.equal(await page.locator('#buildVersionBadge').innerText(), 'v' + expected.appVersion);
        const provenance = await page.evaluate(() => getReleaseManifest());
        assert.equal(provenance.buildId, expected.buildId);
        assert.equal(provenance.gitCommit, expected.gitCommit);
        const recent = await page.evaluate(() => window.FutolStructureDesktop.getRecentProjects());
        assert.deepEqual(recent, [], 'Smoke profile must not load user project history');
        await page.getByRole('button', { name: 'Close recent projects', exact: true }).click();
        await page.locator('#desktopRecentProjects').waitFor({ state: 'detached' });
        await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
        assert.match(await page.locator('#analysisOptimizationStatus').innerText(), /ADAPTER_PENDING|BLOCKED/);
        await page.screenshot({ path: path.join(output, 'installed-workspaces.png') });
        assert.deepEqual(errors, []);
        const result = { ok: true, executablePath, appVersion: info.appVersion, buildId: provenance.buildId,
            sourceCommit: provenance.gitCommit, isolatedProfile: true, pageErrors: errors };
        fs.writeFileSync(path.join(output, 'desktop-smoke.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } finally {
        await app.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
