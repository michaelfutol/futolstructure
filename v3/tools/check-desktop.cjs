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
        const recentPanel = page.locator('#desktopRecentProjects');
        assert.equal(await page.locator('#desktopRecentProjectsSidebar').count(), 0);
        assert.equal(await recentPanel.count(), 0, 'Recent history must not open on startup');
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('desktop-request-open-project'));
        await recentPanel.waitFor({ state: 'visible' });
        assert.equal(await page.getByRole('button', { name: 'Browse files...', exact: true }).count(), 1);
        await page.evaluate(() => renderDesktopRecentProjects(Array.from({ length: 12 }, (_, index) => ({
            name: `Smoke project ${index + 1}.fstr`, path: `D:/Smoke/project-${index + 1}.fstr`
        }))));
        assert.equal(await recentPanel.locator('.recent-project-row').count(), 10);
        await page.screenshot({ path: path.join(output, 'file-open-history.png') });
        if (await recentPanel.count()) {
            await page.getByRole('button', { name: 'Close recent projects', exact: true }).click();
            await recentPanel.waitFor({ state: 'detached' });
        }
        await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
        assert.match(await page.locator('#analysisOptimizationStatus').innerText(), /ADAPTER_PENDING|BLOCKED/);
        await page.screenshot({ path: path.join(output, 'installed-workspaces.png') });
        const geometry = await page.evaluate(() => {
            autosaveSuppressed = true;
            toggleColumnPositionLock(false);
            const column = state.columns.find(item => item.id === 'A1');
            const centroid = getColumnPlanPosition(column);
            updateColumnParam(column.id, 'webB', 300);
            updateColumnParam(column.id, 'webD', 450);
            updateColumnParam(column.id, 'orientationDeg', 90);
            calculate();
            const resized = getColumnPlanPosition(column);
            const beforeAlignment = state.columns.map(item => ({ id: item.id, ...getColumnPlanPosition(item) }));
            toggleColumnAlignment();
            const stableAlignment = beforeAlignment.every(saved => {
                const point = getColumnPlanPosition(state.columns.find(item => item.id === saved.id));
                return Math.abs(point.x - saved.x) < 1e-9 && Math.abs(point.y - saved.y) < 1e-9;
            });
            const model = collectCSIExportModelData();
            prepareSolverColumnGeometry(model);
            const locked = JSON.stringify(state.columnGeometryLock);
            const messages = [];
            const originalStatus = setNudgeStatus;
            setNudgeStatus = (message, tone) => { messages.push({ message, tone }); originalStatus(message, tone); };
            updateColumnParam(column.id, 'orientationDeg', 0);
            updateSpan('x', 0, 8);
            setNudgeStatus = originalStatus;
            calculate();
            const saved = buildProjectData();
            applyLoadedProject(saved, 'desktop-column-authority.fstr', { skipAutosave: true });
            assertColumnGeometryUnchanged();
            setPlanTab('structural'); resizeCanvas(); fitView(); draw();
            return {
                centroid, resized, stableAlignment, autoLocked: state.columnPositionLocked,
                rotation: getColumnOrientationDeg(state.columns.find(item => item.id === saved.columnOverrides[0].id)),
                lockRetained: JSON.stringify(state.columnGeometryLock) === locked,
                blockedEdits: messages.filter(item => item.tone === 'warning').length,
                serializedAuthority: saved.columnGeometryLock?.schema
            };
        });
        assert.deepEqual(geometry.centroid, geometry.resized, 'Installed resize/rotation moved the column centroid');
        assert.equal(geometry.stableAlignment, true);
        assert.equal(geometry.autoLocked, true);
        assert.equal(geometry.rotation, 90);
        assert.equal(geometry.lockRetained, true);
        assert.equal(geometry.blockedEdits, 2);
        assert.equal(geometry.serializedAuthority, 'FutolStructure.ColumnGeometryLock.v1');
        await page.screenshot({ path: path.join(output, 'installed-column-authority.png') });
        assert.deepEqual(errors, []);
        const result = { ok: true, executablePath, appVersion: info.appVersion, buildId: provenance.buildId,
            sourceCommit: provenance.gitCommit, isolatedProfile: true, columnGeometry: geometry, pageErrors: errors };
        fs.writeFileSync(path.join(output, 'desktop-smoke.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify(result));
    } finally {
        await app.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
