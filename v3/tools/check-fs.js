#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const V3 = path.join(ROOT, 'v3');
const INDEX = path.join(V3, 'index.html');
const DEFAULT_PORT = Number(process.env.FS_CDP_PORT || 9234);
const KEEP_BROWSER = process.env.FS_KEEP_BROWSER === '1' || process.argv.includes('--keep-browser');
const HIDDEN_GEOMETRY_POLICY = 'preserve-intentional-hidden-geometry';
const APP_URL = process.env.FS_APP_URL || fileUrl(INDEX);

function assert(condition, message, details = undefined) {
    if (!condition) {
        const err = new Error(message);
        err.details = details;
        throw err;
    }
}

function fileUrl(filePath) {
    return 'file:///' + path.resolve(filePath).replace(/\\/g, '/').replace(/ /g, '%20');
}

function parseInlineScripts() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(match => match[1])
        .filter(script => script.trim());

    scripts.forEach((script, index) => {
        new vm.Script(script, { filename: `inline-${index}.js` });
    });

    return { inlineScripts: scripts.length };
}

function checkNodeSyntax(relativeFile) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, relativeFile)], {
        stdio: 'pipe'
    });
}

function sortSlabsTopLeftForQa(a, b) {
    const ay = Math.min(Number(a?.y1) || 0, Number(a?.y2) || 0);
    const by = Math.min(Number(b?.y1) || 0, Number(b?.y2) || 0);
    if (Math.abs(ay - by) > 0.01) return ay - by;
    const ax = Math.min(Number(a?.x1) || 0, Number(a?.x2) || 0);
    const bx = Math.min(Number(b?.x1) || 0, Number(b?.x2) || 0);
    if (Math.abs(ax - bx) > 0.01) return ax - bx;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function getActiveSlabDisplayMarksForQa(slabs, prefix, predicate) {
    return (slabs || [])
        .filter(slab => slab && !slab.isVoid && predicate(slab))
        .sort(sortSlabsTopLeftForQa)
        .map((slab, index) => ({ id: slab.id, mark: `${prefix}${index + 1}` }));
}

function checkDisplayMarkOrdering() {
    const slabs = [
        { id: 'S1', x1: 0, y1: 0, x2: 1, y2: 1, isVoid: true },
        { id: 'S2', x1: 1, y1: 0, x2: 2, y2: 1 },
        { id: 'S3', x1: 2, y1: 0, x2: 3, y2: 1 },
        { id: 'S4', x1: 0, y1: 1, x2: 1, y2: 2 },
        { id: 'S5', x1: 1, y1: 1, x2: 2, y2: 2, isVoid: true },
        { id: 'S6', x1: 2, y1: 1, x2: 3, y2: 2 },
        { id: 'SC-R2', x1: 3, y1: 1, x2: 4, y2: 2, isCantilever: true },
        { id: 'SC-T1', x1: 0, y1: -1, x2: 1, y2: 0, isCantilever: true }
    ];
    const regularMarks = getActiveSlabDisplayMarksForQa(slabs, 'S', slab => !slab.isCantilever);
    const cantileverMarks = getActiveSlabDisplayMarksForQa(slabs, 'CS-', slab => slab.isCantilever);
    assert(
        JSON.stringify(regularMarks) === JSON.stringify([
            { id: 'S2', mark: 'S1' },
            { id: 'S3', mark: 'S2' },
            { id: 'S4', mark: 'S3' },
            { id: 'S6', mark: 'S4' }
        ]),
        'Active regular slab display marks did not close deleted-slab numbering gaps',
        regularMarks
    );
    assert(
        JSON.stringify(cantileverMarks) === JSON.stringify([
            { id: 'SC-T1', mark: 'CS-1' },
            { id: 'SC-R2', mark: 'CS-2' }
        ]),
        'Active cantilever slab display marks were not sorted top-left',
        cantileverMarks
    );
    return { regularMarks, cantileverMarks };
}

function getArgValue(name) {
    const index = process.argv.indexOf(name);
    if (index < 0 || index + 1 >= process.argv.length) return null;
    return process.argv[index + 1];
}

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
    return response.json();
}

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);

    return candidates.find(candidate => fs.existsSync(candidate));
}

async function ensureBrowser(port) {
    const base = `http://127.0.0.1:${port}`;
    try {
        await fetchJson(`${base}/json/version`);
        return { base, process: null };
    } catch (err) {
        // Launch below.
    }

    const browser = findChrome();
    assert(browser, 'Chrome or Edge executable was not found. Set CHROME_PATH to run browser smoke checks.');

    let profileDir = process.env.FS_CDP_PROFILE_DIR || path.join(os.tmpdir(), `fs-codex-smoke-${port}`);
    if (!KEEP_BROWSER) {
        try {
            fs.rmSync(profileDir, { recursive: true, force: true });
        } catch (err) {
            profileDir = path.join(os.tmpdir(), `fs-codex-smoke-${port}-${Date.now()}`);
        }
    }
    fs.mkdirSync(profileDir, { recursive: true });

    const child = spawn(browser, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-networking',
        'about:blank'
    ], {
        detached: false,
        stdio: 'ignore'
    });
    child.unref();

    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            await fetchJson(`${base}/json/version`);
            return { base, process: child };
        } catch (err) {
            await wait(250);
        }
    }

    throw new Error(`Browser did not open a CDP endpoint on port ${port}`);
}

class CdpTab {
    constructor(webSocketDebuggerUrl) {
        this.ws = new WebSocket(webSocketDebuggerUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.logs = [];
        this.opened = new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
        this.ws.onmessage = event => this.handleMessage(event.data);
    }

    handleMessage(raw) {
        const message = JSON.parse(raw.toString());
        if (message.id && this.pending.has(message.id)) {
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
                pending.reject(new Error(`${pending.method}: ${message.error.message}`));
            } else {
                pending.resolve(message);
            }
            return;
        }

        if (message.method === 'Runtime.consoleAPICalled') {
            this.logs.push({
                type: message.params.type,
                args: message.params.args.map(arg => arg.value || arg.description || arg.type)
            });
        } else if (message.method === 'Runtime.exceptionThrown') {
            this.logs.push({
                type: 'exception',
                args: [message.params.exceptionDetails.text]
            });
        }
    }

    async send(method, params = {}) {
        await this.opened;
        const id = this.nextId++;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            setTimeout(() => {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                reject(new Error(`CDP timeout: ${method}`));
            }, 15000);
        });
    }

    async enable() {
        await this.send('Runtime.enable');
        await this.send('Page.enable');
    }

    async evaluate(expression) {
        const response = await this.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true
        });
        const exception = response.result.exceptionDetails;
        if (exception) throw new Error(exception.exception?.description || exception.text || 'Runtime evaluation failed');
        return response.result.result.value;
    }

    async screenshot(outPath) {
        const response = await this.send('Page.captureScreenshot', {
            format: 'png',
            captureBeyondViewport: false
        });
        fs.writeFileSync(outPath, Buffer.from(response.result.data, 'base64'));
    }

    close() {
        try { this.ws.close(); } catch (err) { /* noop */ }
    }
}

async function openAppTab(base) {
    const target = await fetchJson(`${base}/json/new?${encodeURIComponent('about:blank')}`, {
        method: 'PUT'
    });
    const tab = new CdpTab(target.webSocketDebuggerUrl);
    await tab.enable();
    try {
        await tab.send('Network.enable');
        await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
    } catch (err) {
        // Older CDP targets may not expose Network before navigation; the cache-busting query remains enough.
    }
    const separator = APP_URL.includes('?') ? '&' : '?';
    await tab.send('Page.navigate', { url: `${APP_URL}${separator}fsSmoke=${Date.now()}` });
    await waitForAppReady(tab);
    return tab;
}

async function waitForAppReady(tab) {
    let lastError = null;
    for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
            const ready = await tab.evaluate(`(() => ({
                body: !!document.body,
                readyState: document.readyState,
                hasState: typeof state !== 'undefined',
                hasCalculate: typeof calculate === 'function',
                hasCanvas: typeof canvas !== 'undefined' && !!canvas && canvas.width > 0 && canvas.height > 0,
                title: document.title || ''
            }))()`);
            if (ready.body && ready.readyState === 'complete' && ready.hasState && ready.hasCalculate && ready.hasCanvas && ready.title.includes('FutolStructure')) {
                return;
            }
        } catch (err) {
            lastError = err;
        }
        await wait(250);
    }
    throw new Error(`App did not become ready for browser smoke check${lastError ? `: ${lastError.message}` : ''}`);
}

