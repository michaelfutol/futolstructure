'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/playwright/workspaces');

async function main() {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    try {
        await page.goto(pathToFileURL(path.join(root, 'v3/index.html')).href);
        await page.waitForFunction(() => typeof collectCSIExportModelData === 'function' && state.columns.length > 0);
        const before = await page.evaluate(() => {
            const m = collectCSIExportModelData();
            return JSON.stringify({ columns: m.columns, beams: m.beams, slabs: m.slabs, foundation: m.foundation });
        });
        await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#planModelTools').isVisible(), false);
        await page.getByRole('button', { name: 'Prepare draft', exact: true }).click();
        assert.match(await page.locator('#analysisOptimizationStatus').innerText(), /ADAPTER_PENDING|BLOCKED/);
        assert.equal(await page.locator('#analysisOptimizationStatus').evaluate(el => el.classList.contains('ready')), false);
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download draft JSON', exact: true }).click();
        const download = await downloadPromise;
        const filename = path.join(output, download.suggestedFilename());
        await download.saveAs(filename);
        const draft = JSON.parse(fs.readFileSync(filename, 'utf8'));
        assert.equal(draft.execution.runAllowed, false);
        assert.equal(draft.request.canonicalModel.schema, 'FutolStructure.CSIExportModel.v1');
        assert.ok(draft.request.canonicalModel.columns.length > 0);
        assert.ok(draft.request.readiness.pending.length > 0);
        await page.screenshot({ path: path.join(output, 'analysis-desktop.png'), fullPage: true });

        await page.locator('[data-tab-group="optimization"].plan-tab-group-btn').click();
        await page.locator('#panelOptimization').waitFor({ state: 'visible' });
        await page.locator('#optimizationObjective').selectOption('minimum_material_cost');
        await page.getByRole('button', { name: 'Prepare study', exact: true }).click();
        const proposal = await page.evaluate(() => lastAnalysisOptimizationJob);
        assert.equal(proposal.objective, 'minimum_material_cost');
        assert.deepEqual(proposal.candidates, []);
        assert.equal(proposal.sourceJob.execution.applyResultsAllowed, false);

        await page.locator('[data-tab-group="model"].plan-tab-group-btn').click();
        await page.locator('#tabStaircase').click();
        await page.locator('#panelStaircase').waitFor({ state: 'visible' });
        const stairViews = await page.evaluate(() => {
            const readCanvas = id => {
                const canvas = document.getElementById(id);
                if (!canvas) return { width: 0, height: 0, painted: 0 };
                const context = canvas.getContext('2d');
                const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
                let painted = 0;
                for (let index = 0; index < pixels.length; index += 4) {
                    if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) painted += 1;
                }
                return { width: canvas.width, height: canvas.height, painted };
            };
            return { plan: readCanvas('stairPlan2DCanvas'), elevation: readCanvas('stairElevation2DCanvas') };
        });
        assert.ok(stairViews.plan.width > 0 && stairViews.plan.height > 0 && stairViews.plan.painted > 100, JSON.stringify(stairViews));
        assert.ok(stairViews.elevation.width > 0 && stairViews.elevation.height > 0 && stairViews.elevation.painted > 100, JSON.stringify(stairViews));
        await page.screenshot({ path: path.join(output, 'stair-builder-2d-desktop.png'), fullPage: true });
        await page.locator('#tabRoofFrame').click();
        await page.locator('#panelRoofFrame').waitFor({ state: 'visible' });
        const roofSupportAudit = await page.evaluate(() => {
            const model = globalThis.FSRoofFrame.build({ floors: state.floors, columns: state.columns, roofFrame: state.roofFrame });
            const canvas = document.getElementById('roofFrameCanvas');
            const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data || [];
            let painted = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) painted += 1;
            }
            return {
                policy: model.supportPolicy,
                assignments: model.supportPlan.assignments,
                painted,
                advice: document.getElementById('roofFrameSupportAdvice')?.innerText || ''
            };
        });
        assert.ok(roofSupportAudit.assignments.length > 0, JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.assignments.some(item => item.supportType === 'hinge'), JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.assignments.some(item => item.supportType === 'roller'), JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.painted > 100, JSON.stringify(roofSupportAudit));
        assert.match(roofSupportAudit.advice, /HINGE \+ ROLLER/i);
        await page.screenshot({ path: path.join(output, 'roof-frame-support-auto-desktop.png'), fullPage: true });
        await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        await page.locator('[data-tab-group="model"].plan-tab-group-btn').click();
        await page.locator('#tabStaircase').click();
        await page.locator('#panelStaircase').waitFor({ state: 'visible' });
        await page.evaluate(() => { setPlanTab('beamSchedule'); setPlanTab('analysisWorkbench'); });
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        assert.equal(await page.locator('.schedule-panel:visible').count(), 1);
        await page.locator('#view3D').click();
        await page.waitForFunction(() => document.querySelector('#container3D canvas')?.width > 0);
        assert.equal(await page.locator('.schedule-panel:visible').count(), 0);
        await page.locator('#tabStructural').click();
        assert.equal(await page.locator('#planModelTools').isVisible(), true);

        const after = await page.evaluate(() => {
            const m = collectCSIExportModelData();
            return JSON.stringify({ columns: m.columns, beams: m.beams, slabs: m.slabs, foundation: m.foundation });
        });
        assert.equal(after, before, 'Workspace navigation must retain physical model geometry');
        await page.screenshot({ path: path.join(output, 'model-desktop.png'), fullPage: true });
        for (const width of [390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
            await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
            const layout = await page.locator('#panelAnalysisWorkbench').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
            assert.ok(layout.width > 0 && layout.scroll <= layout.width + 2, JSON.stringify(layout));
            await page.screenshot({ path: path.join(output, `analysis-${width}.png`), fullPage: true });
        }
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ ok: true, evidence: output, viewports: [1440, 768, 390], draft: path.basename(filename), geometryPreserved: true, pageErrors: errors }));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
