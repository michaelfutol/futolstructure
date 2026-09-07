'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const V3 = path.join(ROOT, 'v3');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function checkAnalysisInputs() {
    const api = require(path.join(V3, 'engine', 'analysis-inputs.js'));
    const valid = api.build({
        verticalDatums: { baseSupportElevation: 0 },
        columns: [{ id: 'GF-A1', x: 0, y: 0, z1: 0 }],
        slabs: [{ id: 'GF-S1', areaM2: 10, superDead: 2, live: 0 }],
        beams: [{ id: 'GF-B1', wallLoad: 6 }]
    });
    assert.equal(valid.validation.status, 'READY_FOR_ADAPTER');
    assert.equal(valid.supports.length, 1);
    assert.equal(valid.supports[0].nodeX, 0);
    assert.equal(valid.massSource.includeLive, false);

    const invalid = api.build({
        verticalDatums: { baseSupportElevation: 0 },
        columns: [{ id: 'BAD-C1', x: 'not-a-number', y: 0, z1: 'not-a-number' }],
        slabs: [],
        beams: []
    });
    assert.equal(invalid.supports.length, 0);
    assert.equal(invalid.supportIssues.length, 1);
    assert.equal(invalid.validation.status, 'BLOCKED');
    assert.match(invalid.validation.blockers.join(' '), /BAD-C1/);
    return { validStatus: valid.validation.status, invalidStatus: invalid.validation.status };
}

function checkSolverRoundTrip() {
    require(path.join(V3, 'solver-roundtrip.js'));
    const api = global.FSSolverRoundTrip;
    const model = {
        provenance: { projectId: 'qa-super-improvement', sourceRevisionId: 'qa-r1' },
        levels: [{ id: 'GF', name: 'GF', elevation: 0, kind: 'floor' }],
        gridDefinition: {
            xLines: [{ label: 'A', coordinateM: 0, bubbleLoc: 'End', visible: true }],
            yLines: [{ label: '1', coordinateM: 0, bubbleLoc: 'Start', visible: true }]
        },
        columns: [{ id: 'GF-A1', x: 0, y: 0, z1: 0, z2: 3 }],
        beams: [{
            id: 'GF-B1', x1: 0, y1: 0, x2: 4, y2: 0, z: 3,
            jointOffsets: { sharedSolverPlan: { start: { dx: 0.1, dy: 0 }, end: { dx: -0.1, dy: 0 } } }
        }],
        counts: { stories: 1, columns: 1, beams: 1, slabs: 1, footings: 1, pedestals: 1, tieBeams: 0 },
        foundation: { enabled: true },
        foundationHandoff: {
            mode: 'plan', geometryExportedToETABS: false,
            baseSupportRestraintsExportedToETABS: true,
            footingsInSource: 1, pedestalsInSource: 1, tieBeamsInSource: 0
        }
    };
    const complete = api.buildETABSAuditRecord({
        solver: 'ETABS', stories: 1, columns: 1, beams: 1, slabs: 1,
        frameObjectsInETABS: 2, areaObjectsInETABS: 1, levels: model.levels,
        provenance: model.provenance, analysisReturn: 0,
        modalModes: [{ Mode: 1, SumUX: 1, SumUY: 1, SumRZ: 1 }],
        gridDefinition: {
            nativeLines: {
                rows: [
                    { LineType: 'X (Cartesian)', ID: 'A', Ordinate: '0', BubbleLoc: 'End', Visible: 'Yes' },
                    { LineType: 'Y (Cartesian)', ID: '1', Ordinate: '0', BubbleLoc: 'Start', Visible: 'Yes' }
                ]
            }
        },
        analyticalGeometry: {
            nativeGeometryAudit: {
                status: 'PASS',
                toleranceM: 0.001,
                columns: [{ name: 'C-GF-A1', start: [0, 0, 0], end: [0, 0, 3] }],
                beams: [{ name: 'B-GF-B1', start: [0, 0, 3], end: [4, 0, 3] }]
            },
            nativeFrameAudit: {
                columns: [{ name: 'C-GF-A1', jointOffset1Global: [0, 0, 0], jointOffset2Global: [0, 0, 0] }],
                beams: [{ name: 'B-GF-B1', jointOffset1Global: [0.1, 0, 0], jointOffset2Global: [-0.1, 0, 0] }]
            },
            nativeFrameParityAudit: { status: 'PASS' },
            columnationParity: { status: 'PASS' }
        },
        foundation: {
            mode: 'plan', geometryExportedToETABS: false,
            baseSupportRestraintsExportedToETABS: true,
            footingsInSource: 1, pedestalsInSource: 1, tieBeamsInSource: 0
        }
    }, model, 'complete.json');
    assert.equal(complete.comparison.status, 'MATCH');
    assert.equal(complete.comparison.geometry.status, 'MATCH');
    const partial = api.buildETABSAuditRecord({
        solver: 'ETABS',
        stories: 1,
        foundation: model.foundationHandoff
    }, model, 'partial.json');
    assert.notEqual(partial.comparison.status, 'MATCH');
    assert.equal(partial.comparison.status, 'INCOMPLETE');
    const booleanCount = api.buildETABSAuditRecord({
        solver: 'ETABS', stories: true,
        foundation: model.foundationHandoff
    }, model, 'boolean.json');
    assert.notEqual(booleanCount.comparison.status, 'MATCH');
    return { complete: complete.comparison.status, partial: partial.comparison.status, booleanCount: booleanCount.comparison.status };
}

