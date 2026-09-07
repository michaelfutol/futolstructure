'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.FS_PLAYWRIGHT_MODULE || 'playwright');

function getArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

async function main() {
    const projectArgument = getArg('--project');
    const outputArgument = getArg('--output');
    assert(projectArgument, 'Use --project <project.fstr>.');
    assert(outputArgument, 'Use --output <request.json>.');
    const projectPath = path.resolve(projectArgument);
    const outputPath = path.resolve(outputArgument);
    assert(fs.existsSync(projectPath), `Project file not found: ${projectPath}`);

    const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
    const root = path.resolve(__dirname, '../..');
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());

    try {
        await page.goto(pathToFileURL(path.join(root, 'v3/index.html')).href);
        await page.waitForFunction(() => typeof collectCSIExportModelData === 'function' && state.columns.length > 0);
        const result = await page.evaluate(({ projectData, projectName }) => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            const validated = typeof validateProjectData === 'function'
                ? validateProjectData(projectData)
                : projectData;
            applyLoadedProject(validated, projectName, {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            calculate();
            const model = collectCSIExportModelData();
            const job = window.FSPyNite.prepareJob(model);
            return {
                status: job.status,
                request: job.runRequest,
                counts: model.counts,
                blockers: job.runRequest.blockers,
                warnings: job.runRequest.warnings
            };
        }, { projectData: project, projectName: path.basename(projectPath) });

        assert.equal(result.status, 'READY_FOR_RUN', JSON.stringify(result.blockers));
        assert.equal(result.request.contract, 'FutolStructure.PyNiteRunRequest.v1');
        assert.deepEqual(pageErrors, []);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(result.request, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({
            ok: true,
            project: projectPath,
            output: outputPath,
            counts: result.counts,
            warnings: result.warnings
        }));
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
