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
        const revit = await page.evaluate(() => {
            const manifest = buildRevitImportManifest();
            return {
                contract: manifest.contract,
                levels: manifest.model.levels.length,
                columns: manifest.model.columns.length,
                beams: manifest.model.beams.length,
                slabs: manifest.model.slabs.length,
                footings: manifest.model.foundation?.footings?.length || 0,
                rebar: manifest.rebar.status,
                cardinal: manifest.source.analyticalGeometry.columnCardinalPoint === 5 &&
                    manifest.source.analyticalGeometry.beamCardinalPoint === 8,
                offsets: manifest.source.analyticalGeometry.jointOffsetPolicy
            };
        });
        assert.equal(revit.contract, 'FutolStructure.RevitNativeImport.v1');
        assert.ok(revit.levels > 0 && revit.columns > 0 && revit.beams > 0 && revit.slabs > 0, JSON.stringify(revit));
        assert.equal(revit.rebar, 'PENDING_APPROVED_DESIGN_RESULTS');
        assert.equal(revit.cardinal, true, JSON.stringify(revit));
        assert.match(String(revit.offsets), /offset/i);
        const footingSbc = await page.evaluate(() => ({
            assumed: document.getElementById('assumedSoilBearing')?.value || '',
            final: document.getElementById('finalSoilBearing')?.value || '',
            effective: document.getElementById('settSoilBearing')?.value || '',
            status: document.getElementById('soilBearingStatus')?.textContent || ''
        }));
        assert.equal(footingSbc.assumed, '150', JSON.stringify(footingSbc));
        assert.equal(footingSbc.final, '', JSON.stringify(footingSbc));
        assert.equal(footingSbc.effective, '150', JSON.stringify(footingSbc));
        assert.match(footingSbc.status, /ASSUMED|PRELIMINARY/i, JSON.stringify(footingSbc));
        const workspaceTheme = await page.evaluate(() => {
            setWorkspaceTheme('dark');
            const canvas = document.getElementById('mainCanvas');
            const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data || [];
            let painted = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) painted += 1;
            }
            const audit = {
                mode: document.documentElement.getAttribute('data-workspace-theme'),
                background: getComputedStyle(canvas).backgroundColor,
                beam: getWorkspaceDrawingPalette().beam,
                text: getWorkspaceDrawingPalette().text,
                painted
            };
            setWorkspaceTheme('light');
            return audit;
        });
        assert.equal(workspaceTheme.mode, 'dark', JSON.stringify(workspaceTheme));
        assert.match(workspaceTheme.background, /17, 24, 39|#111827/i, JSON.stringify(workspaceTheme));
        assert.equal(workspaceTheme.beam, '#f8fafc', JSON.stringify(workspaceTheme));
        assert.equal(workspaceTheme.text, '#e5e7eb', JSON.stringify(workspaceTheme));
        assert.ok(workspaceTheme.painted > 100, JSON.stringify(workspaceTheme));
        const revitDownloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Revit', exact: true }).click();
        const revitDownload = await revitDownloadPromise;
        const revitPath = path.join(output, revitDownload.suggestedFilename());
        await revitDownload.saveAs(revitPath);
        const downloadedRevitManifest = JSON.parse(fs.readFileSync(revitPath, 'utf8'));
        assert.equal(downloadedRevitManifest.contract, 'FutolStructure.RevitNativeImport.v1');
        assert.equal(downloadedRevitManifest.rebar.status, 'PENDING_APPROVED_DESIGN_RESULTS');
        assert.equal(downloadedRevitManifest.model.columns.length, revit.columns);
        const before = await page.evaluate(() => {
            const m = collectCSIExportModelData();
            return JSON.stringify({ columns: m.columns, beams: m.beams, slabs: m.slabs, foundation: m.foundation });
        });
        await page.locator('[data-tab-group="analysis"].plan-tab-group-btn').click();
        await page.locator('#panelAnalysisWorkbench').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#planModelTools').isVisible(), false);
        const canonicalAudit = await page.evaluate(() => ({
            status: document.getElementById('canonicalAnalyticalAudit')?.dataset.auditStatus || '',
            text: document.getElementById('canonicalAnalyticalAudit')?.textContent || '',
            wallSolverParked: document.getElementById('wallEditorSolver')?.disabled === true,
            roofSolverParked: document.getElementById('roofFrameSolver')?.disabled === true
        }));
        assert.match(canonicalAudit.status, /READY_FOR_SOLVER_REVIEW|BLOCKED_OR_REVIEW_REQUIRED/);
        assert.match(canonicalAudit.text, /Canonical \/ analytical contract/);
        assert.equal(canonicalAudit.wallSolverParked, true);
        assert.equal(canonicalAudit.roofSolverParked, true);
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
        const stairPlacement = await page.evaluate(() => {
            const before = calculateStairBuilderPreview();
            if (!before?.baseBounds) return { ready: false, reason: 'preview-not-ready' };
            setStairPlacementOffsets(0.15, -0.1, 'free', '');
            const manual = calculateStairBuilderPreview();
            const canvas = document.getElementById('stairPlan2DCanvas');
            const rect = canvas.getBoundingClientRect();
            canvas.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                clientX: rect.left + rect.width * 0.18,
                clientY: rect.top + rect.height * 0.22
            }));
            const clicked = calculateStairBuilderPreview();
            const normalized = EngineStairs.normalizeStair({
                id: 'ST-QA-PLACEMENT',
                fromFloorId: before.fromFloorId,
                toFloorId: before.toFloorId,
                bayX: before.bayX,
                bayY: before.bayY,
                bounds: clicked.bounds,
                placement: clicked.placement
            });
            const audit = {
                ready: true,
                bound: canvas.dataset.placementBound === 'true',
                manualDeltaX: manual.bounds.x1 - before.bounds.x1,
                manualDeltaY: manual.bounds.y1 - before.bounds.y1,
                clickedPlacement: clicked.placement,
                normalizedPlacement: normalized?.placement || null
            };
            resetStairPlacement();
            return audit;
        });
        assert.equal(stairPlacement.ready, true, JSON.stringify(stairPlacement));
        assert.equal(stairPlacement.bound, true, JSON.stringify(stairPlacement));
        assert.ok(Math.abs(stairPlacement.manualDeltaX - 0.15) < 0.001, JSON.stringify(stairPlacement));
        assert.ok(Math.abs(stairPlacement.manualDeltaY + 0.1) < 0.001, JSON.stringify(stairPlacement));
        assert.ok(['grid', 'column', 'free'].includes(stairPlacement.clickedPlacement.snapMode), JSON.stringify(stairPlacement));
        assert.deepEqual(stairPlacement.normalizedPlacement, stairPlacement.clickedPlacement, JSON.stringify(stairPlacement));
        await page.screenshot({ path: path.join(output, 'stair-builder-2d-desktop.png'), fullPage: true });
        await page.locator('#tabWallElevations').click();
        await page.locator('#panelWallElevations').waitFor({ state: 'visible' });
        const wallEditor = await page.evaluate(() => {
            const floor = state.floors[0];
            const before = globalThis.FSWalls.build({ floors: state.floors });
            wallEditorDraft = {
                start: { x: 0, y: 0, snap: { mode: 'grid', targetId: 'GRID-A1', toleranceM: 0.45 } },
                end: { x: Math.min(2, state.xSpans[0] || 2), y: 0, snap: { mode: 'grid', targetId: 'GRID-B1', toleranceM: 0.45 } }
            };
            document.getElementById('wallEditorFloor').value = floor.id;
            document.getElementById('wallEditorSolver').checked = false;
            document.getElementById('wallEditorThickness').value = '150';
            document.getElementById('wallEditorHeight').value = '3';
            document.getElementById('wallEditorOpeningType').value = 'window';
            document.getElementById('wallEditorOpeningWidth').value = '1.2';
            document.getElementById('wallEditorOpeningHeight').value = '1';
            document.getElementById('wallEditorOpeningSill').value = '0.9';
            document.getElementById('wallEditorOpeningCount').value = '2';
            document.getElementById('wallEditorLintel').checked = true;
            document.getElementById('wallEditorLintelWidth').value = '150';
            document.getElementById('wallEditorLintelDepth').value = '250';
            addWallFromPlan();
            const after = globalThis.FSWalls.build({ floors: state.floors });
            const created = after.walls.find(item => item.source === 'manual-wall-line' && !before.walls.some(previous => previous.id === item.id));
            if (created) editWallFromPlan(created.floorId, created.id);
            const loaded = {
                selectedId: wallEditorSelectedId,
                openingType: document.getElementById('wallEditorOpeningType').value,
                openingCount: Number(document.getElementById('wallEditorOpeningCount').value),
                lintelDepthMm: Number(document.getElementById('wallEditorLintelDepth').value),
                snapStart: wallEditorDraft.start?.snap?.mode || ''
            };
            document.getElementById('wallEditorOpeningCount').value = '1';
            document.getElementById('wallEditorLintelDepth').value = '300';
            if (created) addWallFromPlan();
            const updatedInventory = globalThis.FSWalls.build({ floors: state.floors });
            const updated = updatedInventory.walls.find(item => item.id === created?.id);
            const elevation = updatedInventory.elevations.find(item => item.wallId === created?.id);
            const persistedProject = validateProjectData(JSON.parse(JSON.stringify(buildProjectData())));
            const persistedWall = persistedProject.floors
                .find(item => item.id === floor.id)?.wallLoads
                ?.find(item => item.id === created?.id);
            const audit = {
                beforeCount: before.walls.length,
                afterCount: after.walls.length,
                updatedCount: updatedInventory.walls.length,
                createdId: created?.id || '',
                lengthM: created?.lengthM || 0,
                snapStart: created?.endpoints?.start?.snap?.mode || '',
                solverExport: created?.exportToSolvers === true,
                canvasBound: document.getElementById('wallPlanCanvas')?.dataset.bound === 'true',
                loaded,
                updatedOpening: updated?.openings?.[0] || null,
                updatedLintel: updated?.lintel || null,
                openingHeadElevationM: elevation?.openings?.[0]?.headElevationM,
                persistedWall: persistedWall ? {
                    source: persistedWall.source,
                    x1: persistedWall.x1,
                    endSnapMode: persistedWall.endSnap?.mode,
                    plasterInsideMm: persistedWall.plasterInsideMm,
                    openingCount: persistedWall.openings?.[0]?.count,
                    lintelDepthMm: persistedWall.lintel?.depthMm,
                    exportToSolvers: persistedWall.exportToSolvers,
                    exportToIFC: persistedWall.exportToIFC
                } : null,
                selectedIdCleared: wallEditorSelectedId === ''
            };
            if (updated) removeWallFromPlan(updated.floorId, updated.id);
            return audit;
        });
        assert.equal(wallEditor.afterCount, wallEditor.beforeCount + 1, JSON.stringify(wallEditor));
        assert.match(wallEditor.createdId, /^WL-/);
        assert.ok(wallEditor.lengthM > 0.05, JSON.stringify(wallEditor));
        assert.equal(wallEditor.snapStart, 'grid', JSON.stringify(wallEditor));
        assert.equal(wallEditor.solverExport, false, JSON.stringify(wallEditor));
        assert.equal(wallEditor.canvasBound, true, JSON.stringify(wallEditor));
        assert.equal(wallEditor.loaded.selectedId, wallEditor.createdId, JSON.stringify(wallEditor));
        assert.equal(wallEditor.loaded.openingType, 'window', JSON.stringify(wallEditor));
        assert.equal(wallEditor.loaded.openingCount, 2, JSON.stringify(wallEditor));
        assert.equal(wallEditor.loaded.lintelDepthMm, 250, JSON.stringify(wallEditor));
        assert.equal(wallEditor.loaded.snapStart, 'grid', JSON.stringify(wallEditor));
        assert.equal(wallEditor.updatedCount, wallEditor.afterCount, JSON.stringify(wallEditor));
        assert.equal(wallEditor.updatedOpening.type, 'window', JSON.stringify(wallEditor));
        assert.equal(wallEditor.updatedOpening.count, 1, JSON.stringify(wallEditor));
        assert.equal(wallEditor.updatedLintel.widthMm, 150, JSON.stringify(wallEditor));
        assert.equal(wallEditor.updatedLintel.depthMm, 300, JSON.stringify(wallEditor));
        assert.ok(Number.isFinite(wallEditor.openingHeadElevationM), JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.source, 'manual-wall-line', JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.x1, 0, JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.endSnapMode, 'grid', JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.plasterInsideMm, 15, JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.openingCount, 1, JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.lintelDepthMm, 300, JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.exportToSolvers, false, JSON.stringify(wallEditor));
        assert.equal(wallEditor.persistedWall.exportToIFC, true, JSON.stringify(wallEditor));
        assert.equal(wallEditor.selectedIdCleared, true, JSON.stringify(wallEditor));
        await page.locator('#tabRoofFrame').click();
        await page.locator('#panelRoofFrame').waitFor({ state: 'visible' });
        const roofSupportAudit = await page.evaluate(() => {
            const original = JSON.parse(JSON.stringify(state.roofFrame || { enabled: false, members: [] }));
            const beforeCount = original.members?.length || 0;
            const z = getRoofFrameElevation();
            roofFrameDraft = {
                start: { x: 0, y: 0, snap: { mode: 'grid', targetId: 'GRID-A1', toleranceM: 0.45 } },
                end: { x: Math.min(2, state.xSpans[0] || 2), y: 0, snap: { mode: 'grid', targetId: 'GRID-B1', toleranceM: 0.45 } }
            };
            document.getElementById('roofFrameMemberType').value = 'rafter';
            document.getElementById('roofFrameSection').value = 'RHS-100x50x3';
            document.getElementById('roofFrameStartZ').value = String(z);
            document.getElementById('roofFrameEndZ').value = String(z + 0.6);
            document.getElementById('roofFrameDeadLoad').value = '0.35';
            document.getElementById('roofFrameLiveLoad').value = '0.25';
            document.getElementById('roofFrameSolver').checked = false;
            addRoofFrameMember();
            let model = globalThis.FSRoofFrame.build({ floors: state.floors, columns: state.columns, roofFrame: state.roofFrame });
            const created = model.members.find(item => !original.members?.some(previous => previous.id === item.id));
            if (created) editRoofFrameMember(created.id);
            const loadedId = roofFrameSelectedId;
            document.getElementById('roofFrameLiveLoad').value = '0.3';
            if (created) addRoofFrameMember();
            model = globalThis.FSRoofFrame.build({ floors: state.floors, columns: state.columns, roofFrame: state.roofFrame });
            const updated = model.members.find(item => item.id === created?.id);
            const persisted = buildProjectData({ savedAt: '2026-09-06T00:00:00.000Z' }).roofFrame;
            const canvas = document.getElementById('roofFrameCanvas');
            const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data || [];
            let painted = 0;
            for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 30) painted += 1;
            }
            const audit = {
                policy: model.supportPolicy,
                assignments: model.supportPlan.assignments,
                painted,
                advice: document.getElementById('roofFrameSupportAdvice')?.innerText || '',
                beforeCount,
                afterCount: model.members.length,
                createdId: created?.id || '',
                loadedId,
                updated,
                loads: model.loads,
                persistedCount: persisted.members?.length || 0,
                placementBound: canvas?.dataset.memberPlacementBound === 'true'
            };
            state.roofFrame = original;
            roofFrameSelectedId = '';
            roofFrameDraft = { start: null, end: null };
            populateRoofFrame();
            return audit;
        });
        assert.ok(roofSupportAudit.assignments.length > 0, JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.assignments.some(item => item.supportType === 'hinge'), JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.assignments.some(item => item.supportType === 'roller'), JSON.stringify(roofSupportAudit));
        assert.ok(roofSupportAudit.painted > 100, JSON.stringify(roofSupportAudit));
        assert.match(roofSupportAudit.advice, /HINGE \+ ROLLER/i);
        assert.equal(roofSupportAudit.afterCount, roofSupportAudit.beforeCount + 1, JSON.stringify(roofSupportAudit));
        assert.match(roofSupportAudit.createdId, /^RF-/);
        assert.equal(roofSupportAudit.loadedId, roofSupportAudit.createdId, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.updated.liveLoadKNm, 0.3, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.updated.deadLoadKNm, 0.35, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.updated.exportToSolvers, false, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.loads.length, 2, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.persistedCount, roofSupportAudit.afterCount, JSON.stringify(roofSupportAudit));
        assert.equal(roofSupportAudit.placementBound, true, JSON.stringify(roofSupportAudit));
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
        console.log(JSON.stringify({ ok: true, evidence: output, viewports: [1440, 768, 390], draft: path.basename(filename), revitManifest: path.basename(revitPath), stairPlacement, wallEditor, roofFrame: roofSupportAudit, revit, footingSbc, workspaceTheme, canonicalAudit, geometryPreserved: true, pageErrors: errors }));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