function checkGravityComparison() {
    const api = require(path.join(V3, 'tools', 'compare-gravity-results.js'));
    const parsed = api.staadPrimaryLoads(`
TOTAL APPLIED LOAD (LOADING 1)\nSUMMATION FORCE-Y = -100.0
TOTAL APPLIED LOAD (LOADING 2)\nSUMMATION FORCE-Y = -200.0
`);
    assert.equal(parsed.deadKN, 100);
    assert.equal(parsed.signedDeadKN, -100);
    assert.equal(api.withinTolerance(api.difference(100, 0), 2, 0.01), false);
    assert.equal(api.withinTolerance(api.difference(0, 0), 2, 0.01), true);
    return { deadMagnitude: parsed.deadKN, signedDead: parsed.signedDeadKN, zeroReferenceRejectsNonzero: true };
}

function checkPyniteScopeGate() {
    require(path.join(V3, 'analysis-optimization.js'));
    const api = require(path.join(V3, 'engine', 'pynite-adapter.js'));
    const base = {
        schema: 'FutolStructure.CSIExportModel.v1',
        provenance: { projectId: 'qa-pynite-scope', sourceRevisionId: 'qa-r1' },
        coordinateTransform: { source: 'FutolStructure X-right/Y-down' },
        verticalDatums: { baseSupportElevation: 0 },
        levels: [{ id: 'GF', name: 'GF', elevation: 3, kind: 'floor' }],
        counts: { stories: 1, columns: 1, beams: 1, slabs: 0 },
        columns: [{ id: 'GF-C1', x: 0, y: 0, z1: 0, z2: 3 }],
        beams: [{ id: 'GF-B1', x1: 0, y1: 0, x2: 4, y2: 0, z: 3 }],
        slabs: [],
        supports: [{ id: 'SUP-1', nodeX: 0, nodeY: 0, elevation: 0, restraint: [true, true, true, true, true, true] }],
        loadCases: [{ id: 'FS_DEAD', selfWeightMultiplier: 1 }],
        loadCombinations: [{ id: 'ULS-1.4D', factors: [{ caseId: 'FS_DEAD', factor: 1.4 }] }],
        analysisInputValidation: { solverReady: true, blockers: [], warnings: [] }
    };
    const baseline = api.prepareJob(base);
    assert.equal(baseline.status, 'READY_FOR_RUN');
    assert.equal(baseline.runRequest.scopeAudit.status, 'SUPPORTED_BASELINE');

    const offset = api.prepareJob({
        ...base,
        beams: [{
            ...base.beams[0],
            verticalInsertionOffsetM: -0.15,
            jointOffsets: {
                start: { dx: 0.1, dy: 0, dz: 0 },
                end: { dx: 0.1, dy: 0, dz: 0 },
                sharedSolverPlan: {
                    start: { dx: 0.1, dy: 0, dz: 0 },
                    end: { dx: 0.1, dy: 0, dz: 0 }
                }
            }
        }]
    });
    assert.equal(offset.status, 'BLOCKED');
    assert.equal(offset.runRequest.scopeAudit.status, 'BLOCKED');
    assert.match(offset.runRequest.blockers.join(' '), /physical_member_joint_offsets/);
    assert.match(offset.runRequest.blockers.join(' '), /vertical_member_insertion_offsets/);
    assert.equal(offset.runRequest.scopeAudit.unsupported.length, 2);
    assert.equal(offset.runRequest.scopeAudit.unsupported[0].paths.length, 4);
    assert.match(offset.runRequest.blockers.join(' '), /physical_member_joint_offsets=1 member/);
    assert.match(offset.runRequest.blockers.join(' '), /vertical_member_insertion_offsets=1 member/);

    const sloped = api.prepareJob({
        ...base,
        beams: [{ ...base.beams[0], z1: 3, z2: 3.4 }]
    });
    assert.equal(sloped.status, 'BLOCKED');
    assert.match(sloped.runRequest.blockers.join(' '), /sloped_members/);
    return {
        baseline: baseline.runRequest.scopeAudit.status,
        offset: offset.runRequest.scopeAudit.status,
        sloped: sloped.runRequest.scopeAudit.status,
        manifest: api.featureManifest.contract
    };
}

