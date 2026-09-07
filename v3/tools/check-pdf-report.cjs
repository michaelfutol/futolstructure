'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');

async function main() {
    const root = path.resolve(__dirname, '../..');
    const projectPath = path.resolve(process.argv[2] || '');
    const outputPath = path.resolve(process.argv[3] || path.join(root, 'output/pdf/FutolStructure_Report_Acceptance.pdf'));
    assert.ok(fs.existsSync(projectPath), `Project not found: ${projectPath}`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const appPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const pageErrors = [];
        appPage.on('pageerror', error => pageErrors.push(error.message));
        appPage.on('dialog', dialog => dialog.dismiss());
        await appPage.goto(pathToFileURL(path.join(root, 'v3/index.html')).href);
        await appPage.waitForFunction(() => typeof collectCSIExportModelData === 'function' && typeof generatePDFReport === 'function');
        const generated = await appPage.evaluate(async ({ projectData, projectName }) => {
            applyLoadedProject(validateProjectData(projectData), projectName, {
                silent: true,
                quarantineHiddenGeometry: true
            });
            calculate();
            globalThis.FutolStructureDesktop = {
                isDesktop: true,
                exportPdfReport: async payload => {
                    globalThis.__capturedPdfReport = payload;
                    return { success: true, filePath: 'acceptance-capture.pdf', bytes: payload.html.length };
                }
            };
            const result = await generatePDFReport();
            return { result, payload: globalThis.__capturedPdfReport };
        }, { projectData, projectName: path.basename(projectPath) });
        assert.equal(generated.result?.success, true, JSON.stringify(generated.result));
        assert.ok(generated.payload?.html?.includes('STRUCTURAL COMPUTATION REPORT'));
        assert.ok(generated.payload?.html?.includes('font-family: Arial'));
        assert.ok(generated.payload?.suggestedName?.endsWith('.pdf'));
        assert.deepEqual(pageErrors, []);

        const reportPage = await browser.newPage();
        await reportPage.setContent(generated.payload.html, { waitUntil: 'load' });
        await reportPage.emulateMedia({ media: 'print' });
        await reportPage.pdf({
            path: outputPath,
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true
        });
        await reportPage.close();
    } finally {
        await browser.close();
    }

    const bytes = fs.readFileSync(outputPath);
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(bytes.length > 20000, `Generated PDF is unexpectedly small: ${bytes.length} bytes`);
    console.log(JSON.stringify({ ok: true, projectPath, outputPath, bytes: bytes.length }));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
