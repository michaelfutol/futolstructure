'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');

async function typeAndCommit(page, locator, value, label) {
    await locator.click();
    await locator.press('ControlOrMeta+a');
    await locator.pressSequentially(value);
    assert.equal(await locator.inputValue(), value, `${label}: typed value`);
    await locator.press('Enter');
    assert.equal(await locator.inputValue(), value, `${label}: committed value`);
}

async function main() {
    const executablePath = process.argv[2];
    assert.ok(executablePath && fs.existsSync(executablePath), 'Pass the installed FutolStructure executable path');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-rc7-framing-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ executablePath, args: ['--user-data-dir=' + profile], env, timeout: 60000 });
    try {
        const page = await app.firstWindow();
        await page.waitForFunction(() => typeof calculate === 'function' && state.columns.length > 0);
        await typeAndCommit(page, page.locator('#columnWidthInput'), '325', 'Column B');
        await typeAndCommit(page, page.locator('#columnDepthInput'), '450', 'Column H');
        await typeAndCommit(page, page.locator('#beamWidthInput'), '275', 'Beam B');
        await typeAndCommit(page, page.locator('#beamDepthInput'), '425', 'Beam H');
        await page.evaluate(() => setPlanTab('colSchedule'));
        await typeAndCommit(page, page.locator('#colScheduleBody input[type="number"]').first(), '375', 'Column schedule');
        await page.evaluate(() => setPlanTab('beamSchedule'));
        await typeAndCommit(page, page.locator('#beamScheduleBody input[type="number"]').first(), '325', 'Beam schedule');
        console.log(JSON.stringify({ ok: true, installedTyping: true }));
    } finally {
        await app.close();
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