function checkSourceContracts() {
    const runner = read('v3/tools/run-pynite.py');
    const adapter = read('v3/engine/pynite-adapter.js');
    assert.match(runner, /elastic_mpa \* 1000\.0/);
    assert.match(runner, /PyNite mapping is incomplete; no analysis was run/);
    assert.match(runner, /collect_unsupported_features/);
    assert.match(runner, /summarize_unsupported_features/);
    assert.match(runner, /unsupported until Phase 1B mapping is implemented/);
    assert.match(adapter, /FutolStructure\.AdapterFeatureManifest\.v1/);
    assert.match(adapter, /physical_member_joint_offsets/);
    assert.match(adapter, /summarizeUnsupportedFeatures/);
    assert.match(adapter, /scopeAudit/);
    assert.match(read('v3/solver-roundtrip.js'), /compareNativeGeometry/);
    const dashboard = read('v3/index.html');
    assert.match(dashboard, /id="assumedSoilBearing"/);
    assert.match(dashboard, /id="finalSoilBearing"/);
    assert.match(dashboard, /function updateSoilBearingFromUI\(\)/);
    assert.match(dashboard, /Basis: \$\{isFinal \? 'FINAL \/ VERIFIED INPUT'/);
    assert.match(dashboard, /id="canonicalAnalyticalAudit"/);
    assert.match(dashboard, /Parked scope: wall, roof-frame, stair, tank, blockwall/);
    assert.match(dashboard, /id="wallEditorSolver" type="checkbox" disabled/);
    assert.match(dashboard, /id="roofFrameSolver" type="checkbox" disabled/);
    assert.doesNotMatch(dashboard, /getElementById\('soilBearing'\)/);
    const start = dashboard.indexOf('function updateLoadSummary()');
    const end = dashboard.indexOf('\n        function isFloorAtOrAbove', start);
    const summary = dashboard.slice(start, end);
    assert.match(summary, /floor\.slabThickness/);
    assert.match(summary, /floor\.liveLoad/);
    assert.match(summary, /collect3DFloorGeometry/);
    assert.doesNotMatch(summary, /state\.slabThickness/);
    assert.doesNotMatch(summary, /\* numFloors/);
    return { runnerUnits: true, runnerMappingBlock: true, floorLedger: true, phase1BFeatureGate: true, footingSbcGovernance: true };
}

const result = {
    contract: 'FutolStructure.SuperImprovementPhase1A.v1',
    analysisInputs: checkAnalysisInputs(),
    solverRoundTrip: checkSolverRoundTrip(),
    gravityComparison: checkGravityComparison(),
    pyniteScope: checkPyniteScopeGate(),
    sourceContracts: checkSourceContracts()
};

console.log(JSON.stringify(result, null, 2));
