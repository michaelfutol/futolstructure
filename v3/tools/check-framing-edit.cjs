const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
        await page.waitForFunction(() => typeof calculate === 'function' && state.columns.length);
        for (const [id, value, property] of [
            ['columnWidthInput', '325', 'defaultColumnB'],
            ['columnDepthInput', '450', 'defaultColumnH'],
            ['beamWidthInput', '275', 'defaultBeamB'],
            ['beamDepthInput', '425', 'defaultBeamH']
        ]) {
            const input = page.locator('#' + id);
            await input.click();
            await input.press('ControlOrMeta+a');
            await input.pressSequentially(value);
            assert.equal(await input.inputValue(), value, id + ' typing');
            await input.press('Enter');
            assert.equal(await page.evaluate(key => state[key], property), Number(value), id + ' committed');
        }
        const geometry = await page.evaluate(() => {
            state.columnAlignment = 'outer';
            state.floors[0].cantilevers = { top: [0,0], bottom: [1.2,1.2], left: [0,0], right: [0,0] };
            state.cantilevers = state.floors[0].cantilevers;
            calculate();
            return state.beams.filter(b => b.isEdgeBeam).map(b => ({ id:b.id,
                geometry:getBeamPlanDrawGeometry(b, state.floors[0].id),
                start:getBeamPlanDrawGeometry(getEdgeBeamTerminationMember(b, 'start', state.floors[0].id), state.floors[0].id),
                end:getBeamPlanDrawGeometry(getEdgeBeamTerminationMember(b, 'end', state.floors[0].id), state.floors[0].id)
            }));
        });
        assert.equal(geometry.length, 2);
        for (const b of geometry) {
            assert.ok(Math.abs(b.geometry.rect.left - b.start.rect.right) < 1e-8, b.id + ' start gap');
            assert.ok(Math.abs(b.geometry.rect.right - b.end.rect.left) < 1e-8, b.id + ' end gap');
        }
        const changed = await page.evaluate(() => {
            state.defaultBeamB = 350;
            const beam = state.beams.find(b => b.isEdgeBeam);
            const side = getEdgeBeamTerminationMember(beam, 'start', state.floors[0].id);
            return { edge:getBeamPlanDrawGeometry(beam, state.floors[0].id).rect,
                side:getBeamPlanDrawGeometry(side, state.floors[0].id).rect,
                dimensions:getCantileverProjectionDimensions() };
        });
        assert.ok(Math.abs(changed.edge.left - changed.side.right) < 1e-8, 'Width change must not leave a stale end face');
        assert.equal(changed.dimensions.filter(d => d.label === '1200').length, 1);
        await page.evaluate(() => { fitView(); draw(); });
        await page.screenshot({ path:path.resolve(__dirname, '../../output/playwright/framing-edit.png') });
        for (const [tab, body, value] of [['colSchedule', 'colScheduleBody', '375'], ['beamSchedule', 'beamScheduleBody', '325']]) {
            await page.evaluate(tab => setPlanTab(tab), tab);
            const input = page.locator(`#${body} input[type="number"]`).first();
            await input.click();
            await input.press('ControlOrMeta+a');
            await input.pressSequentially(value);
            assert.equal(await input.inputValue(), value, tab + ' typed value');
            await input.press('Enter');
            assert.equal(await page.locator(`#${body} input[type="number"]`).first().inputValue(), value, tab + ' committed value');
        }
        console.log(JSON.stringify({ ok:true, typedSizes:true, edgeFacesMeet:true, projectionDimension:'1200' }));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
