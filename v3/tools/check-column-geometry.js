#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { columnLineInterval, beamCorners } = require('../engine/frame-geometry.js');
const { ensureBrowser, openAppTab, DEFAULT_PORT } = require('./check-fs.js');

function unitChecks() {
    const column = { center: { x: 0, y: 0 }, size: { b: 200, h: 400 }, orientationDeg: 0 };
    const line = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    assert.equal(columnLineInterval(...line, column).exit, 0.025);
    column.orientationDeg = 90;
    assert.equal(columnLineInterval(...line, column).exit, 0.05);
    column.orientationDeg = 45;
    assert.ok(Math.abs(columnLineInterval(...line, column).exit * 4 - Math.SQRT2 * 0.1) < 1e-10);
    assert.equal(columnLineInterval({ x: 0, y: 2 }, { x: 4, y: 2 }, column), null);
    column.orientationDeg = 0;
    assert.ok(columnLineInterval({ x: 0, y: 0.2 }, { x: 4, y: 0.2 }, column));
    assert.equal(columnLineInterval({ x: 4, y: 0 }, { x: 0, y: 0 }, column).enter, 0.975);
    const corners = beamCorners({ x1: 0, y1: 0, x2: 3, y2: 4 }, 0.25);
    assert.equal(corners.length, 4);
    assert.ok(Math.abs(Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y) - 0.25) < 1e-10);
    assert.deepEqual(beamCorners({ x1: 0, y1: 0, x2: 0, y2: 0 }, 0.25), []);
    return 8;
}