async function runBrowserSmoke() {
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    const screenshotPath = path.join(os.tmpdir(), 'futolstructure-smoke.png');

    try {
        const result = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            state.xSpans = [4.0, 4.0];
            state.ySpans = [5.0, 5.0];
            state.cantilevers = { top: [0, 0], bottom: [0, 0], left: [0, 0], right: [0, 0] };
            state.floors = [
                createFloor('2F', '2nd Floor', 2, 2),
                createFloor('RF', 'Roof', 2, 2, {
                    isRoof: true,
                    dlSuper: 1.5,
                    liveLoad: 1.0,
                    slabThickness: 120,
                    wallLoad: 0
                })
            ];
            state.currentFloorIndex = 0;
            state.columns = [];
            state.beams = [];
            state.slabs = [];
            state.beamSizeOverrides = {};
            state.beamAlignmentOverrides = {};
            state.columnPositionOverrides = {};
            state.foundationTieBeamAlignmentOverrides = {};
            undoHistory.length = 0;
            redoHistory.length = 0;
            calculate();
            refreshInputPanelsAfterStateRestore();

            const initial = {
                title: document.title,
                status: document.getElementById('statusText')?.textContent || '',
                initError: document.body.innerText.includes('Init error'),
                grid: [state.xSpans.length, state.ySpans.length],
                columns: state.columns.length,
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length
            };

            saveStateSnapshot();
            state.xSpans = [2.05, 4.38, 4.58, 2.91];
            state.ySpans = [4.06, 4.0, 2.8];
            state.cantilevers = {
                top: [0.5, 0.5, 0.5, 0.5],
                bottom: [0.5, 0.5, 0.5, 0.5],
                left: [0.5, 0.5, 0.5],
                right: [1.2, 0, 0.5]
            };
            state.floors = [
                createFloor('2F', '2nd Floor', 4, 3),
                createFloor('RF', 'Roof', 4, 3, {
                    isRoof: true,
                    dlSuper: 1.5,
                    liveLoad: 1.0,
                    slabThickness: 120,
                    wallLoad: 0
                })
            ];
            state.floors.forEach(floor => {
                floor.cantilevers = normalizeCantileverSet(state.cantilevers, state.xSpans.length, state.ySpans.length);
            });
            state.currentFloorIndex = 0;
            state.columns = [];
            state.beams = [];
            state.slabs = [];
            state.beamSizeOverrides = {};
            state.beamAlignmentOverrides = {};
            state.columnPositionOverrides = {};
            state.foundationTieBeamAlignmentOverrides = {};
            calculate();
            refreshInputPanelsAfterStateRestore();

            const fourByThree = {
                grid: [state.xSpans.length, state.ySpans.length],
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                },
                columns: state.columns.length,
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length,
                voidSlabs: state.floors[state.currentFloorIndex].voidSlabs.slice()
            };

            ['cantileverTop', 'cantileverRight', 'cantileverBottom', 'cantileverLeft'].forEach((id) => {
                const container = document.getElementById(id);
                if (container) container.innerHTML = '<div class="cantilever-span-input"><span>STALE</span><input value="0"></div>';
            });
            calculate();
            const afterCantileverDashboardRepair = {
                grid: [state.xSpans.length, state.ySpans.length],
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                },
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length
            };

            undo();
            const afterUndo = {
                grid: [state.xSpans.length, state.ySpans.length],
                columns: state.columns.length,
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                }
            };

            redo();
            const afterRedo = {
                grid: [state.xSpans.length, state.ySpans.length],
                columns: state.columns.length,
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                },
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length
            };

            const currentFloor = state.floors[state.currentFloorIndex];
            state.beamSizeOverrides[getBeamSizeKey('BY-5-1', currentFloor.id)] = { webW: 250, webD: 550 };
            state.beamAlignmentOverrides[getBeamAlignmentKey('BX-1-4', currentFloor.id)] = 0.18;
            const applyRightPatchSpec = spec => {
                const normalized = normalizeCantileverSpec(spec);
                state.cantilevers = normalizeCantileverSet(state.cantilevers, state.xSpans.length, state.ySpans.length);
                currentFloor.cantilevers = normalizeCantileverSet(currentFloor.cantilevers, state.xSpans.length, state.ySpans.length);
                state.cantilevers.right[0] = normalized;
                currentFloor.cantilevers.right[0] = normalized;
                calculate();
            };
            applyRightPatchSpec({ projection: 1.2, run: 1.2, offset: 0, eb: true });
            const rightPatchWithEdge = {
                slab: (() => {
                    const slab = state.slabs.find(s => s.id === 'SC-R1');
                    return slab ? {
                        id: slab.id,
                        lx: slab.lx,
                        ly: slab.ly,
                        run: slab.cantileverRun,
                        offset: slab.cantileverOffset,
                        edgeBeamEnabled: slab.edgeBeamEnabled
                    } : null;
                })(),
                edgeBeam: (() => {
                    const beam = state.beams.find(b => b.id === 'BEY-R-1-L');
                    if (!beam) return null;
                    const slab = state.slabs.find(s => s.id === 'SC-R1');
                    const beamSize = getBeamSizeMm(beam, state.floors[state.currentFloorIndex]?.id);
                    const supportBeam = state.beams.find(item => item.id === beam.supportingBeamId);
                    const supportSize = supportBeam ? getBeamSizeMm(supportBeam, state.floors[state.currentFloorIndex]?.id) : null;
                    const beamWidthM = beamSize.b / 1000;
                    const beamOffset = getBeamPlanOffset(beam, beamWidthM, state.floors[state.currentFloorIndex]?.id);
                    const renderedCenterX = beam.x1 + beamOffset.offsetX;
                    return {
                        id: beam.id,
                        label: getBeamScheduleId(beam, state.floors[state.currentFloorIndex]?.id, 0),
                        span: beam.span,
                        isEdgeBeam: beam.isEdgeBeam,
                        supportingBeamId: beam.supportingBeamId || '',
                        supportingMainBeamId: beam.supportingMainBeamId || '',
                        supportSize,
                        widthMm: beamSize.b,
                        depthMm: beamSize.h,
                        renderedOuterFaceX: renderedCenterX + beamWidthM / 2,
                        slabFreeEdgeX: slab?.x2
                    };
                })(),
                sideBeam: (() => {
                    const beam = state.beams.find(b => b.id === 'BCX-R-1');
                    if (!beam) return null;
                    const mainBeam = state.beams.find(b => b.id === beam.supportingMainBeamId);
                    const beamSize = getBeamSizeMm(beam, state.floors[state.currentFloorIndex]?.id);
                    const mainSize = mainBeam ? getBeamSizeMm(mainBeam, state.floors[state.currentFloorIndex]?.id) : null;
                    const beamOffset = getBeamPlanOffset(beam, beamSize.b / 1000, state.floors[state.currentFloorIndex]?.id);
                    const mainOffset = mainBeam && mainSize ? getBeamPlanOffset(mainBeam, mainSize.b / 1000, state.floors[state.currentFloorIndex]?.id) : null;
                    return {
                        id: beam.id,
                        label: getBeamScheduleId(beam, state.floors[state.currentFloorIndex]?.id, 0),
                        nearestSupportColumnId: beam.nearestSupportColumnId || '',
                        supportingMainBeamId: beam.supportingMainBeamId || '',
                        mainSize,
                        offsetY: beamOffset.offsetY,
                        mainOffsetY: mainOffset?.offsetY,
                        widthMm: beamSize.b,
                        depthMm: beamSize.h
                    };
                })()
            };
            applyRightPatchSpec({ projection: 1.2, run: 1.2, offset: 0, eb: false });
            const rightPatchWithoutEdge = {
                slab: (() => {
                    const slab = state.slabs.find(s => s.id === 'SC-R1');
                    return slab ? {
                        id: slab.id,
                        lx: slab.lx,
                        ly: slab.ly,
                        run: slab.cantileverRun,
                        edgeBeamEnabled: slab.edgeBeamEnabled
                    } : null;
                })(),
                edgeBeamExists: !!state.beams.find(b => b.id === 'BEY-R-1-L')
            };
            const partialCantilever = { rightPatchWithEdge, rightPatchWithoutEdge };

            toggleColumn('A1');
            const afterColumnToggle = {
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
                undoCount: undoHistory.length
            };
            undo();
            const afterColumnUndo = {
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
                undoCount: undoHistory.length
            };

            const beamId = state.beams.find(b => !b.isCantilever)?.id;
            toggleBeamDeleted(beamId);
            const afterBeamDelete = {
                beamId,
                deletedBeams: state.floors[state.currentFloorIndex].deletedBeams.slice(),
                undoCount: undoHistory.length
            };
            undo();
            const afterBeamUndo = {
                beamId,
                deletedBeams: state.floors[state.currentFloorIndex].deletedBeams.slice(),
                undoCount: undoHistory.length
            };

            const canvas = document.getElementById('mainCanvas');
            const countCanvasRedPixels = () => {
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let count = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const a = pixels[i + 3];
                    if (a > 80 && r > 170 && g < 95 && b < 95) count += 1;
                }
                return count;
            };
            toggleSlabVoid('S1');
            populateSlabSchedule();
            const afterSlabVoidScheduleIds = Array.from(document.querySelectorAll('#slabScheduleBody tr td:nth-child(2)'))
                .map(td => td.textContent.trim());
            const afterSlabVoid = {
                voidSlabs: state.floors[state.currentFloorIndex].voidSlabs.slice(),
                activeRegularSlabs: state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                scheduleIds: afterSlabVoidScheduleIds,
                redPixels: countCanvasRedPixels(),
                undoCount: undoHistory.length
            };
            undo();
            const afterSlabVoidUndo = {
                voidSlabs: state.floors[state.currentFloorIndex].voidSlabs.slice(),
                activeRegularSlabs: state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                undoCount: undoHistory.length
            };

            const slab = state.slabs.find(s => !s.isCantilever && !s.isVoid);
            const rect = canvas.getBoundingClientRect();
            const clientX = rect.left + state.offsetX + (slab.x1 + slab.lx / 2) * state.scale;
            const clientY = rect.top + state.offsetY + (slab.y1 + slab.ly / 2) * state.scale;
            canvas.dispatchEvent(new MouseEvent('click', { clientX, clientY, bubbles: true }));
            const afterSlabLeftClick = {
                voidSlabs: state.floors[state.currentFloorIndex].voidSlabs.slice(),
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };

            const beforeColumnLockVisible = state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length;
            toggleColumnPositionLock(true);
            const columnLockProject = buildProjectData();
            toggleColumn('A1');
            const afterColumnLock = {
                locked: state.columnPositionLocked,
                savedLocked: columnLockProject.columnPositionLocked,
                buttonText: document.getElementById('columnLockBtn')?.textContent || '',
                beforeVisible: beforeColumnLockVisible,
                afterToggleVisible: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length
            };
            toggleColumnPositionLock(false);

            const beamLockFloor = state.floors[state.currentFloorIndex];
            const lockedBeam = state.beams.find(b => b.id === 'BX-1-1') || state.beams.find(b => !b.isCustom);
            const lockedColumn = lockedBeam?.startCol || 'A1';
            const beforeBeamLock = {
                beamId: lockedBeam?.id || '',
                floorId: beamLockFloor?.id || '',
                offset: lockedBeam ? getBeamAlignmentOverride(lockedBeam, beamLockFloor?.id) : null,
                size: lockedBeam ? getBeamSizeMm(lockedBeam, beamLockFloor?.id) : null,
                deletedBeams: (beamLockFloor?.deletedBeams || []).slice(),
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, beamLockFloor?.id)).length
            };
            toggleAllBeamsLockedOnCurrentFloor(true);
            const beamLockAllProject = buildProjectData();
            selectedMemberType = 'beam';
            selectedMemberId = lockedBeam?.id || '';
            moveSelectedBeamAlignment();
            if (lockedBeam) updateBeamParam(lockedBeam.id, 'webW', 999, beamLockFloor?.id);
            if (lockedBeam) toggleBeamDeleted(lockedBeam.id);
            if (lockedColumn) toggleColumn(lockedColumn);
            const floorLockStats = state.floors.map(floor => {
                const activeBeamCount = getActiveFloorBeamIds(floor.id).length;
                const savedFloor = beamLockAllProject.floors?.find(item => item.id === floor.id) || {};
                return {
                    id: floor.id,
                    activeBeamCount,
                    lockedCount: (floor.lockedBeams || []).length,
                    savedLockedCount: (savedFloor.lockedBeams || []).length
                };
            });
            const afterBeamLock = {
                lockedCount: (beamLockFloor?.lockedBeams || []).length,
                activeBeamCount: getActiveFloorBeamIds(beamLockFloor?.id).length,
                savedLockedCount: (beamLockAllProject.floors?.find(f => f.id === beamLockFloor?.id)?.lockedBeams || []).length,
                floorLockStats,
                buttonText: document.getElementById('beamLockAllBtn')?.textContent || '',
                offset: lockedBeam ? getBeamAlignmentOverride(lockedBeam, beamLockFloor?.id) : null,
                size: lockedBeam ? getBeamSizeMm(lockedBeam, beamLockFloor?.id) : null,
                deletedBeams: (beamLockFloor?.deletedBeams || []).slice(),
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, beamLockFloor?.id)).length
            };
            toggleAllBeamsLockedOnCurrentFloor(false);
            selectedMemberType = null;
            selectedMemberId = null;

            const shallowColumn = state.columns.find(c => c.id === 'A1');
            const originalShallowColumnSize = shallowColumn ? getColumnSizeMm(shallowColumn) : null;
            if (shallowColumn) {
                applyColumnSizeMm(shallowColumn, 300, 200);
                calculate();
            }
            const floorIdForBeamJunction = state.floors[state.currentFloorIndex]?.id;
            const topEdgeBeam = state.beams.find(b => b.id === 'BX-1-1');
            const leftEdgeBeam = state.beams.find(b => b.id === 'BY-1-1');
            const leftCantileverBeam = state.beams.find(b => b.id === 'BCX-L-1');
            const topEdgeVisual = topEdgeBeam ? getBeamPlanDrawGeometry(topEdgeBeam, floorIdForBeamJunction) : null;
            const topEdgeDraft = topEdgeBeam ? getBeamPlanDrawGeometry(topEdgeBeam, floorIdForBeamJunction, { trimToJunction: true }) : null;
            const leftEdgeDraft = leftEdgeBeam ? getBeamPlanDrawGeometry(leftEdgeBeam, floorIdForBeamJunction, { trimToJunction: true }) : null;
            const leftCantileverDraft = leftCantileverBeam ? getBeamPlanDrawGeometry(leftCantileverBeam, floorIdForBeamJunction, { trimToJunction: true }) : null;
            const columnRect = (col) => {
                if (!col) return null;
                const pos = getColumnPlanPosition(col);
                const size = getColumnSizeMm(col);
                const halfB = (size.b / 1000) / 2;
                const halfH = (size.h / 1000) / 2;
                return {
                    left: pos.x - halfB,
                    right: pos.x + halfB,
                    top: pos.y - halfH,
                    bottom: pos.y + halfH
                };
            };
            const inside = (value, min, max) => Number.isFinite(value) && value >= min - 0.001 && value <= max + 0.001;
            const topStartRect = columnRect(topEdgeBeam ? state.columns.find(c => c.id === topEdgeBeam.startCol) : null);
            const topEndRect = columnRect(topEdgeBeam ? state.columns.find(c => c.id === topEdgeBeam.endCol) : null);
            const leftStartRect = columnRect(leftEdgeBeam ? state.columns.find(c => c.id === leftEdgeBeam.startCol) : null);
            const leftEndRect = columnRect(leftEdgeBeam ? state.columns.find(c => c.id === leftEdgeBeam.endCol) : null);
            const leftCantileverEndRect = columnRect(leftCantileverBeam ? state.columns.find(c => c.id === leftCantileverBeam.endCol) : null);
            const afterBeamJunction = {
                topEdgeTopFace: topEdgeVisual?.rect?.top,
                topEdgeExpectedTopFace: 0,
                horizontalStartX: topEdgeDraft?.rect?.left,
                horizontalStartColumnFaceX: topStartRect?.right,
                horizontalEndX: topEdgeDraft?.rect?.right,
                horizontalEndColumnFaceX: topEndRect?.left,
                verticalRightFaceX: leftEdgeDraft?.rect?.right,
                verticalStartY: leftEdgeDraft?.rect?.top,
                verticalStartColumnFaceY: leftStartRect?.bottom,
                verticalEndY: leftEdgeDraft?.rect?.bottom,
                verticalEndColumnFaceY: leftEndRect?.top,
                junctionGapM: topEdgeDraft && leftEdgeDraft ? topEdgeDraft.rect.left - leftEdgeDraft.rect.right : null,
                horizontalStartInsideColumn: topEdgeDraft && topStartRect ? inside(topEdgeDraft.rect.left, topStartRect.left, topStartRect.right) : false,
                horizontalEndInsideColumn: topEdgeDraft && topEndRect ? inside(topEdgeDraft.rect.right, topEndRect.left, topEndRect.right) : false,
                verticalStartInsideColumn: leftEdgeDraft && leftStartRect ? inside(leftEdgeDraft.rect.top, leftStartRect.top, leftStartRect.bottom) : false,
                verticalEndInsideColumn: leftEdgeDraft && leftEndRect ? inside(leftEdgeDraft.rect.bottom, leftEndRect.top, leftEndRect.bottom) : false,
                leftCantileverEndX: leftCantileverDraft?.rect?.right,
                leftCantileverColumnFaceX: leftCantileverEndRect?.left,
                leftCantileverEndInsideColumn: leftCantileverDraft && leftCantileverEndRect ? inside(leftCantileverDraft.rect.right, leftCantileverEndRect.left, leftCantileverEndRect.right) : false,
                leftCantileverEndPastFaceM: leftCantileverDraft && leftCantileverEndRect ? leftCantileverDraft.rect.right - leftCantileverEndRect.left : null
            };
            if (shallowColumn && originalShallowColumnSize) {
                applyColumnSizeMm(shallowColumn, originalShallowColumnSize.b, originalShallowColumnSize.h);
                calculate();
            }

            setFoundationMode('baseReactionsOnly', { snapshot: false });
            setPlanTab('foundation');
            draw();
            populateFootingSchedule();
            const foundationBaseRows = getBaseReactionRows();
            const foundationBaseProject = buildProjectData();
            const afterFoundationBaseOnly = {
                mode: state.foundationMode,
                savedMode: foundationBaseProject.foundationMode,
                buttonText: document.getElementById('foundationModeBtn')?.textContent || '',
                foundationTabText: document.getElementById('tabFoundation')?.textContent || '',
                tieBeamInputDisabled: document.getElementById('tieBeamWidth')?.disabled === true,
                tieBeamSegments: getFoundationTieBeamSegmentsForPlan().length,
                rows: foundationBaseRows.length,
                baseReactionSum: foundationBaseRows.reduce((sum, row) => sum + row.factoredReactionKn, 0),
                maxFootingSize: Math.max(0, ...state.columns.map(c => Number(c.footingSize || 0))),
                maxTieBeamDL: Math.max(0, ...state.columns.map(c => Number(c.tieBeamDL || 0))),
                maxFootingDL: Math.max(0, ...state.columns.map(c => Number(c.footingDL || 0))),
                scheduleSummary: document.getElementById('footingScheduleSummary')?.textContent || ''
            };
            applyLoadedProject(foundationBaseProject, 'qa-base-reactions.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const afterFoundationBaseOnlyReload = {
                mode: state.foundationMode,
                buttonText: document.getElementById('foundationModeBtn')?.textContent || '',
                tieBeamSegments: getFoundationTieBeamSegmentsForPlan().length,
                rows: getBaseReactionRows().length
            };
            setFoundationMode('plan', { snapshot: false });
            setPlanTab('analysis');

            state.floors.forEach(floor => { floor.planDimensions = []; });
            state.measureSnapEnabled = false;
            state.measureOrtho = false;
            state.measureStart = null;
            state.measureHover = null;
            toggleMeasureMode(true);
            const dimensionEvent = (x, y) => ({
                clientX: rect.left + state.offsetX + x * state.scale,
                clientY: rect.top + state.offsetY + y * state.scale,
                preventDefault() {},
                stopImmediatePropagation() {}
            });
            handleMeasureClick(dimensionEvent(0, 0));
            handleMeasureClick(dimensionEvent(3, 4));
            const dimensionProject = buildProjectData();
            const afterMeasureAdd = {
                activeCount: getCurrentFloorPlanDimensions().length,
                savedCount: dimensionProject.floors[state.currentFloorIndex].planDimensions.length,
                lengthM: Math.hypot(
                    getCurrentFloorPlanDimensions()[0]?.x2 - getCurrentFloorPlanDimensions()[0]?.x1,
                    getCurrentFloorPlanDimensions()[0]?.y2 - getCurrentFloorPlanDimensions()[0]?.y1
                ),
                measureMode: state.measureMode
            };
            clearPlanDimensions();
            const afterMeasureClear = {
                activeCount: getCurrentFloorPlanDimensions().length,
                undoCount: undoHistory.length
            };
            undo();
            const afterMeasureClearUndo = {
                activeCount: getCurrentFloorPlanDimensions().length,
                lengthM: Math.hypot(
                    getCurrentFloorPlanDimensions()[0]?.x2 - getCurrentFloorPlanDimensions()[0]?.x1,
                    getCurrentFloorPlanDimensions()[0]?.y2 - getCurrentFloorPlanDimensions()[0]?.y1
                )
            };
            state.floors.forEach(floor => { floor.planDimensions = []; });
            state.measureSnapEnabled = true;
            state.measureOrtho = false;
            state.measureStart = null;
            const snappedMeasurePoint = resolveMeasurePoint({ x: 0.04, y: 0.03 });
            state.measureSnapEnabled = false;
            state.measureStart = { x: 0, y: 0 };
            state.measureOrtho = true;
            const orthoMeasurePoint = resolveMeasurePoint({ x: 3, y: 4 });
            const afterMeasureSnapOrtho = {
                snappedMeasurePoint,
                orthoMeasurePoint,
                orthoLengthM: Math.hypot(orthoMeasurePoint.x, orthoMeasurePoint.y)
            };
            state.measureOrtho = false;
            state.measureSnapEnabled = true;
            state.measureStart = null;
            state.measureSnapPoint = null;
            toggleMeasureMode(false);

            const transientDeletedSlab = state.slabs.find(s => !s.isCantilever && s.id === 'S2');
            if (transientDeletedSlab) transientDeletedSlab.deleted = true;
            const transientDeletedProject = buildProjectData();
            applyLoadedProject(transientDeletedProject, 'qa-transient-deleted-slab.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const transientDeletedSave = {
                savedVoidSlabs: transientDeletedProject.floors[0].voidSlabs.slice(),
                hidden: {
                    voidSlabs: state.floors[0].voidSlabs.slice()
                },
                activeRegularSlabs: getActiveRegularSlabs().length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };
            state.floors.forEach(floor => {
                floor.voidSlabs = [];
                floor.deletedBeams = [];
                floor.deletedColumns = [];
                floor.lockedSlabs = [];
                floor.lockedBeams = [];
                floor.recoveryQuarantinedHiddenGeometry = null;
            });
            calculate();

            const legacyRootProject = buildProjectData();
            legacyRootProject.cantilevers = {
                top: [0.25, 0.5, 0.75, 1],
                bottom: [1, 0.75, 0.5, 0.25],
                left: [0.2, 0.4, 0.6],
                right: [0.6, 0.4, 0.2]
            };
            legacyRootProject.floors = legacyRootProject.floors.map(floor => {
                const clone = { ...floor };
                delete clone.cantilevers;
                return clone;
            });
            applyLoadedProject(legacyRootProject, 'qa-legacy-root-cantilevers.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const legacyRootLoad = {
                grid: [state.xSpans.length, state.ySpans.length],
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                },
                floorCantilevers: {
                    top: state.floors[0].cantilevers.top.slice(),
                    right: state.floors[0].cantilevers.right.slice(),
                    bottom: state.floors[0].cantilevers.bottom.slice(),
                    left: state.floors[0].cantilevers.left.slice()
                },
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length
            };

            const hiddenProject = buildProjectData();
            delete hiddenProject.hiddenGeometryPolicy;
            hiddenProject.floors = hiddenProject.floors.map(floor => ({
                ...floor,
                voidSlabs: ['S1', 'S2'],
                deletedBeams: ['BX-1-1'],
                deletedColumns: ['A1'],
                lockedSlabs: ['S3'],
                lockedBeams: ['BX-2-1']
            }));
            applyLoadedProject(hiddenProject, 'qa-hidden.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const quarantine = {
                hidden: {
                    voidSlabs: state.floors[0].voidSlabs.slice(),
                    deletedBeams: state.floors[0].deletedBeams.slice(),
                    deletedColumns: state.floors[0].deletedColumns.slice(),
                    lockedSlabs: state.floors[0].lockedSlabs.slice(),
                    lockedBeams: state.floors[0].lockedBeams.slice()
                },
                count: recoveryHiddenGeometryCount(state.floors[0].recoveryQuarantinedHiddenGeometry),
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };

            const intentionalHiddenProject = buildProjectData();
            intentionalHiddenProject.hiddenGeometryPolicy = 'preserve-intentional-hidden-geometry';
            intentionalHiddenProject.floors = intentionalHiddenProject.floors.map(floor => ({
                ...floor,
                voidSlabs: ['S1'],
                deletedBeams: [],
                deletedColumns: [],
                lockedSlabs: [],
                lockedBeams: []
            }));
            applyLoadedProject(intentionalHiddenProject, 'qa-intentional-hidden.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const intentionalHidden = {
                policy: intentionalHiddenProject.hiddenGeometryPolicy,
                hidden: {
                    voidSlabs: state.floors[0].voidSlabs.slice(),
                    deletedBeams: state.floors[0].deletedBeams.slice(),
                    deletedColumns: state.floors[0].deletedColumns.slice(),
                    lockedSlabs: state.floors[0].lockedSlabs.slice(),
                    lockedBeams: state.floors[0].lockedBeams.slice()
                },
                quarantinedCount: recoveryHiddenGeometryCount(state.floors[0].recoveryQuarantinedHiddenGeometry),
                activeRegularSlabs: state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };

            const autosaveHiddenProject = buildProjectData();
            autosaveHiddenProject.autosaveMeta = {
                reason: 'qa-hidden-autosave',
                savedAt: new Date().toISOString(),
                sourceName: 'qa-hidden-autosave'
            };
            autosaveHiddenProject.floors = autosaveHiddenProject.floors.map(floor => ({
                ...floor,
                voidSlabs: ['S1'],
                deletedBeams: ['BX-1-1'],
                deletedColumns: [],
                lockedSlabs: [],
                lockedBeams: []
            }));
            localStorage.setItem(PROJECT_AUTOSAVE_KEY, JSON.stringify(autosaveHiddenProject));
            restoreAutosavedProjectOnStartup();
            calculate();
            const autosaveHidden = {
                hidden: {
                    voidSlabs: state.floors[0].voidSlabs.slice(),
                    deletedBeams: state.floors[0].deletedBeams.slice(),
                    deletedColumns: state.floors[0].deletedColumns.slice(),
                    lockedSlabs: state.floors[0].lockedSlabs.slice(),
                    lockedBeams: state.floors[0].lockedBeams.slice()
                },
                quarantinedCount: recoveryHiddenGeometryCount(state.floors[0].recoveryQuarantinedHiddenGeometry),
                activeRegularSlabs: state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };
            localStorage.removeItem(PROJECT_AUTOSAVE_KEY);

            applyLoadedProject(intentionalHiddenProject, 'qa-trusted-autosave-base.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            calculate();
            writeProjectAutosave('qa-trusted-autosave');
            restoreAutosavedProjectOnStartup();
            calculate();
            const trustedAutosaveHidden = {
                hidden: {
                    voidSlabs: state.floors[0].voidSlabs.slice(),
                    deletedBeams: state.floors[0].deletedBeams.slice(),
                    deletedColumns: state.floors[0].deletedColumns.slice(),
                    lockedSlabs: state.floors[0].lockedSlabs.slice(),
                    lockedBeams: state.floors[0].lockedBeams.slice()
                },
                quarantinedCount: recoveryHiddenGeometryCount(state.floors[0].recoveryQuarantinedHiddenGeometry),
                activeRegularSlabs: state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };
            localStorage.removeItem(PROJECT_AUTOSAVE_KEY);

            state.xSpans = [4, 4];
            state.ySpans = [5, 5];
            state.floors = [
                createFloor('2F', '2nd Floor', state.xSpans.length, state.ySpans.length),
                createFloor('RF', 'Roof', state.xSpans.length, state.ySpans.length, { isRoof: true })
            ];
            state.currentFloorIndex = 0;
            state.cantilevers = normalizeCantileverSet(null, state.xSpans.length, state.ySpans.length);
            state.floors.forEach(floor => {
                floor.cantilevers = normalizeCantileverSet(null, state.xSpans.length, state.ySpans.length);
            });
            state.floors[0].voidSlabs = ['S1'];
            state.floors[1].voidSlabs = ['S3'];
            calculate();
            const multiFloorVoidProject = buildProjectData();
            const multiFloorVoidSave = {
                currentFloorId: state.floors[state.currentFloorIndex].id,
                saved2FVoidSlabs: multiFloorVoidProject.floors.find(floor => floor.id === '2F')?.voidSlabs || [],
                savedRFVoidSlabs: multiFloorVoidProject.floors.find(floor => floor.id === 'RF')?.voidSlabs || []
            };

            state.floors = [
                createFloor('2F', '2nd Floor', state.xSpans.length, state.ySpans.length),
                createFloor('RF', 'Roof', state.xSpans.length, state.ySpans.length, {
                    isRoof: true,
                    dlSuper: 1.5,
                    liveLoad: 1.0,
                    slabThickness: 120,
                    wallLoad: 0
                })
            ];
            state.currentFloorIndex = 1;
            state.floors[0].cantilevers = normalizeCantileverSet({
                top: [{ projection: 0.75, run: 0, offset: 0, eb: true }, 0],
                bottom: [0, 0],
                left: [0, 0],
                right: [{ projection: 1.2, run: 1.2, offset: 0.4, eb: false }, 0]
            }, state.xSpans.length, state.ySpans.length);
            state.floors[0].slabThickness = 100;
            state.floors[0].voidSlabs = ['S1'];
            state.floors[0].deletedBeams = ['BX-1-1'];
            state.floors[0].planDimensions = [{ id: 'DIM-QA', x1: 0, y1: 0, x2: 2, y2: 0, label: '2.00 m' }];
            const inheritedOverrideBeamId = 'BX-1-2';
            const inheritedBeamOffset = 0.22;
            const inheritedBeamSize = { webW: 350, webD: 650 };
            state.beamAlignmentOverrides = state.beamAlignmentOverrides || {};
            state.beamSizeOverrides = state.beamSizeOverrides || {};
            state.beamAlignmentOverrides[getBeamAlignmentKey(inheritedOverrideBeamId, '2F')] = inheritedBeamOffset;
            state.beamSizeOverrides[getBeamSizeKey(inheritedOverrideBeamId, '2F')] = inheritedBeamSize;
            const readInheritedBeamOverrides = floorId => {
                const size = state.beamSizeOverrides[getBeamSizeKey(inheritedOverrideBeamId, floorId)] || {};
                return {
                    offset: state.beamAlignmentOverrides[getBeamAlignmentKey(inheritedOverrideBeamId, floorId)],
                    width: size.webW,
                    depth: size.webD
                };
            };
            state.floors[1].typicalFromLower = true;
            state.floors[1].cantilevers = normalizeCantileverSet(null, state.xSpans.length, state.ySpans.length);
            state.floors[1].voidSlabs = [];
            state.floors[1].deletedBeams = [];
            applyTypicalFloorLayoutInheritance({ includeColumnVisibility: false });
            syncVisibleCantileversFromCurrentFloor();
            renderCantileverInputs();
            calculate();
            const typicalFloorProject = buildProjectData();
            const rfSavedTypical = typicalFloorProject.floors.find(floor => floor.id === 'RF') || {};
            const typicalFloorBeforeReload = {
                flag: !!state.floors[1].typicalFromLower,
                source: state.floors[1].typicalSourceFloorId || '',
                roofLoads: {
                    dlSuper: state.floors[1].dlSuper,
                    liveLoad: state.floors[1].liveLoad,
                    slabThickness: state.floors[1].slabThickness,
                    wallLoad: state.floors[1].wallLoad
                },
                cantTop0: state.floors[1].cantilevers.top[0]?.projection,
                cantRight0Run: state.floors[1].cantilevers.right[0]?.run,
                cantRight0Eb: state.floors[1].cantilevers.right[0]?.eb,
                voidSlabs: state.floors[1].voidSlabs.slice(),
                deletedBeams: state.floors[1].deletedBeams.slice(),
                dimensions: state.floors[1].planDimensions.length,
                beamOverride: readInheritedBeamOverrides('RF'),
                savedFlag: !!rfSavedTypical.typicalFromLower,
                savedCantTop0: rfSavedTypical.cantilevers?.top?.[0]?.projection,
                savedBeamOffset: typicalFloorProject.beamAlignmentOverrides[getBeamAlignmentKey(inheritedOverrideBeamId, 'RF')],
                savedBeamSize: typicalFloorProject.beamSizeOverrides[getBeamSizeKey(inheritedOverrideBeamId, 'RF')],
                inheritedInputsDisabled: Array.from(document.querySelectorAll('#cantileverTop input, #cantileverRight input'))
                    .every(input => input.disabled === true)
            };
            applyLoadedProject(typicalFloorProject, 'qa-typical-floor.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const typicalFloorAfterReload = {
                flag: !!state.floors[1].typicalFromLower,
                source: state.floors[1].typicalSourceFloorId || '',
                cantTop0: state.floors[1].cantilevers.top[0]?.projection,
                voidSlabs: state.floors[1].voidSlabs.slice(),
                deletedBeams: state.floors[1].deletedBeams.slice(),
                beamOverride: readInheritedBeamOverrides('RF'),
                roofLoads: {
                    dlSuper: state.floors[1].dlSuper,
                    liveLoad: state.floors[1].liveLoad,
                    slabThickness: state.floors[1].slabThickness,
                    wallLoad: state.floors[1].wallLoad
                }
            };

            state.currentFloorIndex = state.floors.findIndex(floor => floor.id === 'RF');
            removeFloor();
            const oneFloorAfterRfDelete = {
                floorIds: state.floors.map(floor => floor.id),
                count: state.floors.length,
                currentFloorId: state.floors[state.currentFloorIndex]?.id || '',
                isRoof: !!state.floors[0]?.isRoof,
                cantTop0: state.floors[0]?.cantilevers?.top?.[0]?.projection,
                voidSlabs: state.floors[0]?.voidSlabs?.slice() || [],
                deletedBeams: state.floors[0]?.deletedBeams?.slice() || [],
                beamOverride: readInheritedBeamOverrides('2F')
            };
            addFloor();
            const addedRfFromSingle = {
                floorIds: state.floors.map(floor => floor.id),
                currentFloorId: state.floors[state.currentFloorIndex]?.id || '',
                rfTypical: !!state.floors[1]?.typicalFromLower,
                rfSource: state.floors[1]?.typicalSourceFloorId || '',
                rfIsRoof: !!state.floors[1]?.isRoof,
                rfCantTop0: state.floors[1]?.cantilevers?.top?.[0]?.projection,
                rfVoidSlabs: state.floors[1]?.voidSlabs?.slice() || [],
                rfDeletedBeams: state.floors[1]?.deletedBeams?.slice() || [],
                rfBeamOverride: readInheritedBeamOverrides('RF'),
                roofLoads: {
                    dlSuper: state.floors[1]?.dlSuper,
                    liveLoad: state.floors[1]?.liveLoad,
                    slabThickness: state.floors[1]?.slabThickness,
                    wallLoad: state.floors[1]?.wallLoad
                },
                inheritedInputsDisabled: Array.from(document.querySelectorAll('#cantileverTop input, #cantileverRight input'))
                    .every(input => input.disabled === true)
            };
            addFloor();
            const addedTypicalBeforeRf = {
                floorIds: state.floors.map(floor => floor.id),
                currentFloorId: state.floors[state.currentFloorIndex]?.id || '',
                newTypicalFlag: !!state.floors[1]?.typicalFromLower,
                newTypicalSource: state.floors[1]?.typicalSourceFloorId || '',
                newTypicalIsRoof: !!state.floors[1]?.isRoof,
                newTypicalCantTop0: state.floors[1]?.cantilevers?.top?.[0]?.projection,
                newTypicalBeamOverride: readInheritedBeamOverrides('3F'),
                rfTypicalFlag: !!state.floors[2]?.typicalFromLower,
                rfSource: state.floors[2]?.typicalSourceFloorId || '',
                rfIsRoof: !!state.floors[2]?.isRoof,
                rfCantTop0: state.floors[2]?.cantilevers?.top?.[0]?.projection,
                rfBeamOverride: readInheritedBeamOverrides('RF'),
                roofLoads: {
                    dlSuper: state.floors[2]?.dlSuper,
                    liveLoad: state.floors[2]?.liveLoad,
                    slabThickness: state.floors[2]?.slabThickness,
                    wallLoad: state.floors[2]?.wallLoad
                }
            };

            state.currentFloorIndex = 0;
            syncVisibleCantileversFromCurrentFloor();
            state.floors[0].voidSlabs = ['S4'];
            calculate();
            const beforeSpanVoidOrphan = {
                voidSlabs: state.floors[0].voidSlabs.slice(),
                activeRegularSlabs: getActiveRegularSlabs().length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };
            state.xSpans = [4];
            state.cantilevers = normalizeCantileverSet(state.cantilevers, state.xSpans.length, state.ySpans.length);
            state.floors.forEach(floor => {
                floor.cantilevers = normalizeCantileverSet(floor.cantilevers, state.xSpans.length, state.ySpans.length);
            });
            calculate();
            const orphanVoidProject = buildProjectData();
            const afterSpanVoidOrphan = {
                grid: [state.xSpans.length, state.ySpans.length],
                voidSlabs: state.floors[0].voidSlabs.slice(),
                orphanedVoidSlabs: (state.floors[0].orphanedVoidSlabs || []).slice(),
                savedVoidSlabs: orphanVoidProject.floors.find(floor => floor.id === '2F')?.voidSlabs || [],
                activeRegularSlabs: getActiveRegularSlabs().length,
                voidRegular: state.slabs.filter(s => !s.isCantilever && s.isVoid).map(s => s.id)
            };

            const dxfLayerAudit = (() => {
                const dxf = generateDXFContent();
                const requiredLayers = [
                    'S-CONC-FOUND',
                    'S-CONC-SLAB',
                    'S-CONC-BEAM',
                    'S-CONC-COL',
                    'S-CONC-SW',
                    'S-CONC-STAIR',
                    'S-REBAR-GEN',
                    'S-FORM-SLAB',
                    'S-FORM-BEAM',
                    'S-FORM-COL',
                    'S-FORM-SW',
                    'S-MAS-CHB',
                    'S-STEEL-FRM',
                    'S-STEEL-MSC',
                    'S-WP-RAFT',
                    'S-SOIL-EXC',
                    'S-SOIL-BACK',
                    'S-GRID',
                    'S-TEXT'
                ];
                const exportedEntityLayers = [
                    'S-GRID',
                    'S-CONC-COL',
                    'S-CONC-BEAM',
                    'S-CONC-SLAB',
                    'S-TEXT'
                ];
                const legacyLayers = ['GRID', 'COLUMNS', 'BEAMS', 'SLABS', 'TEXT', 'CUSTOM_BEAMS'];
                const layerChunk = (name) => {
                    const marker = '0\\nLAYER\\n2\\n' + name + '\\n';
                    const start = dxf.indexOf(marker);
                    return start >= 0 ? dxf.slice(start, start + 180) : '';
                };

                return {
                    missingRequiredLayers: requiredLayers.filter(name => !dxf.includes('\\n2\\n' + name + '\\n')),
                    missingEntityLayers: exportedEntityLayers.filter(name => !dxf.includes('\\n8\\n' + name + '\\n')),
                    legacyLayerHits: legacyLayers.filter(name => dxf.includes('\\n2\\n' + name + '\\n') || dxf.includes('\\n8\\n' + name + '\\n')),
                    hasCenter2Linetype: dxf.includes('\\n2\\nCENTER2\\n') && dxf.includes('\\n6\\nCENTER2\\n'),
                    beamLayerChunk: layerChunk('S-CONC-BEAM'),
                    columnLayerChunk: layerChunk('S-CONC-COL'),
                    gridLayerChunk: layerChunk('S-GRID')
                };
            })();

            setPlanTab('analysis');
            return {
                initial,
                fourByThree,
                afterCantileverDashboardRepair,
                afterUndo,
                afterRedo,
                partialCantilever,
                afterColumnToggle,
                afterColumnUndo,
                afterBeamDelete,
                afterBeamUndo,
                afterSlabVoid,
                afterSlabVoidUndo,
                afterSlabLeftClick,
                afterColumnLock,
                beforeBeamLock,
                afterBeamLock,
                afterBeamJunction,
                afterFoundationBaseOnly,
                afterFoundationBaseOnlyReload,
                afterMeasureAdd,
                afterMeasureClear,
                afterMeasureClearUndo,
                afterMeasureSnapOrtho,
                transientDeletedSave,
                legacyRootLoad,
                quarantine,
                intentionalHidden,
                autosaveHidden,
                trustedAutosaveHidden,
                multiFloorVoidSave,
                typicalFloorBeforeReload,
                typicalFloorAfterReload,
                oneFloorAfterRfDelete,
                addedRfFromSingle,
                addedTypicalBeforeRf,
                beforeSpanVoidOrphan,
                afterSpanVoidOrphan,
                dxfLayerAudit,
                finalStatus: document.getElementById('statusText')?.textContent || '',
                initError: document.body.innerText.includes('Init error')
            };
        })()`);

        assert(result.initial.title === 'FutolStructure | Structural Engineering', 'Unexpected app title', result.initial);
        assert(!result.initial.initError && !result.initError, 'Init error shown in app', result);
        assert(result.initial.columns === 9, 'Default 2x2 model did not initialize 9 columns', result.initial);
        assert(result.fourByThree.grid[0] === 4 && result.fourByThree.grid[1] === 3, '4x3 grid setup failed', result.fourByThree);
        assert(result.fourByThree.inputs.top === 4 && result.fourByThree.inputs.right === 3, 'Cantilever inputs did not match 4x3 grid', result.fourByThree);
        assert(result.fourByThree.columns === 20 && result.fourByThree.visibleColumns === 20, '4x3 model did not generate 20 visible columns', result.fourByThree);
        assert(result.fourByThree.regularSlabs === 12, '4x3 model did not generate 12 regular slabs', result.fourByThree);
        assert(result.afterCantileverDashboardRepair.inputs.top === 4 && result.afterCantileverDashboardRepair.inputs.right === 3 && result.afterCantileverDashboardRepair.inputs.bottom === 4 && result.afterCantileverDashboardRepair.inputs.left === 3, 'Calculate did not repair stale cantilever dashboard controls', result.afterCantileverDashboardRepair);
        assert(result.afterUndo.grid[0] === 2 && result.afterUndo.inputs.top === 2 && result.afterUndo.columns === 9, 'Undo did not refresh 2x2 inputs/columns', result.afterUndo);
        assert(result.afterRedo.grid[0] === 4 && result.afterRedo.inputs.top === 4 && result.afterRedo.inputs.right === 3 && result.afterRedo.columns === 20, 'Redo did not refresh 4x3 inputs/columns', result.afterRedo);
        assert(
            Math.abs(result.partialCantilever.rightPatchWithEdge.slab?.lx - 1.2) < 0.001 &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.slab?.ly - 1.2) < 0.001 &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.edgeBeam?.span - 1.2) < 0.001 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.widthMm === 150 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.depthMm === 550 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.supportingMainBeamId === result.partialCantilever.rightPatchWithEdge.edgeBeam?.supportingBeamId &&
            /^EB-/.test(result.partialCantilever.rightPatchWithEdge.edgeBeam?.label || '') &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.edgeBeam?.renderedOuterFaceX - result.partialCantilever.rightPatchWithEdge.edgeBeam?.slabFreeEdgeX) < 0.001,
            'Partial right cantilever patch did not generate a 1.2m x 1.2m slab with an inward 150mm free-edge beam inheriting support depth',
            result.partialCantilever
        );
        assert(
            result.partialCantilever.rightPatchWithEdge.sideBeam?.nearestSupportColumnId === 'E1' &&
            result.partialCantilever.rightPatchWithEdge.sideBeam?.label === 'CB-2F-E1' &&
            result.partialCantilever.rightPatchWithEdge.sideBeam?.widthMm === result.partialCantilever.rightPatchWithEdge.sideBeam?.mainSize?.b &&
            result.partialCantilever.rightPatchWithEdge.sideBeam?.depthMm === result.partialCantilever.rightPatchWithEdge.sideBeam?.mainSize?.h &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.sideBeam?.offsetY - result.partialCantilever.rightPatchWithEdge.sideBeam?.mainOffsetY) < 0.0001,
            'Cantilever side beam did not inherit main-beam dimensions, alignment, or CB-floor-nearest-column naming',
            result.partialCantilever
        );
        assert(
            result.partialCantilever.rightPatchWithoutEdge.slab?.edgeBeamEnabled === false &&
            result.partialCantilever.rightPatchWithoutEdge.edgeBeamExists === false,
            'Cantilever edge beam toggle did not suppress only the free-end edge beam',
            result.partialCantilever
        );
        assert(result.afterColumnToggle.visibleColumns === 19, 'Column toggle did not hide one active column', result.afterColumnToggle);
        assert(result.afterColumnUndo.visibleColumns === 20, 'Undo did not restore toggled column', result.afterColumnUndo);
        assert(result.afterBeamDelete.beamId && result.afterBeamDelete.deletedBeams.includes(result.afterBeamDelete.beamId), 'Beam delete did not register deleted beam', result.afterBeamDelete);
        assert(result.afterBeamUndo.deletedBeams.length === 0, 'Undo did not restore deleted beam state', result.afterBeamUndo);
        assert(result.afterSlabVoid.voidSlabs.includes('S1') && result.afterSlabVoid.activeRegularSlabs === 11, 'Slab void did not remove one active regular slab', result.afterSlabVoid);
        assert(!result.afterSlabVoid.scheduleIds.includes('SL-S1'), 'Slab schedule still listed a deleted/void slab', result.afterSlabVoid);
        assert(result.afterSlabVoid.redPixels < 50, 'Void/deleted slab rendered red ghost pixels in normal canvas', result.afterSlabVoid);
        assert(result.afterSlabVoidUndo.voidSlabs.length === 0 && result.afterSlabVoidUndo.activeRegularSlabs === 12, 'Undo did not restore voided slab', result.afterSlabVoidUndo);
        assert(result.afterSlabLeftClick.voidSlabs.length === 0, 'Plain left-click voided a slab', result.afterSlabLeftClick);
        assert(
            result.afterColumnLock.locked === true &&
            result.afterColumnLock.savedLocked === true &&
            /Locked/.test(result.afterColumnLock.buttonText) &&
            result.afterColumnLock.beforeVisible === result.afterColumnLock.afterToggleVisible,
            'Global column lock did not persist or block column delete/toggle',
            result.afterColumnLock
        );
        assert(
            result.afterBeamLock.activeBeamCount > 0 &&
            result.afterBeamLock.lockedCount === result.afterBeamLock.activeBeamCount &&
            result.afterBeamLock.savedLockedCount === result.afterBeamLock.activeBeamCount &&
            result.afterBeamLock.floorLockStats.every(item => item.activeBeamCount > 0 && item.lockedCount === item.activeBeamCount && item.savedLockedCount === item.activeBeamCount) &&
            /Locked/.test(result.afterBeamLock.buttonText) &&
            Math.abs(result.afterBeamLock.offset - result.beforeBeamLock.offset) < 0.000001 &&
            result.afterBeamLock.size.b === result.beforeBeamLock.size.b &&
            result.afterBeamLock.size.h === result.beforeBeamLock.size.h &&
            result.afterBeamLock.deletedBeams.length === result.beforeBeamLock.deletedBeams.length &&
            result.afterBeamLock.visibleColumns === result.beforeBeamLock.visibleColumns,
            'Beam lock did not persist or block locked beam offset, resize, delete, or connected column toggle',
            { before: result.beforeBeamLock, after: result.afterBeamLock }
        );
        assert(
            Math.abs(result.afterBeamJunction.topEdgeTopFace - result.afterBeamJunction.topEdgeExpectedTopFace) < 0.001 &&
            result.afterBeamJunction.horizontalStartInsideColumn === true &&
            result.afterBeamJunction.horizontalEndInsideColumn === true &&
            result.afterBeamJunction.verticalStartInsideColumn === true &&
            result.afterBeamJunction.verticalEndInsideColumn === true &&
            result.afterBeamJunction.leftCantileverEndInsideColumn === true &&
            result.afterBeamJunction.leftCantileverEndPastFaceM > 0.001,
            'Beam drawing did not keep flush edge alignment or extend beam caps into the column-masked junction zone',
            result.afterBeamJunction
        );
        assert(
            result.afterFoundationBaseOnly.mode === 'baseReactionsOnly' &&
            result.afterFoundationBaseOnly.savedMode === 'baseReactionsOnly' &&
            /Base Rxn/.test(result.afterFoundationBaseOnly.buttonText) &&
            /Base Rxn/.test(result.afterFoundationBaseOnly.foundationTabText) &&
            result.afterFoundationBaseOnly.tieBeamInputDisabled === true &&
            result.afterFoundationBaseOnly.tieBeamSegments === 0 &&
            result.afterFoundationBaseOnly.rows > 0 &&
            result.afterFoundationBaseOnly.baseReactionSum > 0 &&
            result.afterFoundationBaseOnly.maxFootingSize === 0 &&
            result.afterFoundationBaseOnly.maxTieBeamDL === 0 &&
            result.afterFoundationBaseOnly.maxFootingDL === 0 &&
            /Base reactions/.test(result.afterFoundationBaseOnly.scheduleSummary),
            'Base-reaction mode did not remove foundation plan members while preserving exportable reactions',
            result.afterFoundationBaseOnly
        );
        assert(
            result.afterFoundationBaseOnlyReload.mode === 'baseReactionsOnly' &&
            /Base Rxn/.test(result.afterFoundationBaseOnlyReload.buttonText) &&
            result.afterFoundationBaseOnlyReload.tieBeamSegments === 0 &&
            result.afterFoundationBaseOnlyReload.rows === result.afterFoundationBaseOnly.rows,
            'Base-reaction foundation mode did not survive project save/load',
            result.afterFoundationBaseOnlyReload
        );
        assert(
            result.afterMeasureAdd.activeCount === 1 &&
            result.afterMeasureAdd.savedCount === 1 &&
            Math.abs(result.afterMeasureAdd.lengthM - 5) < 0.001 &&
            result.afterMeasureAdd.measureMode === true,
            'Measure tool did not add and serialize a plan dimension',
            result.afterMeasureAdd
        );
        assert(result.afterMeasureClear.activeCount === 0, 'Clear Dims did not remove saved plan dimensions', result.afterMeasureClear);
        assert(
            result.afterMeasureClearUndo.activeCount === 1 &&
            Math.abs(result.afterMeasureClearUndo.lengthM - 5) < 0.001,
            'Undo did not restore cleared plan dimensions',
            result.afterMeasureClearUndo
        );
        assert(
            Math.abs(result.afterMeasureSnapOrtho.snappedMeasurePoint.x) < 0.001 &&
            Math.abs(result.afterMeasureSnapOrtho.snappedMeasurePoint.y) < 0.001,
            'Measure entity snap did not acquire the nearby column/grid intersection',
            result.afterMeasureSnapOrtho
        );
        assert(
            Math.abs(result.afterMeasureSnapOrtho.orthoMeasurePoint.x) < 0.001 &&
            Math.abs(result.afterMeasureSnapOrtho.orthoMeasurePoint.y - 4) < 0.001 &&
            Math.abs(result.afterMeasureSnapOrtho.orthoLengthM - 4) < 0.001,
            'Measure Ortho did not constrain the endpoint to the dominant axis',
            result.afterMeasureSnapOrtho
        );
        assert(
            result.transientDeletedSave.savedVoidSlabs.includes('S2') &&
            result.transientDeletedSave.hidden.voidSlabs.includes('S2') &&
            result.transientDeletedSave.activeRegularSlabs === 11,
            'Transient slab.deleted state was not converted to persistent voidSlabs during save/load',
            result.transientDeletedSave
        );
        assert(result.legacyRootLoad.grid[0] === 4 && result.legacyRootLoad.grid[1] === 3, 'Legacy root-cantilever project did not keep 4x3 grid', result.legacyRootLoad);
        assert(result.legacyRootLoad.inputs.top === 4 && result.legacyRootLoad.inputs.right === 3, 'Legacy root-cantilever load did not sync visible input counts', result.legacyRootLoad);
        assert(
            result.legacyRootLoad.floorCantilevers.top[3]?.projection === 1 &&
            result.legacyRootLoad.floorCantilevers.right[2]?.projection === 0.2,
            'Legacy root cantilevers did not migrate into floor data',
            result.legacyRootLoad
        );
        assert(result.legacyRootLoad.regularSlabs === 12, 'Legacy root-cantilever load did not keep regular slab count', result.legacyRootLoad);
        assert(result.quarantine.hidden.voidSlabs.length === 0, 'Quarantine left void slabs active', result.quarantine);
        assert(result.quarantine.hidden.deletedBeams.length === 0, 'Quarantine left deleted beams active', result.quarantine);
        assert(result.quarantine.hidden.deletedColumns.length === 0, 'Quarantine left deleted columns active', result.quarantine);
        assert(result.quarantine.hidden.lockedSlabs.length === 0 && result.quarantine.hidden.lockedBeams.length === 0, 'Quarantine left stale locks active', result.quarantine);
        assert(result.quarantine.count === 6, 'Quarantined payload was not fully captured', result.quarantine);
        assert(result.intentionalHidden.hidden.voidSlabs.includes('S1'), 'Intentional saved void slab was quarantined instead of preserved', result.intentionalHidden);
        assert(result.intentionalHidden.voidRegular.includes('S1') && result.intentionalHidden.activeRegularSlabs === 11, 'Intentional saved void slab did not affect active slab geometry after load', result.intentionalHidden);
        assert(result.autosaveHidden.hidden.voidSlabs.length === 0 && result.autosaveHidden.hidden.deletedBeams.length === 0, 'Autosave restore left stale hidden geometry active', result.autosaveHidden);
        assert(result.autosaveHidden.quarantinedCount === 2 && result.autosaveHidden.activeRegularSlabs === 12 && result.autosaveHidden.voidRegular.length === 0, 'Autosave hidden geometry was not quarantined on startup restore', result.autosaveHidden);
        assert(result.trustedAutosaveHidden.hidden.voidSlabs.includes('S1'), 'Trusted current-build autosave did not preserve intentional void slab state', result.trustedAutosaveHidden);
        assert(result.trustedAutosaveHidden.quarantinedCount === 0 && result.trustedAutosaveHidden.activeRegularSlabs === 11 && result.trustedAutosaveHidden.voidRegular.includes('S1'), 'Trusted current-build autosave void slab was not active after restore', result.trustedAutosaveHidden);
        assert(
            result.multiFloorVoidSave.saved2FVoidSlabs.includes('S1') &&
            result.multiFloorVoidSave.savedRFVoidSlabs.includes('S3'),
            'Multi-floor void slab intent was not preserved when saving from one active floor',
            result.multiFloorVoidSave
        );
        assert(
            result.typicalFloorBeforeReload.flag === true &&
            result.typicalFloorBeforeReload.source === '2F' &&
            Math.abs(result.typicalFloorBeforeReload.cantTop0 - 0.75) < 0.001 &&
            Math.abs(result.typicalFloorBeforeReload.cantRight0Run - 1.2) < 0.001 &&
            result.typicalFloorBeforeReload.cantRight0Eb === false &&
            result.typicalFloorBeforeReload.voidSlabs.includes('S1') &&
            result.typicalFloorBeforeReload.deletedBeams.includes('BX-1-1') &&
            result.typicalFloorBeforeReload.dimensions === 1 &&
            Math.abs(result.typicalFloorBeforeReload.beamOverride.offset - 0.22) < 0.001 &&
            result.typicalFloorBeforeReload.beamOverride.width === 350 &&
            result.typicalFloorBeforeReload.beamOverride.depth === 650 &&
            result.typicalFloorBeforeReload.savedFlag === true &&
            Math.abs(result.typicalFloorBeforeReload.savedCantTop0 - 0.75) < 0.001 &&
            Math.abs(result.typicalFloorBeforeReload.savedBeamOffset - 0.22) < 0.001 &&
            result.typicalFloorBeforeReload.savedBeamSize?.webW === 350 &&
            result.typicalFloorBeforeReload.savedBeamSize?.webD === 650 &&
            result.typicalFloorBeforeReload.inheritedInputsDisabled === true &&
            result.typicalFloorBeforeReload.roofLoads.dlSuper === 1.5 &&
            result.typicalFloorBeforeReload.roofLoads.liveLoad === 1.0 &&
            result.typicalFloorBeforeReload.roofLoads.slabThickness === 120 &&
            result.typicalFloorBeforeReload.roofLoads.wallLoad === 0,
            'Typical-from-lower floor did not inherit floor layout while preserving roof load values',
            result.typicalFloorBeforeReload
        );
        assert(
            result.typicalFloorAfterReload.flag === true &&
            result.typicalFloorAfterReload.source === '2F' &&
            Math.abs(result.typicalFloorAfterReload.cantTop0 - 0.75) < 0.001 &&
            result.typicalFloorAfterReload.voidSlabs.includes('S1') &&
            result.typicalFloorAfterReload.deletedBeams.includes('BX-1-1') &&
            Math.abs(result.typicalFloorAfterReload.beamOverride.offset - 0.22) < 0.001 &&
            result.typicalFloorAfterReload.beamOverride.width === 350 &&
            result.typicalFloorAfterReload.beamOverride.depth === 650 &&
            result.typicalFloorAfterReload.roofLoads.liveLoad === 1.0,
            'Typical-from-lower floor did not survive project save/load',
            result.typicalFloorAfterReload
        );
        assert(
            result.oneFloorAfterRfDelete.count === 1 &&
            JSON.stringify(result.oneFloorAfterRfDelete.floorIds) === JSON.stringify(['2F']) &&
            result.oneFloorAfterRfDelete.currentFloorId === '2F' &&
            result.oneFloorAfterRfDelete.isRoof === false &&
            Math.abs(result.oneFloorAfterRfDelete.cantTop0 - 0.75) < 0.001 &&
            result.oneFloorAfterRfDelete.voidSlabs.includes('S1') &&
            result.oneFloorAfterRfDelete.deletedBeams.includes('BX-1-1') &&
            Math.abs(result.oneFloorAfterRfDelete.beamOverride.offset - 0.22) < 0.001 &&
            result.oneFloorAfterRfDelete.beamOverride.width === 350 &&
            result.oneFloorAfterRfDelete.beamOverride.depth === 650,
            'RF deletion did not leave a valid one-floor model with the cleaned lower-floor layout intact',
            result.oneFloorAfterRfDelete
        );
        assert(
            JSON.stringify(result.addedRfFromSingle.floorIds) === JSON.stringify(['2F', 'RF']) &&
            result.addedRfFromSingle.currentFloorId === 'RF' &&
            result.addedRfFromSingle.rfTypical === true &&
            result.addedRfFromSingle.rfSource === '2F' &&
            result.addedRfFromSingle.rfIsRoof === true &&
            Math.abs(result.addedRfFromSingle.rfCantTop0 - 0.75) < 0.001 &&
            result.addedRfFromSingle.rfVoidSlabs.includes('S1') &&
            result.addedRfFromSingle.rfDeletedBeams.includes('BX-1-1') &&
            Math.abs(result.addedRfFromSingle.rfBeamOverride.offset - 0.22) < 0.001 &&
            result.addedRfFromSingle.rfBeamOverride.width === 350 &&
            result.addedRfFromSingle.rfBeamOverride.depth === 650 &&
            result.addedRfFromSingle.roofLoads.dlSuper === 1.5 &&
            result.addedRfFromSingle.roofLoads.liveLoad === 1.0 &&
            result.addedRfFromSingle.roofLoads.slabThickness === 100 &&
            result.addedRfFromSingle.roofLoads.wallLoad === 0 &&
            result.addedRfFromSingle.inheritedInputsDisabled === true,
            'Adding a floor from a one-floor model did not create a roof typical copy of the lower floor',
            result.addedRfFromSingle
        );
        assert(
            JSON.stringify(result.addedTypicalBeforeRf.floorIds) === JSON.stringify(['2F', '3F', 'RF']) &&
            result.addedTypicalBeforeRf.currentFloorId === '3F' &&
            result.addedTypicalBeforeRf.newTypicalFlag === true &&
            result.addedTypicalBeforeRf.newTypicalSource === '2F' &&
            result.addedTypicalBeforeRf.newTypicalIsRoof === false &&
            Math.abs(result.addedTypicalBeforeRf.newTypicalCantTop0 - 0.75) < 0.001 &&
            Math.abs(result.addedTypicalBeforeRf.newTypicalBeamOverride.offset - 0.22) < 0.001 &&
            result.addedTypicalBeforeRf.newTypicalBeamOverride.width === 350 &&
            result.addedTypicalBeforeRf.newTypicalBeamOverride.depth === 650 &&
            result.addedTypicalBeforeRf.rfTypicalFlag === true &&
            result.addedTypicalBeforeRf.rfSource === '3F' &&
            result.addedTypicalBeforeRf.rfIsRoof === true &&
            Math.abs(result.addedTypicalBeforeRf.rfCantTop0 - 0.75) < 0.001 &&
            Math.abs(result.addedTypicalBeforeRf.rfBeamOverride.offset - 0.22) < 0.001 &&
            result.addedTypicalBeforeRf.rfBeamOverride.width === 350 &&
            result.addedTypicalBeforeRf.rfBeamOverride.depth === 650 &&
            result.addedTypicalBeforeRf.roofLoads.liveLoad === 1.0,
            'Adding another floor did not insert a typical 3F before RF while keeping RF typical to the new lower floor',
            result.addedTypicalBeforeRf
        );
        assert(
            result.beforeSpanVoidOrphan.voidSlabs.includes('S4') &&
            result.beforeSpanVoidOrphan.voidRegular.includes('S4'),
            'Setup for orphaned void slab regression did not void S4 before span change',
            result.beforeSpanVoidOrphan
        );
        assert(
            result.afterSpanVoidOrphan.grid[0] === 1 &&
            result.afterSpanVoidOrphan.voidSlabs.includes('S4') &&
            result.afterSpanVoidOrphan.orphanedVoidSlabs.includes('S4') &&
            result.afterSpanVoidOrphan.savedVoidSlabs.includes('S4') &&
            !result.afterSpanVoidOrphan.voidRegular.includes('S4'),
            'Orphaned void slab intent was silently removed or incorrectly applied after span change',
            result.afterSpanVoidOrphan
        );
        assert(result.dxfLayerAudit.missingRequiredLayers.length === 0, 'DXF export is missing structural layer-map layers', result.dxfLayerAudit);
        assert(result.dxfLayerAudit.missingEntityLayers.length === 0, 'DXF export did not place generated entities on structural layers', result.dxfLayerAudit);
        assert(result.dxfLayerAudit.legacyLayerHits.length === 0, 'DXF export still emits legacy layer names', result.dxfLayerAudit);
        assert(result.dxfLayerAudit.hasCenter2Linetype === true, 'DXF export did not define/use CENTER2 for grid lines', result.dxfLayerAudit);
        assert(/62\n1\n/.test(result.dxfLayerAudit.beamLayerChunk) && /370\n50\n/.test(result.dxfLayerAudit.beamLayerChunk), 'DXF beam layer does not match FT layer color/lineweight', result.dxfLayerAudit);
        assert(/62\n2\n/.test(result.dxfLayerAudit.columnLayerChunk) && /370\n70\n/.test(result.dxfLayerAudit.columnLayerChunk), 'DXF column layer does not match FT layer color/lineweight', result.dxfLayerAudit);
        assert(/62\n250\n/.test(result.dxfLayerAudit.gridLayerChunk) && /6\nCENTER2\n/.test(result.dxfLayerAudit.gridLayerChunk), 'DXF grid layer does not match FT layer color/linetype', result.dxfLayerAudit);

        await tab.evaluate(`(() => {
            state.xSpans = [2.05, 4.38, 4.58, 2.91];
            state.ySpans = [4.06, 4.0, 2.8];
            state.cantilevers = {
                top: [0, 0, 0, 0],
                bottom: [0, 0, 0, 0],
                left: [0, 0, 0],
                right: [0, 0, 0]
            };
            state.floors = [
                createFloor('2F', '2nd Floor', 4, 3),
                createFloor('RF', 'Roof', 4, 3, {
                    isRoof: true,
                    dlSuper: 1.5,
                    liveLoad: 1.0,
                    slabThickness: 120,
                    wallLoad: 0
                })
            ];
            state.currentFloorIndex = 0;
            state.columns = [];
            state.beams = [];
            state.slabs = [];
            state.beamSizeOverrides = {};
            state.beamAlignmentOverrides = {};
            state.columnPositionOverrides = {};
            state.foundationTieBeamAlignmentOverrides = {};
            state.floors.forEach(floor => {
                floor.cantilevers = normalizeCantileverSet(state.cantilevers, state.xSpans.length, state.ySpans.length);
                floor.voidSlabs = [];
                floor.deletedBeams = [];
                floor.deletedColumns = [];
                floor.lockedSlabs = [];
                floor.lockedBeams = [];
                floor.recoveryQuarantinedHiddenGeometry = null;
            });
            calculate();
            writeProjectAutosave('qa-browser-reload');
            return true;
        })()`);
        await tab.send('Page.reload', { ignoreCache: true });
        await waitForAppReady(tab);
        const afterReload = await tab.evaluate(`(() => ({
            grid: [state.xSpans.length, state.ySpans.length],
            inputs: {
                top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
            },
            columns: state.columns.length,
            visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
            regularSlabs: state.slabs.filter(s => !s.isCantilever).length,
            hidden: {
                voidSlabs: state.floors[state.currentFloorIndex].voidSlabs.slice(),
                deletedBeams: state.floors[state.currentFloorIndex].deletedBeams.slice(),
                deletedColumns: state.floors[state.currentFloorIndex].deletedColumns.slice()
            },
            initError: document.body.innerText.includes('Init error')
        }))()`);
        assert(!afterReload.initError, 'Reloaded autosave showed Init error', afterReload);
        assert(afterReload.grid[0] === 4 && afterReload.grid[1] === 3, 'Browser reload did not restore 4x3 autosave grid', afterReload);
        assert(afterReload.inputs.top === 4 && afterReload.inputs.right === 3, 'Browser reload did not restore cantilever input counts', afterReload);
        assert(afterReload.columns === 20 && afterReload.visibleColumns === 20, 'Browser reload did not restore visible columns', afterReload);
        assert(afterReload.regularSlabs === 12, 'Browser reload did not restore regular slabs', afterReload);
        assert(afterReload.hidden.voidSlabs.length === 0 && afterReload.hidden.deletedBeams.length === 0 && afterReload.hidden.deletedColumns.length === 0, 'Browser reload restored hidden geometry as active state', afterReload);

        await tab.screenshot(screenshotPath);
        const relevantLogs = tab.logs.filter(log => ['error', 'warning', 'exception'].includes(log.type));
        return { result, afterReload, screenshotPath, relevantLogs };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function runProjectSmoke(projectPath, etabsScriptPath = null, staadPath = null, ifcPath = null) {
    const resolvedProjectPath = path.resolve(projectPath);
    assert(fs.existsSync(resolvedProjectPath), 'Project file was not found', { projectPath: resolvedProjectPath });

    const projectData = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));
    const projectName = path.basename(resolvedProjectPath);
    const preserveHiddenGeometry = projectData.hiddenGeometryPolicy === HIDDEN_GEOMETRY_POLICY;
    const hiddenGeometryPayloadTotal = (projectData.floors || []).reduce((sum, floor) => {
        return sum +
            (floor.deletedBeams || []).length +
            (floor.voidSlabs || []).length +
            (floor.deletedColumns || []).length +
            (floor.lockedSlabs || []).length +
            (floor.lockedBeams || []).length;
    }, 0);
    const expectedQuarantinedTotal = preserveHiddenGeometry ? 0 : hiddenGeometryPayloadTotal;
    const expectedActiveHiddenTotal = preserveHiddenGeometry ? hiddenGeometryPayloadTotal : 0;
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    const screenshotPath = path.join(os.tmpdir(), `futolstructure-project-${path.basename(projectName, path.extname(projectName)).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.png`);

    try {
        const serializedProject = JSON.stringify(projectData);
        const serializedName = JSON.stringify(projectName);
        const result = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            const projectData = ${serializedProject};
            const projectName = ${serializedName};
            const validated = typeof validateProjectData === 'function'
                ? validateProjectData(projectData)
                : projectData;

            applyLoadedProject(validated, projectName, {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });

            setPlanTab('structural');
            calculate();
            refreshInputPanelsAfterStateRestore();
            draw();

            const expectedVisibleColumns = (() => {
                const totalColumns = (state.xSpans.length + 1) * (state.ySpans.length + 1);
                const overrides = Array.isArray(projectData.columnOverrides) ? projectData.columnOverrides : [];
                const floorId = state.floors[state.currentFloorIndex]?.id || '';
                if (overrides.length !== totalColumns) return totalColumns;
                return overrides.filter(override => {
                    if (override.activePerFloor) return override.activePerFloor[floorId] !== false;
                    return override.active !== false;
                }).length;
            })();
            const inactiveColumnIds = state.columns
                .filter(c => !isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id))
                .map(c => c.id);
            const countCanvasRedPixels = () => {
                const canvas = document.getElementById('mainCanvas');
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let count = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const a = pixels[i + 3];
                    if (a > 80 && r > 170 && g < 95 && b < 95) count += 1;
                }
                return count;
            };
            const floorSummaries = state.floors.map(floor => ({
                id: floor.id,
                typicalFromLower: !!floor.typicalFromLower,
                cantCounts: {
                    top: (floor.cantilevers?.top || []).length,
                    right: (floor.cantilevers?.right || []).length,
                    bottom: (floor.cantilevers?.bottom || []).length,
                    left: (floor.cantilevers?.left || []).length
                },
                activeCantCounts: {
                    top: (floor.cantilevers?.top || []).filter(v => getCantileverProjection(v) > 0).length,
                    right: (floor.cantilevers?.right || []).filter(v => getCantileverProjection(v) > 0).length,
                    bottom: (floor.cantilevers?.bottom || []).filter(v => getCantileverProjection(v) > 0).length,
                    left: (floor.cantilevers?.left || []).filter(v => getCantileverProjection(v) > 0).length
                },
                hidden: {
                    voidSlabs: (floor.voidSlabs || []).slice(),
                    deletedBeams: (floor.deletedBeams || []).slice(),
                    deletedColumns: (floor.deletedColumns || []).slice(),
                    lockedSlabs: (floor.lockedSlabs || []).slice(),
                    lockedBeams: (floor.lockedBeams || []).slice()
                },
                quarantinedCount: recoveryHiddenGeometryCount(floor.recoveryQuarantinedHiddenGeometry),
                quarantined: floor.recoveryQuarantinedHiddenGeometry || null
            }));

            const collectCantileverDiagnosticsForFloor = (floorIndex) => {
                const originalFloorIndex = state.currentFloorIndex;
                try {
                    state.currentFloorIndex = floorIndex;
                    syncVisibleCantileversFromCurrentFloor();
                    calculate();
                    const floorId = state.floors[state.currentFloorIndex]?.id || '';
                    const sideBeamDiagnostics = state.beams
                        .filter(beam => beam && beam.isCantilever && !beam.isEdgeBeam)
                        .map(beam => {
                            const beamSize = getBeamSizeMm(beam, floorId);
                            const beamOffset = getBeamPlanOffset(beam, beamSize.b / 1000, floorId);
                            const mainBeam = state.beams.find(item => item.id === beam.supportingMainBeamId);
                            const mainSize = mainBeam ? getBeamSizeMm(mainBeam, floorId) : null;
                            const mainOffset = mainBeam && mainSize ? getBeamPlanOffset(mainBeam, mainSize.b / 1000, floorId) : null;
                            const offsetMismatch = mainOffset && mainBeam.direction === beam.direction
                                ? Math.abs((beam.direction === 'X' ? beamOffset.offsetY : beamOffset.offsetX) - (mainBeam.direction === 'X' ? mainOffset.offsetY : mainOffset.offsetX))
                                : null;
                            const startCol = state.columns.find(col => col.id === beam.startCol);
                            const endCol = state.columns.find(col => col.id === beam.endCol);
                            const segment = getRenderedBeamPlanSegment(beam, startCol, endCol);
                            const mainStartCol = mainBeam ? state.columns.find(col => col.id === mainBeam.startCol) : null;
                            const mainEndCol = mainBeam ? state.columns.find(col => col.id === mainBeam.endCol) : null;
                            const mainSegment = mainBeam ? getRenderedBeamPlanSegment(mainBeam, mainStartCol, mainEndCol) : null;
                            const renderedAxisMismatch = mainBeam && mainSegment && mainOffset && mainBeam.direction === beam.direction
                                ? Math.abs(
                                    beam.direction === 'X'
                                        ? (((segment.y1 + segment.y2) / 2) + beamOffset.offsetY) - (((mainSegment.y1 + mainSegment.y2) / 2) + mainOffset.offsetY)
                                        : (((segment.x1 + segment.x2) / 2) + beamOffset.offsetX) - (((mainSegment.x1 + mainSegment.x2) / 2) + mainOffset.offsetX)
                                )
                                : null;
                            return {
                                id: beam.id,
                                label: getBeamScheduleId(beam, floorId, 0),
                                edge: beam.cantileverEdge || '',
                                direction: beam.direction,
                                nearestSupportColumnId: beam.nearestSupportColumnId || '',
                                supportingMainBeamId: beam.supportingMainBeamId || '',
                                size: beamSize,
                                mainSize,
                                offset: beamOffset,
                                mainOffset,
                                offsetMismatch,
                                renderedAxisMismatch
                            };
                        });
                    const rects = (typeof getActiveCantileverSlabs === 'function' ? getActiveCantileverSlabs() : state.slabs.filter(slab => slab && slab.isCantilever && !slab.isVoid))
                        .map(slab => ({
                            id: slab.id,
                            x1: Math.min(Number(slab.x1) || 0, Number(slab.x2) || 0),
                            y1: Math.min(Number(slab.y1) || 0, Number(slab.y2) || 0),
                            x2: Math.max(Number(slab.x1) || 0, Number(slab.x2) || 0),
                            y2: Math.max(Number(slab.y1) || 0, Number(slab.y2) || 0),
                            edge: slab.cantileverEdge || ''
                        }));
                    const overlaps = [];
                    for (let i = 0; i < rects.length; i += 1) {
                        for (let j = i + 1; j < rects.length; j += 1) {
                            const a = rects[i];
                            const b = rects[j];
                            const dx = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
                            const dy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
                            if (dx > 0.001 && dy > 0.001) {
                                overlaps.push({
                                    a: a.id,
                                    b: b.id,
                                    edges: [a.edge, b.edge],
                                    area: Number((dx * dy).toFixed(4))
                                });
                            }
                        }
                    }
                    const sideBeamAlignmentMismatches = sideBeamDiagnostics.filter(item =>
                        !item.mainSize ||
                        item.size.b !== item.mainSize.b ||
                        item.size.h !== item.mainSize.h ||
                        (item.offsetMismatch !== null && item.offsetMismatch > 0.001) ||
                        (item.renderedAxisMismatch !== null && item.renderedAxisMismatch > 0.001)
                    );
                    const regularBeamSegments = state.beams
                        .filter(beam => beam && getBeamGovernanceType(beam) === 'regular')
                        .map(beam => ({ beam, segment: getBeamCenterlineSegment(beam) }))
                        .filter(item => item.segment);
                    const sideBeamRegularOverlaps = state.beams
                        .filter(beam => beam && beam.isCantilever && !beam.isEdgeBeam)
                        .flatMap(beam => {
                            const segment = getBeamCenterlineSegment(beam);
                            if (!segment) return [];
                            return regularBeamSegments
                                .filter(item => {
                                    const regularSegment = item.segment;
                                    if (regularSegment.direction !== segment.direction) return false;
                                    if (Math.abs(regularSegment.line - segment.line) > 0.01) return false;
                                    const overlap = getIntervalOverlap(segment.start, segment.end, regularSegment.start, regularSegment.end, 0.001);
                                    return !!overlap;
                                })
                                .map(item => ({
                                    sideBeamId: beam.id,
                                    sideBeamLabel: getBeamScheduleId(beam, floorId, 0),
                                    regularBeamId: item.beam.id,
                                    regularBeamLabel: getBeamScheduleId(item.beam, floorId, 0)
                                }));
                        });
                    return {
                        floorId,
                        sideBeamCount: sideBeamDiagnostics.length,
                        sideBeamAlignmentMismatches,
                        sideBeamRegularOverlaps,
                        cantileverSlabOverlaps: overlaps
                    };
                } finally {
                    state.currentFloorIndex = originalFloorIndex;
                    syncVisibleCantileversFromCurrentFloor();
                    calculate();
                }
            };
            const cantileverDiagnostics = state.floors.map((floor, index) => collectCantileverDiagnosticsForFloor(index));
            const csiExportModel = collectCSIExportModelData();
            const etabsScript = generateETABSOAPIScript(csiExportModel);
            const staadContent = generateSTAADContent(csiExportModel);
            const ifcContent = generateIFCContent(csiExportModel);
            const orientationSourceColumn = [...state.columns]
                .filter(column => column && column.active !== false)
                .sort((a, b) => getColumnPlanPosition(b).y - getColumnPlanPosition(a).y)[0];
            const orientationSourcePosition = orientationSourceColumn
                ? getColumnPlanPosition(orientationSourceColumn)
                : null;
            const orientationExportColumn = orientationSourceColumn
                ? csiExportModel.columns.find(column =>
                    column.floorId === state.floors[0]?.id && column.sourceId === orientationSourceColumn.id)
                : null;
            const csiExportAudit = {
                counts: csiExportModel.counts,
                coordinateTransform: csiExportModel.coordinateTransform,
                slabCountsByFloor: csiExportModel.slabs.reduce((counts, slab) => {
                    counts[slab.floorId] = (counts[slab.floorId] || 0) + 1;
                    return counts;
                }, {}),
                orientationProbe: {
                    sourceId: orientationSourceColumn?.id || '',
                    sourceY: orientationSourcePosition?.y ?? null,
                    solverY: orientationExportColumn?.y ?? null
                },
                frameSections: csiExportModel.frameSections.length,
                slabSections: csiExportModel.slabSections.length,
                scriptLength: etabsScript.length,
                hasSetStories: etabsScript.includes('SetStories_2'),
                hasSaveEdb: etabsScript.includes('Save EDB'),
                hasNativeE2k: etabsScript.includes('Export native E2K'),
                hasFixedSupports: etabsScript.includes('SetRestraint'),
                hasRigidDiaphragm: etabsScript.includes("GetDiaphragm('D1', [ref]$d1SemiRigid)") &&
                    etabsScript.includes("SetDiaphragm('D1', $false)") &&
                    etabsScript.includes("AreaObj.SetDiaphragm($name, 'D1')"),
                hasGovernedMassSource: etabsScript.includes("'FS_SDL', '1'") &&
                    etabsScript.includes("'FS_WALL', '1'") &&
                    etabsScript.includes("liveLoadIncluded = $false"),
                hasAutomatedModalAudit: etabsScript.includes("Analyze.RunAnalysis()") &&
                    etabsScript.includes("SetCaseSelectedForOutput('Modal', $true)") &&
                    etabsScript.includes("ModalParticipatingMassRatios") &&
                    etabsScript.includes("Mode = $i + 1") &&
                    etabsScript.includes("_modal_participation.csv") &&
                    etabsScript.includes("Get-CSITable 'Mass Source Definition'") &&
                    etabsScript.includes("Get-CSITable 'Mass Summary by Diaphragm'"),
                wallLoadValuesByFloor: csiExportModel.beams.reduce((values, beam) => {
                    if (!(Number(beam.wallLoad) > 0)) return values;
                    if (!values[beam.floorId]) values[beam.floorId] = [];
                    if (!values[beam.floorId].includes(beam.wallLoad)) values[beam.floorId].push(beam.wallLoad);
                    return values;
                }, {}),
                hasSafeHandoff: typeof exportToSAFEViaETABS === 'function' &&
                    exportToSAFEViaETABS.toString().includes('Story as SAFE V12 .f2k File'),
                hasAreaLoads: etabsScript.includes('SetLoadUniform')
            };
            const staadExportAudit = {
                ...window.lastSTAADExportAudit,
                contentLength: staadContent.length,
                hasSharedAudit: staadContent.includes('* FS_AUDIT STORIES ' + csiExportModel.counts.stories + ' COLUMNS ' + csiExportModel.counts.columns + ' BEAMS ' + csiExportModel.counts.beams + ' SLABS ' + csiExportModel.counts.slabs),
                hasShellIncidences: staadContent.includes('\\nELEMENT INCIDENCES SHELL\\n'),
                hasElementLoads: staadContent.includes('\\nELEMENT LOAD\\n'),
                hasLegacyFloorLoad: staadContent.includes('\\nFLOOR LOAD\\n'),
                hasConcreteDesignUnits: staadContent.includes('\\nLOAD LIST 3 4\\nUNIT MMS NEWTON\\nSTART CONCRETE DESIGN\\n'),
                hasJointDisplacements: staadContent.includes('\\nPRINT JOINT DISPLACEMENTS\\n')
            };
            const ifcExportAudit = {
                ...window.lastIFCExportAudit,
                contentLength: ifcContent.length,
                hasCoordinationView: ifcContent.includes("ViewDefinition [CoordinationView_V2.0]"),
                hasBRepGeometry: ifcContent.includes('=IFCFACETEDBREP('),
                hasColumns: ifcContent.includes('=IFCCOLUMN('),
                hasBeams: ifcContent.includes('=IFCBEAM('),
                hasSlabs: ifcContent.includes('=IFCSLAB('),
                hasMaterial: ifcContent.includes("=IFCMATERIAL('Concrete')"),
                hasSourceProperties: ifcContent.includes("IFCPROPERTYSINGLEVALUE('FutolStructureId'"),
                invalidProfilePlacement: /IFCRECTANGLEPROFILEDEF\\([^\\n]*IFCCARTESIANPOINT/.test(ifcContent)
            };

            const slabTruthAudit = typeof collectActiveSlabTruthAudit === 'function'
                ? collectActiveSlabTruthAudit()
                : null;
            const tabSwitchAudit = {};
            let planLabelDiagnostics = null;
            if (typeof setPlanTab === 'function' && typeof collectActiveSlabTruthAudit === 'function') {
                setPlanTab('analysis');
                tabSwitchAudit.tributary = collectActiveSlabTruthAudit();
                setPlanTab('structural');
                if (typeof draw === 'function') draw();
                planLabelDiagnostics = window.lastPlanLabelDiagnostics || null;
                tabSwitchAudit.layout = collectActiveSlabTruthAudit();
            }

            return {
                title: document.title,
                status: document.getElementById('statusText')?.textContent || '',
                statusDetail: document.getElementById('statusText')?.title || '',
                statusMembers: document.getElementById('statusMembers')?.textContent || '',
                initError: document.body.innerText.includes('Init error'),
                currentPlanTab,
                currentFloorId: state.floors[state.currentFloorIndex]?.id || '',
                grid: [state.xSpans.length, state.ySpans.length],
                inputs: {
                    top: document.querySelectorAll('#cantileverTop .cantilever-span-input').length,
                    right: document.querySelectorAll('#cantileverRight .cantilever-span-input').length,
                    bottom: document.querySelectorAll('#cantileverBottom .cantilever-span-input').length,
                    left: document.querySelectorAll('#cantileverLeft .cantilever-span-input').length
                },
                columns: state.columns.length,
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
                expectedVisibleColumns,
                inactiveColumnIds,
                beams: state.beams.length,
                regularSlabs: state.slabs.filter(s => !s.isCantilever).length,
                activeRegularSlabs: typeof getActiveRegularSlabs === 'function' ? getActiveRegularSlabs().length : state.slabs.filter(s => !s.isCantilever && !s.isVoid).length,
                cantileverSlabs: typeof getActiveCantileverSlabs === 'function' ? getActiveCantileverSlabs().length : state.slabs.filter(s => s.isCantilever && !s.isVoid).length,
                voidRegular: state.slabs
                    .filter(s => !s.isCantilever && (typeof isActiveSlab === 'function' ? !isActiveSlab(s) : s.isVoid))
                    .map(s => s.id),
                slabTruthAudit,
                tabSwitchAudit,
                redPixels: countCanvasRedPixels(),
                area: {
                    totalSlabArea: document.getElementById('totalArea')?.textContent || '',
                    areaBalance: document.getElementById('areaBalance')?.textContent || ''
                },
                planLabelDiagnostics,
                csiExportAudit,
                staadExportAudit,
                ifcExportAudit,
                floors: floorSummaries,
                cantileverDiagnostics,
                projectName,
                expectedQuarantinedTotal: ${expectedQuarantinedTotal},
                expectedActiveHiddenTotal: ${expectedActiveHiddenTotal}
            };
        })()`);

        assert(result.title === 'FutolStructure | Structural Engineering', 'Project smoke loaded the wrong app identity', result);
        assert(!result.initError, 'Project smoke showed Init error after loading project', result);
        assert(result.grid[0] === 4 && result.grid[1] === 3, 'Olango project did not load as a 4x3 grid', result);
        assert(result.inputs.top === 4 && result.inputs.bottom === 4 && result.inputs.left === 3 && result.inputs.right === 3, 'Olango cantilever dashboard inputs did not match the loaded grid', result);
        assert(result.columns === 20 && result.visibleColumns === result.expectedVisibleColumns, 'Olango project visible columns do not match saved column overrides after load', result);
        assert(result.regularSlabs === 12, 'Olango project did not generate all 12 regular slab records after load', result);
        assert(
            result.csiExportAudit.counts.stories === projectData.floors.length &&
            result.csiExportAudit.counts.columns > 0 &&
            result.csiExportAudit.counts.beams > 0 &&
            result.csiExportAudit.counts.slabs > 0 &&
            result.csiExportAudit.frameSections > 0 &&
            result.csiExportAudit.slabSections > 0 &&
            result.csiExportAudit.scriptLength > 5000 &&
            result.csiExportAudit.hasSetStories &&
            result.csiExportAudit.hasSaveEdb &&
            result.csiExportAudit.hasNativeE2k &&
            result.csiExportAudit.hasFixedSupports &&
            result.csiExportAudit.hasRigidDiaphragm &&
            result.csiExportAudit.hasGovernedMassSource &&
            result.csiExportAudit.hasAutomatedModalAudit &&
            result.csiExportAudit.hasSafeHandoff &&
            result.csiExportAudit.hasAreaLoads,
            'ETABS OAPI export payload is incomplete',
            result.csiExportAudit
        );
        Object.entries(result.csiExportAudit.wallLoadValuesByFloor).forEach(([floorId, values]) => {
            const sourceFloor = projectData.floors.find(floor => floor.id === floorId);
            assert(
                values.every(value => Math.abs(value - Number(sourceFloor?.wallLoad || 0)) < 1e-9),
                'Solver export factored the basic FS_WALL pattern before load combinations',
                { floorId, values, sourceWallLoad: sourceFloor?.wallLoad }
            );
        });
        assert(
            result.csiExportAudit.coordinateTransform?.ySign === -1 &&
            Math.abs(result.csiExportAudit.orientationProbe.solverY + result.csiExportAudit.orientationProbe.sourceY) < 1e-6,
            'Solver export did not convert FutolStructure Y-down coordinates to solver Y-up coordinates',
            result.csiExportAudit
        );
        assert(
            result.staadExportAudit.counts.stories === result.csiExportAudit.counts.stories &&
            result.staadExportAudit.counts.columns === result.csiExportAudit.counts.columns &&
            result.staadExportAudit.counts.beams === result.csiExportAudit.counts.beams &&
            result.staadExportAudit.counts.slabs === result.csiExportAudit.counts.slabs &&
            result.staadExportAudit.counts.rigidLinkedPlateNodes > 0 &&
            result.staadExportAudit.counts.upwardPlateNormals === result.csiExportAudit.counts.slabs &&
            result.staadExportAudit.plateNormalsUp &&
            result.staadExportAudit.coordinateTransform?.xSignFromSourceX === -1 &&
            result.staadExportAudit.coordinateTransform?.zSignFromSourceY === 1 &&
            Math.abs(
                result.staadExportAudit.orientationProbe.staadX +
                result.staadExportAudit.orientationProbe.sourcePlanX
            ) < 1e-6 &&
            Math.abs(
                result.staadExportAudit.orientationProbe.staadZ -
                result.staadExportAudit.orientationProbe.sourcePlanY
            ) < 1e-6 &&
            result.staadExportAudit.hasSharedAudit &&
            result.staadExportAudit.hasShellIncidences &&
            result.staadExportAudit.hasElementLoads &&
            result.staadExportAudit.hasConcreteDesignUnits &&
            result.staadExportAudit.hasJointDisplacements &&
            result.staadExportAudit.concreteDesign?.units === 'N-mm' &&
            JSON.stringify(result.staadExportAudit.concreteDesign?.loadList) === JSON.stringify([3, 4]) &&
            !result.staadExportAudit.hasLegacyFloorLoad,
            'STAAD export is not in geometry/load parity with the shared ETABS solver payload',
            { etabs: result.csiExportAudit, staad: result.staadExportAudit }
        );
        assert(
            result.ifcExportAudit.counts.stories === result.csiExportAudit.counts.stories &&
            result.ifcExportAudit.counts.columns === result.csiExportAudit.counts.columns &&
            result.ifcExportAudit.counts.beams === result.csiExportAudit.counts.beams &&
            result.ifcExportAudit.counts.slabs === result.csiExportAudit.counts.slabs &&
            result.ifcExportAudit.counts.products === (
                result.csiExportAudit.counts.columns +
                result.csiExportAudit.counts.beams +
                result.csiExportAudit.counts.slabs
            ) &&
            result.ifcExportAudit.hasCoordinationView &&
            result.ifcExportAudit.hasBRepGeometry &&
            result.ifcExportAudit.hasColumns &&
            result.ifcExportAudit.hasBeams &&
            result.ifcExportAudit.hasSlabs &&
            result.ifcExportAudit.hasMaterial &&
            result.ifcExportAudit.hasSourceProperties &&
            !result.ifcExportAudit.invalidProfilePlacement,
            'IFC export is not in active-geometry parity with the shared ETABS/STAAD solver payload',
            { solver: result.csiExportAudit, ifc: result.ifcExportAudit }
        );
        result.floors.forEach((floor, index) => {
            if (!floor.typicalFromLower || index === 0) return;
            const sourceFloor = result.floors[index - 1];
            assert(
                result.csiExportAudit.slabCountsByFloor[floor.id] === result.csiExportAudit.slabCountsByFloor[sourceFloor.id] &&
                JSON.stringify(floor.hidden.voidSlabs) === JSON.stringify(sourceFloor.hidden.voidSlabs),
                'Typical upper floor exported stale/ghost slab geometry instead of lower-floor slab intent',
                { sourceFloor, floor, slabCountsByFloor: result.csiExportAudit.slabCountsByFloor }
            );
        });
        if (preserveHiddenGeometry) {
            assert(result.voidRegular.length === (projectData.floors?.[result.currentFloorId === 'RF' ? 1 : 0]?.voidSlabs || []).length, 'Olango intentional saved void slabs did not remain active after load', result);
            assert(result.statusMembers.includes(`${result.activeRegularSlabs + result.cantileverSlabs}S`), 'Olango status member slab count does not match active slab truth', result);
        } else {
            assert(result.activeRegularSlabs === 12, 'Olango project did not keep all 12 regular slabs active after hidden-geometry quarantine', result);
            assert(result.voidRegular.length === 0, 'Olango project still has void/deleted regular slabs active after load quarantine', result);
        }
        if (result.slabTruthAudit) {
            assert(result.slabTruthAudit.renderedSlabIds.length === result.activeRegularSlabs + result.cantileverSlabs, 'Rendered slab truth does not match active slab count', result.slabTruthAudit);
            if (expectedQuarantinedTotal > 0 && Math.abs(result.slabTruthAudit.areaDelta) >= 0.05) {
                assert(
                    /Recovery|Review|Warning/i.test(`${result.status} ${result.statusDetail}`),
                    'Legacy quarantined hidden geometry with slab-area mismatch did not surface a recovery warning',
                    result
                );
            } else {
                assert(Math.abs(result.slabTruthAudit.areaDelta) < 0.05, 'Olango slab area balance is not governed by active slab truth', result.slabTruthAudit);
            }
        }
        if (result.tabSwitchAudit?.tributary && result.tabSwitchAudit?.layout) {
            assert(JSON.stringify(result.tabSwitchAudit.tributary.activeIds) === JSON.stringify(result.slabTruthAudit.activeIds), 'Tributary tab changed active slab truth', result.tabSwitchAudit);
            assert(JSON.stringify(result.tabSwitchAudit.layout.activeIds) === JSON.stringify(result.slabTruthAudit.activeIds), 'Layout tab changed active slab truth', result.tabSwitchAudit);
        }
        assert(result.redPixels < 50, 'Olango project rendered red ghost/deleted geometry in the structural plan canvas', result);
        if (result.planLabelDiagnostics) {
            assert(result.planLabelDiagnostics.drawBeamCount > 0, 'Plan label diagnostics did not process any beam labels', result.planLabelDiagnostics);
            assert(result.planLabelDiagnostics.skippedLabels.length === 0, 'Plan label placement skipped beam tags instead of keeping them near their beams', result.planLabelDiagnostics);
            const farBeamLabels = [
                ...result.planLabelDiagnostics.labels,
                ...result.planLabelDiagnostics.forcedOverlaps
            ].filter(label => /far|outer/i.test(label.placement || ''));
            assert(farBeamLabels.length === 0, 'Plan label placement still sent beam tags far from their beams', { farBeamLabels, diagnostics: result.planLabelDiagnostics });
        }
        const activeHiddenCounts = result.floors.map(floor => Object.values(floor.hidden).reduce((sum, values) => sum + values.length, 0));
        assert(activeHiddenCounts.reduce((sum, count) => sum + count, 0) === expectedActiveHiddenTotal, 'Olango active hidden/deleted geometry count did not match saved-file policy', { expectedActiveHiddenTotal, floors: result.floors });
        const quarantinedTotal = result.floors.reduce((sum, floor) => sum + floor.quarantinedCount, 0);
        assert(quarantinedTotal === expectedQuarantinedTotal, 'Olango saved hidden geometry quarantine count did not match the file payload', { expectedQuarantinedTotal, floors: result.floors });
        result.cantileverDiagnostics.forEach(floor => {
            assert(floor.sideBeamAlignmentMismatches.length === 0, 'Cantilever side beams did not inherit supporting main beam size/alignment', floor);
            assert(floor.sideBeamRegularOverlaps.length === 0, 'Cantilever side beams still overlap existing regular beams', floor);
            assert(floor.cantileverSlabOverlaps.length === 0, 'Cantilever slab rectangles still overlap after L-corner cleanup', floor);
        });

        if (etabsScriptPath) {
            const etabsScript = await tab.evaluate('generateETABSOAPIScript()');
            const resolvedScriptPath = path.resolve(etabsScriptPath);
            fs.mkdirSync(path.dirname(resolvedScriptPath), { recursive: true });
            fs.writeFileSync(resolvedScriptPath, etabsScript, 'utf8');
            result.csiExportAudit.writtenScriptPath = resolvedScriptPath;
        }
        if (staadPath) {
            const staadContent = await tab.evaluate('generateSTAADContent()');
            const resolvedSTAADPath = path.resolve(staadPath);
            fs.mkdirSync(path.dirname(resolvedSTAADPath), { recursive: true });
            fs.writeFileSync(resolvedSTAADPath, staadContent, 'utf8');
            result.staadExportAudit.writtenPath = resolvedSTAADPath;
        }
        if (ifcPath) {
            const ifcContent = await tab.evaluate('generateIFCContent()');
            const resolvedIFCPath = path.resolve(ifcPath);
            fs.mkdirSync(path.dirname(resolvedIFCPath), { recursive: true });
            fs.writeFileSync(resolvedIFCPath, ifcContent, 'utf8');
            result.ifcExportAudit.writtenPath = resolvedIFCPath;
        }

        await tab.screenshot(screenshotPath);
        const relevantLogs = tab.logs.filter(log => ['error', 'warning', 'exception'].includes(log.type));
        return { projectPath: resolvedProjectPath, result, screenshotPath, relevantLogs };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function main() {
    const summary = {
        syntax: parseInlineScripts(),
        engines: [],
        displayMarks: checkDisplayMarkOrdering()
    };
    const projectPath = getArgValue('--project');
    const etabsScriptPath = getArgValue('--write-etabs-script');
    const staadPath = getArgValue('--write-staad');
    const ifcPath = getArgValue('--write-ifc');

    ['v3/engine/loads.js', 'v3/engine/tributary.js'].forEach(file => {
        checkNodeSyntax(file);
        summary.engines.push(file);
    });

    if (process.argv.includes('--no-browser')) {
        console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
        return;
    }

    const browser = await runBrowserSmoke();
    const project = projectPath ? await runProjectSmoke(projectPath, etabsScriptPath, staadPath, ifcPath) : null;
    console.log(JSON.stringify({ ok: true, ...summary, browser, project }, null, 2));
}

main().catch(err => {
    console.error(JSON.stringify({
        ok: false,
        message: err.message,
        details: err.details || null,
        stack: err.stack
    }, null, 2));
    process.exit(1);
});