async function main() {
    const units = unitChecks();
    if (process.argv.includes('--unit-only')) { console.log(JSON.stringify({ ok: true, units })); return; }
    const browser = await ensureBrowser(DEFAULT_PORT);
    let tab;
    const output = path.resolve(__dirname, '../../output/acceptance/rc12-column-authority');
    fs.mkdirSync(output, { recursive: true });
    try {
        tab = await openAppTab(browser.base);
        const baselineFixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/canonical-analytical-bacacay-v1.json'), 'utf8'));
        const baseline = await tab.evaluate(`(() => {
            autosaveSuppressed = true;
            state.columnPositionLocked = false;
            state.columnGeometryLock = null;
            state.columnAlignment = 'outer';
            state.xSpans = [4, 4]; state.ySpans = [5, 5];
            state.cantilevers = { top: [0, 0], bottom: [0, 0], left: [0, 0], right: [0, 0] };
            state.floors = [createFloor('2F', '2nd Floor', 2, 2), createFloor('RF', 'Roof', 2, 2,
                { isRoof: true, dlSuper: 1.5, liveLoad: 1, slabThickness: 120, wallLoad: 0 })];
            state.currentFloorIndex = 0;
            state.columns = []; state.beams = []; state.slabs = [];
            state.defaultColumnB = 0; state.defaultColumnH = 0;
            state.defaultBeamB = 250; state.defaultBeamH = 0;
            state.beamSizeOverrides = {}; state.beamAlignmentOverrides = {};
            state.columnPositionOverrides = {}; state.foundationTieBeamAlignmentOverrides = {};
            calculate();
            return FSSolverRoundTrip.compareCanonicalAnalyticalFixture(collectCSIExportModelData(), ${JSON.stringify(baselineFixture)});
        })()`);
        assert.equal(baseline.status, 'PASS', JSON.stringify(baseline));
        const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-v2.8-2floor.fstr'), 'utf8'));
        fixture.columnAlignment = 'outer';
        fixture.columnPositionLocked = false;
        fixture.cantilevers = { top: [0, 0], bottom: [0, 0], left: [0, 0], right: [0, 0] };
        fixture.floors.forEach(floor => {
            floor.deletedBeams = []; floor.lockedBeams = []; floor.voidSlabs = [];
            floor.cantilevers = fixture.cantilevers;
        });
        fixture.columnOverrides = [
            { id: 'A1', overrideB: 250, overrideH: 450, orientationDeg: 0 },
            { id: 'B1', overrideB: 450, overrideH: 250, orientationDeg: 90 },
            { id: 'C1', overrideB: 300, overrideH: 450, orientationDeg: 90 }
        ];
        const result = await tab.evaluate(`(() => {
            let assertions = 0;
            const check = (condition, message) => { assertions++; if (!condition) throw new Error(message); };
            const near = (a, b) => Math.abs(a - b) < 1e-8;
            const alerts = [];
            window.alert = message => alerts.push(String(message));
            const originalStatus = setNudgeStatus;
            setNudgeStatus = (message, tone) => { if (tone === 'warning') alerts.push(message); originalStatus(message, tone); };
            autosaveSuppressed = true;
            applyLoadedProject(${JSON.stringify(fixture)}, 'column-authority-fixture.fstr', { skipAutosave: true });
            const position = id => getColumnPlanPosition(state.columns.find(col => col.id === id));
            const a = state.columns.find(col => col.id === 'A1');
            const before = position('A1');
            check(near(before.x, 0.125) && near(before.y, 0.225), 'Legacy outer placement was not preserved');
            updateColumnParam('A1', 'orientationDeg', 90);
            updateColumnParam('A1', 'webB', 300);
            calculate();
            check(near(position('A1').x, before.x) && near(position('A1').y, before.y), 'Resize/rotation moved the column centroid');
            const centers = state.columns.map(col => ({ id: col.id, ...getColumnPlanPosition(col) }));
            toggleColumnAlignment();
            check(state.columnAlignment === 'center', 'Beam centered mode did not engage');
            centers.forEach(saved => check(near(position(saved.id).x, saved.x) && near(position(saved.id).y, saved.y), 'Beam alignment moved columns'));
            const floorId = state.floors[state.currentFloorIndex].id;
            const topBeam = state.beams.find(beam => beam.direction === 'X' && beam.startCol === 'A1' && beam.endCol === 'B1');
            check(!!topBeam, 'Fixture top beam missing');
            const centered = getBeamAnalyticalPhysicalGeometry(topBeam, floorId);
            const rendered = getRenderedBeamPlanSegment(topBeam, a, state.columns.find(col => col.id === 'B1'));
            check(near(rendered.x1, before.x) && near(rendered.y1, before.y), 'Centered canonical axis is not on fixed centroid');
            check(near(centered.analytical.x1, before.x) && near(centered.analytical.y1, before.y), 'Analytical start is not on column centroid');
            toggleColumnAlignment();
            const flushed = getBeamAnalyticalPhysicalGeometry(topBeam, floorId);
            check(near(flushed.analytical.x1, centered.analytical.x1) && near(flushed.analytical.y1, centered.analytical.y1), 'Flush mode altered analytical joints');
            check(!near(flushed.physical.y1, centered.physical.y1), 'Flush mode did not move canonical axis');
            check(near(flushed.physical.x1 - flushed.analytical.x1, flushed.jointOffsets.start.dx), 'Start eccentricity is not physical minus analytical');
            check(near(flushed.physical.y2 - flushed.analytical.y2, flushed.jointOffsets.end.dy), 'End eccentricity is not physical minus analytical');
            const drawn = getBeamPlanDrawGeometry(topBeam, floorId, { trimToJunction: true });
            check(drawn.corners.length === 4, 'Canonical outline missing');

            toggleColumnPositionLock(true);
            const frozen = JSON.stringify(state.columnGeometryLock);
            alerts.length = 0;
            updateColumnParam('A1', 'webB', 800);
            updateColumnParam('A1', 'orientationDeg', 0);
            updateSpan('x', 0, 8);
            updateDefaultColumnSize('b', 700);
            check(alerts.length === 4, 'Blocked edits did not give visible feedback: ' + JSON.stringify(alerts));
            calculate();
            check(JSON.stringify(state.columnGeometryLock) === frozen, 'Recalculation changed locked geometry');
            const saved = buildProjectData();
            applyLoadedProject(saved, 'roundtrip.fstr', { skipAutosave: true });
            check(JSON.stringify(state.columnGeometryLock) === frozen, 'FSTR roundtrip changed column authority');
            assertColumnGeometryUnchanged();
            const mutate = state.columns.find(col => col.id === 'A1');
            const tamper = (object, key, value) => {
                const original = object[key]; object[key] = value;
                let blocked = false;
                try { collectCSIExportModelData(); } catch (error) { blocked = error.message.includes('Locked column geometry changed'); }
                object[key] = original;
                check(blocked, 'Export accepted tampered ' + key);
            };
            tamper(mutate, 'webB', 800);
            tamper(mutate, 'orientationDeg', 45);
            tamper(mutate, 'orientationDeg', NaN);
            tamper(mutate, 'x', 1);
            tamper(mutate.centroidReference, 'dx', 1);
            const snapshot = createStateSnapshot();
            toggleColumnPositionLock(false);
            restoreStateSnapshot(snapshot);
            assertColumnGeometryUnchanged();
            check(state.columnPositionLocked && JSON.stringify(state.columnGeometryLock) === frozen, 'Undo snapshot lost column authority');

            toggleColumnPositionLock(false);
            const model = collectCSIExportModelData();
            const std = generateSTAADContent(model);
            const script = generateETABSOAPIScript(model);
            check(state.columnPositionLocked && !!model.columnGeometryAuthority, 'Solver export did not lock columns');
            const exportedBeam = model.beams.find(beam => beam.sourceId === topBeam.id && beam.floorId === floorId);
            check(exportedBeam && near(exportedBeam.x1, before.x) && near(exportedBeam.y1, -before.y), 'Solver beam joint drifted from fixed column centroid');
            const stale = JSON.parse(JSON.stringify(model));
            stale.columns[0].sourcePlanX += 0.1;
            let staleBlocked = false;
            try { generateETABSOAPIScript(stale); } catch (error) { staleBlocked = error.message.includes('differs from the locked column geometry'); }
            check(staleBlocked, 'Stale solver payload was accepted');
            const invalidBeam = JSON.parse(JSON.stringify(model));
            invalidBeam.beams[0].x1 = NaN;
            let invalidBeamBlocked = false;
            try { prepareSolverColumnGeometry(invalidBeam); } catch (error) { invalidBeamBlocked = error.message.includes('locked centroid'); }
            check(invalidBeamBlocked, 'Nonfinite analytical beam joint was accepted');
            const ifc = generateIFCContent(model);
            const dxf = generateDXFContent();
            resizeCanvas(); fitView(); draw();
            return { ok: true, units: ${units}, assertions, blockedEdits: alerts,
                preservedCentroid: before, centered: centered.physical, flushed: flushed.physical,
                columnGeometryAuthority: model.columnGeometryAuthority,
                transformAudit: model.analyticalGeometry.sharedTransformAudit,
                std, script, ifc, dxf };
        })()`);
        for (const [key, filename] of Object.entries({ std: 'column-authority.std', script: 'column-authority-etabs.ps1', ifc: 'column-authority.ifc', dxf: 'column-authority.dxf' })) {
            fs.writeFileSync(path.join(output, filename), result[key]); delete result[key];
        }
        result.canonicalBaseline = baseline;
        await tab.screenshot(path.join(output, 'plan.png'));
        fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(result, null, 2));
        console.log(JSON.stringify({ ok: true, units, assertions: result.assertions, output, preservedCentroid: result.preservedCentroid, centered: result.centered, flushed: result.flushed }, null, 2));
    } finally {
        if (tab) tab.close();
        if (browser.process) browser.process.kill();
    }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
