#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, spawnSync, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const V3 = path.join(ROOT, 'v3');
const INDEX = path.join(V3, 'index.html');
const HISTORICAL_FSTR_FIXTURE = path.join(V3, 'tools', 'fixtures', 'legacy-v2.8-2floor.fstr');
const REGULAR_3F_FSTR_FIXTURE = path.join(V3, 'tools', 'fixtures', 'regular-v2.8-3floor-pre-p0c.fstr');
const TERMINATED_3F_FSTR_FIXTURE = path.join(V3, 'tools', 'fixtures', 'terminated-v2.8-3floor-pre-p0c.fstr');
const COLUMN_SEGMENT_BASELINES = path.join(V3, 'tools', 'fixtures', 'p0-c1a-pre-migration-baselines.json');
const STAIR_STRUCTURAL_BASELINE = path.join(V3, 'tools', 'fixtures', 'stair-dogleg-structural-baseline.json');
const VERTICAL_DATUM_FOUNDATION_BASELINE = path.join(
    V3,
    'tools',
    'fixtures',
    'vertical-datum-foundation-baseline.json'
);
const CANONICAL_ANALYTICAL_FIXTURE = path.join(
    V3,
    'tools',
    'fixtures',
    'canonical-analytical-bacacay-v1.json'
);
const DESKTOP_MAIN = path.join(ROOT, 'desktop', 'main.cjs');
const DESKTOP_PRELOAD = path.join(ROOT, 'desktop', 'preload.cjs');
const DESKTOP_PACKAGE = path.join(ROOT, 'desktop', 'package.json');
const DESKTOP_ICON = path.join(ROOT, 'desktop', 'assets', 'futolstructure.ico');
const DXF_VALIDATOR = path.join(V3, 'tools', 'validate-dxf.py');
const IFC_VALIDATOR = path.join(V3, 'tools', 'validate-ifc.py');
const IFC_LITE_VALIDATOR = path.join(V3, 'tools', 'validate-ifc-lite.js');
const DEFAULT_PORT = Number(process.env.FS_CDP_PORT || 9234);
const CDP_TIMEOUT_MS = Math.max(15000, Number(process.env.FS_CDP_TIMEOUT_MS) || 15000);
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

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
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

function checkReleaseManifest() {
    const manifestPath = path.join(V3, 'release-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const html = fs.readFileSync(INDEX, 'utf8');
    const desktopPackage = JSON.parse(fs.readFileSync(DESKTOP_PACKAGE, 'utf8'));
    assert(manifest.appVersion === desktopPackage.version, 'Desktop and runtime versions differ', manifest);
    assert(manifest.buildId === 'FS-125-RC3', 'Release manifest build ID is stale', manifest);
    assert(manifest.releaseName === 'Desktop Workspaces Candidate', 'Release manifest name is stale', manifest);
    assert(manifest.fstrSchemaVersion === '0.2.0', 'Release manifest FSTR schema is stale', manifest);
    const allowUnstampedManifest = process.env.FS_ALLOW_UNSTAMPED_MANIFEST === '1';
    assert(
        /^[0-9a-f]{40}$/.test(manifest.gitCommit || '') ||
            (manifest.releaseChannel === 'development' && !manifest.gitCommit) ||
            (allowUnstampedManifest && !manifest.gitCommit),
        'Release manifest must contain a real commit SHA unless it is explicitly a development candidate',
        manifest
    );
    assert(html.includes('v' + manifest.appVersion), 'Build badge does not match release manifest', manifest);
    assert(html.includes(`const FSTR_BUILD_ID = '${manifest.buildId}'`), 'Runtime build ID does not match release manifest', manifest);
    assert(html.includes('persistence/project-revisions.js'), 'Protected revision module is not loaded by the app');
    assert(
        manifest.validatedFixtures?.includes('legacy-v2.8-2floor') &&
        manifest.validatedFixtures?.includes('regular-v2.8-3floor-pre-p0c') &&
        manifest.validatedFixtures?.includes('terminated-v2.8-3floor-pre-p0c') &&
        manifest.validatedFixtures?.includes('Olango_2026-07-14_3Floors_GF-2F-RF') &&
        manifest.validatedFixtures?.includes('canonical-analytical-bacacay-v1'),
        'Release manifest does not identify the P0-C1A compatibility fixtures',
        manifest
    );
    return manifest;
}

function checkHistoricalFstrFixture() {
    const fixture = JSON.parse(fs.readFileSync(HISTORICAL_FSTR_FIXTURE, 'utf8'));
    assert(fixture.version === '2.8' && !fixture.schemaVersion, 'Historical FSTR fixture is not a legacy pre-schema shape', fixture);
    assert(Array.isArray(fixture.floors) && fixture.floors.length === 2, 'Historical FSTR fixture floor count is invalid', fixture);
    assert(fixture.floors[0].voidSlabs.includes('S1'), 'Historical FSTR fixture is missing intentional hidden geometry', fixture.floors[0]);
    return { file: path.relative(ROOT, HISTORICAL_FSTR_FIXTURE), version: fixture.version, floors: fixture.floors.length };
}

function checkColumnSegmentFixtures() {
    [REGULAR_3F_FSTR_FIXTURE, TERMINATED_3F_FSTR_FIXTURE, COLUMN_SEGMENT_BASELINES].forEach(file => {
        assert(fs.existsSync(file), 'P0-C1A fixture is missing', { file });
    });
    const regular = JSON.parse(fs.readFileSync(REGULAR_3F_FSTR_FIXTURE, 'utf8'));
    const terminated = JSON.parse(fs.readFileSync(TERMINATED_3F_FSTR_FIXTURE, 'utf8'));
    const baselines = JSON.parse(fs.readFileSync(COLUMN_SEGMENT_BASELINES, 'utf8'));
    assert(regular.version === '2.8' && terminated.version === '2.8', 'P0-C1A fixtures must remain legacy pre-schema payloads');
    assert(regular.floors?.length === 3 && terminated.floors?.length === 3, 'P0-C1A three-floor fixtures are invalid');
    const terminatedA1 = terminated.columnOverrides?.find(column => column.id === 'A1');
    assert(terminatedA1?.activePerFloor?.RF === false, 'Terminated fixture does not freeze the legacy RF termination state');
    assert(
        baselines.fixtures?.['regular-v2.8-3floor-pre-p0c.fstr']?.threeD?.columnSegments === 27 &&
        baselines.fixtures?.['terminated-v2.8-3floor-pre-p0c.fstr']?.threeD?.columnSegments === 26 &&
        baselines.fixtures?.['legacy-v2.8-2floor.fstr']?.threeD?.columnSegments === 18,
        'P0-C1A pre-migration count baselines are incomplete',
        baselines
    );
    return {
        regular: path.relative(ROOT, REGULAR_3F_FSTR_FIXTURE),
        terminated: path.relative(ROOT, TERMINATED_3F_FSTR_FIXTURE),
        baselines: path.relative(ROOT, COLUMN_SEGMENT_BASELINES)
    };
}

function checkColumnSegmentSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const loads = fs.readFileSync(path.join(V3, 'engine', 'loads.js'), 'utf8');
    assert(loads.includes('function resolveColumnSegmentState('), 'Canonical column-segment resolver is missing from EngineLoads');
    assert(html.includes("const FSTR_SCHEMA_VERSION = '0.2.0'"), 'P0-C1A schema version is not governed');
    assert(html.includes("const FSTR_MIN_COMPATIBLE_APP_VERSION = '3.16.119'"), 'P0-C1A minimum compatible app is not governed');
    assert(html.includes('Project schema ${sourceSchemaVersion} requires a newer FutolStructure build'), 'Future-schema downgrade guard is missing');
    assert(html.includes("'legacy_omitted_column_line'"), 'Legacy whole-line omission migration is missing');
    assert(html.includes('migrateLegacyColumnSegmentIntent(oldColumns, state.floors);'), 'generateGrid does not reconcile legacy segment intent');
    assert(html.includes('const isPersistentCustom = column.isPlanted === true'), 'generateGrid does not preserve custom/planted columns');
    assert(html.includes("assertSolverColumnTopologyReady('STAAD')"), 'STAAD topology gate is missing');
    assert(html.includes("assertSolverColumnTopologyReady('ETABS')"), 'ETABS topology gate is missing');
    assert(html.includes('$foundationGeometryInETABS = $false'), 'ETABS foundation geometry policy is missing');
    assert(html.includes('$baseSupportRestraintsInETABS = $true'), 'ETABS base restraint policy is missing');
    assert(html.includes('Foundation geometry remains in IFC / SAFE / STAAD Foundation handoff'), 'ETABS foundation handoff disclosure is missing');
    assert(html.includes("dependentGeometryPolicy: 'preserve-and-mark-unresolved'"), 'Column dependency policy is not explicit');
    assert(html.includes("intent: 'remove_storey_segment'") || html.includes("'remove_storey_segment'"), 'Storey-segment removal intent is missing');
    assert(html.includes("'terminated_above'"), 'Column termination intent is missing');
    assert(html.includes("'remove_entire_line'"), 'Entire-line removal intent is missing');
    return {
        schema: '0.2.0',
        minimumAppVersion: '3.16.119',
        resolver: 'EngineLoads.resolveColumnSegmentState',
        reconciler: 'generateGrid',
        solverGate: ['STAAD', 'ETABS']
    };
}

function checkDxfSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const writer = fs.readFileSync(path.join(V3, 'dxf-export.js'), 'utf8');
    const requirementsPath = path.join(V3, 'tools', 'requirements-dxf.txt');
    assert(!html.includes('AC1015') && !writer.includes('AC1015'), 'DXF source still advertises AutoCAD 2000 while using the R12 writer');
    assert(html.includes('AC1009') && writer.includes('AC1009'), 'DXF source does not advertise AutoCAD R12');
    assert(html.includes('BYLAYER') && html.includes('BYBLOCK') && html.includes('arial.ttf'), 'DXF R12 standard table records or Arial text style are incomplete');
    assert(!html.includes('\\n370\\n') && !writer.includes('\\n370\\n'), 'DXF R12 writer still emits the R2000 lineweight group');
    assert(!html.includes('\\n74\\n') && !writer.includes('\\n74\\n'), 'DXF R12 writer still emits unsupported linetype alignment groups');
    assert(fs.existsSync(DXF_VALIDATOR), 'DXF strict validator is missing', { path: DXF_VALIDATOR });
    assert(fs.existsSync(requirementsPath) && fs.readFileSync(requirementsPath, 'utf8').includes('ezdxf'), 'DXF parser dependency is not pinned');
    return {
        version: 'AC1009',
        validator: path.relative(ROOT, DXF_VALIDATOR),
        requirements: path.relative(ROOT, requirementsPath)
    };
}

function checkStairSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const enginePath = path.join(V3, 'engine', 'stairs.js');
    const engine = fs.readFileSync(enginePath, 'utf8');
    const dxf = fs.readFileSync(path.join(V3, 'dxf-export.js'), 'utf8');
    assert(html.includes('engine/stairs.js'), 'Stair structural engine is not loaded by the app');
    [
        'stair_flight_slab',
        'landing_slab',
        'stair_beam',
        'landing_beam',
        'stair_opening',
        'stair_support_reaction'
    ].forEach(memberType => {
        assert(engine.includes(memberType), `Stair structural member type ${memberType} is missing`);
    });
    assert(engine.includes('excluded_from_horizontal_rigid_diaphragm'), 'Stair diaphragm exclusion policy is missing');
    assert(engine.includes('export_shells_and_frames_or_reactions_never_both'), 'Stair load double-count policy is missing');
    assert(html.includes("assertSolverStairTopologyReady('STAAD'"), 'STAAD stair integration gate is missing');
    assert(html.includes("assertSolverStairTopologyReady('ETABS'"), 'ETABS stair integration gate is missing');
    assert(html.includes('stairPlan2DCanvas') && html.includes('stairElevation2DCanvas') && html.includes('renderStairBuilder2DViews'), '2D stair plan/elevation workspace is missing');
    assert(html.includes("'FS_STAIR_DL pattern'") && html.includes("'FS_STAIR_LL pattern'"), 'ETABS stair load patterns are missing');
    assert(html.includes('$createdStairBeams') && html.includes('$createdStairSlabs'), 'ETABS stair frame and shell creation path is missing');
    assert(html.includes('FS_AUDIT_STAIR_COMPONENTS') && html.includes('stairLoadPolicy'), 'STAAD stair export audit path is missing');
    assert(html.includes('data-tab-group="model"') && html.includes('data-tab-group="design"'), 'Workflow-grouped tab controls are missing');
    assert(html.includes('IFCOPENINGELEMENT') && html.includes('FS_StairId'), 'IFC stair components or metadata are missing');
    assert(dxf.includes('STAIR STRUCTURAL COMPONENT SCHEDULE'), 'DXF stair component schedule is missing');
    return {
        schema: 'FutolStructure.StairStructuralModel.v1',
        memberTypes: [
            'stair_flight_slab',
            'landing_slab',
            'stair_beam',
            'landing_beam',
            'stair_opening',
            'stair_support_reaction'
        ],
        solverGate: ['STAAD', 'ETABS'],
        coordinationExports: ['DXF', 'IFC', 'A4 report']
    };
}

function checkStairStructuralFixture() {
    const EngineStairs = require(path.join(V3, 'engine', 'stairs.js'));
    const fixture = JSON.parse(fs.readFileSync(STAIR_STRUCTURAL_BASELINE, 'utf8'));
    const supportMappings = {};
    const model = EngineStairs.buildStairStructuralModel(fixture.stair, {
        ...fixture.context,
        bayBounds: fixture.stair.bounds,
        resolveSupport(request) {
            const support = {
                kind: 'beam',
                referenceId: `${request.floorId}-HOST-${request.role}`,
                floorId: request.floorId
            };
            supportMappings[request.reactionId] = support;
            return support;
        }
    });
    const expected = fixture.expected;
    const physicalMeshTotal = model.counts.flightSlabs +
        model.counts.landingSlabs +
        model.counts.stairBeams +
        model.counts.landingBeams;
    const intermediate = model.beams.find(beam => beam.id === expected.intermediateLandingBeamId);
    assert(model.schema === expected.schema, 'Stair fixture schema changed', model);
    assert(
        Object.entries(expected.componentCounts).every(([key, value]) => model.counts[key] === value),
        'Stair fixture component counts changed',
        { expected: expected.componentCounts, actual: model.counts }
    );
    assert(
        model.components.length === expected.componentTotal &&
        physicalMeshTotal === expected.physicalMeshTotal,
        'Stair fixture physical or governed component total changed',
        { expected, physicalMeshTotal, componentTotal: model.components.length }
    );
    assert(
        Math.abs(intermediate?.start?.z - expected.intermediateLandingElevation) < 1e-9 &&
        Math.abs(intermediate?.end?.z - expected.intermediateLandingElevation) < 1e-9,
        'Stair fixture intermediate landing beam elevation changed',
        intermediate
    );
    assert(
        Math.abs(model.loadHandoff.totalDeadKN - expected.totalDeadKN) < 1e-9 &&
        Math.abs(model.loadHandoff.totalLiveKN - expected.totalLiveKN) < 1e-9,
        'Stair fixture preliminary load handoff changed',
        model.loadHandoff
    );
    assert(
        Object.keys(supportMappings).length === expected.supportMappingCount &&
        model.supportReactions.every(reaction => reaction.support.status === 'resolved'),
        'Stair fixture support map changed',
        model.supportReactions
    );
    assert(
        model.integration.status === expected.integrationStatus &&
        model.integration.solverReady === expected.solverReady &&
        model.loadHandoff.doubleCountPolicy === expected.doubleCountPolicy &&
        model.flightSlabs.every(slab => slab.diaphragmPolicy === expected.diaphragmPolicy),
        'Stair fixture analytical governance changed',
        { integration: model.integration, loadHandoff: model.loadHandoff }
    );
    return {
        file: path.relative(ROOT, STAIR_STRUCTURAL_BASELINE),
        fixtureId: fixture.fixtureId,
        counts: model.counts,
        componentTotal: model.components.length,
        physicalMeshTotal,
        elevations: model.coordinatePrimer,
        loads: {
            deadKN: model.loadHandoff.totalDeadKN,
            liveKN: model.loadHandoff.totalLiveKN
        },
        integration: model.integration
    };
}

function checkRevitImportSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const revitProjectPath = path.join(ROOT, 'revit', 'FutolStructure.Revit2027.csproj');
    const revitCommandPath = path.join(ROOT, 'revit', 'FutolStructureCommand.cs');
    assert(fs.existsSync(revitProjectPath), 'Revit 2027 add-in project is missing');
    assert(fs.existsSync(revitCommandPath), 'Revit 2027 import command is missing');
    const revitProject = fs.readFileSync(revitProjectPath, 'utf8');
    const revitCommand = fs.readFileSync(revitCommandPath, 'utf8');
    assert(html.includes("FutolStructure.RevitNativeImport.v1"), 'Native Revit import contract is missing');
    assert(html.includes('function buildRevitImportManifest('), 'Revit import manifest builder is missing');
    assert(html.includes('function exportToRevitPackage('), 'Revit package export action is missing');
    assert(html.includes('columnCardinalPoint'), 'Revit manifest must preserve column cardinal point governance');
    assert(html.includes('beamCardinalPoint'), 'Revit manifest must preserve beam cardinal point governance');
    assert(html.includes('jointOffsetPolicy'), 'Revit manifest must preserve joint-offset policy');
    assert(html.includes('PENDING_APPROVED_DESIGN_RESULTS'), 'Revit rebar gate is missing');
    assert(html.includes('baseSupportElevation'), 'Revit manifest must carry the governed base support datum');
    assert(revitProject.includes('<TargetFramework>net10.0-windows</TargetFramework>'), 'Revit 2027 add-in must target .NET 10 for Windows');
    assert(revitProject.includes('RevitAPI.dll') && revitProject.includes('RevitAPIUI.dll'), 'Revit API references are incomplete');
    assert(revitCommand.includes('Grid.Create('), 'Native Revit grid creation is missing');
    assert(revitCommand.includes('Level.Create('), 'Native Revit level creation is missing');
    assert(revitCommand.includes('exists at a different elevation and was not modified'), 'Level conflict blocking is missing');
    assert(revitCommand.includes('exists at a different coordinate and was not modified'), 'Grid conflict blocking is missing');
    assert(revitCommand.includes('revit-import-audit-'), 'Dated native Revit import audit is missing');
    return {
        contract: 'FutolStructure.RevitNativeImport.v1',
        source: 'collectCSIExportModelData',
        nativeRvt: 'Revit 2027 add-in compiled; levels/grids implemented; native acceptance pending',
        rebar: 'PENDING_APPROVED_DESIGN_RESULTS'
    };
}

function checkIfcSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    assert(fs.existsSync(IFC_VALIDATOR), 'Strict IFC validator is missing', { path: IFC_VALIDATOR });
    assert(fs.existsSync(IFC_LITE_VALIDATOR), 'Dependency-free IFC validator is missing', { path: IFC_LITE_VALIDATOR });
    assert(html.includes('IFCFOOTING'), 'IFC footing export mapping is missing');
    assert(html.includes('Foundation Tie Beam'), 'IFC foundation tie-beam metadata is missing');
    assert(html.includes('Pedestal'), 'IFC pedestal metadata is missing');
    assert(html.includes('BASE/FOUNDATION'), 'IFC foundation storey name is missing');
    assert(html.includes('FS_BaseSupportElevation'), 'IFC base-support datum metadata is missing');
    return {
        strictValidator: path.relative(ROOT, IFC_VALIDATOR),
        lightweightValidator: path.relative(ROOT, IFC_LITE_VALIDATOR),
        foundationTypes: ['IfcFooting', 'IfcBeam/Foundation Tie Beam', 'IfcColumn/Pedestal metadata']
    };
}

function checkVerticalDatumSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const enginePath = path.join(V3, 'engine', 'vertical-datums.js');
    const engine = fs.readFileSync(enginePath, 'utf8');
    const dxf = fs.readFileSync(path.join(V3, 'dxf-export.js'), 'utf8');
    const requirementsPath = path.join(V3, 'tools', 'requirements-ifc.txt');
    assert(html.includes('engine/vertical-datums.js'), 'Vertical datum engine is not loaded by the app');
    assert(
        engine.includes('FutolStructure.VerticalDatums.v1') &&
        engine.includes('resolveVerticalDatums') &&
        engine.includes('serializeVerticalDatums'),
        'Canonical vertical datum resolver or serializer is incomplete'
    );
    [
        'gradeElevation',
        'groundFloorElevation',
        'baseSupportElevation',
        'footingBottomElevation',
        'footingTopElevation'
    ].forEach(field => {
        assert(engine.includes(field), `Vertical datum field ${field} is missing from the engine`);
        assert(html.includes(field), `Vertical datum field ${field} is not integrated into the app`);
    });
    assert(html.includes('syncGovernedFloorElevations()'), 'App does not synchronize governed floor elevations');
    assert(html.includes('collectFoundationExportData(verticalDatums)'), 'Foundation export does not consume governed datums');
    assert(html.includes('IFCFOOTING('), 'IFC isolated-footing export is missing');
    assert(html.includes("'Pedestal'"), 'IFC pedestal classification metadata is missing');
    assert(html.includes("'Foundation Tie Beam'"), 'IFC foundation tie-beam classification is missing');
    assert(fs.existsSync(IFC_VALIDATOR), 'Strict IFC validator is missing', { path: IFC_VALIDATOR });
    assert(
        fs.existsSync(requirementsPath) &&
        fs.readFileSync(requirementsPath, 'utf8').includes('ifcopenshell=='),
        'IFC parser dependency is not pinned'
    );
    assert(html.includes('$model.verticalDatums.baseSupportElevation'), 'ETABS does not consume base-support elevation');
    assert(html.includes('verticalDatums.baseSupportElevation'), 'STAAD/CSI model does not consume base-support elevation');
    assert(
        dxf.includes('Grade / BASE') &&
        dxf.includes('GF elevation') &&
        dxf.includes('Floor levels') &&
        dxf.includes('Footing bottom / top'),
        'DXF datum disclosure is incomplete'
    );
    return {
        schema: 'FutolStructure.VerticalDatums.v1',
        consumers: ['3D', 'save/load', 'IFC', 'STAAD', 'ETABS', 'reports', 'DXF'],
        foundationEntities: ['IfcFooting', 'IfcColumn/Pedestal', 'IfcBeam/Foundation Tie Beam'],
        validator: path.relative(ROOT, IFC_VALIDATOR),
        requirements: path.relative(ROOT, requirementsPath)
    };
}

function checkSolverRoundTripSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'solver-roundtrip.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    assert(html.includes('solver-roundtrip.js'), 'Solver round-trip module is not loaded by the app');
    assert(html.includes('importETABSAudit') && html.includes('solverAuditInput'), 'ETABS audit import UI is missing');
    assert(html.includes('solverRoundTripGeometry'), 'ETABS native geometry reconciliation UI is missing');
    assert(source.includes('FutolStructure.SolverRoundTrip.v1'), 'Solver round-trip contract is missing');
    assert(source.includes('compareNativeGeometry'), 'Native ETABS geometry reconciliation is missing');
    assert(source.includes('compareGridDefinition'), 'Native ETABS grid reconciliation is missing');
    assert(source.includes('physicalEndpoints'), 'Offset-adjusted physical endpoint reconciliation is missing');
    assert(
        html.includes("roundTripContract = 'FutolStructure.SolverRoundTrip.v1'") &&
        html.includes('verticalDatums = $model.verticalDatums') &&
        html.includes('levels = @($model.levels)') &&
        html.includes('provenance = $model.provenance'),
        'ETABS audit does not expose round-trip provenance and governed levels'
    );

    const sandbox = { window: {}, console };
    vm.runInNewContext(source, sandbox, { filename: modulePath });
    const api = sandbox.window.FSSolverRoundTrip;
    assert(api?.contract === 'FutolStructure.SolverRoundTrip.v1', 'Solver round-trip API is not attached');
    const model = {
        provenance: { projectId: 'qa-roundtrip', sourceRevisionId: 'qa-r1' },
        verticalDatums: { groundFloorElevation: 3 },
        levels: [
            { id: 'BASE/FOUNDATION', name: 'BASE/FOUNDATION', elevation: 0, kind: 'foundation' },
            { id: 'GF', name: 'GF', elevation: 3, kind: 'floor' },
            { id: 'RF', name: 'RF', elevation: 6, kind: 'floor' }
        ],
        counts: { stories: 2, columns: 4, beams: 6, slabs: 4, footings: 4, pedestals: 4, tieBeams: 3 },
        foundation: { enabled: true, footings: [{ id: 'F1' }], pedestals: [{ id: 'P1' }], tieBeams: [{ id: 'TB1' }] },
        foundationHandoff: {
            mode: 'plan',
            geometryExportedToETABS: false,
            baseSupportRestraintsExportedToETABS: true,
            footingsInSource: 4,
            pedestalsInSource: 4,
            tieBeamsInSource: 3
        }
    };
    const audit = {
        roundTripContract: 'FutolStructure.SolverRoundTrip.v1',
        stories: 2,
        columns: 4,
        beams: 6,
        slabs: 4,
        frameObjectsInETABS: 10,
        areaObjectsInETABS: 4,
        levels: model.levels,
        provenance: model.provenance,
        foundation: {
            mode: 'plan',
            geometryExportedToETABS: false,
            baseSupportRestraintsExportedToETABS: true,
            footingsInSource: 4,
            pedestalsInSource: 4,
            tieBeamsInSource: 3
        },
        analysisReturn: 0,
        modalModes: [{ Mode: 1, SumUX: 0.8, SumUY: 0.7, SumRZ: 0.6 }]
    };
    const record = api.buildETABSAuditRecord(audit, model, 'qa-etabs-audit.json');
    assert(record.comparison.status === 'MATCH', 'Matching ETABS round-trip fixture did not match', record);
    assert(record.comparison.levels.status === 'MATCH', 'Matching ETABS level fixture did not match', record);
    const changedAudit = { ...audit, beams: audit.beams + 1 };
    const changed = api.buildETABSAuditRecord(changedAudit, model, 'qa-changed.json');
    assert(changed.comparison.status === 'REVIEW' && changed.comparison.warnings.some(warning => warning.includes('beams')), 'Changed ETABS audit was not flagged for review', changed);
    const shiftedAudit = {
        ...audit,
        levels: audit.levels.map(level => level.id === 'GF' ? { ...level, elevation: level.elevation + 0.1 } : level)
    };
    const shifted = api.buildETABSAuditRecord(shiftedAudit, model, 'qa-shifted-level.json');
    assert(shifted.comparison.status === 'REVIEW' && shifted.comparison.levels.status === 'DIFF', 'Shifted ETABS level was not flagged for review', shifted);
    const foreignAudit = {
        ...audit,
        provenance: { ...audit.provenance, projectId: 'different-project' }
    };
    const foreign = api.buildETABSAuditRecord(foreignAudit, model, 'qa-foreign-project.json');
    assert(foreign.comparison.status === 'REVIEW' && foreign.comparison.warnings.some(warning => warning.includes('provenance')), 'Foreign ETABS provenance was not flagged for review', foreign);
    return {
        contract: api.contract,
        matchingStatus: record.comparison.status,
        changedStatus: changed.comparison.status,
        shiftedLevelStatus: shifted.comparison.levels.status,
        foreignProjectStatus: foreign.comparison.status,
        checks: Object.keys(record.comparison.counts).length,
        levelChecks: record.comparison.levels.items.length
    };
}

function checkCanonicalAnalyticalFixtureSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'solver-roundtrip.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    assert(fs.existsSync(CANONICAL_ANALYTICAL_FIXTURE), 'Canonical analytical fixture is missing', {
        file: CANONICAL_ANALYTICAL_FIXTURE
    });
    assert(source.includes('FutolStructure.CanonicalAnalyticalFixture.v1'), 'Canonical analytical fixture contract is missing');
    assert(source.includes('compareCanonicalAnalyticalFixture'), 'Canonical analytical fixture comparator is missing');
    assert(html.includes('solver-roundtrip.js'), 'Canonical analytical fixture cannot use the solver round-trip module');
    const fixture = JSON.parse(fs.readFileSync(CANONICAL_ANALYTICAL_FIXTURE, 'utf8'));
    assert(fixture.contract === 'FutolStructure.CanonicalAnalyticalFixture.v1', 'Canonical analytical fixture contract ID is invalid', fixture);
    assert(fixture.expected?.counts?.columns === 18 && fixture.expected?.counts?.beams === 24 && fixture.expected?.counts?.slabs === 8, 'Canonical analytical fixture inventory changed', fixture.expected?.counts);
    assert(fixture.expected?.uniqueAnalyticalJoints === 27, 'Canonical analytical fixture joint count changed', fixture.expected);
    assert(fixture.expected?.policies?.columnCardinalPoint === 5 && fixture.expected?.policies?.beamCardinalPoint === 8, 'Canonical analytical fixture cardinal-point policy changed', fixture.expected?.policies);
    assert(fixture.expected?.gridDefinition?.xLines?.length === 3 && fixture.expected?.gridDefinition?.yLines?.length === 3, 'Canonical analytical fixture grid axes are incomplete', fixture.expected?.gridDefinition);
    const sandbox = { window: {}, console };
    vm.runInNewContext(source, sandbox, { filename: modulePath });
    const api = sandbox.window.FSSolverRoundTrip;
    assert(typeof api?.compareCanonicalAnalyticalFixture === 'function', 'Canonical analytical fixture API is not attached');
    return {
        file: path.relative(ROOT, CANONICAL_ANALYTICAL_FIXTURE),
        fixtureId: fixture.fixtureId,
        contract: fixture.contract,
        expectedCounts: fixture.expected.counts,
        expectedUniqueAnalyticalJoints: fixture.expected.uniqueAnalyticalJoints
    };
}

function checkAnalysisOptimizationSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'analysis-optimization.js');
    const pyniteModulePath = path.join(V3, 'engine', 'pynite-adapter.js');
    const pyniteRunnerPath = path.join(V3, 'tools', 'run-pynite.py');
    const gravityComparisonPath = path.join(V3, 'tools', 'compare-gravity-results.js');
    const pyniteRequirementsPath = path.join(V3, 'tools', 'requirements-pynite.txt');
    const source = fs.readFileSync(modulePath, 'utf8');
    const pyniteSource = fs.readFileSync(pyniteModulePath, 'utf8');
    const pyniteRunner = fs.readFileSync(pyniteRunnerPath, 'utf8');
    const gravityComparison = fs.readFileSync(gravityComparisonPath, 'utf8');
    const pyniteRequirements = fs.readFileSync(pyniteRequirementsPath, 'utf8');
    assert(html.includes('analysis-optimization.js'), 'Analysis/optimization contract is not loaded by the app');
    assert(html.includes('engine/pynite-adapter.js'), 'PyNite adapter is not loaded by the app');
    assert(html.includes('data-tab-group="analysis"') && html.includes('data-tab-group="optimization"'), 'Analysis and optimization workflow groups are missing');
    assert(html.includes('tabAnalysisWorkbench') && html.includes('tabOptimization'), 'Analysis and optimization tabs are missing');
    assert(html.includes('panelAnalysisWorkbench') && html.includes('panelOptimization'), 'Analysis and optimization panels are missing');
    assert(source.includes('FutolStructure.AnalysisOptimization.v1'), 'Analysis/optimization contract is missing');
    assert(source.includes('createCanonicalRequest') && source.includes('noSilentGeometryRewrite'), 'Canonical request governance is missing');
    assert(source.includes('pynite') && source.includes('opensees') && source.includes('qubo'), 'Required analysis engines are not registered');
    assert(source.includes('proposal-only-engineer-approval'), 'QUBO approval policy is missing');
    assert(pyniteSource.includes('FutolStructure.PyNiteAdapter.v1') && pyniteSource.includes('FutolStructure.PyNiteRunRequest.v1'), 'PyNite adapter contracts are missing');
    assert(pyniteSource.includes('No PyNite result may be applied') && pyniteSource.includes('run-pynite.py'), 'PyNite result/application safety boundary is missing');
    assert(pyniteRunner.includes('FutolStructure.PyNiteResult.v1') && pyniteRunner.includes('applyResults') && pyniteRunner.includes('add_member_self_weight'), 'PyNite runner mapping or result safety contract is missing');
    assert(pyniteRunner.includes('FutolStructure.PyNiteExecutionLog.v1') && pyniteRunner.includes('--cancel-file') && pyniteRunner.includes('CANCELLED'), 'PyNite controlled logging/cancellation contract is missing');
    assert(gravityComparison.includes('FutolStructure.GravitySolverComparison.v1') && gravityComparison.includes('dead-tolerance-percent'), 'PyNite/STAAD gravity comparison gate is missing');
    assert(pyniteRequirements.trim() === 'PyNiteFEA==3.0.0', 'PyNite dependency is not pinned to the governed version');
    assert(html.includes('thicknessMm,\n                            points: solverPoints'), 'Canonical regular slabs must retain explicit thickness for solver self-weight');
    assert(html.includes('thicknessMm: Number(slab.thicknessMm) || 150'), 'Canonical stair slabs must retain explicit thickness for solver self-weight');

    const api = require(modulePath);
    const pyniteApi = require(pyniteModulePath);
    assert(api.contract === 'FutolStructure.AnalysisOptimization.v1', 'Analysis/optimization API is not attached');
    const model = {
        schema: 'FutolStructure.CSIExportModel.v1',
        provenance: { projectId: 'qa-analysis', sourceRevisionId: 'qa-r1' },
        coordinateTransform: { source: 'FutolStructure X-right/Y-down' },
        levels: [{ id: 'BASE/FOUNDATION', name: 'BASE/FOUNDATION', elevation: 0, kind: 'foundation' }, { id: 'GF', name: 'GF', elevation: 3, kind: 'floor' }],
        counts: { stories: 1, columns: 1, beams: 1, slabs: 1, stairs: 0, stairBeams: 0, stairSlabs: 0, footings: 1, pedestals: 1, tieBeams: 0 },
        columns: [{ id: 'GF-A1' }], beams: [{ id: 'GF-B1' }], slabs: [{ id: 'GF-S1' }],
        foundation: { footings: [{ id: 'F1' }] },
        memberSizeGovernance: { status: 'READY' }
    };
    const pynite = api.createEngineJob('pynite', model);
    const opensees = api.createEngineJob('opensees', model);
    const qubo = api.createOptimizationProposal(model);
    assert(pynite.status === 'ADAPTER_PENDING' && opensees.status === 'ADAPTER_PENDING', 'Analysis jobs did not stop at the adapter boundary');
    assert(pynite.request.geometry.columns.length === 1 && pynite.request.geometry.beams.length === 1, 'Analysis request did not retain canonical geometry');
    assert(qubo.status === 'DRAFT' && qubo.candidates.length === 0 && qubo.applyPolicy === 'never-write-directly-to-canonical-model', 'QUBO study must not invent a candidate');
    const blocked = api.createEngineJob('pynite', { ...model, stairTopologyValidation: { summary: { solverReady: false, blocked: 1 } } });
    assert(blocked.status === 'BLOCKED' && !blocked.execution.runAllowed, 'Unresolved stair summary must block execution');
    const sizesBlocked = api.createEngineJob('pynite', { ...model, memberSizeGovernance: { summary: { solverReady: false } } });
    assert(sizesBlocked.status === 'BLOCKED', 'Member-size summary must be respected');
    const invalidLevel = api.createEngineJob('pynite', { ...model, levels: [{ id: 'GF', elevation: null }] });
    assert(invalidLevel.status === 'BLOCKED', 'Missing elevation must not become zero');
    assert(pynite.request.readiness.pending.includes('Explicit analysis support assignments'), 'Missing supports must remain pending');
    assert(Object.isFrozen(pynite.request.canonicalModel.columns[0]), 'Source snapshot must be immutable');
    model.columns[0].id = 'changed-source';
    assert(pynite.request.canonicalModel.columns[0].id === 'GF-A1', 'Draft must remain detached from current model');
    assert(api.createEngineJob('pynite', model).jobId !== api.createEngineJob('pynite', model).jobId, 'Consecutive jobs need distinct IDs');
    const readyModel = {
        ...model,
        supports: [{ id: 'SUP-1', nodeX: 0, nodeY: 0, elevation: 0, restraint: [true, true, true, true, true, true] }],
        loadCases: [{ id: 'FS_DEAD', selfWeightMultiplier: 1 }],
        loadCombinations: [{ id: 'ULS-1.4D', factors: [{ caseId: 'FS_DEAD', factor: 1.4 }] }],
        analysisInputValidation: { solverReady: true, blockers: [], warnings: [] }
    };
    const readyRun = pyniteApi.prepareJob(readyModel);
    assert(readyRun.status === 'READY_FOR_RUN' && readyRun.execution.runAllowed, 'Ready PyNite request did not reach the runner boundary');
    assert(readyRun.execution.applyResultsAllowed === false && readyRun.runRequest.status === 'READY_FOR_RUN', 'PyNite result application boundary is not locked');
    return {
        contract: api.contract,
        engines: api.listEngineDefinitions().map(engine => engine.id),
        canonicalRequest: api.requestContract,
        analysisStatus: [pynite.status, opensees.status],
        optimizationStatus: qubo.status,
        pyniteAdapter: readyRun.runRequest.contract
    };
}

function checkAnalysisInputsSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'engine', 'analysis-inputs.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    assert(html.includes('engine/analysis-inputs.js'), 'Shared analytical-input engine is not loaded by the app');
    assert(source.includes('FutolStructure.AnalyticalInputs.v1'), 'Analytical-input contract is missing');
    assert(source.includes('FS_DEAD') && source.includes('FS_SDL') && source.includes('FS_WALL'), 'Required governed load cases are missing');
    assert(source.includes('elementSelfMassOnce: true') && source.includes('includeLive: false'), 'Mass-source policy is not explicit');
    assert(source.includes('buildSupports') && source.includes('READY_FOR_ADAPTER'), 'Support resolution or validation gate is missing');
    const api = require(modulePath);
    const inputs = api.build({
        verticalDatums: { schema: 'FutolStructure.VerticalDatums.v1', baseSupportElevation: -1.5 },
        provenance: { buildId: 'qa' },
        columns: [{ id: 'GF-A1', x: 0, y: 0, z1: -1.5 }],
        slabs: [{ id: 'GF-S1', areaM2: 12, superDead: 2, live: 1.9 }],
        beams: [{ id: 'GF-B1', wallLoad: 6 }],
        stairSlabs: []
    });
    assert(inputs.contract === 'FutolStructure.AnalyticalInputs.v1', 'Analytical-input API contract is not attached');
    assert(inputs.validation.solverReady && inputs.supports.length === 1, 'Analytical-input fixture did not resolve a governed support');
    assert(inputs.massSource.includeLive === false && inputs.massSource.includedCaseIds.includes('FS_SDL'), 'Analytical mass source policy is incorrect');
    assert(inputs.combinations.some(combo => combo.id === 'ULS-1.2D+1.6L'), 'Required live-load design combination is missing');
    return { contract: api.contract, loadCases: inputs.loadCases.map(item => item.id), supports: inputs.supports.length, status: inputs.validation.status };
}

function checkWallInventorySourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'engine', 'walls.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    assert(html.includes('engine/walls.js'), 'Wall inventory engine is not loaded by the app');
    assert(source.includes('FutolStructure.WallInventory.v1'), 'Wall inventory contract is missing');
    assert(source.includes('chbThicknessMm') && source.includes('plasterInsideMm') && source.includes('plasterOutsideMm'), 'Wall masonry properties are missing');
    assert(source.includes('CHB_THICKNESS_OPTIONS_MM') && source.includes('normalizeChbThickness'), 'Governed 100/150/200 mm CHB options are missing');
    assert(source.includes('alignmentMode') && source.includes('flush-exterior') && source.includes('flush-interior'), 'Wall placement alignment modes are missing');
    assert(source.includes('plasterUnitWeightKNM3') && source.includes('wallTotalThicknessMm'), 'Wall finish weight or total thickness metadata is missing');
    assert(source.includes('openings') && source.includes('lintel') && source.includes('exportToSolvers'), 'Wall opening/lintel or solver opt-in policy is missing');
    assert(source.includes('normalizeSnap') && source.includes('elevations'), 'Programmable wall snaps or elevation inventory is missing');
    ['wallEditorOpeningType', 'wallEditorOpeningWidth', 'wallEditorOpeningHeight', 'wallEditorLintel', 'wallEditorAlignment', 'editWallFromPlan'].forEach(id => {
        assert(html.includes(id), `Wall editor control ${id} is missing`);
    });
    const api = require(modulePath);
    const inventory = api.build({ floors: [{ id: 'GF', height: 3, wallLoads: [{ id: 'W-GF-1', x1: 0, y1: 0, x2: 4, y2: 0, chbThicknessMm: 150, plasterInsideMm: 20, plasterOutsideMm: 20, alignmentMode: 'flush-exterior', openings: [{ id: 'D1', type: 'door', widthM: 0.9, heightM: 2.1 }], lintel: { depthMm: 200 }, exportToSolvers: true }] }] });
    assert(inventory.contract === 'FutolStructure.WallInventory.v1', 'Wall inventory API contract is not attached');
    assert(inventory.walls.length === 1 && inventory.openings.length === 1 && inventory.lintels.length === 1, 'Wall opening/lintel inventory did not normalize');
    assert(inventory.solverWalls.length === 1 && inventory.walls[0].lineLoadKNm > 0, 'Opted-in wall line load was not derived');
    assert(inventory.walls[0].alignmentMode === 'flush-exterior' && inventory.walls[0].wallTotalThicknessMm === 190, 'Wall alignment or total thickness did not normalize');
    assert(inventory.walls[0].plasterInsideMm === 20 && inventory.walls[0].plasterOutsideMm === 20, 'Wall plaster defaults did not normalize to 20 mm each side');
    assert(inventory.elevations[0].openings[0].headElevationM > 0, 'Wall elevation opening head was not derived');
    return { contract: api.contract, walls: inventory.walls.length, openings: inventory.openings.length, lintels: inventory.lintels.length, elevations: inventory.elevations.length };
}

function checkWallSolverTransferSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    assert(html.includes('resolveFloorWallAssignments') && html.includes('wallSolverAssignments'), 'Canonical wall-to-beam solver resolver is missing');
    assert(html.includes('explicit-wall-line') && html.includes('wallLoadTransfer'), 'Per-beam explicit wall line-load transfer metadata is missing');
    assert(html.includes('wall.exportToSolvers === true'), 'Wall solver export is not persisted as an explicit opt-in');
    assert(html.includes('id="wallEditorSolver" type="checkbox"') && !html.includes('id="wallEditorSolver" type="checkbox" disabled'), 'Wall solver opt-in control is still disabled');
    assert(html.includes('wall endpoints resolve to a canonical beam axis'), 'Wall solver connectivity warning policy is missing');
    return {
        contract: 'FutolStructure.WallSolverTransfer.v1',
        policy: 'explicit-opt-in-to-canonical-beam-line-load',
        unresolvedPolicy: 'coordination-only-with-warning'
    };
}

function checkRoofFrameSourceContract() {
    const html = fs.readFileSync(INDEX, 'utf8');
    const modulePath = path.join(V3, 'engine', 'roof-frame.js');
    const source = fs.readFileSync(modulePath, 'utf8');
    assert(html.includes('engine/roof-frame.js') && html.includes('tabRoofFrame') && html.includes('panelRoofFrame'), 'Steel roof-frame workspace is not wired');
    assert(html.includes('roofFrameCanvas') && html.includes('setRoofFrameSupportType') && html.includes('renderRoofFrameViewport'), 'Roof-frame viewport or support controls are missing');
    assert(html.includes('addRoofFrameMember') && html.includes('editRoofFrameMember') && html.includes('removeRoofFrameMember'), 'Roof-frame member editing controls are missing');
    assert(source.includes('FutolStructure.RoofFrameModel.v1') && source.includes('solverMembers'), 'Roof-frame analytical contract is missing');
    assert(source.includes('deriveSupportAssignments') && source.includes('supportPlan'), 'Roof-frame automatic support-assignment policy is missing');
    const api = require(modulePath);
    const frame = api.build({
        floors: [{ id: 'RF', isRoof: true }],
        columns: [{ id: 'C1', x: 0, y: 0, z: 6 }, { id: 'C2', x: 4, y: 0, z: 6 }],
        roofFrame: { enabled: true, members: [{ id: 'R1', type: 'rafter', start: { x: 0, y: 0, z: 6 }, end: { x: 4, y: 0, z: 6.8 }, deadLoadKNm: 0.35, liveLoadKNm: 0.25, exportToSolvers: true }] }
    });
    assert(frame.contract === 'FutolStructure.RoofFrameModel.v1' && frame.members.length === 1 && frame.solverMembers.length === 1, 'Roof-frame fixture did not normalize');
    assert(frame.supportPolicy === 'auto' && frame.supportPlan.assignments.length === 2, 'Roof-frame AUTO support plan did not derive support nodes');
    assert(frame.supportPlan.assignments.some(item => item.supportType === 'hinge') && frame.supportPlan.assignments.some(item => item.supportType === 'roller'), 'Roof-frame AUTO support plan must include hinge and roller');
    assert(frame.loads.length === 2 && frame.loads.some(item => item.caseId === 'FS_ROOF_DL') && frame.loads.some(item => item.caseId === 'FS_ROOF_LL'), 'Roof-frame explicit line loads did not normalize');
    const fixed = api.build({ columns: [{ id: 'C1', x: 0, y: 0 }, { id: 'C2', x: 4, y: 0 }], roofFrame: { supportType: 'fixed' } });
    assert(fixed.supportPlan.assignments.every(item => item.supportType === 'fixed'), 'Explicit fixed support override was not applied');
    return { contract: api.contract, members: frame.members.length, solverMembers: frame.solverMembers.length, supportAssignments: frame.supportPlan.assignments.length, autoSupportTypes: frame.supportPlan.assignments.map(item => item.supportType) };
}

function checkDesktopETABSBridge() {
    const main = fs.readFileSync(DESKTOP_MAIN, 'utf8');
    const preload = fs.readFileSync(DESKTOP_PRELOAD, 'utf8');
    const index = fs.readFileSync(INDEX, 'utf8');
    const packageJson = JSON.parse(fs.readFileSync(DESKTOP_PACKAGE, 'utf8'));
    assert(fs.existsSync(DESKTOP_ICON), 'Windows FutolStructure icon is missing', { path: DESKTOP_ICON });
    assert(main.includes("ipcMain.handle('run-etabs-export'"), 'Desktop ETABS IPC handler is missing');
    assert(main.includes("ipcMain.handle('export-pdf-report'") && main.includes('printToPDF'), 'Desktop PDF generation bridge is missing');
    assert(main.includes('WindowsPowerShell'), 'Desktop ETABS bridge does not use Windows PowerShell');
    assert(main.includes('ETABS model created:'), 'Desktop ETABS bridge does not collect the generated EDB path');
    assert(
        main.includes("parseEtabsArtifactPath(result.stdout, 'Native E2K created'") &&
        main.includes("parseEtabsArtifactPath(result.stdout, 'Audit created'") &&
        main.includes("parseEtabsArtifactPath(result.stdout, 'Modal participation CSV created'") &&
        main.includes('auditPath') &&
        main.includes('modalParticipationCsvPath'),
        'Desktop ETABS bridge does not return the native E2K, FS audit JSON, and modal CSV paths'
    );
    assert(main.includes('FutolStructure ETABS Exports'), 'Desktop ETABS output directory is not governed');
    assert(
        main.includes("child.once('exit'") &&
        main.includes('child.stdout.destroy()') &&
        main.includes('child.stderr.destroy()'),
        'Desktop ETABS bridge can remain pending while the open ETABS process retains inherited output pipes'
    );
    assert(main.includes('if (hasSingleInstanceLock) {') && main.includes('app.whenReady().then'), 'Desktop lifecycle does not guard duplicate instances');
    assert(main.includes('pathToFileURL(indexPath)'), 'Desktop startup does not use a space-safe file URL');
    assert(preload.includes('runEtabsBuilder'), 'Desktop preload does not expose the ETABS builder bridge');
    assert(preload.includes('exportPdfReport'), 'Desktop preload does not expose the PDF generation bridge');
    assert(index.includes('desktopBridge.runEtabsBuilder'), 'ETABS UI is not connected to the desktop bridge');
    assert(index.includes('desktopBridge.exportPdfReport') && index.includes('return generatePDFReport()'), 'Report UI is not connected to generated PDF output');
    assert(index.includes('>Recalculate</button>') && !index.includes('>Run Analysis</button>'), 'The model recalculation action is still mislabeled as a solver analysis');
    assert(
        main.includes('const RECENT_PROJECT_LIMIT = 10') &&
        main.includes("'recent-projects.json'") &&
        main.includes("ipcMain.handle('get-recent-projects'") &&
        main.includes("ipcMain.handle('open-recent-project'") &&
        main.includes("ipcMain.handle('remember-project'") &&
        main.includes("label: 'Open Recent'") &&
        main.includes('app.addRecentDocument(normalizedPath)'),
        'Desktop recent-project persistence or native File menu integration is incomplete'
    );
    assert(
        preload.includes('getRecentProjects') &&
        preload.includes('openProjectDialog') &&
        preload.includes('openRecentProject') &&
        preload.includes('rememberProject'),
        'Desktop preload does not expose the governed recent-project bridge'
    );
    assert(
        index.includes('function renderDesktopRecentProjects(projects)') &&
        index.includes('function showDesktopRecentProjectsOnStartup()') &&
        index.includes('projects.slice(0, 10)') &&
        index.includes('showDesktopRecentProjectsOnStartup(), 200)'),
        'Desktop startup does not provide the ten-item Recent Projects surface'
    );
    assert(
        index.includes('if (window.FutolStructureDesktop?.isDesktop)') &&
        index.includes('awaiting an explicit FutolStructure project open'),
        'Desktop startup can silently restore a previous project instead of waiting for an explicit .fstr open'
    );
    assert(
        /function loadDesktopProject\([\s\S]*?applyLoadedProject\([\s\S]*?silent:\s*true[\s\S]*?quarantineHiddenGeometry:\s*true/.test(index),
        'Desktop file-association loading can block behind a success alert'
    );
    assert(packageJson.build?.win?.icon === 'assets/futolstructure.ico', 'Windows packaging is not using the FutolStructure ICO');
    return {
        windowsIcon: path.relative(ROOT, DESKTOP_ICON),
        powershellBridge: true,
        browserFallback: true,
        explicitProjectOpenOnStartup: true,
        recentProjectLimit: 10,
        nativeOpenRecentMenu: true,
        recentProjectsStartupSurface: true,
        nonBlockingFileAssociationLoad: true,
        etabsBuilderSettlesOnPowerShellExit: true,
        outputDirectory: 'Documents/FutolStructure ETABS Exports'
    };
}

function checkVerticalDatumFixture() {
    assert(fs.existsSync(VERTICAL_DATUM_FOUNDATION_BASELINE), 'Vertical datum fixture is missing', {
        file: VERTICAL_DATUM_FOUNDATION_BASELINE
    });
    const EngineVerticalDatums = require(path.join(V3, 'engine', 'vertical-datums.js'));
    const fixture = JSON.parse(fs.readFileSync(VERTICAL_DATUM_FOUNDATION_BASELINE, 'utf8'));
    const resolved = EngineVerticalDatums.resolveVerticalDatums(fixture.project, fixture.floors);
    const expected = fixture.expected;
    const tolerance = 1e-9;
    const close = (actual, target) => Math.abs(Number(actual) - Number(target)) <= tolerance;
    assert(resolved.schema === expected.schema && resolved.valid, 'Vertical datum fixture did not resolve', resolved);
    [
        'gradeElevation',
        'groundFloorElevation',
        'baseSupportElevation',
        'footingBottomElevation',
        'footingTopElevation',
        'belowGroundFloorColumnLength'
    ].forEach(field => {
        assert(close(resolved[field], expected[field]), `Vertical datum fixture ${field} changed`, {
            actual: resolved[field],
            expected: expected[field]
        });
    });
    expected.namedLevels.forEach((id, index) => {
        assert(resolved.namedLevels[index]?.id === id, `Governed level ${id} is missing or out of order`, {
            actual: resolved.namedLevels
        });
    });
    resolved.floorLevels.forEach(level => {
        assert(close(level.elevation, expected.floorLevels[level.id]), `Floor elevation ${level.id} changed`, level);
        assert(close(level.storeyHeight, expected.storeyHeights[level.id]), `Storey height ${level.id} changed`, level);
    });
    const serialized = EngineVerticalDatums.serializeVerticalDatums(resolved);
    const roundTrip = EngineVerticalDatums.resolveVerticalDatums(
        { verticalDatums: serialized },
        fixture.floors
    );
    assert(
        roundTrip.valid &&
        close(roundTrip.groundFloorElevation, expected.groundFloorElevation) &&
        close(roundTrip.baseSupportElevation, expected.baseSupportElevation) &&
        close(roundTrip.footingBottomElevation, expected.footingBottomElevation),
        'Serialized vertical datum contract did not round trip',
        roundTrip
    );
    return {
        file: path.relative(ROOT, VERTICAL_DATUM_FOUNDATION_BASELINE),
        fixtureId: fixture.fixtureId,
        verticalDatums: serialized,
        floorLevels: resolved.floorLevels,
        namedLevels: resolved.namedLevels
    };
}

function checkNodeSyntax(relativeFile) {
    execFileSync(process.execPath, ['--check', path.join(ROOT, relativeFile)], {
        stdio: 'pipe'
    });
}

let cachedDxfPython = null;
let cachedIfcPython = null;

function resolveDxfPython() {
    if (cachedDxfPython) return cachedDxfPython;
    const candidates = [];
    if (process.env.FS_PYTHON) candidates.push({ command: process.env.FS_PYTHON, args: [] });
    if (process.platform === 'win32') {
        candidates.push(
            { command: 'py', args: ['-3.12'] },
            { command: 'py', args: ['-3.11'] },
            { command: 'python', args: [] }
        );
    } else {
        candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] });
    }

    const attempts = [];
    for (const candidate of candidates) {
        const probe = spawnSync(candidate.command, [...candidate.args, '-c', 'import ezdxf'], {
            encoding: 'utf8',
            windowsHide: true
        });
        attempts.push({
            command: [candidate.command, ...candidate.args].join(' '),
            status: probe.status,
            error: probe.error?.message || '',
            stderr: String(probe.stderr || '').trim()
        });
        if (probe.status === 0) {
            cachedDxfPython = candidate;
            return candidate;
        }
    }
    throw Object.assign(new Error('DXF acceptance requires Python with ezdxf installed.'), { details: attempts });
}

function validateDxfWithEzdxf(dxfContent, label = 'generated') {
    assert(fs.existsSync(DXF_VALIDATOR), 'DXF parser validator is missing', { path: DXF_VALIDATOR });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'futolstructure-dxf-'));
    const dxfPath = path.join(tempDir, `${String(label).replace(/[^A-Za-z0-9_.-]+/g, '-')}.dxf`);
    fs.writeFileSync(dxfPath, dxfContent, 'utf8');
    try {
        const python = resolveDxfPython();
        const validation = spawnSync(
            python.command,
            [...python.args, DXF_VALIDATOR, dxfPath, '--expected-version', 'AC1009'],
            { encoding: 'utf8', windowsHide: true }
        );
        let audit = null;
        try {
            audit = JSON.parse(String(validation.stdout || '').trim());
        } catch (error) {
            throw Object.assign(new Error('DXF parser validator did not return JSON.'), {
                details: {
                    status: validation.status,
                    stdout: String(validation.stdout || '').trim(),
                    stderr: String(validation.stderr || '').trim()
                }
            });
        }
        assert(validation.status === 0 && audit.ok === true, 'DXF failed strict parser or round-trip validation', audit);
        return audit;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

function resolveIfcPython() {
    if (cachedIfcPython) return cachedIfcPython;
    const candidates = [];
    if (process.env.FS_PYTHON) candidates.push({ command: process.env.FS_PYTHON, args: [] });
    if (process.platform === 'win32') {
        candidates.push(
            { command: 'py', args: ['-3.12'] },
            { command: 'py', args: ['-3.11'] },
            { command: 'python', args: [] }
        );
    } else {
        candidates.push({ command: 'python3', args: [] }, { command: 'python', args: [] });
    }
    const attempts = [];
    for (const candidate of candidates) {
        const probe = spawnSync(
            candidate.command,
            [...candidate.args, '-c', 'import ifcopenshell, ifcopenshell.geom, ifcopenshell.validate'],
            { encoding: 'utf8', windowsHide: true }
        );
        attempts.push({
            command: [candidate.command, ...candidate.args].join(' '),
            status: probe.status,
            error: probe.error?.message || '',
            stderr: String(probe.stderr || '').trim()
        });
        if (probe.status === 0) {
            cachedIfcPython = candidate;
            return candidate;
        }
    }
    throw Object.assign(new Error('IFC acceptance requires Python with IfcOpenShell installed.'), {
        details: attempts
    });
}

function validateIfcWithIfcOpenShell(ifcContent, label = 'generated', options = {}) {
    assert(fs.existsSync(IFC_VALIDATOR), 'IFC strict validator is missing', { path: IFC_VALIDATOR });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'futolstructure-ifc-'));
    const ifcPath = path.join(tempDir, `${String(label).replace(/[^A-Za-z0-9_.-]+/g, '-')}.ifc`);
    fs.writeFileSync(ifcPath, ifcContent, 'utf8');
    try {
        const python = resolveIfcPython();
        const validatorArgs = [
            ...python.args,
            IFC_VALIDATOR,
            ifcPath
        ];
        (options.expectedLevels || []).forEach(level => {
            validatorArgs.push('--expect-level', `${level.name || level.id}=${level.elevation}`);
        });
        if (options.exactLevelSet) validatorArgs.push('--exact-level-set');
        const validation = spawnSync(
            python.command,
            validatorArgs,
            { encoding: 'utf8', windowsHide: true }
        );
        let audit = null;
        try {
            audit = JSON.parse(String(validation.stdout || '').trim());
        } catch (error) {
            throw Object.assign(new Error('IfcOpenShell validator did not return JSON.'), {
                details: {
                    status: validation.status,
                    stdout: String(validation.stdout || '').trim(),
                    stderr: String(validation.stderr || '').trim()
                }
            });
        }
        assert(
            validation.status === 0 &&
            audit.ok === true &&
            /^IFC2X3/i.test(audit.schema || ''),
            'IFC failed strict schema, geometry, datum, or metadata validation',
            audit
        );
        return audit;
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
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

    const browserArgs = [
        `--remote-debugging-port=${port}`,
        '--remote-debugging-address=127.0.0.1',
        '--remote-allow-origins=*',
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--disable-extensions',
        '--disable-background-networking'
    ];
    if (process.env.CI === 'true' || process.env.CI === '1' || process.env.FS_HEADLESS === '1') {
        browserArgs.push('--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu');
    }
    browserArgs.push('about:blank');

    const child = spawn(browser, browserArgs, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let browserOutput = '';
    const captureOutput = chunk => {
        browserOutput = `${browserOutput}${chunk.toString()}`.slice(-4000);
    };
    child.stdout.on('data', captureOutput);
    child.stderr.on('data', captureOutput);

    for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
            await fetchJson(`${base}/json/version`);
            return { base, process: child };
        } catch (err) {
            if (child.exitCode !== null) break;
            await wait(250);
        }
    }

    const exitState = child.exitCode === null ? 'still running' : `exit ${child.exitCode}`;
    if (child.exitCode === null) {
        try { child.kill(); } catch (err) { /* noop */ }
    }
    throw new Error(
        `Browser did not open a CDP endpoint on port ${port} (${browser}; ${exitState}).` +
        (browserOutput.trim() ? `\n${browserOutput.trim()}` : '')
    );
}

class CdpTab {
    constructor(webSocketDebuggerUrl) {
        this.ws = new WebSocket(webSocketDebuggerUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.logs = [];
        this.transportDiagnostics = [];
        this.opened = new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });
        this.ws.onclose = event => {
            this.transportDiagnostics.push({ closeCode: event.code, closeReason: event.reason || '', wasClean: event.wasClean });
        };
        this.ws.onmessage = event => {
            const data = event.data;
            this.transportDiagnostics.push({
                kind: typeof data,
                constructor: data?.constructor?.name || '',
                hasText: !!data && typeof data.text === 'function',
                byteLength: Number(data?.byteLength || data?.size || 0)
            });
            this.transportDiagnostics = this.transportDiagnostics.slice(-8);
            if (typeof data === 'string') {
                this.handleMessage(data);
            } else if (data && typeof data.text === 'function') {
                data.text().then(text => this.handleMessage(text)).catch(error => {
                    this.transportDiagnostics.push({ error: error.message });
                });
            } else if (data instanceof ArrayBuffer) {
                this.handleMessage(Buffer.from(data).toString('utf8'));
            } else if (ArrayBuffer.isView(data)) {
                this.handleMessage(Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8'));
            } else {
                this.transportDiagnostics.push({ error: 'unsupported CDP frame' });
            }
        };
    }

    handleMessage(raw) {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch (error) {
            this.transportDiagnostics.push({ error: error.message, sample: String(raw).slice(0, 120) });
            return;
        }
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
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            try {
                this.ws.send(JSON.stringify({ id, method, params }));
            } catch (error) {
                this.pending.delete(id);
                reject(error);
                return;
            }
            setTimeout(() => {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                reject(new Error(`CDP timeout: ${method}; readyState=${this.ws.readyState}; frames=${JSON.stringify(this.transportDiagnostics)}`));
            }, CDP_TIMEOUT_MS);
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
    const viewportWidth = Number(getArgValue('--viewport-width')) || 0;
    const viewportHeight = Number(getArgValue('--viewport-height')) || 0;
    if (viewportWidth > 0 && viewportHeight > 0) {
        await tab.send('Emulation.setDeviceMetricsOverride', {
            width: viewportWidth,
            height: viewportHeight,
            deviceScaleFactor: 1,
            mobile: viewportWidth < 700
        });
    }
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
    let lastReady = null;
    for (let attempt = 0; attempt < 240; attempt += 1) {
        try {
            const ready = await tab.evaluate(`(() => ({
                body: !!document.body,
                readyState: document.readyState,
                hasState: typeof state !== 'undefined',
                hasCalculate: typeof calculate === 'function',
                hasCanvas: typeof canvas !== 'undefined' && !!canvas && canvas.width > 0 && canvas.height > 0,
                title: document.title || ''
            }))()`);
            lastReady = ready;
            if (ready.body && ready.readyState === 'complete' && ready.hasState && ready.hasCalculate && ready.hasCanvas && ready.title.includes('FutolStructure')) {
                return;
            }
        } catch (err) {
            lastError = err;
        }
        await wait(250);
    }
    const diagnostic = lastReady ? ` Last state: ${JSON.stringify(lastReady)}` : '';
    throw new Error(`App did not become ready for browser smoke check${lastError ? `: ${lastError.message}` : ''}.${diagnostic}`);
}

async function runBrowserSmoke(historicalFixture, fs123OutputDir = null) {
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    const screenshotPath = path.join(os.tmpdir(), 'futolstructure-smoke.png');
    const stair3DScreenshotPath = path.join(os.tmpdir(), 'futolstructure-stair-3d.png');
    const revisionScreenshotPath = path.join(os.tmpdir(), 'futolstructure-protected-revisions.png');
    const verticalDatum3DScreenshotPath = path.join(os.tmpdir(), 'futolstructure-raised-gf-foundation-3d.png');
    const serializedHistoricalFixture = JSON.stringify(historicalFixture);
    const serializedRegular3FFixture = JSON.stringify(JSON.parse(fs.readFileSync(REGULAR_3F_FSTR_FIXTURE, 'utf8')));
    const serializedTerminated3FFixture = JSON.stringify(JSON.parse(fs.readFileSync(TERMINATED_3F_FSTR_FIXTURE, 'utf8')));
    const serializedVerticalDatumFixture = JSON.stringify(
        JSON.parse(fs.readFileSync(VERTICAL_DATUM_FOUNDATION_BASELINE, 'utf8'))
    );
    const serializedCanonicalAnalyticalFixture = JSON.stringify(
        JSON.parse(fs.readFileSync(CANONICAL_ANALYTICAL_FIXTURE, 'utf8'))
    );

    try {
        const result = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            localStorage.removeItem('FutolStructure.autosave.healthy.v1');
            localStorage.removeItem('FutolStructure.autosave.quarantine.v1');
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

            const uiCleanupAudit = (() => {
                const stairBeamBtn = document.getElementById('addCustomBeamBtn');
                const aiAssistantTab = document.getElementById('tabAIAssistant');
                const scheduleModal = document.getElementById('schedulesModal');
                const previousTab = currentPlanTab || 'structural';
                if (typeof showSchedulesModal === 'function') showSchedulesModal();
                const audit = {
                    buildBadge: document.getElementById('buildVersionBadge')?.textContent.trim() || '',
                    rebuildButton: Array.from(document.querySelectorAll('.header-actions .tool-btn')).some(btn => btn.textContent.trim() === 'Rebuild'),
                    etabsButton: Array.from(document.querySelectorAll('.header-actions .tool-btn')).some(btn => btn.textContent.trim() === 'ETABS'),
                    solverImportButton: Array.from(document.querySelectorAll('.header-actions .tool-btn')).some(btn => btn.textContent.trim() === 'Import'),
                    roundTripInput: !!document.getElementById('solverAuditInput'),
                    etabsQaBadge: document.querySelectorAll('.header-actions .export-validation-badge').length,
                    stairBeamHidden: !!stairBeamBtn && (stairBeamBtn.hidden || stairBeamBtn.getAttribute('aria-hidden') === 'true'),
                    aiAssistantHidden: !!aiAssistantTab && (aiAssistantTab.hidden || aiAssistantTab.style.display === 'none' || aiAssistantTab.getAttribute('aria-hidden') === 'true'),
                    publicAiDisabled: typeof PUBLIC_AI_ASSISTANT_ENABLED !== 'undefined' && PUBLIC_AI_ASSISTANT_ENABLED === false,
                    scheduleRedirectTab: currentPlanTab,
                    legacyScheduleModalDisplay: scheduleModal?.style.display || '',
                    legacyScheduleModalDisabled: scheduleModal?.dataset?.legacyDisabled === 'true'
                };
                const roundTripModel = collectCSIExportModelData();
                const canonicalAnalyticalFixture = FSSolverRoundTrip.compareCanonicalAnalyticalFixture(
                    roundTripModel,
                    ${serializedCanonicalAnalyticalFixture}
                );
                audit.canonicalAnalyticalFixture = canonicalAnalyticalFixture;
                const roundTripFingerprint = () => JSON.stringify({
                    floorIndex: state.currentFloorIndex,
                    floors: state.floors.map(floor => ({
                        id: floor.id,
                        voidSlabs: floor.voidSlabs,
                        deletedBeams: floor.deletedBeams,
                        lockedBeams: floor.lockedBeams
                    })),
                    columns: state.columns.map(column => ({
                        id: column.id,
                        x: column.x,
                        y: column.y,
                        active: column.active,
                        segmentOverrides: column.segmentOverrides
                    })),
                    beams: state.beams.map(beam => ({ id: beam.id, deleted: beam.deleted })),
                    slabs: state.slabs.map(slab => ({ id: slab.id, isVoid: slab.isVoid, active: slab.active }))
                });
                const roundTripBefore = roundTripFingerprint();
                const roundTripRecord = importETABSAuditData({
                    roundTripContract: 'FutolStructure.SolverRoundTrip.v1',
                    stories: roundTripModel.counts.stories,
                    columns: roundTripModel.counts.columns,
                    beams: roundTripModel.counts.beams,
                    slabs: roundTripModel.counts.slabs,
                    frameObjectsInETABS: roundTripModel.counts.columns + roundTripModel.counts.beams,
                    areaObjectsInETABS: roundTripModel.counts.slabs,
                    levels: roundTripModel.levels,
                    verticalDatums: roundTripModel.verticalDatums,
                    provenance: roundTripModel.provenance,
                    foundation: roundTripModel.foundationHandoff,
                    analysisReturn: 0,
                    modalModes: []
                }, 'qa-ui-etabs-audit.json');
                audit.roundTripProbeStatus = roundTripRecord.comparison.status;
                audit.roundTripProbeNoAutoApply = roundTripBefore === roundTripFingerprint();
                closeSolverRoundTrip();
                setPlanTab(previousTab);
                return audit;
            })();

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
                    const terminationMember = id => state.beams.find(item => item.id === id);
                    const terminationGeometry = id => {
                        const member = terminationMember(id);
                        return member ? getBeamPlanDrawGeometry(member, state.floors[state.currentFloorIndex]?.id) : null;
                    };
                    const startTermination = terminationMember(beam.terminationStartBeamId);
                    const endTermination = terminationMember(beam.terminationEndBeamId);
                    const startTerminationGeometry = terminationGeometry(beam.terminationStartBeamId);
                    const endTerminationGeometry = terminationGeometry(beam.terminationEndBeamId);
                    const startFaceY = startTerminationGeometry && startTermination
                        ? startTerminationGeometry.cy + getBeamSizeMm(startTermination, state.floors[state.currentFloorIndex]?.id).b / 2000
                        : null;
                    const endFaceY = endTerminationGeometry && endTermination
                        ? endTerminationGeometry.cy - getBeamSizeMm(endTermination, state.floors[state.currentFloorIndex]?.id).b / 2000
                        : null;
                    return {
                        id: beam.id,
                        label: getBeamScheduleId(beam, state.floors[state.currentFloorIndex]?.id, 0),
                        span: beam.span,
                        isEdgeBeam: beam.isEdgeBeam,
                        faceTerminated: beam.faceTerminated === true,
                        terminationStartBeamId: beam.terminationStartBeamId || '',
                        terminationEndBeamId: beam.terminationEndBeamId || '',
                        startY: beam.y1,
                        endY: beam.y2,
                        startFaceY,
                        endFaceY,
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

            partialCantilever.edgeSizing = (() => {
                const edgeBeamId = 'BEY-R-1-L';
                const originalFloorIndex = state.currentFloorIndex;
                const originalFloorState = state.floors.map(floor => cloneSerializable(floor, {}));
                const originalCantilevers = cloneSerializable(state.cantilevers, null);
                const originalOverrides = cloneSerializable(state.beamSizeOverrides, {});
                const originalGlobalWidth = state.defaultEdgeBeamB;
                const originalGlobalDepth = state.defaultEdgeBeamH;
                const originalUndoHistory = undoHistory.slice();
                const originalRedoHistory = redoHistory.slice();
                const sourceFloor = state.floors.find(floor => floor.id === '2F') || state.floors[0];
                const targetFloor = state.floors.find(floor => floor.id === 'RF') || state.floors[1];
                const dispatchEdgeInput = (inputId, value) => {
                    const input = document.getElementById(inputId);
                    input.value = String(value);
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                };
                const readFloorEdgeSize = (floorGeometry, floor) => {
                    const edgeBeam = floorGeometry.get(floor.id)?.beams?.find(beam => beam.id === edgeBeamId);
                    const size = edgeBeam ? getBeamSizeMm(edgeBeam, floor.id) : null;
                    return { widthMm: size?.b || 0, depthMm: size?.h || 0 };
                };

                try {
                    if (!sourceFloor || !targetFloor) {
                        return { controlsPresent: false, fixtureReady: false };
                    }

                    // Give both floors the same edge-beam location, then exercise
                    // the actual dashboard change events instead of injecting state.
                    state.floors.forEach(floor => {
                        floor.typicalFromLower = false;
                        floor.typicalSourceFloorId = '';
                        const cantilevers = normalizeCantileverSet(
                            floor.cantilevers || state.cantilevers,
                            state.xSpans.length,
                            state.ySpans.length
                        );
                        cantilevers.right[0] = normalizeCantileverSpec({
                            projection: 1.2,
                            run: 1.2,
                            offset: 0,
                            eb: true
                        });
                        floor.cantilevers = cantilevers;
                        delete state.beamSizeOverrides[getBeamSizeKey(edgeBeamId, floor.id)];
                    });
                    sourceFloor.defaultEdgeBeamB = 150;
                    sourceFloor.defaultEdgeBeamH = 300;
                    targetFloor.defaultEdgeBeamB = 330;
                    targetFloor.defaultEdgeBeamH = 620;
                    state.currentFloorIndex = state.floors.indexOf(sourceFloor);
                    state.cantilevers = cloneSerializable(sourceFloor.cantilevers, null);
                    renderFloorTabs();
                    calculate();

                    dispatchEdgeInput('edgeBeamWidthInput', 225);
                    dispatchEdgeInput('edgeBeamDepthInput', 475);
                    const independentGeometry = collect3DFloorGeometry();
                    const independentProject = buildProjectData({ revisionId: 'fs119-edge-floor-scope' });
                    const independentSource = readFloorEdgeSize(independentGeometry, sourceFloor);
                    const independentTarget = readFloorEdgeSize(independentGeometry, targetFloor);
                    const savedSource = independentProject.floors.find(floor => floor.id === sourceFloor.id);
                    const savedTarget = independentProject.floors.find(floor => floor.id === targetFloor.id);

                    state.currentFloorIndex = state.floors.indexOf(targetFloor);
                    renderFloorTabs();
                    toggleTypicalFromLower(true);
                    const inheritedGeometry = collect3DFloorGeometry();
                    const inheritedTarget = readFloorEdgeSize(inheritedGeometry, targetFloor);
                    const inheritedControlsDisabled = document.getElementById('edgeBeamWidthInput').disabled &&
                        document.getElementById('edgeBeamDepthInput').disabled;

                    toggleTypicalFromLower(false);
                    const detachedControlsEnabled = !document.getElementById('edgeBeamWidthInput').disabled &&
                        !document.getElementById('edgeBeamDepthInput').disabled;
                    state.currentFloorIndex = state.floors.indexOf(sourceFloor);
                    renderFloorTabs();
                    dispatchEdgeInput('edgeBeamWidthInput', 250);
                    dispatchEdgeInput('edgeBeamDepthInput', 500);
                    const detachedGeometry = collect3DFloorGeometry();
                    const detachedSource = readFloorEdgeSize(detachedGeometry, sourceFloor);
                    const detachedTarget = readFloorEdgeSize(detachedGeometry, targetFloor);

                    state.beamSizeOverrides[getBeamSizeKey(edgeBeamId, sourceFloor.id)] = {
                        webW: 210,
                        webD: 360,
                        edgeBeamSizeSource: 'manual'
                    };
                    state.beamSizeOverrides[getBeamSizeKey(edgeBeamId, targetFloor.id)] = {
                        webW: 330,
                        webD: 620,
                        edgeBeamSizeSource: 'manual'
                    };
                    const overrideGeometry = collect3DFloorGeometry();
                    const perFloor = Object.fromEntries([sourceFloor, targetFloor].map(floor => {
                        const size = readFloorEdgeSize(overrideGeometry, floor);
                        const override = state.beamSizeOverrides[getBeamSizeKey(edgeBeamId, floor.id)] || null;
                        return [floor.id, {
                            ...size,
                            savedWidthMm: override?.webW || 0,
                            savedDepthMm: override?.webD || 0,
                            source: override?.edgeBeamSizeSource || ''
                        }];
                    }));

                    return {
                        fixtureReady: true,
                        controlsPresent: !!document.getElementById('edgeBeamWidthInput') && !!document.getElementById('edgeBeamDepthInput'),
                        generatedWidthMm: independentSource.widthMm,
                        generatedDepthMm: independentSource.depthMm,
                        savedWidthMm: savedSource?.defaultEdgeBeamB || 0,
                        savedDepthMm: savedSource?.defaultEdgeBeamH || 0,
                        independent: {
                            source: independentSource,
                            target: independentTarget,
                            savedSource: { widthMm: savedSource?.defaultEdgeBeamB || 0, depthMm: savedSource?.defaultEdgeBeamH || 0 },
                            savedTarget: { widthMm: savedTarget?.defaultEdgeBeamB || 0, depthMm: savedTarget?.defaultEdgeBeamH || 0 }
                        },
                        inherited: {
                            target: inheritedTarget,
                            controlsDisabled: inheritedControlsDisabled
                        },
                        detached: {
                            source: detachedSource,
                            target: detachedTarget,
                            controlsEnabled: detachedControlsEnabled,
                            targetDefaults: getFloorEdgeBeamDefaults(targetFloor.id)
                        },
                        perFloor
                    };
                } finally {
                    state.floors.forEach((floor, index) => {
                        Object.keys(floor).forEach(key => delete floor[key]);
                        Object.assign(floor, cloneSerializable(originalFloorState[index], {}));
                    });
                    state.cantilevers = originalCantilevers;
                    state.beamSizeOverrides = originalOverrides;
                    state.defaultEdgeBeamB = originalGlobalWidth;
                    state.defaultEdgeBeamH = originalGlobalDepth;
                    state.currentFloorIndex = originalFloorIndex;
                    undoHistory.splice(0, undoHistory.length, ...originalUndoHistory);
                    redoHistory.splice(0, redoHistory.length, ...originalRedoHistory);
                    renderFloorTabs();
                    calculate();
                }
            })();
            applyRightPatchSpec({ projection: 1.2, run: 1.2, offset: 0, eb: false });

            selectedMemberType = 'slab';
            selectedMemberId = 'SC-T4';
            toggleSelectedCornerSlab();
            const createdCornerSlab = state.slabs.find(slab => slab.isCornerSlab);
            const createdCornerSupportBeams = createdCornerSlab
                ? getCornerSlabSupportBeams(createdCornerSlab, currentFloor.id)
                : [];
            const createdCornerHiddenBeamIds = Array.from(getCornerSlabHiddenBeamIds(currentFloor.id));
            const cornerAudit = collectActiveSlabTruthAudit(currentFloor.id);
            const cornerProjectData = buildProjectData();
            const cornerSlabBeforeReload = {
                joinCount: currentFloor.cornerSlabs?.length || 0,
                id: createdCornerSlab?.id || '',
                sourceSlabIds: createdCornerSlab?.sourceSlabIds || [],
                area: createdCornerSlab?.area || 0,
                supportBeamIds: createdCornerSupportBeams.map(beam => beam.id).sort(),
                hiddenBeamIds: createdCornerHiddenBeamIds.sort(),
                renderedHiddenBeamIds: (window.lastPlanLabelDiagnostics?.cornerHiddenBeamIds || []).slice().sort(),
                assignedArea: createdCornerSupportBeams.reduce((sum, beam) => sum + beam.slices
                    .filter(slice => slice.slabId === createdCornerSlab?.id)
                    .reduce((beamSum, slice) => beamSum + (Number(slice.area) || 0), 0), 0),
                areaDelta: cornerAudit.areaDelta,
                savedJoinCount: cornerProjectData.floors.find(floor => floor.id === currentFloor.id)?.cornerSlabs?.length || 0
            };
            applyLoadedProject(cornerProjectData, 'corner-slab-smoke.fstr', { silent: true, skipAutosave: true });
            const reloadedFloor = state.floors[state.currentFloorIndex];
            const reloadedCornerSlab = state.slabs.find(slab => slab.isCornerSlab);
            const cornerSlabAfterReload = {
                joinCount: reloadedFloor.cornerSlabs?.length || 0,
                id: reloadedCornerSlab?.id || '',
                sourceSlabIds: reloadedCornerSlab?.sourceSlabIds || [],
                hiddenBeamIds: Array.from(getCornerSlabHiddenBeamIds(reloadedFloor.id)).sort(),
                areaDelta: collectActiveSlabTruthAudit(reloadedFloor.id).areaDelta
            };
            selectedMemberType = 'slab';
            selectedMemberId = reloadedCornerSlab?.id || '';
            toggleSelectedCornerSlab();
            const cornerSlabAfterRemove = {
                joinCount: state.floors[state.currentFloorIndex].cornerSlabs?.length || 0,
                generatedCount: state.slabs.filter(slab => slab.isCornerSlab).length
            };
            const multiEndFloor = state.floors[state.currentFloorIndex];
            const originalMultiEndSlabs = state.slabs;
            const originalMultiEndJoins = normalizeCornerSlabList(multiEndFloor.cornerSlabs);
            state.slabs = [
                { id: 'SC-QA-H', x1: 0, y1: -1, x2: 4, y2: 0, isCantilever: true, cantileverEdge: 'top', area: 4 },
                { id: 'SC-QA-L', x1: -1, y1: 0, x2: 0, y2: 3, isCantilever: true, cantileverEdge: 'left', area: 3 },
                { id: 'SC-QA-R', x1: 4, y1: 0, x2: 5, y2: 3, isCantilever: true, cantileverEdge: 'right', area: 3 }
            ];
            multiEndFloor.cornerSlabs = normalizeCornerSlabList([
                { sourceSlabIds: ['SC-QA-H', 'SC-QA-L'] }
            ]);
            const multiEndHorizontal = state.slabs.find(slab => slab.id === 'SC-QA-H');
            const multiEndLeftAction = getCantileverCornerAction(multiEndHorizontal, multiEndFloor.id, { x: 0, y: -0.5 });
            const multiEndRightAction = getCantileverCornerAction(multiEndHorizontal, multiEndFloor.id, { x: 4, y: -0.5 });
            const multiEndCornerAction = {
                leftMode: multiEndLeftAction?.mode || '',
                leftPair: multiEndLeftAction?.join?.sourceSlabIds || [],
                rightMode: multiEndRightAction?.mode || '',
                rightCandidateId: multiEndRightAction?.candidate?.other?.id || ''
            };
            state.slabs = originalMultiEndSlabs;
            multiEndFloor.cornerSlabs = originalMultiEndJoins;
            calculate();

            toggleColumn('A1');
            const afterColumnToggle = {
                visibleColumns: state.columns.filter(c => isColumnActiveOnFloor(c, state.floors[state.currentFloorIndex].id)).length,
                undoCount: undoHistory.length,
                columnPositionLocked: !!state.columnPositionLocked,
                lockedBeamCount: state.floors[state.currentFloorIndex]?.lockedBeams?.length || 0,
                a1: (() => {
                    const col = state.columns.find(item => item.id === 'A1');
                    return col ? { active: col.active, activePerFloor: col.activePerFloor } : null;
                })()
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
            const originColumn = state.columns.find(column => column.id === 'A1');
            const initialMeasureColumnPosition = getColumnPlanPosition(originColumn);
            const snappedMeasurePoint = resolveMeasurePoint({ x: 0.04, y: 0.03 });
            const snappedMeasureKind = state.measureSnapPoint?.kind || '';
            state.measureSnapEnabled = false;
            state.measureStart = { x: 0, y: 0 };
            state.measureOrtho = true;
            const orthoMeasurePoint = resolveMeasurePoint({ x: 3, y: 4 });

            const measureStateSnapshot = createStateSnapshot();
            const measureViewState = {
                scale: state.scale,
                offsetX: state.offsetX,
                offsetY: state.offsetY,
                tab: currentPlanTab
            };
            const measureColumn = state.columns.find(column =>
                isColumnActiveOnFloor(column, state.floors[state.currentFloorIndex]?.id)
            );
            const measureBeam = state.beams.find(beam =>
                !beam.isCantilever && !beam.isEdgeBeam && beam.startCol && beam.endCol
            );
            const existingColumnOffset = cloneSerializable(
                state.columnPositionOverrides?.[measureColumn?.id],
                { dx: 0, dy: 0 }
            );
            const expectedColumnOffset = {
                dx: Number(existingColumnOffset.dx || 0) + 0.18,
                dy: Number(existingColumnOffset.dy || 0) + 0.12
            };
            if (measureColumn) {
                state.columnPositionOverrides[measureColumn.id] = expectedColumnOffset;
            }
            const activeMeasureFloorId = state.floors[state.currentFloorIndex]?.id;
            if (measureBeam) {
                state.beamAlignmentOverrides[getBeamAlignmentKey(measureBeam.id, activeMeasureFloorId)] = 0.17;
            }
            state.scale = 82;
            state.offsetX = 117;
            state.offsetY = 83;
            state.measureSnapEnabled = true;
            state.measureOrtho = false;
            state.measureStart = null;

            setPlanTab('structural');
            const movedColumnPosition = measureColumn ? getColumnPlanPosition(measureColumn) : { x: 0, y: 0 };
            const layoutMovedColumnSnap = resolveMeasurePoint({
                x: movedColumnPosition.x + 0.025,
                y: movedColumnPosition.y + 0.02
            });
            const layoutMovedColumnSnapKind = state.measureSnapPoint?.kind || '';
            const measureColumnSize = measureColumn ? getColumnSizeMm(measureColumn) : { b: 300, h: 300 };
            const expectedColumnFaceX = movedColumnPosition.x + measureColumnSize.b / 2000;
            const layoutColumnFaceSnap = resolveMeasurePoint({
                x: expectedColumnFaceX + 0.015,
                y: movedColumnPosition.y + 0.07
            });
            const layoutColumnFaceSnapKind = state.measureSnapPoint?.kind || '';

            setPlanTab('analysis');
            const movedBeamGeometry = measureBeam
                ? getBeamPlanDrawGeometry(measureBeam, activeMeasureFloorId, { trimToColumnFaces: true })
                : null;
            const tributaryBeamRawPoint = movedBeamGeometry
                ? {
                    x: (movedBeamGeometry.x1 + movedBeamGeometry.x2) / 2 + (measureBeam.direction === 'Y' ? 0.02 : 0),
                    y: (movedBeamGeometry.y1 + movedBeamGeometry.y2) / 2 + (measureBeam.direction === 'X' ? 0.02 : 0)
                }
                : { x: 1, y: 1 };
            const tributaryMovedBeamSnap = resolveMeasurePoint(tributaryBeamRawPoint);
            const tributaryMovedBeamSnapKind = state.measureSnapPoint?.kind || '';
            const expectedBeamAxis = (() => {
                if (!movedBeamGeometry) return { x: 1, y: 1 };
                const dx = movedBeamGeometry.x2 - movedBeamGeometry.x1;
                const dy = movedBeamGeometry.y2 - movedBeamGeometry.y1;
                const len2 = dx * dx + dy * dy;
                const t = len2 > 0
                    ? Math.max(0, Math.min(1, (
                        (tributaryBeamRawPoint.x - movedBeamGeometry.x1) * dx +
                        (tributaryBeamRawPoint.y - movedBeamGeometry.y1) * dy
                    ) / len2))
                    : 0;
                return {
                    x: movedBeamGeometry.x1 + dx * t,
                    y: movedBeamGeometry.y1 + dy * t
                };
            })();

            const columnPositionBeforeMeasureClicks = measureColumn
                ? getColumnPlanPosition(measureColumn)
                : null;
            state.floors[state.currentFloorIndex].planDimensions = [];
            toggleMeasureMode(true);
            handleMeasureClick(dimensionEvent(movedColumnPosition.x + 0.02, movedColumnPosition.y + 0.02));
            handleMeasureClick(dimensionEvent(expectedBeamAxis.x, expectedBeamAxis.y));
            const columnPositionAfterMeasureClicks = measureColumn
                ? getColumnPlanPosition(measureColumn)
                : null;
            const measuredAfterZoomPan = getCurrentFloorPlanDimensions().length;
            toggleMeasureMode(false);

            const measureReloadProject = buildProjectData();
            applyLoadedProject(measureReloadProject, 'qa-measure-roundtrip.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            setPlanTab('structural');
            state.measureSnapEnabled = true;
            state.measureOrtho = false;
            state.measureStart = null;
            const reloadedMeasureColumn = state.columns.find(column => column.id === measureColumn?.id);
            const reloadedColumnPosition = reloadedMeasureColumn
                ? getColumnPlanPosition(reloadedMeasureColumn)
                : { x: 0, y: 0 };
            const reloadColumnSnap = resolveMeasurePoint({
                x: reloadedColumnPosition.x + 0.02,
                y: reloadedColumnPosition.y + 0.02
            });
            const reloadColumnSnapKind = state.measureSnapPoint?.kind || '';

            const afterMeasureSnapOrtho = {
                initialMeasureColumnPosition,
                snappedMeasurePoint,
                snappedMeasureKind,
                orthoMeasurePoint,
                orthoLengthM: Math.hypot(orthoMeasurePoint.x, orthoMeasurePoint.y),
                layoutMovedColumnSnap,
                layoutMovedColumnSnapKind,
                movedColumnPosition,
                layoutColumnFaceSnap,
                layoutColumnFaceSnapKind,
                expectedColumnFaceX,
                tributaryMovedBeamSnap,
                tributaryMovedBeamSnapKind,
                expectedBeamAxis,
                columnPositionBeforeMeasureClicks,
                columnPositionAfterMeasureClicks,
                measuredAfterZoomPan,
                reloadColumnSnap,
                reloadColumnSnapKind,
                reloadedColumnPosition,
                persistedDimensionCount: measureReloadProject.floors[state.currentFloorIndex]?.planDimensions?.length || 0,
                expectedColumnOffset,
                persistedColumnOffset: measureReloadProject.columnPositionOverrides?.[measureColumn?.id] || null,
                persistedBeamOffset: measureReloadProject.beamAlignmentOverrides?.[
                    getBeamAlignmentKey(measureBeam?.id, activeMeasureFloorId)
                ]
            };

            restoreStateSnapshot(measureStateSnapshot);
            state.scale = measureViewState.scale;
            state.offsetX = measureViewState.offsetX;
            state.offsetY = measureViewState.offsetY;
            state.measureOrtho = false;
            state.measureSnapEnabled = true;
            state.measureStart = null;
            state.measureSnapPoint = null;
            setPlanTab(measureViewState.tab);
            calculate();
            state.measureOrtho = false;
            state.measureSnapEnabled = true;
            state.measureStart = null;
            state.measureSnapPoint = null;
            toggleMeasureMode(false);

            const memberSizeStateSnapshot = createStateSnapshot();
            const memberSizeAudit = (() => {
                const floorId = state.floors[0]?.id || '';
                state.currentFloorIndex = 0;
                state.memberSizePolicy = normalizeMemberSizePolicy({
                    action: 'warn',
                    columnMinB: 200,
                    columnMinH: 200,
                    beamMinB: 200,
                    beamMinH: 300,
                    cantileverEdgeMinB: 150
                });

                const activeColumns = (state.columns || []).filter(column => isColumnActiveOnFloor(column, floorId));
                const rectangularColumnId = activeColumns[0]?.id || '';
                const squareColumnId = activeColumns[1]?.id || '';
                const rectangularColumn = state.columns.find(column => column.id === rectangularColumnId);
                const squareColumn = state.columns.find(column => column.id === squareColumnId);
                if (!rectangularColumn || !squareColumn) {
                    return { setupError: 'Member-size fixture requires two active columns.' };
                }

                rectangularColumn.memberStatus = 'existing_for_assessment';
                rectangularColumn.orientationDeg = 90;
                applyColumnSizeMm(rectangularColumn, 150, 400);
                squareColumn.memberStatus = 'existing';
                squareColumn.orientationDeg = 0;
                applyColumnSizeMm(squareColumn, 150, 150);

                const initialGeometry = collect3DFloorGeometry().get(floorId) || { beams: [] };
                const targetBeam = (initialGeometry.beams || []).find(beam =>
                    beam && !beam.deleted && !beam.isCustom &&
                    getBeamGovernanceType(beam) === 'regular'
                );
                const beamId = targetBeam?.id || '';
                if (!beamId) return { setupError: 'Member-size fixture requires one regular beam.' };
                const beamKey = getBeamSizeKey(beamId, floorId);
                state.beamSizeOverrides[beamKey] = {
                    ...(state.beamSizeOverrides[beamKey] || {}),
                    webW: 150,
                    webD: 175,
                    memberStatus: 'proposed_new'
                };
                calculate();
                setPlanTab('structural');
                draw();

                const currentRectangularColumn = state.columns.find(column => column.id === rectangularColumnId);
                const currentSquareColumn = state.columns.find(column => column.id === squareColumnId);
                const currentBeam = (collect3DFloorGeometry().get(floorId)?.beams || [])
                    .find(beam => beam.id === beamId);
                const rectangularFootprint = getColumnPlanFootprint(currentRectangularColumn);
                const footprintEdgeLengths = rectangularFootprint.corners.map((point, index) => {
                    const next = rectangularFootprint.corners[(index + 1) % rectangularFootprint.corners.length];
                    return Number(Math.hypot(next.x - point.x, next.y - point.y).toFixed(6));
                });
                state.measureSnapEnabled = true;
                state.measureOrtho = false;
                state.measureStart = null;
                // Resolve the face at a drafting zoom where it is distinct from the centroid.
                const faceSnapScale = state.scale;
                state.scale = 100;
                const rotatedFaceSnap = resolveMeasurePoint({
                    x: rectangularFootprint.right + 0.005,
                    y: rectangularFootprint.center.y
                });
                const rotatedFaceSnapKind = state.measureSnapPoint?.kind || '';
                state.scale = faceSnapScale;

                populateColumnSchedule();
                populateBeamSchedule();
                const columnScheduleRow = Array.from(document.querySelectorAll('#colScheduleBody tr'))
                    .find(row => row.children[1]?.textContent.trim() === 'C-' + rectangularColumnId);
                const columnScheduleInputs = Array.from(columnScheduleRow?.querySelectorAll('input') || [])
                    .map(input => Number(input.value));
                const columnScheduleStatus = columnScheduleRow?.querySelector('select')?.value || '';
                const beamScheduleRow = Array.from(document.querySelectorAll('#beamScheduleBody tr'))
                    .find(row => row.innerHTML.includes("updateBeamParam('" + beamId + "'"));
                const beamScheduleInputs = Array.from(beamScheduleRow?.querySelectorAll('input') || [])
                    .map(input => Number(input.value));
                const beamScheduleStatus = beamScheduleRow?.querySelector('select')?.value || '';

                if (!view3DInitialized && typeof init3D === 'function') init3D();
                render3DFrame();
                const rectangularColumnMesh = meshes3D.find(mesh =>
                    mesh?.userData?.type === 'column' &&
                    mesh.userData.id === rectangularColumnId &&
                    mesh.userData.floorId === floorId
                );
                const squareColumnMesh = meshes3D.find(mesh =>
                    mesh?.userData?.type === 'column' &&
                    mesh.userData.id === squareColumnId &&
                    mesh.userData.floorId === floorId
                );
                const beamMesh = meshes3D.find(mesh =>
                    mesh?.userData?.type === 'beam' &&
                    mesh.userData.id === beamId &&
                    mesh.userData.floorId === floorId
                );
                const getMeshSection = (mesh, direction = '') => {
                    const parameters = mesh?.geometry?.parameters || {};
                    return {
                        b: direction === 'Y'
                            ? Number(parameters.width || 0)
                            : Number(parameters.depth || 0),
                        h: Number(parameters.height || 0),
                        rotationY: Number(mesh?.rotation?.y || 0)
                    };
                };
                const threeD = {
                    rectangularColumn: {
                        b: Number(rectangularColumnMesh?.geometry?.parameters?.width || 0),
                        h: Number(rectangularColumnMesh?.geometry?.parameters?.depth || 0),
                        rotationY: Number(rectangularColumnMesh?.rotation?.y || 0)
                    },
                    squareColumn: {
                        b: Number(squareColumnMesh?.geometry?.parameters?.width || 0),
                        h: Number(squareColumnMesh?.geometry?.parameters?.depth || 0)
                    },
                    beam: getMeshSection(beamMesh, currentBeam?.direction)
                };

                const project = buildProjectData({ revisionId: 'fs121-member-size-roundtrip' });
                const savedRectangularColumn = project.columnOverrides
                    .find(column => column.id === rectangularColumnId);
                const savedSquareColumn = project.columnOverrides
                    .find(column => column.id === squareColumnId);
                const savedBeamOverride = project.beamSizeOverrides?.[beamKey] || null;
                applyLoadedProject(project, 'qa-fs121-member-sizes.fstr', {
                    silent: true,
                    skipAutosave: true,
                    quarantineHiddenGeometry: true
                });
                state.currentFloorIndex = Math.max(0, state.floors.findIndex(floor => floor.id === floorId));
                calculate();

                const loadedRectangularColumn = state.columns.find(column => column.id === rectangularColumnId);
                const loadedSquareColumn = state.columns.find(column => column.id === squareColumnId);
                const loadedBeam = (collect3DFloorGeometry().get(floorId)?.beams || [])
                    .find(beam => beam.id === beamId);
                const loadedSizes = {
                    rectangularColumn: {
                        ...getColumnSizeMm(loadedRectangularColumn),
                        memberStatus: loadedRectangularColumn?.memberStatus,
                        orientationDeg: getColumnOrientationDeg(loadedRectangularColumn)
                    },
                    squareColumn: {
                        ...getColumnSizeMm(loadedSquareColumn),
                        memberStatus: loadedSquareColumn?.memberStatus
                    },
                    beam: {
                        ...getBeamSizeMm(loadedBeam, floorId),
                        memberStatus: getBeamMemberStatus(loadedBeam, floorId)
                    }
                };

                const warningGovernance = collectMemberSizeGovernance();
                const model = collectCSIExportModelData();
                if (model.wallInventory?.contract !== 'FutolStructure.WallInventory.v1') throw new Error('Canonical model is missing wall inventory');
                if (model.analyticalInputs?.contract !== 'FutolStructure.AnalyticalInputs.v1') throw new Error('Canonical model is missing shared analytical inputs');
                if (!model.loadCases?.some(loadCase => loadCase.id === 'FS_DEAD' && loadCase.selfWeightMultiplier === 1)) throw new Error('Canonical model is missing governed element self-weight');
                if (model.massSource?.elementSelfMassOnce !== true || model.massSource.includeLive !== false) throw new Error('Canonical mass-source policy is incorrect');
                if (!(model.supports?.length > 0)) throw new Error('Canonical model is missing explicit base supports');
                if (model.analysisInputValidation?.solverReady !== true) throw new Error('Canonical analytical-input validation is not solver-ready');
                const modelRectangularColumn = model.columns.find(column =>
                    column.sourceId === rectangularColumnId && column.floorId === floorId
                );
                const modelSquareColumn = model.columns.find(column =>
                    column.sourceId === squareColumnId && column.floorId === floorId
                );
                const modelBeam = model.beams.find(beam =>
                    beam.sourceId === beamId && beam.floorId === floorId
                );
                const modelSections = Object.fromEntries(model.frameSections.map(section => [
                    section.name,
                    {
                        type: section.type,
                        b: section.bMm,
                        h: section.hMm,
                        etabsT2: section.etabsT2Mm,
                        etabsT3: section.etabsT3Mm,
                        axisPolicy: section.etabsSectionAxisPolicy
                    }
                ]));

                const staadContent = generateSTAADContent(model);
                const etabsContent = generateETABSOAPIScript(model);
                const encodedModelMarker = "FromBase64String('";
                const encodedModelStart = etabsContent.indexOf(encodedModelMarker);
                const encodedModelEnd = encodedModelStart >= 0
                    ? etabsContent.indexOf("')", encodedModelStart + encodedModelMarker.length)
                    : -1;
                const encodedModel = encodedModelStart >= 0 && encodedModelEnd > encodedModelStart
                    ? etabsContent.slice(encodedModelStart + encodedModelMarker.length, encodedModelEnd)
                    : '';
                const etabsModel = encodedModel
                    ? JSON.parse(new TextDecoder().decode(Uint8Array.from(
                        atob(encodedModel),
                        character => character.charCodeAt(0)
                    )))
                    : null;
                const ifcContent = generateIFCContent(model);
                const ifcWarningAudit = JSON.parse(JSON.stringify(window.lastIFCExportAudit || {}));
                const dxfContent = generateDXFContent();
                loadedRectangularColumn.totalLoadWithDL = Math.max(
                    1000000,
                    ...state.columns.map(column => Number(column.totalLoadWithDL || column.totalLoad || 0) + 1)
                );
                const tanReportHtml = buildTANReportHtml();

                let reportHtml = '';
                const originalOpen = window.open;
                window.open = () => ({
                    document: {
                        write: html => { reportHtml += String(html); },
                        close: () => {}
                    },
                    print: () => {}
                });
                try {
                    generatePDFReport();
                } finally {
                    window.open = originalOpen;
                }

                state.memberSizePolicy = normalizeMemberSizePolicy({
                    ...state.memberSizePolicy,
                    action: 'block'
                });
                const blockedGovernance = collectMemberSizeGovernance();
                const captureBlock = generator => {
                    try {
                        generator();
                        return { blocked: false, message: '' };
                    } catch (error) {
                        return { blocked: true, message: String(error?.message || error) };
                    }
                };
                const staadBlock = captureBlock(() => generateSTAADContent());
                const etabsBlock = captureBlock(() => generateETABSOAPIScript());
                const blockedIFCContent = generateIFCContent(collectCSIExportModelData());
                const ifcBlockedAudit = JSON.parse(JSON.stringify(window.lastIFCExportAudit || {}));

                return {
                    ids: { floorId, rectangularColumnId, squareColumnId, beamId, beamKey },
                    geometry: {
                        footprintWidth: Number((rectangularFootprint.right - rectangularFootprint.left).toFixed(6)),
                        footprintHeight: Number((rectangularFootprint.bottom - rectangularFootprint.top).toFixed(6)),
                        footprintEdgeLengths,
                        expectedFace: {
                            x: rectangularFootprint.right,
                            y: rectangularFootprint.center.y
                        },
                        rotatedFaceSnap,
                        rotatedFaceSnapKind
                    },
                    schedules: {
                        columnInputs: columnScheduleInputs,
                        columnStatus: columnScheduleStatus,
                        beamInputs: beamScheduleInputs,
                        beamStatus: beamScheduleStatus
                    },
                    threeD,
                    save: {
                        rectangularColumn: savedRectangularColumn,
                        squareColumn: savedSquareColumn,
                        beamOverride: savedBeamOverride,
                        policy: project.memberSizePolicy
                    },
                    loadedSizes,
                    governance: {
                        warning: warningGovernance,
                        blocked: blockedGovernance
                    },
                    sharedModel: {
                        rectangularColumn: modelRectangularColumn,
                        squareColumn: modelSquareColumn,
                        beam: modelBeam,
                        sections: modelSections
                    },
                    exports: {
                        staadHasExactSections:
                            staadContent.includes('PRIS YD 0.400 ZD 0.150') &&
                            staadContent.includes('PRIS YD 0.150 ZD 0.150') &&
                            staadContent.includes('PRIS YD 0.175 ZD 0.150'),
                        staadHasOrientation: staadContent.includes('BETA 90.000 MEMB'),
                        etabsDecoded: !!etabsModel,
                        etabsRectangularColumn: etabsModel?.columns?.find(column =>
                            column.sourceId === rectangularColumnId && column.floorId === floorId
                        ) || null,
                        etabsBeam: etabsModel?.beams?.find(beam =>
                            beam.sourceId === beamId && beam.floorId === floorId
                        ) || null,
                        etabsHasLocalAxesCommand: etabsContent.includes('FrameObj.SetLocalAxes'),
                        etabsHasCanonicalNodePolicy:
                            etabsContent.includes('Get-OrCreateAnalyticalPoint') &&
                            etabsContent.includes('FrameObj.AddByPoint') &&
                            etabsContent.includes('SetInsertionPoint_1'),
                        etabsHasReflectedOrientation:
                            etabsModel?.columns?.find(column =>
                                column.sourceId === rectangularColumnId && column.floorId === floorId
                            )?.etabsLocalAxisAngleDeg === -90,
                        etabsHasExplicitSectionAxisMapping:
                            etabsModel?.frameSections?.find(section => section.name === 'C150x400')?.etabsT2Mm === 400 &&
                            etabsModel?.frameSections?.find(section => section.name === 'C150x400')?.etabsT3Mm === 150 &&
                            etabsModel?.frameSections?.find(section => section.name === 'B150x175')?.etabsT2Mm === 150 &&
                            etabsModel?.frameSections?.find(section => section.name === 'B150x175')?.etabsT3Mm === 175 &&
                            etabsContent.includes('etabsT3Mm') &&
                            etabsContent.includes('etabsT2Mm'),
                        ifcHasExactSections:
                            ifcContent.includes('C150x400') &&
                            ifcContent.includes('C150x150') &&
                            ifcContent.includes('B150x175'),
                        ifcHasOrientation:
                            ifcContent.includes("'FS_OrientationDeg'") &&
                            ifcContent.includes("IFCLABEL('90')"),
                        ifcHasMemberStatus:
                            ifcContent.includes("'FS_MemberStatus'") &&
                            ifcContent.includes("IFCLABEL('existing_for_assessment')"),
                        ifcWarningAudit,
                        dxfHasExactSections:
                            dxfContent.includes('150x400') &&
                            dxfContent.includes('150x150') &&
                            dxfContent.includes('150x175'),
                        reportUsesArial: reportHtml.includes('font-family: Arial, sans-serif'),
                        reportHasExactSections:
                            reportHtml.includes('<td>150</td><td>400</td>') &&
                            reportHtml.includes('<td>150</td><td>150</td>') &&
                            reportHtml.includes('<td>150x175</td>'),
                        reportHasOrientation: reportHtml.includes('<td>90&deg;</td>'),
                        reportHasMemberClass:
                            reportHtml.includes('Existing For Assessment') &&
                            reportHtml.includes('Proposed New'),
                        tanReportUsesArial: tanReportHtml.includes('font-family: Arial, sans-serif'),
                        tanReportHasExactColumn: tanReportHtml.includes('150 x 400 mm')
                    },
                    blockPolicy: {
                        staad: staadBlock,
                        etabs: etabsBlock,
                        ifcHasBlockedDisclosure:
                            blockedIFCContent.includes("'FS_SizeGovernanceStatus'") &&
                            blockedIFCContent.includes("IFCLABEL('BLOCKED')"),
                        ifcAudit: ifcBlockedAudit
                    }
                };
            })();
            restoreStateSnapshot(memberSizeStateSnapshot);
            calculate();

            state.stairs = [];
            state.nextStairId = 1;
            state.floors.forEach(floor => {
                floor.slabOpenings = (floor.slabOpenings || []).filter(opening => opening.source !== 'stair');
            });
            setPlanTab('staircase');
            populateStairBuilder();
            document.getElementById('stairType').value = 'dogleg';
            document.getElementById('stairAxis').value = 'X';
            document.getElementById('stairBayX').value = '1';
            document.getElementById('stairBayY').value = '0';
            document.getElementById('stairWidth').value = '900';
            document.getElementById('stairLanding').value = '900';
            document.getElementById('stairRise').value = '175';
            document.getElementById('stairTread').value = '250';
            document.getElementById('stairWaist').value = '150';
            document.getElementById('stairGap').value = '100';
            const stairPreview = refreshStairBuilderPreview();
            createStairFromBuilder();
            const createdStair = state.stairs[0];
            const stairProject = buildProjectData();
            const destinationFloor = state.floors.find(floor => floor.id === createdStair?.toFloorId);
            const stairOpening = destinationFloor?.slabOpenings?.find(opening => opening.stairId === createdStair?.id);
            if (!view3DInitialized && typeof init3D === 'function') init3D();
            if (typeof render3DFrame === 'function') render3DFrame();
            const stairMeshes = meshes3D.filter(mesh => mesh?.userData?.type === 'stair');
            const destinationGeometry = collect3DFloorGeometry().get(createdStair?.toFloorId)?.slabs || [];
            const stairStructuralModel = createdStair?.structuralModel;
            const stairCSIModel = collectCSIExportModelData();
            const stairIFC = generateIFCContent(stairCSIModel);
            window.__fsQaStairIFC = stairIFC;
            const stairIFCAudit = cloneSerializable(window.lastIFCExportAudit, {});
            const stairDXF = generateDXFContent();
            let staadGate = { blocked: false, message: '' };
            let etabsGate = { blocked: false, message: '' };
            try {
                generateSTAADContent(stairCSIModel);
            } catch (error) {
                staadGate = { blocked: true, message: error.message };
            }
            try {
                generateETABSOAPIScript(stairCSIModel);
            } catch (error) {
                etabsGate = { blocked: true, message: error.message };
            }
            const afterStairCreate = {
                previewReady: stairPreview.ready,
                previewMessage: stairPreview.message,
                pairValue: document.getElementById('stairLevelPair')?.value || '',
                floorIds: state.floors.map(floor => floor.id),
                spans: { x: state.xSpans.slice(), y: state.ySpans.slice() },
                count: state.stairs.length,
                id: createdStair?.id,
                levels: [createdStair?.fromFloorId, createdStair?.toFloorId],
                risers: createdStair?.risers,
                opening: stairOpening ? {
                    slabId: stairOpening.id,
                    width: stairOpening.openingW,
                    height: stairOpening.openingH
                } : null,
                savedCount: stairProject.stairs?.length || 0,
                stairMeshCount: stairMeshes.length,
                structuralSchema: stairStructuralModel?.schema,
                componentCounts: stairStructuralModel?.counts,
                structuralComponentCount: stairStructuralModel?.components?.length || 0,
                intermediateLandingBeam: stairStructuralModel?.beams?.find(beam =>
                    beam.memberType === 'landing_beam' &&
                    beam.source === 'intermediate_landing_support'
                ) || null,
                elevations: stairStructuralModel?.coordinatePrimer,
                supportSummary: {
                    mapped: stairStructuralModel?.supportReactions?.filter(
                        reaction => reaction.support?.status === 'resolved'
                    ).length || 0,
                    total: stairStructuralModel?.supportReactions?.length || 0
                },
                loadHandoff: stairStructuralModel?.loadHandoff,
                integration: stairStructuralModel?.integration,
                analysisExport: createdStair?.analysisExport,
                csiCounts: stairCSIModel.counts,
                ifcAudit: stairIFCAudit,
                ifcHasStairTypes: stairIFC.includes("'stair_flight_slab'") &&
                    stairIFC.includes("'landing_slab'") &&
                    stairIFC.includes("'landing_beam'") &&
                    stairIFC.includes('IFCOPENINGELEMENT'),
                solverGates: { staad: staadGate, etabs: etabsGate },
                preview3D: cloneSerializable(window.lastStairBuilderPreviewAudit, {}),
                destinationFragmentCount: destinationGeometry.filter(slab => slab.isStairOpeningFragment).length,
                tableHasStair: document.getElementById('staircaseBody')?.textContent.includes(createdStair?.id || '') || false,
                dxfHasStair: stairDXF.includes(createdStair?.id || 'missing-stair'),
                dxfHasStructuralSchedule: stairDXF.includes('STAIR STRUCTURAL COMPONENT SCHEDULE') &&
                    stairDXF.includes((createdStair?.id || '') + '-LB-IN')
            };
            applyLoadedProject(stairProject, 'qa-stair-builder.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const afterStairReload = {
                count: state.stairs.length,
                id: state.stairs[0]?.id,
                openingCount: state.floors.reduce((sum, floor) => sum + (floor.slabOpenings || []).filter(opening => opening.source === 'stair').length, 0),
                structuralSchema: state.stairs[0]?.structuralModel?.schema,
                componentIds: state.stairs[0]?.structuralModel?.components?.map(component => component.id) || [],
                rotationDeg: state.stairs[0]?.rotationDeg,
                analysisExport: state.stairs[0]?.analysisExport,
                supportMappingCount: Object.keys(state.stairs[0]?.integration?.supportMappings || {}).length
            };
            removeStair(state.stairs[0]?.id);
            const afterStairRemove = {
                count: state.stairs.length,
                openingCount: state.floors.reduce((sum, floor) => sum + (floor.slabOpenings || []).filter(opening => opening.source === 'stair').length, 0)
            };

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

            const autosaveBaselineProject = buildProjectData();
            autosaveBaselineProject.floors = autosaveBaselineProject.floors.map(floor => ({
                ...floor,
                voidSlabs: [],
                deletedBeams: [],
                deletedColumns: [],
                lockedSlabs: [],
                lockedBeams: []
            }));
            applyLoadedProject(autosaveBaselineProject, 'qa-autosave-baseline.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const autosaveHiddenProject = cloneSerializable(autosaveBaselineProject, {});
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
            const incompatibleAutosaveRestored = restoreAutosavedProjectOnStartup();
            calculate();
            const autosaveHidden = {
                restored: incompatibleAutosaveRestored,
                warningReason: startupAutosaveWarning?.reason || '',
                quarantineBackup: !!localStorage.getItem(PROJECT_AUTOSAVE_QUARANTINE_KEY),
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
            localStorage.removeItem(PROJECT_AUTOSAVE_QUARANTINE_KEY);
            startupAutosaveWarning = null;

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

            const invalidStructuralAutosaveProject = buildProjectData();
            invalidStructuralAutosaveProject.autosaveMeta = {
                reason: 'qa-invalid-structural-autosave',
                savedAt: new Date().toISOString(),
                sourceName: 'qa-invalid-structural-autosave',
                stateRevision: FSTR_AUTOSAVE_STATE_REVISION
            };
            const invalidFloorId = invalidStructuralAutosaveProject.floors[1]?.id || invalidStructuralAutosaveProject.floors[0]?.id;
            invalidStructuralAutosaveProject.columnOverrides = invalidStructuralAutosaveProject.columnOverrides.map(column => ({
                ...column,
                active: false,
                activePerFloor: {
                    ...(column.activePerFloor || {}),
                    [invalidFloorId]: false
                }
            }));
            localStorage.setItem(PROJECT_AUTOSAVE_KEY, JSON.stringify(invalidStructuralAutosaveProject));
            const invalidStructuralAutosaveRestored = restoreAutosavedProjectOnStartup();
            const invalidStructuralAutosave = {
                restored: invalidStructuralAutosaveRestored,
                warningReason: startupAutosaveWarning?.reason || '',
                quarantineBackup: !!localStorage.getItem(PROJECT_AUTOSAVE_QUARANTINE_KEY),
                invalidFloorId,
                fallbackActiveColumns: state.columns.filter(column =>
                    isColumnActiveOnFloor(column, invalidFloorId)).length,
                fallbackFloorIds: state.floors.map(floor => floor.id)
            };
            localStorage.removeItem(PROJECT_AUTOSAVE_KEY);
            localStorage.removeItem(PROJECT_AUTOSAVE_QUARANTINE_KEY);
            startupAutosaveWarning = null;

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
                right: [{ projection: 1.2, run: 1.2, offset: 0, eb: false }, 0]
            }, state.xSpans.length, state.ySpans.length);
            state.floors[0].slabThickness = 100;
            state.floors[0].voidSlabs = ['S1'];
            state.floors[0].cornerSlabs = normalizeCornerSlabList([
                { sourceSlabIds: ['SC-T1', 'SC-R1'] }
            ]);
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
                cornerSlabCount: state.floors[1].cornerSlabs.length,
                dimensions: state.floors[1].planDimensions.length,
                beamOverride: readInheritedBeamOverrides('RF'),
                savedFlag: !!rfSavedTypical.typicalFromLower,
                savedCantTop0: rfSavedTypical.cantilevers?.top?.[0]?.projection,
                savedCornerSlabCount: rfSavedTypical.cornerSlabs?.length || 0,
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
                cornerSlabCount: state.floors[1].cornerSlabs.length,
                beamOverride: readInheritedBeamOverrides('RF'),
                roofLoads: {
                    dlSuper: state.floors[1].dlSuper,
                    liveLoad: state.floors[1].liveLoad,
                    slabThickness: state.floors[1].slabThickness,
                    wallLoad: state.floors[1].wallLoad
                }
            };

            state.currentFloorIndex = state.floors.findIndex(floor => floor.id === 'RF');
            const originalConfirm = window.confirm;
            let removeFloorPrompt = '';
            window.confirm = message => {
                removeFloorPrompt = String(message || '');
                return false;
            };
            const floorCountBeforeCancelledRemove = state.floors.length;
            const cancelledRemoveResult = removeFloor();
            window.confirm = originalConfirm;
            const floorRemovalGuard = {
                before: floorCountBeforeCancelledRemove,
                after: state.floors.length,
                result: cancelledRemoveResult,
                prompt: removeFloorPrompt
            };
            removeFloor({ confirm: false });
            let floorOverwritePrompt = '';
            window.confirm = message => {
                floorOverwritePrompt = String(message || '');
                return false;
            };
            const floorOverwriteAllowed = confirmFloorCountReductionBeforeSave(false);
            window.confirm = originalConfirm;
            const floorOverwriteGuard = {
                allowed: floorOverwriteAllowed,
                baseline: currentProjectBaselineFloorCount,
                current: state.floors.length,
                prompt: floorOverwritePrompt
            };
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
                const normalizedDxf = dxf.replace(/\\r\\n/g, '\\n');
                const packageAudit = JSON.parse(JSON.stringify(window.lastDXFExportAudit || {}));
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
                const floorIds = (state.floors || []).map(floor => floor.id);
                const missingPlanTitles = floorIds.flatMap(floorId => [
                    floorId + ' - STRUCTURAL LAYOUT PLAN',
                    floorId + ' - TRIBUTARY PLAN'
                ]).filter(title => !normalizedDxf.includes('\\n1\\n' + title + '\\n'));
                const requiredTableTitles = [
                    'DRAWING PACKAGE INDEX',
                    'MODEL SUMMARY',
                    'FLOOR LOAD SUMMARY',
                    'COLUMN SCHEDULE',
                    'BEAM SCHEDULE - PLAN TAGS',
                    'SLAB SCHEDULE - PLAN TAGS',
                    'BILL OF QUANTITIES - CONCRETE (PRELIMINARY)',
                    'BILL OF QUANTITIES - REBAR ALLOWANCE'
                ];
                const layerChunk = (name) => {
                    const marker = '0\\nLAYER\\n2\\n' + name + '\\n';
                    const start = normalizedDxf.indexOf(marker);
                    return start >= 0 ? normalizedDxf.slice(start, start + 180) : '';
                };

                return {
                    missingRequiredLayers: requiredLayers.filter(name => !normalizedDxf.includes('\\n2\\n' + name + '\\n')),
                    missingEntityLayers: exportedEntityLayers.filter(name => !normalizedDxf.includes('\\n8\\n' + name + '\\n')),
                    legacyLayerHits: legacyLayers.filter(name => normalizedDxf.includes('\\n2\\n' + name + '\\n') || normalizedDxf.includes('\\n8\\n' + name + '\\n')),
                    hasR12Version: normalizedDxf.includes('9\\n$ACADVER\\n1\\nAC1009\\n'),
                    hasLayerZero: normalizedDxf.includes('0\\nLAYER\\n2\\n0\\n'),
                    hasByLayerByBlock: normalizedDxf.includes('\\n2\\nBYLAYER\\n') && normalizedDxf.includes('\\n2\\nBYBLOCK\\n'),
                    hasCenter2Linetype: normalizedDxf.includes('\\n2\\nCENTER2\\n') && normalizedDxf.includes('\\n6\\nCENTER2\\n'),
                    hasCorrectCenter2Length: normalizedDxf.includes('2\\nCENTER2\\n70\\n0\\n3\\nCenter ____ _ ____ _ ____\\n72\\n65\\n73\\n4\\n40\\n1.125\\n'),
                    hasHidden2Linetype: normalizedDxf.includes('\\n2\\nHIDDEN2\\n'),
                    hasR2000LineweightCodes: normalizedDxf.includes('\\n370\\n'),
                    hasR2000LinetypeAlignmentCodes: normalizedDxf.includes('\\n74\\n'),
                    hasArialStyle: normalizedDxf.includes('\\n3\\narial.ttf\\n'),
                    crlfOnly: dxf.includes('\\r\\n') && !dxf.replace(/\\r\\n/g, '').includes('\\n'),
                    hasFoundationPlanTitle: normalizedDxf.includes('\\n1\\nFOUNDATION PLAN\\n') || normalizedDxf.includes('\\n1\\nBASE REACTION PLAN\\n'),
                    missingPlanTitles,
                    missingTableTitles: requiredTableTitles.filter(title => !normalizedDxf.includes('\\n1\\n' + title + '\\n')),
                    validTerminator: dxf.endsWith('0\\r\\nEOF\\r\\n'),
                    packageAudit,
                    beamLayerChunk: layerChunk('S-CONC-BEAM'),
                    columnLayerChunk: layerChunk('S-CONC-COL'),
                    gridLayerChunk: layerChunk('S-GRID')
                };
            })();

            const memberTagAudit = (() => {
                setPlanTab('layout');
                if (typeof populateBeamSchedule === 'function') populateBeamSchedule();
                if (typeof renderScheduleBeams === 'function') renderScheduleBeams();
                if (typeof populateScheduleTables === 'function') populateScheduleTables();
                if (typeof designAllBeams === 'function') designAllBeams();
                const floorId = state.floors[state.currentFloorIndex]?.id || '2F';
                const beam = state.beams.find(b => b && b.id === 'BX-1-1') ||
                    state.beams.find(b => b && !b.isCustom && !b.isCantilever && !b.deleted);
                const tag = beam ? getBeamPlanTableTag(beam, floorId, 1) : '';
                return {
                    floorId,
                    beamId: beam?.id || '',
                    tag,
                    designText: document.getElementById('beamDesignBody')?.textContent || '',
                    beamScheduleText: document.getElementById('beamScheduleBody')?.textContent || '',
                    paperScheduleText: document.getElementById('scheduleBeamsBody')?.textContent || ''
                };
            })();

            setPlanTab('analysis');
            return {
                initial,
                uiCleanupAudit,
                fourByThree,
                afterCantileverDashboardRepair,
                afterUndo,
                afterRedo,
                partialCantilever,
                cornerSlabBeforeReload,
                cornerSlabAfterReload,
                cornerSlabAfterRemove,
                multiEndCornerAction,
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
                memberSizeAudit,
                afterStairCreate,
                afterStairReload,
                afterStairRemove,
                transientDeletedSave,
                legacyRootLoad,
                quarantine,
                intentionalHidden,
                autosaveHidden,
                trustedAutosaveHidden,
                invalidStructuralAutosave,
                multiFloorVoidSave,
                typicalFloorBeforeReload,
                typicalFloorAfterReload,
                floorRemovalGuard,
                floorOverwriteGuard,
                oneFloorAfterRfDelete,
                addedRfFromSingle,
                addedTypicalBeforeRf,
                beforeSpanVoidOrphan,
                afterSpanVoidOrphan,
                dxfLayerAudit,
                memberTagAudit,
                finalStatus: document.getElementById('statusText')?.textContent || '',
                initError: document.body.innerText.includes('Init error')
            };
        })()`);

        assert(
            result.uiCleanupAudit?.canonicalAnalyticalFixture?.status === 'PASS',
            'Canonical-versus-analytical fixture did not match the live CSI export payload',
            result.uiCleanupAudit?.canonicalAnalyticalFixture
        );

        const stairIfcContent = await tab.evaluate('window.__fsQaStairIFC || ""');
        const stairIfcParser = validateIfcWithIfcOpenShell(stairIfcContent, 'browser-stair-structural');
        await tab.evaluate('window.__fsQaStairIFC = ""');
        result.afterStairCreate.ifcParser = stairIfcParser;

        assert(result.initial.title === 'FutolStructure | Structural Engineering', 'Unexpected app title', result.initial);
        assert(!result.initial.initError && !result.initError, 'Init error shown in app', result);
        assert(result.initial.columns === 9, 'Default 2x2 model did not initialize 9 columns', result.initial);
        assert(
            result.uiCleanupAudit.buildBadge === 'v3.16.125-rc.3' &&
            result.uiCleanupAudit.rebuildButton === true &&
            result.uiCleanupAudit.etabsButton === true &&
            result.uiCleanupAudit.solverImportButton === true &&
            result.uiCleanupAudit.roundTripInput === true &&
            result.uiCleanupAudit.roundTripProbeStatus === 'INCOMPLETE' &&
            result.uiCleanupAudit.roundTripProbeNoAutoApply === true &&
            result.uiCleanupAudit.etabsQaBadge === 1 &&
            result.uiCleanupAudit.stairBeamHidden === true &&
            result.uiCleanupAudit.aiAssistantHidden === true &&
            result.uiCleanupAudit.publicAiDisabled === true &&
            result.uiCleanupAudit.scheduleRedirectTab === 'beamSchedule' &&
            result.uiCleanupAudit.legacyScheduleModalDisplay === 'none' &&
            result.uiCleanupAudit.legacyScheduleModalDisabled === true,
            'Approved toolbar/schedule cleanup UI did not render as expected',
            result.uiCleanupAudit
        );
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
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.span > 0.001 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.span < 1.199 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.widthMm === 150 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.depthMm === 550 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.faceTerminated === true &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.terminationStartBeamId &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.terminationEndBeamId &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.edgeBeam?.startY - result.partialCantilever.rightPatchWithEdge.edgeBeam?.startFaceY) < 0.001 &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.edgeBeam?.endY - result.partialCantilever.rightPatchWithEdge.edgeBeam?.endFaceY) < 0.001 &&
            result.partialCantilever.rightPatchWithEdge.edgeBeam?.supportingMainBeamId === result.partialCantilever.rightPatchWithEdge.edgeBeam?.supportingBeamId &&
            /^EB-/.test(result.partialCantilever.rightPatchWithEdge.edgeBeam?.label || '') &&
            Math.abs(result.partialCantilever.rightPatchWithEdge.edgeBeam?.renderedOuterFaceX - result.partialCantilever.rightPatchWithEdge.edgeBeam?.slabFreeEdgeX) < 0.001,
            'Partial right cantilever patch did not generate a face-terminated 150x550mm free-edge beam with inherited support depth',
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
            result.partialCantilever.edgeSizing?.controlsPresent === true &&
            result.partialCantilever.edgeSizing?.generatedWidthMm === 225 &&
            result.partialCantilever.edgeSizing?.generatedDepthMm === 475 &&
            result.partialCantilever.edgeSizing?.savedWidthMm === 225 &&
            result.partialCantilever.edgeSizing?.savedDepthMm === 475,
            'Edge-beam width/depth controls did not govern generated geometry and project persistence',
            result.partialCantilever.edgeSizing
        );
        assert(
            result.partialCantilever.edgeSizing?.independent?.source?.widthMm === 225 &&
            result.partialCantilever.edgeSizing?.independent?.source?.depthMm === 475 &&
            result.partialCantilever.edgeSizing?.independent?.target?.widthMm === 330 &&
            result.partialCantilever.edgeSizing?.independent?.target?.depthMm === 620 &&
            result.partialCantilever.edgeSizing?.independent?.savedSource?.widthMm === 225 &&
            result.partialCantilever.edgeSizing?.independent?.savedSource?.depthMm === 475 &&
            result.partialCantilever.edgeSizing?.independent?.savedTarget?.widthMm === 330 &&
            result.partialCantilever.edgeSizing?.independent?.savedTarget?.depthMm === 620,
            'Editing the 2F edge-beam defaults changed the independent RF defaults or failed to persist floor scope',
            result.partialCantilever.edgeSizing
        );
        assert(
            result.partialCantilever.edgeSizing?.inherited?.target?.widthMm === 225 &&
            result.partialCantilever.edgeSizing?.inherited?.target?.depthMm === 475 &&
            result.partialCantilever.edgeSizing?.inherited?.controlsDisabled === true,
            'A Typical roof did not inherit the lower-floor edge-beam defaults and lock the inherited controls',
            result.partialCantilever.edgeSizing
        );
        assert(
            result.partialCantilever.edgeSizing?.detached?.source?.widthMm === 250 &&
            result.partialCantilever.edgeSizing?.detached?.source?.depthMm === 500 &&
            result.partialCantilever.edgeSizing?.detached?.target?.widthMm === 225 &&
            result.partialCantilever.edgeSizing?.detached?.target?.depthMm === 475 &&
            result.partialCantilever.edgeSizing?.detached?.targetDefaults?.b === 225 &&
            result.partialCantilever.edgeSizing?.detached?.targetDefaults?.h === 475 &&
            result.partialCantilever.edgeSizing?.detached?.controlsEnabled === true,
            'Unchecking Typical did not freeze RF edge-beam defaults before a later 2F edit',
            result.partialCantilever.edgeSizing
        );
        assert(
            result.partialCantilever.edgeSizing?.perFloor?.['2F']?.widthMm === 210 &&
            result.partialCantilever.edgeSizing?.perFloor?.['2F']?.depthMm === 360 &&
            result.partialCantilever.edgeSizing?.perFloor?.['2F']?.savedWidthMm === 210 &&
            result.partialCantilever.edgeSizing?.perFloor?.['2F']?.savedDepthMm === 360 &&
            result.partialCantilever.edgeSizing?.perFloor?.['2F']?.source === 'manual' &&
            result.partialCantilever.edgeSizing?.perFloor?.RF?.widthMm === 330 &&
            result.partialCantilever.edgeSizing?.perFloor?.RF?.depthMm === 620 &&
            result.partialCantilever.edgeSizing?.perFloor?.RF?.savedWidthMm === 330 &&
            result.partialCantilever.edgeSizing?.perFloor?.RF?.savedDepthMm === 620 &&
            result.partialCantilever.edgeSizing?.perFloor?.RF?.source === 'manual',
            'Edge-beam override leaked between floors or was not persisted per member location',
            result.partialCantilever.edgeSizing
        );
        assert(
            result.partialCantilever.rightPatchWithoutEdge.slab?.edgeBeamEnabled === false &&
            result.partialCantilever.rightPatchWithoutEdge.edgeBeamExists === false,
            'Cantilever edge beam toggle did not suppress only the free-end edge beam',
            result.partialCantilever
        );
        assert(
            result.cornerSlabBeforeReload.joinCount === 1 &&
            result.cornerSlabBeforeReload.savedJoinCount === 1 &&
            result.cornerSlabBeforeReload.sourceSlabIds.includes('SC-T4') &&
            result.cornerSlabBeforeReload.sourceSlabIds.includes('SC-R1') &&
            Math.abs(result.cornerSlabBeforeReload.area - 0.6) < 0.001 &&
            result.cornerSlabBeforeReload.supportBeamIds.length === 2 &&
            result.cornerSlabBeforeReload.supportBeamIds.every(id => result.cornerSlabBeforeReload.hiddenBeamIds.includes(id)) &&
            result.cornerSlabBeforeReload.supportBeamIds.every(id => result.cornerSlabBeforeReload.renderedHiddenBeamIds.includes(id)) &&
            Math.abs(result.cornerSlabBeforeReload.assignedArea - result.cornerSlabBeforeReload.area) < 0.001 &&
            Math.abs(result.cornerSlabBeforeReload.areaDelta) < 0.001,
            'Corner slab creation did not add the missing patch once, assign its area once, or mark both support beams as hidden lines',
            result.cornerSlabBeforeReload
        );
        assert(
            result.cornerSlabAfterReload.joinCount === 1 &&
            result.cornerSlabAfterReload.id === result.cornerSlabBeforeReload.id &&
            result.cornerSlabAfterReload.sourceSlabIds.includes('SC-T4') &&
            result.cornerSlabAfterReload.sourceSlabIds.includes('SC-R1') &&
            result.cornerSlabAfterReload.hiddenBeamIds.length === 2 &&
            Math.abs(result.cornerSlabAfterReload.areaDelta) < 0.001,
            'Corner slab join or hidden-line support state did not survive save/load',
            result.cornerSlabAfterReload
        );
        assert(
            result.cornerSlabAfterRemove.joinCount === 0 && result.cornerSlabAfterRemove.generatedCount === 0,
            'Remove Corner Slab did not restore the original two-cantilever condition',
            result.cornerSlabAfterRemove
        );
        assert(
            result.multiEndCornerAction.leftMode === 'remove' &&
            result.multiEndCornerAction.leftPair.includes('SC-QA-L') &&
            result.multiEndCornerAction.rightMode === 'create' &&
            result.multiEndCornerAction.rightCandidateId === 'SC-QA-R',
            'Corner slab menu action was not resolved independently at opposite ends of the same cantilever slab',
            result.multiEndCornerAction
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
            Math.abs(result.afterMeasureSnapOrtho.snappedMeasurePoint.x -
                (result.afterMeasureSnapOrtho.snappedMeasureKind === 'column-center' ? result.afterMeasureSnapOrtho.initialMeasureColumnPosition.x : 0)) < 0.001 &&
            Math.abs(result.afterMeasureSnapOrtho.snappedMeasurePoint.y -
                (result.afterMeasureSnapOrtho.snappedMeasureKind === 'column-center' ? result.afterMeasureSnapOrtho.initialMeasureColumnPosition.y : 0)) < 0.001 &&
            ['column-center', 'grid-intersection'].includes(result.afterMeasureSnapOrtho.snappedMeasureKind),
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
            Math.abs(
                result.afterMeasureSnapOrtho.layoutMovedColumnSnap.x -
                result.afterMeasureSnapOrtho.movedColumnPosition.x
            ) < 0.001 &&
            Math.abs(
                result.afterMeasureSnapOrtho.layoutMovedColumnSnap.y -
                result.afterMeasureSnapOrtho.movedColumnPosition.y
            ) < 0.001 &&
            result.afterMeasureSnapOrtho.layoutMovedColumnSnapKind === 'column-center',
            'Measure did not snap to the rendered, offset column center in Layout after zoom/pan',
            result.afterMeasureSnapOrtho
        );
        assert(
            Math.abs(
                result.afterMeasureSnapOrtho.layoutColumnFaceSnap.x -
                result.afterMeasureSnapOrtho.expectedColumnFaceX
            ) < 0.001 &&
            result.afterMeasureSnapOrtho.layoutColumnFaceSnapKind.startsWith('column-face'),
            'Measure did not snap to the actual column face',
            result.afterMeasureSnapOrtho
        );
        assert(
            Math.abs(
                result.afterMeasureSnapOrtho.tributaryMovedBeamSnap.x -
                result.afterMeasureSnapOrtho.expectedBeamAxis.x
            ) < 0.001 &&
            Math.abs(
                result.afterMeasureSnapOrtho.tributaryMovedBeamSnap.y -
                result.afterMeasureSnapOrtho.expectedBeamAxis.y
            ) < 0.001 &&
            result.afterMeasureSnapOrtho.tributaryMovedBeamSnapKind === 'beam-axis',
            'Measure did not snap to the rendered, aligned beam axis in Tributary',
            result.afterMeasureSnapOrtho
        );
        assert(
            result.afterMeasureSnapOrtho.measuredAfterZoomPan === 1 &&
            result.afterMeasureSnapOrtho.persistedDimensionCount === 1,
            'Measure did not create and persist one dimension after zoom/pan',
            result.afterMeasureSnapOrtho
        );
        assert(
            Math.abs(
                result.afterMeasureSnapOrtho.columnPositionAfterMeasureClicks.x -
                result.afterMeasureSnapOrtho.columnPositionBeforeMeasureClicks.x
            ) < 0.000001 &&
            Math.abs(
                result.afterMeasureSnapOrtho.columnPositionAfterMeasureClicks.y -
                result.afterMeasureSnapOrtho.columnPositionBeforeMeasureClicks.y
            ) < 0.000001,
            'Measure clicks moved a structural column',
            result.afterMeasureSnapOrtho
        );
        assert(
            Math.abs(
                result.afterMeasureSnapOrtho.reloadColumnSnap.x -
                result.afterMeasureSnapOrtho.reloadedColumnPosition.x
            ) < 0.001 &&
            Math.abs(
                result.afterMeasureSnapOrtho.reloadColumnSnap.y -
                result.afterMeasureSnapOrtho.reloadedColumnPosition.y
            ) < 0.001 &&
            result.afterMeasureSnapOrtho.reloadColumnSnapKind === 'column-center' &&
            Math.abs(
                result.afterMeasureSnapOrtho.persistedColumnOffset.dx -
                result.afterMeasureSnapOrtho.expectedColumnOffset.dx
            ) < 0.001 &&
            Math.abs(
                result.afterMeasureSnapOrtho.persistedColumnOffset.dy -
                result.afterMeasureSnapOrtho.expectedColumnOffset.dy
            ) < 0.001 &&
            Math.abs(result.afterMeasureSnapOrtho.persistedBeamOffset - 0.17) < 0.001,
            'Measure snapping did not survive project reload with rendered member offsets',
            result.afterMeasureSnapOrtho
        );
        const memberAuditResult = result.memberSizeAudit || {};
        assert(
            !memberAuditResult.setupError,
            'Member-size regression fixture could not be created',
            memberAuditResult
        );
        assert(
            Math.abs(memberAuditResult.geometry.footprintWidth - 0.4) < 0.000001 &&
            Math.abs(memberAuditResult.geometry.footprintHeight - 0.15) < 0.000001 &&
            memberAuditResult.geometry.footprintEdgeLengths.filter(length => Math.abs(length - 0.15) < 0.000001).length === 2 &&
            memberAuditResult.geometry.footprintEdgeLengths.filter(length => Math.abs(length - 0.4) < 0.000001).length === 2 &&
            Math.abs(memberAuditResult.geometry.rotatedFaceSnap.x - memberAuditResult.geometry.expectedFace.x) < 0.001 &&
            Math.abs(memberAuditResult.geometry.rotatedFaceSnap.y - memberAuditResult.geometry.expectedFace.y) < 0.001 &&
            memberAuditResult.geometry.rotatedFaceSnapKind === 'column-face',
            'Rotated 150x400 column plan footprint or Measure face snap was not exact',
            memberAuditResult.geometry
        );
        assert(
            JSON.stringify(memberAuditResult.schedules.columnInputs) === JSON.stringify([150, 400, 90]) &&
            memberAuditResult.schedules.columnStatus === 'existing_for_assessment' &&
            JSON.stringify(memberAuditResult.schedules.beamInputs) === JSON.stringify([150, 175]) &&
            memberAuditResult.schedules.beamStatus === 'proposed_new',
            'Trusted schedules did not preserve exact member sizes, orientation, and class',
            memberAuditResult.schedules
        );
        assert(
            Math.abs(memberAuditResult.threeD.rectangularColumn.b - 0.15) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.rectangularColumn.h - 0.4) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.rectangularColumn.rotationY + Math.PI / 2) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.squareColumn.b - 0.15) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.squareColumn.h - 0.15) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.beam.b - 0.15) < 0.000001 &&
            Math.abs(memberAuditResult.threeD.beam.h - 0.175) < 0.000001,
            '3D member geometry silently enlarged or ignored column orientation',
            memberAuditResult.threeD
        );
        assert(
            memberAuditResult.save.rectangularColumn.webB === 150 &&
            memberAuditResult.save.rectangularColumn.webD === 400 &&
            memberAuditResult.save.rectangularColumn.orientationDeg === 90 &&
            memberAuditResult.save.rectangularColumn.memberStatus === 'existing_for_assessment' &&
            memberAuditResult.save.squareColumn.webB === 150 &&
            memberAuditResult.save.squareColumn.webD === 150 &&
            memberAuditResult.save.beamOverride.webW === 150 &&
            memberAuditResult.save.beamOverride.webD === 175 &&
            memberAuditResult.save.beamOverride.memberStatus === 'proposed_new' &&
            memberAuditResult.save.policy.action === 'warn' &&
            memberAuditResult.loadedSizes.rectangularColumn.b === 150 &&
            memberAuditResult.loadedSizes.rectangularColumn.h === 400 &&
            memberAuditResult.loadedSizes.rectangularColumn.orientationDeg === 90 &&
            memberAuditResult.loadedSizes.squareColumn.b === 150 &&
            memberAuditResult.loadedSizes.squareColumn.h === 150 &&
            memberAuditResult.loadedSizes.beam.b === 150 &&
            memberAuditResult.loadedSizes.beam.h === 175,
            'Exact member dimensions, class, orientation, or policy did not survive FSTR save/reopen',
            { save: memberAuditResult.save, loaded: memberAuditResult.loadedSizes }
        );
        const warningItems = memberAuditResult.governance.warning.items || [];
        const blockedItems = memberAuditResult.governance.blocked.items || [];
        assert(
            memberAuditResult.governance.warning.summary.blocked === 0 &&
            warningItems.some(item =>
                item.type === 'Column' &&
                item.id === memberAuditResult.ids.rectangularColumnId &&
                item.actualB === 150 &&
                item.actualH === 400 &&
                item.status === 'WARNING'
            ) &&
            warningItems.some(item =>
                item.type === 'Column' &&
                item.id === memberAuditResult.ids.squareColumnId &&
                item.actualB === 150 &&
                item.actualH === 150 &&
                item.status === 'WARNING'
            ) &&
            warningItems.some(item =>
                item.type === 'Beam' &&
                item.id === memberAuditResult.ids.beamId &&
                item.actualB === 150 &&
                item.actualH === 175 &&
                item.status === 'WARNING'
            ) &&
            blockedItems.some(item =>
                item.type === 'Beam' &&
                item.id === memberAuditResult.ids.beamId &&
                item.status === 'BLOCKED'
            ) &&
            [memberAuditResult.ids.rectangularColumnId, memberAuditResult.ids.squareColumnId].every(columnId =>
                blockedItems.some(item =>
                    item.type === 'Column' &&
                    item.id === columnId &&
                    item.status === 'WARNING'
                )
            ) &&
            blockedItems.filter(item =>
                item.type === 'Column' &&
                [memberAuditResult.ids.rectangularColumnId, memberAuditResult.ids.squareColumnId].includes(item.id)
            ).every(item => item.status === 'WARNING'),
            'Member-size warning/block governance did not respect proposed versus existing assessment status',
            memberAuditResult.governance
        );
        assert(
            memberAuditResult.sharedModel.rectangularColumn.section === 'C150x400' &&
            memberAuditResult.sharedModel.rectangularColumn.orientationDeg === 90 &&
            memberAuditResult.sharedModel.rectangularColumn.etabsLocalAxisAngleDeg === -90 &&
            memberAuditResult.sharedModel.rectangularColumn.analyticalCardinalPoint === 5 &&
            memberAuditResult.sharedModel.rectangularColumn.memberStatus === 'existing_for_assessment' &&
            memberAuditResult.sharedModel.squareColumn.section === 'C150x150' &&
            memberAuditResult.sharedModel.beam.section === 'B150x175' &&
            memberAuditResult.sharedModel.beam.memberStatus === 'proposed_new' &&
            memberAuditResult.sharedModel.sections.C150x400?.b === 150 &&
            memberAuditResult.sharedModel.sections.C150x400?.h === 400 &&
            memberAuditResult.sharedModel.sections.C150x400?.etabsT2 === 400 &&
            memberAuditResult.sharedModel.sections.C150x400?.etabsT3 === 150 &&
            memberAuditResult.sharedModel.sections.C150x150?.b === 150 &&
            memberAuditResult.sharedModel.sections.C150x150?.h === 150 &&
            memberAuditResult.sharedModel.sections.C150x150?.etabsT2 === 150 &&
            memberAuditResult.sharedModel.sections.C150x150?.etabsT3 === 150 &&
            memberAuditResult.sharedModel.sections.B150x175?.b === 150 &&
            memberAuditResult.sharedModel.sections.B150x175?.h === 175 &&
            memberAuditResult.sharedModel.sections.B150x175?.etabsT2 === 150 &&
            memberAuditResult.sharedModel.sections.B150x175?.etabsT3 === 175,
            'Shared solver model did not preserve exact section truth',
            memberAuditResult.sharedModel
        );
        assert(
            memberAuditResult.exports.staadHasExactSections &&
            memberAuditResult.exports.staadHasOrientation &&
            memberAuditResult.exports.etabsDecoded &&
            memberAuditResult.exports.etabsRectangularColumn?.section === 'C150x400' &&
            memberAuditResult.exports.etabsRectangularColumn?.orientationDeg === 90 &&
            memberAuditResult.exports.etabsBeam?.section === 'B150x175' &&
            memberAuditResult.exports.etabsHasLocalAxesCommand &&
            memberAuditResult.exports.etabsHasCanonicalNodePolicy &&
            memberAuditResult.exports.etabsHasExplicitSectionAxisMapping &&
            memberAuditResult.exports.etabsHasReflectedOrientation &&
            memberAuditResult.exports.ifcHasExactSections &&
            memberAuditResult.exports.ifcHasOrientation &&
            memberAuditResult.exports.ifcHasMemberStatus &&
            memberAuditResult.exports.dxfHasExactSections &&
            memberAuditResult.exports.reportUsesArial &&
            memberAuditResult.exports.reportHasExactSections &&
            memberAuditResult.exports.reportHasOrientation &&
            memberAuditResult.exports.reportHasMemberClass &&
            memberAuditResult.exports.tanReportUsesArial &&
            memberAuditResult.exports.tanReportHasExactColumn,
            'Report/DXF/IFC/STAAD/ETABS parity failed for sub-200 or rotated members',
            memberAuditResult.exports
        );
        assert(
            memberAuditResult.blockPolicy.staad.blocked &&
            /member size policy/i.test(memberAuditResult.blockPolicy.staad.message) &&
            memberAuditResult.blockPolicy.etabs.blocked &&
            /member size policy/i.test(memberAuditResult.blockPolicy.etabs.message) &&
            memberAuditResult.blockPolicy.ifcHasBlockedDisclosure &&
            memberAuditResult.blockPolicy.ifcAudit.memberSizeGovernance?.summary?.blocked > 0,
            'Block policy did not stop analytical export while retaining IFC coordination disclosure',
            memberAuditResult.blockPolicy
        );
        assert(
            result.afterStairCreate.previewReady &&
            result.afterStairCreate.count === 1 &&
            result.afterStairCreate.savedCount === 1 &&
            result.afterStairCreate.levels[0] === '2F' &&
            result.afterStairCreate.levels[1] === 'RF' &&
            result.afterStairCreate.risers >= 4 &&
            result.afterStairCreate.opening?.slabId === 'S2' &&
            result.afterStairCreate.structuralSchema === 'FutolStructure.StairStructuralModel.v1' &&
            result.afterStairCreate.componentCounts?.flightSlabs === 2 &&
            result.afterStairCreate.componentCounts?.landingSlabs === 1 &&
            result.afterStairCreate.componentCounts?.stairBeams >= 6 &&
            result.afterStairCreate.componentCounts?.landingBeams >= 4 &&
            result.afterStairCreate.componentCounts?.supportReactions === 4 &&
            result.afterStairCreate.stairMeshCount ===
                result.afterStairCreate.componentCounts.flightSlabs +
                result.afterStairCreate.componentCounts.landingSlabs +
                result.afterStairCreate.componentCounts.stairBeams +
                result.afterStairCreate.componentCounts.landingBeams &&
            Math.abs(
                result.afterStairCreate.intermediateLandingBeam?.start?.z -
                (
                    result.afterStairCreate.elevations?.lowerElevation +
                    result.afterStairCreate.elevations?.upperElevation
                ) / 2
            ) < 0.001 &&
            result.afterStairCreate.supportSummary.mapped === 4 &&
            result.afterStairCreate.supportSummary.total === 4 &&
            result.afterStairCreate.loadHandoff?.totalDeadKN > 0 &&
            result.afterStairCreate.loadHandoff?.totalLiveKN > 0 &&
            result.afterStairCreate.integration?.solverReady === false &&
            result.afterStairCreate.analysisExport !== 'solver-ready' &&
            result.afterStairCreate.csiCounts?.stairBeams >= 10 &&
            result.afterStairCreate.csiCounts?.stairSlabs === 3 &&
            result.afterStairCreate.ifcAudit?.counts?.stairBeams >= 10 &&
            result.afterStairCreate.ifcAudit?.counts?.stairSlabs === 3 &&
            result.afterStairCreate.ifcAudit?.counts?.stairOpenings === 1 &&
            /^IFC2X3/i.test(result.afterStairCreate.ifcParser?.schema || '') &&
            result.afterStairCreate.ifcParser?.counts?.openings === 1 &&
            result.afterStairCreate.ifcHasStairTypes &&
            result.afterStairCreate.solverGates?.staad?.blocked &&
            /stair integration/i.test(result.afterStairCreate.solverGates.staad.message) &&
            result.afterStairCreate.solverGates?.etabs?.blocked &&
            /stair integration/i.test(result.afterStairCreate.solverGates.etabs.message) &&
            result.afterStairCreate.preview3D?.meshCount >= result.afterStairCreate.stairMeshCount &&
            result.afterStairCreate.destinationFragmentCount >= 2 &&
            result.afterStairCreate.tableHasStair &&
            result.afterStairCreate.dxfHasStair &&
            result.afterStairCreate.dxfHasStructuralSchedule,
            'Stair Builder did not create governed structural components, loads, views, exports, and solver gates',
            result.afterStairCreate
        );
        assert(
            result.afterStairReload.count === 1 &&
            result.afterStairReload.id === result.afterStairCreate.id &&
            result.afterStairReload.openingCount === 1 &&
            result.afterStairReload.structuralSchema === 'FutolStructure.StairStructuralModel.v1' &&
            result.afterStairReload.componentIds.includes(`${result.afterStairCreate.id}-LB-IN`) &&
            result.afterStairReload.rotationDeg === 0 &&
            result.afterStairReload.analysisExport === result.afterStairCreate.analysisExport &&
            result.afterStairReload.supportMappingCount === 4,
            'Stair Builder object, structural model, support map, or opening did not survive FSTR save/load',
            result.afterStairReload
        );
        assert(
            result.afterStairRemove.count === 0 && result.afterStairRemove.openingCount === 0,
            'Removing a stair did not remove its reserved slab opening',
            result.afterStairRemove
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
        assert(
            result.autosaveHidden.restored === true &&
            result.autosaveHidden.warningReason === 'healthy fallback restored' &&
            result.autosaveHidden.quarantineBackup &&
            result.autosaveHidden.hidden.voidSlabs.length === 0 &&
            result.autosaveHidden.hidden.deletedBeams.length === 0 &&
            result.autosaveHidden.quarantinedCount === 0 &&
            result.autosaveHidden.activeRegularSlabs === 12 &&
            result.autosaveHidden.voidRegular.length === 0,
            'Outdated autosave was not quarantined and replaced by the last healthy snapshot',
            result.autosaveHidden
        );
        assert(result.trustedAutosaveHidden.hidden.voidSlabs.includes('S1'), 'Trusted current-build autosave did not preserve intentional void slab state', result.trustedAutosaveHidden);
        assert(result.trustedAutosaveHidden.quarantinedCount === 0 && result.trustedAutosaveHidden.activeRegularSlabs === 11 && result.trustedAutosaveHidden.voidRegular.includes('S1'), 'Trusted current-build autosave void slab was not active after restore', result.trustedAutosaveHidden);
        assert(
            result.invalidStructuralAutosave.restored === true &&
            result.invalidStructuralAutosave.warningReason === 'healthy fallback restored' &&
            result.invalidStructuralAutosave.quarantineBackup &&
            result.invalidStructuralAutosave.fallbackActiveColumns >= 2,
            'Structurally impossible autosave was not replaced by the last healthy snapshot',
            result.invalidStructuralAutosave
        );
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
            result.typicalFloorBeforeReload.cornerSlabCount === 1 &&
            result.typicalFloorBeforeReload.savedCornerSlabCount === 1 &&
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
            result.typicalFloorAfterReload.cornerSlabCount === 1 &&
            Math.abs(result.typicalFloorAfterReload.beamOverride.offset - 0.22) < 0.001 &&
            result.typicalFloorAfterReload.beamOverride.width === 350 &&
            result.typicalFloorAfterReload.beamOverride.depth === 650 &&
            result.typicalFloorAfterReload.roofLoads.liveLoad === 1.0,
            'Typical-from-lower floor did not survive project save/load',
            result.typicalFloorAfterReload
        );
        assert(
            result.floorRemovalGuard.before === 2 &&
            result.floorRemovalGuard.after === 2 &&
            result.floorRemovalGuard.result === false &&
            /Remove floor RF/.test(result.floorRemovalGuard.prompt) &&
            /floor-specific slabs, beams, locks, offsets, and loads/.test(result.floorRemovalGuard.prompt),
            'Floor removal did not require explicit confirmation or cancellation changed the model',
            result.floorRemovalGuard
        );
        assert(
            result.floorOverwriteGuard.allowed === false &&
            result.floorOverwriteGuard.baseline === 2 &&
            result.floorOverwriteGuard.current === 1 &&
            /2 -> 1/.test(result.floorOverwriteGuard.prompt) &&
            /floor deletion was intentional/.test(result.floorOverwriteGuard.prompt),
            'Saving a model with fewer floors than the loaded project was not guarded',
            result.floorOverwriteGuard
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
        assert(
            result.dxfLayerAudit.hasR12Version === true &&
            result.dxfLayerAudit.hasLayerZero === true &&
            result.dxfLayerAudit.hasByLayerByBlock === true &&
            result.dxfLayerAudit.hasCorrectCenter2Length === true &&
            result.dxfLayerAudit.hasArialStyle === true &&
            result.dxfLayerAudit.hasR2000LineweightCodes === false &&
            result.dxfLayerAudit.hasR2000LinetypeAlignmentCodes === false &&
            result.dxfLayerAudit.crlfOnly === true &&
            result.dxfLayerAudit.packageAudit.dxfVersion === 'AC1009' &&
            result.dxfLayerAudit.packageAudit.lineEnding === 'CRLF' &&
            result.dxfLayerAudit.packageAudit.build === 'FS-125-RC3' &&
            result.dxfLayerAudit.packageAudit.writerBuild === 'FS-119-DXF-1',
            'DXF envelope or app/writer provenance is inconsistent',
            result.dxfLayerAudit
        );
        assert(result.dxfLayerAudit.hasCenter2Linetype === true, 'DXF export did not define/use CENTER2 for grid lines', result.dxfLayerAudit);
        assert(result.dxfLayerAudit.hasHidden2Linetype === true, 'DXF export did not define HIDDEN2 for hidden corner-slab framing', result.dxfLayerAudit);
        assert(
            result.dxfLayerAudit.missingPlanTitles.length === 0 &&
            result.dxfLayerAudit.hasFoundationPlanTitle === true &&
            result.dxfLayerAudit.packageAudit.plans.layouts === result.dxfLayerAudit.packageAudit.floorIds.length &&
            result.dxfLayerAudit.packageAudit.plans.tributary === result.dxfLayerAudit.packageAudit.floorIds.length &&
            result.dxfLayerAudit.packageAudit.plans.foundation === 1,
            'DXF package did not export all floor plans and the foundation/base-reaction plan',
            result.dxfLayerAudit
        );
        assert(
            result.dxfLayerAudit.missingTableTitles.length === 0 &&
            result.dxfLayerAudit.packageAudit.tables.columnSchedule > 0 &&
            result.dxfLayerAudit.packageAudit.tables.beamSchedule > 0 &&
            result.dxfLayerAudit.packageAudit.tables.slabSchedule > 0 &&
            result.dxfLayerAudit.packageAudit.tables.foundationSchedule > 0 &&
            result.dxfLayerAudit.packageAudit.tables.boqConcrete > 0 &&
            result.dxfLayerAudit.packageAudit.tables.boqRebar === 1,
            'DXF package is missing schedules, load summary, or BOQ tables',
            result.dxfLayerAudit
        );
        assert(
            result.dxfLayerAudit.validTerminator === true &&
            result.dxfLayerAudit.packageAudit.validTerminator === true &&
            result.dxfLayerAudit.packageAudit.requiredLayerEntities === true &&
            result.dxfLayerAudit.packageAudit.bytes > 10000,
            'DXF package is incomplete or structurally invalid',
            result.dxfLayerAudit
        );
        assert(/62\n1\n/.test(result.dxfLayerAudit.beamLayerChunk) && /6\nCONTINUOUS\n/.test(result.dxfLayerAudit.beamLayerChunk), 'DXF beam layer does not match FT layer color/linetype', result.dxfLayerAudit);
        assert(/62\n2\n/.test(result.dxfLayerAudit.columnLayerChunk) && /6\nCONTINUOUS\n/.test(result.dxfLayerAudit.columnLayerChunk), 'DXF column layer does not match FT layer color/linetype', result.dxfLayerAudit);
        assert(/62\n250\n/.test(result.dxfLayerAudit.gridLayerChunk) && /6\nCENTER2\n/.test(result.dxfLayerAudit.gridLayerChunk), 'DXF grid layer does not match FT layer color/linetype', result.dxfLayerAudit);
        assert(
            result.memberTagAudit.tag.startsWith(`B - ${result.memberTagAudit.floorId} -`) &&
            result.memberTagAudit.designText.includes(result.memberTagAudit.tag) &&
            result.memberTagAudit.beamScheduleText.includes(result.memberTagAudit.tag) &&
            result.memberTagAudit.paperScheduleText.includes(result.memberTagAudit.tag) &&
            !result.memberTagAudit.designText.includes(result.memberTagAudit.beamId),
            'Beam tables are not synchronized with plan-style member tags',
            result.memberTagAudit
        );

        const dxfParserAudit = validateDxfWithEzdxf(
            await tab.evaluate('generateDXFContent()'),
            'browser-drawing-package'
        );
        const parserRequiredLayers = ['0', 'S-GRID', 'S-CONC-COL', 'S-CONC-BEAM', 'S-CONC-SLAB', 'S-TEXT'];
        assert(
            parserRequiredLayers.every(layer => dxfParserAudit.original.layers.includes(layer)) &&
            dxfParserAudit.original.entityCounts.LINE > 0 &&
            dxfParserAudit.original.entityCounts.TEXT > 0 &&
            dxfParserAudit.original.entityCounts.CIRCLE > 0 &&
            Object.values(dxfParserAudit.retained).every(Boolean),
            'DXF parser audit lost required layers or entities',
            dxfParserAudit
        );

        const beforeReloadAutosave = await tab.evaluate(`(() => {
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
            const writeResult = writeProjectAutosave('qa-browser-reload');
            localStorage.setItem(PROJECT_AUTOSAVE_KEY, '{corrupted-json');
            const fallbackRestored = restoreAutosavedProjectOnStartup();
            const fallbackWarning = startupAutosaveWarning?.reason || '';
            const rewriteResult = writeProjectAutosave('qa-browser-reload-after-fallback');
            return {
                writeResult,
                fallbackRestored,
                fallbackWarning,
                rewriteResult,
                primary: !!localStorage.getItem(PROJECT_AUTOSAVE_KEY),
                healthy: !!localStorage.getItem(PROJECT_LAST_HEALTHY_AUTOSAVE_KEY),
                quarantine: !!localStorage.getItem(PROJECT_AUTOSAVE_QUARANTINE_KEY),
                warning: startupAutosaveWarning
            };
        })()`);
        assert(
            beforeReloadAutosave.writeResult === true &&
            beforeReloadAutosave.fallbackRestored === true &&
            beforeReloadAutosave.fallbackWarning === 'healthy fallback restored' &&
            beforeReloadAutosave.rewriteResult === true &&
            beforeReloadAutosave.primary === true &&
            beforeReloadAutosave.healthy === true,
            'Healthy browser autosave was not persisted before reload',
            beforeReloadAutosave
        );
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

        const revisionProtection = await tab.evaluate(`(async () => {
            await FSProtectedRevisions.clearAll();
            const originalConfirm = window.confirm;
            const originalAlert = window.alert;
            const projectData = buildProjectData({ revisionId: 'qa-protected-baseline' });
            const summary = collectCurrentProjectSummary(projectData);
            const health = FSProtectedRevisions.assessHealth(summary);
            const saved = await FSProtectedRevisions.saveRevision({
                projectId: projectData.projectId,
                projectName: 'QA protected project',
                sourceName: 'qa-protected.fstr',
                reason: 'qa-pre-overwrite',
                projectData,
                summary,
                health
            });
            const serializedBaseline = JSON.stringify(projectData);
            const captured = await capturePreOverwriteRevision({
                name: 'qa-protected.fstr',
                getFile: async () => ({
                    name: 'qa-protected.fstr',
                    size: serializedBaseline.length,
                    text: async () => serializedBaseline
                })
            }, summary, null);

            const originalSaveFilePicker = window.showSaveFilePicker;
            let normalSaveWritten = '';
            currentProjectFileName = 'qa-normal-save.fstr';
            establishProjectBaseline(projectData, summary);
            currentProjectFileHandle = {
                name: currentProjectFileName,
                getFile: async () => ({
                    name: currentProjectFileName,
                    size: serializedBaseline.length,
                    text: async () => serializedBaseline
                }),
                createWritable: async () => ({
                    write: async value => { normalSaveWritten = String(value); },
                    close: async () => {}
                })
            };
            window.showSaveFilePicker = async () => currentProjectFileHandle;
            window.confirm = () => true;
            window.alert = () => {};
            await saveProject(false);
            const normalSaveData = normalSaveWritten ? JSON.parse(normalSaveWritten) : {};
            const normalSaveRevisions = await FSProtectedRevisions.listRevisions(projectData.projectId);
            const normalSaveAudit = {
                writtenBytes: normalSaveWritten.length,
                revisionId: normalSaveData.revisionMeta?.revisionId || '',
                parentRevisionId: normalSaveData.revisionMeta?.parentRevisionId || '',
                releaseBuildId: normalSaveData.releaseManifest?.buildId || '',
                protectedCount: normalSaveRevisions.length,
                preOverwriteCount: normalSaveRevisions.filter(revision => revision.reason === 'pre-overwrite').length
            };
            currentProjectFileHandle = null;
            if (originalSaveFilePicker) window.showSaveFilePicker = originalSaveFilePicker;
            else delete window.showSaveFilePicker;
            window.confirm = originalConfirm;
            window.alert = originalAlert;

            const reducedSummary = cloneSerializable(summary, {});
            reducedSummary.totals.activeSlabs = Math.max(0, reducedSummary.totals.activeSlabs - 1);
            reducedSummary.totals.lockedBeams = Math.max(0, reducedSummary.totals.lockedBeams - 1);
            reducedSummary.totals.voids += 1;
            const destructiveDelta = FSProtectedRevisions.compareSummaries(summary, reducedSummary);
            const invalidHealth = FSProtectedRevisions.assessHealth({
                totals: { floors: 0, activeColumns: 0, activeBeams: 0, activeSlabs: 1 },
                perFloor: []
            });

            state.floors[0].voidSlabs = ['S1'];
            calculate();
            window.confirm = () => true;
            window.alert = () => {};
            await recoveryRestoreProtectedRevision(saved.id);
            window.confirm = originalConfirm;
            window.alert = originalAlert;
            const restored = await FSProtectedRevisions.getRevision(saved.id);

            const originalDownloadProjectJson = window.downloadProjectJson;
            let downloadAudit = null;
            window.downloadProjectJson = (json, filename) => {
                const downloaded = JSON.parse(json);
                downloadAudit = {
                    filename,
                    projectId: downloaded.projectId || '',
                    revisionId: downloaded.revisionMeta?.revisionId || ''
                };
            };
            window.alert = () => {};
            try {
                await recoveryDownloadProtectedRevision(saved.id);
            } finally {
                window.downloadProjectJson = originalDownloadProjectJson;
                window.alert = originalAlert;
            }

            const retentionProjectId = projectData.projectId + '-retention';
            for (let index = 0; index < 55; index += 1) {
                await FSProtectedRevisions.saveRevision({
                    projectId: retentionProjectId,
                    projectName: 'QA retention project',
                    sourceName: 'qa-retention.fstr',
                    reason: 'retention-' + index,
                    createdAt: new Date(Date.UTC(2026, 6, 14, 0, 0, index)).toISOString(),
                    projectData,
                    summary,
                    health
                });
            }
            const retained = await FSProtectedRevisions.listRevisions(retentionProjectId);
            const listed = await FSProtectedRevisions.listRevisions(projectData.projectId);
            await populateRecoveryPanel();
            const rowCount = document.querySelectorAll('#protectedRevisionBody tr').length;

            const historical = validateProjectData(${serializedHistoricalFixture});
            applyLoadedProject(historical, 'legacy-v2.8-2floor.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const firstRoundTrip = buildProjectData({ revisionId: 'qa-migrated-1' });
            applyLoadedProject(firstRoundTrip, 'legacy-v2.8-roundtrip.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            const secondRoundTrip = buildProjectData({ revisionId: 'qa-migrated-2' });
            const historicalRoundTrip = {
                schemaVersion: firstRoundTrip.schemaVersion,
                floorIds: secondRoundTrip.floors.map(floor => floor.id),
                voidSlabs: secondRoundTrip.floors[0].voidSlabs.slice(),
                deletedBeams: secondRoundTrip.floors[0].deletedBeams.slice(),
                lockedBeams: secondRoundTrip.floors[0].lockedBeams.slice(),
                columnPositionLocked: secondRoundTrip.columnPositionLocked,
                beamOffset: secondRoundTrip.beamAlignmentOverrides?.['2F:BX-1-2']?.offset ?? null
            };
            applyLoadedProject(projectData, 'qa-protected.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            return {
                savedId: saved.id,
                capturedId: captured?.id || '',
                listedCount: listed.length,
                restoredProjectId: restored?.projectData?.projectId || '',
                restoredVoidSlabs: state.floors[0].voidSlabs.slice(),
                sourceRevisionId: currentProjectRevisionId,
                destructive: destructiveDelta.destructive,
                significant: destructiveDelta.significant,
                invalidHealth,
                rowCount,
                releaseVersion: projectData.releaseManifest?.appVersion || '',
                releaseBuildId: projectData.releaseManifest?.buildId || '',
                schemaVersion: projectData.schemaVersion || '',
                normalSaveAudit,
                downloadAudit,
                retention: {
                    count: retained.length,
                    newestReason: retained[0]?.reason || '',
                    oldestReason: retained[retained.length - 1]?.reason || '',
                    uniqueIds: new Set(retained.map(revision => revision.id)).size
                },
                historicalRoundTrip
            };
        })()`);
        assert(
            /^revision-/.test(revisionProtection.savedId) &&
            /^revision-/.test(revisionProtection.capturedId) &&
            revisionProtection.listedCount >= 3 &&
            revisionProtection.restoredProjectId.length > 0 &&
            revisionProtection.restoredVoidSlabs.length === 0 &&
            revisionProtection.sourceRevisionId === 'qa-protected-baseline' &&
            revisionProtection.significant === true &&
            revisionProtection.destructive.some(item => item.includes('activeSlabs')) &&
            revisionProtection.destructive.some(item => item.includes('voids')) &&
            revisionProtection.invalidHealth.valid === false &&
            revisionProtection.rowCount >= 1 &&
            revisionProtection.releaseVersion === '3.16.125-rc.3' &&
            revisionProtection.releaseBuildId === 'FS-125-RC3' &&
            revisionProtection.schemaVersion === '0.2.0' &&
            revisionProtection.normalSaveAudit.writtenBytes > 0 &&
            /^model-revision-/.test(revisionProtection.normalSaveAudit.revisionId) &&
            revisionProtection.normalSaveAudit.parentRevisionId === 'qa-protected-baseline' &&
            revisionProtection.normalSaveAudit.releaseBuildId === 'FS-125-RC3' &&
            revisionProtection.normalSaveAudit.protectedCount >= 3 &&
            revisionProtection.normalSaveAudit.preOverwriteCount >= 2 &&
            revisionProtection.downloadAudit?.filename.endsWith('.fstr') &&
            revisionProtection.downloadAudit?.projectId === revisionProtection.restoredProjectId &&
            revisionProtection.downloadAudit?.revisionId === 'qa-protected-baseline' &&
            revisionProtection.retention.count === 50 &&
            revisionProtection.retention.uniqueIds === 50 &&
            revisionProtection.retention.newestReason === 'retention-54' &&
            revisionProtection.retention.oldestReason === 'retention-5' &&
            revisionProtection.historicalRoundTrip.schemaVersion === '0.2.0' &&
            JSON.stringify(revisionProtection.historicalRoundTrip.floorIds) === JSON.stringify(['2F', 'RF']) &&
            revisionProtection.historicalRoundTrip.voidSlabs.includes('S1') &&
            revisionProtection.historicalRoundTrip.deletedBeams.includes('BX-1-1') &&
            revisionProtection.historicalRoundTrip.lockedBeams.includes('BX-1-2') &&
            revisionProtection.historicalRoundTrip.columnPositionLocked === true &&
            Math.abs(revisionProtection.historicalRoundTrip.beamOffset - 0.1) < 0.000001,
            'Protected revision save, delta, health, restore, download, retention, provenance, or migration flow failed',
            revisionProtection
        );
        await tab.evaluate(`(async () => {
            setPlanTab('recovery');
            await populateRecoveryPanel();
            return document.querySelectorAll('#protectedRevisionBody tr').length;
        })()`);
        await wait(150);
        await tab.screenshot(revisionScreenshotPath);
        await tab.evaluate(`(async () => {
            await FSProtectedRevisions.clearAll();
            setPlanTab('structural');
            return true;
        })()`);

        await tab.evaluate(`(() => {
            state.stairs = [];
            state.nextStairId = 1;
            state.floors.forEach(floor => {
                floor.slabOpenings = (floor.slabOpenings || []).filter(opening => opening.source !== 'stair');
            });
            setPlanTab('staircase');
            populateStairBuilder();
            document.getElementById('stairBayX').value = '1';
            document.getElementById('stairBayY').value = '0';
            document.getElementById('stairWidth').value = '900';
            document.getElementById('stairLanding').value = '900';
            document.getElementById('stairTread').value = '250';
            document.getElementById('stairGap').value = '100';
            refreshStairBuilderPreview();
            createStairFromBuilder();
            return { count: state.stairs.length, panel: currentPlanTab };
        })()`);
        await wait(150);
        await tab.evaluate(`(() => {
            const stair = state.stairs[0];
            const status = document.getElementById('stairBuilderStatus');
            if (stair && status) {
                status.textContent = stair.id + ' created. Opening reserved on ' + stair.toFloorId + ' ' + stair.opening.slabId + '.';
                status.classList.add('ready');
            }
            return true;
        })()`);
        await tab.screenshot(screenshotPath);
        await tab.evaluate(`(() => {
            setPlanTab('structural');
            setView('3d');
            return true;
        })()`);
        await wait(600);
        await tab.evaluate(`(() => {
            const stair = state.stairs[0];
            if (!stair || !camera3D || !controls3D) return false;
            const totalX = state.xSpans.reduce((sum, span) => sum + span, 0);
            const totalY = state.ySpans.reduce((sum, span) => sum + span, 0);
            const cx = (stair.bounds.x1 + stair.bounds.x2) / 2 - totalX / 2;
            const cz = (stair.bounds.y1 + stair.bounds.y2) / 2 - totalY / 2;
            const elevations = getExportStoryElevations(state.floors);
            const fromIndex = state.floors.findIndex(floor => floor.id === stair.fromFloorId);
            const targetY = (elevations[fromIndex + 1] + elevations[fromIndex + 2]) / 2;
            view3DDisplaySettings.categories.columns.opacity = 0.18;
            view3DDisplaySettings.categories.beams.opacity = 0.18;
            view3DDisplaySettings.categories.cantilevers.opacity = 0.18;
            view3DDisplaySettings.categories.slabs.opacity = 0.12;
            view3DDisplaySettings.categories.foundations.opacity = 0.1;
            view3DDisplaySettings.categories.stairs.color = '#0d9488';
            view3DDisplaySettings.categories.stairs.opacity = 1;
            render3DFrame();
            controls3D.target.set(cx, targetY, cz);
            camera3D.position.set(cx + 5.5, targetY + 3.5, cz + 5.5);
            camera3D.lookAt(cx, targetY, cz);
            controls3D.update();
            renderer3D.render(scene3D, camera3D);
            return true;
        })()`);
        await wait(150);
        await tab.screenshot(stair3DScreenshotPath);

        const columnSegmentTruth = await tab.evaluate(`(() => {
            const regularFixture = ${serializedRegular3FFixture};
            const terminatedFixture = ${serializedTerminated3FFixture};
            const originalAlert = window.alert;
            const originalConfirm = window.confirm;
            const originalOpen = window.open;
            window.alert = () => {};
            window.confirm = () => true;

            const loadFixture = (fixture, name) => {
                const validated = validateProjectData(cloneSerializable(fixture, {}));
                applyLoadedProject(validated, name, {
                    silent: true,
                    skipAutosave: true,
                    quarantineHiddenGeometry: false
                });
                calculate();
                refreshInputPanelsAfterStateRestore();
                draw();
            };
            const geometryCounts = () => {
                const geometry = collect3DFloorGeometry();
                return {
                    columnSegments: (state.floors || []).reduce((sum, floor) => sum +
                        (state.columns || []).filter(col => resolveColumnSegmentState(col, floor.id).active).length, 0),
                    beams: [...geometry.values()].reduce((sum, floor) => sum + (floor.beams || []).filter(beam => !beam.deleted).length, 0),
                    slabs: [...geometry.values()].reduce((sum, floor) => sum + (floor.slabs || []).filter(slab => !slab.deleted && !slab.isVoid && slab.active !== false).length, 0),
                    byFloor: Object.fromEntries((state.floors || []).map(floor => [floor.id, {
                        columns: (state.columns || []).filter(col => resolveColumnSegmentState(col, floor.id).active).length,
                        beams: (geometry.get(floor.id)?.beams || []).filter(beam => !beam.deleted).length,
                        slabs: (geometry.get(floor.id)?.slabs || []).filter(slab => !slab.deleted && !slab.isVoid && slab.active !== false).length
                    }]))
                };
            };
            const serializationAudit = payload => ({
                version: payload.version,
                schemaVersion: payload.schemaVersion,
                minimumAppVersion: payload.compatibility?.minimumAppVersion || '',
                migrationSourceSchemaVersion: payload.migrationMeta?.sourceSchemaVersion || '',
                migrationSourceFileVersion: payload.migrationMeta?.sourceFileVersion || '',
                migrationApplied: payload.migrationMeta?.migrationApplied === true,
                noLegacyColumnWrites: (payload.columnOverrides || []).every(column =>
                    !Object.prototype.hasOwnProperty.call(column, 'active') &&
                    !Object.prototype.hasOwnProperty.call(column, 'activePerFloor') &&
                    !Object.prototype.hasOwnProperty.call(column, 'floorActive')),
                noLegacyFloorDeletes: (payload.floors || []).every(floor =>
                    !Object.prototype.hasOwnProperty.call(floor, 'deletedColumns')),
                segmentOverrideCount: (payload.columnOverrides || []).reduce((sum, column) =>
                    sum + Object.keys(column.segmentOverrides || {}).length, 0)
            });
            const blockedExport = generator => {
                try {
                    generator();
                    return { blocked: false, message: '' };
                } catch (error) {
                    return { blocked: true, message: String(error?.message || error) };
                }
            };

            try {
                const resolverFloors = [{ id: 'GF' }, { id: '2F' }, { id: 'RF' }];
                const resolverAudit = {
                    explicitOverrideWins: EngineLoads.resolveColumnSegmentState({
                        id: 'QA',
                        active: false,
                        activePerFloor: { RF: false },
                        segmentOverrides: { RF: { active: true, intent: 'explicit_continue' } }
                    }, 'RF', resolverFloors),
                    conservativeLegacyFalse: EngineLoads.resolveColumnSegmentState({
                        id: 'QB',
                        activePerFloor: { RF: true },
                        floorActive: { RF: false }
                    }, 'RF', resolverFloors),
                    belowPlantedStart: EngineLoads.resolveColumnSegmentState({
                        id: 'PC-QA',
                        startFloor: '2F',
                        isPlanted: true
                    }, 'GF', resolverFloors)
                };
                const futureSchemaAudit = {};
                try {
                    validateProjectData({ ...cloneSerializable(regularFixture, {}), schemaVersion: '0.3.0' });
                    futureSchemaAudit.schemaRejected = false;
                    futureSchemaAudit.schemaMessage = '';
                } catch (error) {
                    futureSchemaAudit.schemaRejected = true;
                    futureSchemaAudit.schemaMessage = String(error?.message || error);
                }
                try {
                    validateProjectData({
                        ...cloneSerializable(regularFixture, {}),
                        schemaVersion: '0.2.0',
                        compatibility: { minimumAppVersion: '999.0.0' }
                    });
                    futureSchemaAudit.minimumAppRejected = false;
                    futureSchemaAudit.minimumAppMessage = '';
                } catch (error) {
                    futureSchemaAudit.minimumAppRejected = true;
                    futureSchemaAudit.minimumAppMessage = String(error?.message || error);
                }

                loadFixture(regularFixture, 'regular-v2.8-3floor-pre-p0c.fstr');
                const regularTopology = collectColumnTopologyValidation();
                const regularCounts = geometryCounts();
                const regularCSI = collectCSIExportModelData();
                const regularSTAADLength = generateSTAADContent().length;
                const regularETABSLength = generateETABSOAPIScript().length;
                const regularSaved = buildProjectData({ revisionId: 'qa-p0c-regular-1' });
                const regularSerialization = serializationAudit(regularSaved);
                loadFixture(regularSaved, 'qa-p0c-regular-roundtrip.fstr');
                const regularRoundTripCounts = geometryCounts();

                const a1BeforeReconcile = state.columns.find(column => column.id === 'A1');
                setColumnSegmentIntent(a1BeforeReconcile, 'RF', false, 'qa_reconciler_override');
                const qaHostBeam = collect3DFloorGeometry().get('GF')?.beams?.find(beam => beam.id === 'BX-1-1');
                const qaHostMidpoint = qaHostBeam
                    ? [(qaHostBeam.x1 + qaHostBeam.x2) / 2, (qaHostBeam.y1 + qaHostBeam.y2) / 2]
                    : [2, 0];
                state.columns.push({
                    id: 'PC-QA',
                    x: qaHostMidpoint[0],
                    y: qaHostMidpoint[1],
                    isPlanted: true,
                    isCustomPlaced: true,
                    isRegularGrid: false,
                    columnSource: 'planted',
                    startFloor: '2F',
                    sourceFloorId: 'GF',
                    hostMemberId: 'BX-1-1',
                    hostMemberType: 'beam',
                    supportType: 'beam',
                    supportStatus: 'load_transfer_pending',
                    segmentOverrides: {
                        '2F': { segmentId: 'PC-QA::2F', active: true, intent: 'planted_start' },
                        'RF': { segmentId: 'PC-QA::RF', active: true, intent: 'continuous' }
                    }
                });
                generateGrid();
                const reconciledA1 = state.columns.find(column => column.id === 'A1');
                const reconciledCustom = state.columns.find(column => column.id === 'PC-QA');
                const reconcilerAudit = {
                    regularCount: state.columns.filter(column => column.isRegularGrid !== false).length,
                    customCount: state.columns.filter(column => column.isRegularGrid === false).length,
                    inactiveOverridePreserved: !resolveColumnSegmentState(reconciledA1, 'RF').active,
                    customPreserved: !!reconciledCustom,
                    customPosition: reconciledCustom ? [reconciledCustom.x, reconciledCustom.y] : [],
                    hostMidpoint: qaHostMidpoint,
                    plantedGate: collectColumnTopologyValidation().items.find(item => item.columnId === 'PC-QA') || null
                };

                loadFixture(regularFixture, 'qa-p0c-termination-choice.fstr');
                state.currentFloorIndex = state.floors.findIndex(floor => floor.id === '2F');
                showColumnDeleteDialog('A1', '2F');
                const terminationPreview = cloneSerializable(window.lastColumnDependencyPreview, {});
                const deleteChoiceCount = document.querySelectorAll('input[name="columnIntentAction"]').length;
                selectColumnIntentAction('terminate_above');
                const terminationApplied = applySelectedColumnIntent();
                const terminationCounts = geometryCounts();
                const terminationSaved = buildProjectData({ revisionId: 'qa-p0c-termination-1' });
                loadFixture(terminationSaved, 'qa-p0c-termination-roundtrip.fstr');
                const terminationRoundTrip = {
                    at2F: resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), '2F'),
                    atRF: resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), 'RF')
                };
                addFloor();
                const insertedUpperFloor = state.floors.find(floor => floor.id === '3F');
                const terminationAfterFloorAdd = {
                    floorIds: state.floors.map(floor => floor.id),
                    insertedFloorId: insertedUpperFloor?.id || '',
                    insertedSegment: insertedUpperFloor
                        ? resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), insertedUpperFloor.id)
                        : null,
                    roofSegment: resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), 'RF')
                };

                loadFixture(regularFixture, 'qa-p0c-segment-choice.fstr');
                state.currentFloorIndex = state.floors.findIndex(floor => floor.id === '2F');
                showColumnDeleteDialog('A1', '2F');
                selectColumnIntentAction('remove_segment');
                const segmentApplied = applySelectedColumnIntent();
                const segmentTopology = collectColumnTopologyValidation();
                const segmentSaved = buildProjectData({ revisionId: 'qa-p0c-segment-1' });
                loadFixture(segmentSaved, 'qa-p0c-segment-roundtrip.fstr');
                const segmentRoundTripInactive = !resolveColumnSegmentState(
                    state.columns.find(column => column.id === 'A1'), '2F'
                ).active;

                loadFixture(regularFixture, 'qa-p0c-line-choice.fstr');
                state.currentFloorIndex = 0;
                showColumnDeleteDialog('A1', 'GF');
                selectColumnIntentAction('remove_line');
                const linePreview = cloneSerializable(window.lastColumnDependencyPreview, {});
                const lineApplied = applySelectedColumnIntent();
                const lineColumn = state.columns.find(column => column.id === 'A1');
                const lineAudit = {
                    allInactive: state.floors.every(floor => !resolveColumnSegmentState(lineColumn, floor.id).active),
                    governance: getColumnLineGovernance(lineColumn, collectColumnTopologyValidation()),
                    beamsRetained: geometryCounts().beams
                };

                const legacyOmittedFixture = cloneSerializable(regularFixture, {});
                const omittedFixtureColumn = legacyOmittedFixture.columnOverrides.find(column => column.id === 'A1');
                omittedFixtureColumn.active = true;
                omittedFixtureColumn.activePerFloor = { GF: false, '2F': false, RF: false };
                loadFixture(legacyOmittedFixture, 'qa-p0c-legacy-whole-line-omission.fstr');
                const omittedColumn = state.columns.find(column => column.id === 'A1');
                const omittedTopology = collectColumnTopologyValidation();
                const omittedGeometry = collect3DFloorGeometry();
                const omittedSupportStatuses = [...omittedGeometry.values()]
                    .flatMap(floorGeometry => floorGeometry.beams || [])
                    .filter(beam => beam.startCol === 'A1' || beam.endCol === 'A1')
                    .flatMap(beam => [beam.startSupportStatus, beam.endSupportStatus])
                    .filter(status => status === 'legacy_omitted_column_line');
                const omittedSTAADLength = generateSTAADContent().length;
                const omittedETABSLength = generateETABSOAPIScript().length;
                const omittedSaved = buildProjectData({ revisionId: 'qa-p0c-legacy-omission-1' });
                const omittedSerialization = serializationAudit(omittedSaved);
                loadFixture(omittedSaved, 'qa-p0c-legacy-whole-line-omission-roundtrip.fstr');
                const omittedRoundTrip = {
                    allInactive: state.floors.every(floor =>
                        !resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), floor.id).active),
                    intents: state.floors.map(floor =>
                        resolveColumnSegmentState(state.columns.find(column => column.id === 'A1'), floor.id).intent),
                    topology: collectColumnTopologyValidation().summary
                };

                loadFixture(terminatedFixture, 'terminated-v2.8-3floor-pre-p0c.fstr');
                const terminatedColumn = state.columns.find(column => column.id === 'A1');
                const terminatedCounts = geometryCounts();
                render3DFrame();
                const terminated3D = cloneSerializable(window.last3DModelDiagnostics, {});
                const terminatedTopology = collectColumnTopologyValidation();
                const terminatedCSI = collectCSIExportModelData();
                const terminatedSTAAD = blockedExport(() => generateSTAADContent());
                const terminatedETABS = blockedExport(() => generateETABSOAPIScript());
                const terminatedIFC = generateIFCContent(terminatedCSI);
                const terminatedIFCAudit = cloneSerializable(window.lastIFCExportAudit, {});
                const terminatedDXF = window.generateDXFContent();
                const terminatedDXFAudit = cloneSerializable(window.lastDXFExportAudit, {});
                populateColumnSchedule();
                const columnScheduleRows = document.querySelectorAll('#colScheduleBody tr').length;
                const a1ScheduleText = Array.from(document.querySelectorAll('#colScheduleBody tr'))
                    .find(row => row.textContent.includes('C-A1'))?.textContent.replace(/\\s+/g, ' ').trim() || '';
                let reportHtml = '';
                window.open = () => ({
                    document: { write: value => { reportHtml = String(value || ''); }, close: () => {} },
                    print: () => {}
                });
                generatePDFReport();
                window.open = originalOpen;
                const terminatedSaved = buildProjectData({ revisionId: 'qa-p0c-legacy-migrated-1' });
                const terminatedSerialization = serializationAudit(terminatedSaved);
                loadFixture(terminatedSaved, 'qa-p0c-legacy-migrated-roundtrip.fstr');
                const terminatedRoundTrip = resolveColumnSegmentState(
                    state.columns.find(column => column.id === 'A1'), 'RF'
                );

                return {
                    resolverAudit,
                    futureSchemaAudit,
                    regular: {
                        counts: regularCounts,
                        roundTripCounts: regularRoundTripCounts,
                        topology: regularTopology.summary,
                        csiCounts: regularCSI.counts,
                        staadLength: regularSTAADLength,
                        etabsLength: regularETABSLength,
                        serialization: regularSerialization
                    },
                    reconciler: reconcilerAudit,
                    choices: {
                        deleteChoiceCount,
                        terminationApplied,
                        terminationPreview,
                        terminationCounts,
                        terminationRoundTrip,
                        terminationAfterFloorAdd,
                        segmentApplied,
                        segmentBlocked: segmentTopology.summary.blocked,
                        segmentHasFloating: segmentTopology.items.some(item => item.code === 'floating_column_segment'),
                        segmentRoundTripInactive,
                        lineApplied,
                        linePreview,
                        lineAudit
                    },
                    legacyOmission: {
                        allInactive: state.floors.every(floor =>
                            !resolveColumnSegmentState(omittedColumn, floor.id).active),
                        intents: resolverFloors.map(floor =>
                            resolveColumnSegmentState(omittedColumn, floor.id).intent),
                        topology: omittedTopology.summary,
                        warningCodes: omittedTopology.items
                            .filter(item => item.status === 'WARNING')
                            .map(item => item.code),
                        supportStatusCount: omittedSupportStatuses.length,
                        staadLength: omittedSTAADLength,
                        etabsLength: omittedETABSLength,
                        serialization: omittedSerialization,
                        roundTrip: omittedRoundTrip
                    },
                    terminated: {
                        legacyFieldsRemoved: !terminatedColumn.activePerFloor && !terminatedColumn.floorActive &&
                            state.floors.every(floor => !(floor.deletedColumns || []).length),
                        rfSegment: resolveColumnSegmentState(terminatedColumn, 'RF'),
                        counts: terminatedCounts,
                        threeD: terminated3D.structuralCounts || {},
                        topology: terminatedTopology.summary,
                        topologyCodes: terminatedTopology.items.filter(item => item.status === 'BLOCKED').map(item => item.code),
                        csiCounts: terminatedCSI.counts,
                        csiTopology: terminatedCSI.topologyValidation,
                        staad: terminatedSTAAD,
                        etabs: terminatedETABS,
                        ifc: {
                            audit: terminatedIFCAudit,
                            hasSegmentMetadata: terminatedIFC.includes('FS_ColumnSegmentId'),
                            hasExportMetadata: terminatedIFC.includes('FS_ExportStatus'),
                            hasUnresolvedMetadata: terminatedIFC.includes('BLOCKED')
                        },
                        dxf: {
                            content: terminatedDXF,
                            audit: terminatedDXFAudit,
                            hasArialStyle: terminatedDXF.includes('arial.ttf'),
                            hasTerminationMarker: terminatedDXF.includes('1\\r\\nT\\r\\n'),
                            hasUnresolvedMarker: terminatedDXF.includes('1\\r\\n!\\r\\n')
                        },
                        schedule: { rows: columnScheduleRows, a1Text: a1ScheduleText },
                        report: {
                            hasArial: reportHtml.includes('font-family: Arial'),
                            hasLineId: reportHtml.includes('COL-LINE-A1'),
                            hasUnsupported: reportHtml.includes('Unsupported'),
                            hasSolverWarning: reportHtml.includes('block STAAD and ETABS export')
                        },
                        serialization: terminatedSerialization,
                        roundTrip: terminatedRoundTrip
                    }
                };
            } finally {
                window.alert = originalAlert;
                window.confirm = originalConfirm;
                window.open = originalOpen;
                hideColumnDeleteDialog();
            }
        })()`);
        columnSegmentTruth.terminated.dxf.parserAudit = validateDxfWithEzdxf(
            columnSegmentTruth.terminated.dxf.content,
            'p0-c1a-terminated-coordination'
        );
        delete columnSegmentTruth.terminated.dxf.content;

        assert(
            columnSegmentTruth.resolverAudit.explicitOverrideWins.active === true &&
            columnSegmentTruth.resolverAudit.explicitOverrideWins.source === 'segmentOverrides' &&
            columnSegmentTruth.resolverAudit.conservativeLegacyFalse.active === false &&
            columnSegmentTruth.resolverAudit.belowPlantedStart.active === false,
            'Canonical column-segment resolver precedence failed',
            columnSegmentTruth.resolverAudit
        );
        assert(
            columnSegmentTruth.futureSchemaAudit.schemaRejected &&
            /will not downgrade/i.test(columnSegmentTruth.futureSchemaAudit.schemaMessage) &&
            columnSegmentTruth.futureSchemaAudit.minimumAppRejected &&
            /was not opened or downgraded/i.test(columnSegmentTruth.futureSchemaAudit.minimumAppMessage),
            'Future schema or minimum-app compatibility guard failed',
            columnSegmentTruth.futureSchemaAudit
        );
        assert(
            columnSegmentTruth.regular.counts.columnSegments === 27 &&
            columnSegmentTruth.regular.counts.beams === 36 &&
            columnSegmentTruth.regular.counts.slabs === 12 &&
            columnSegmentTruth.regular.counts.byFloor.GF.columns === 9 &&
            columnSegmentTruth.regular.counts.byFloor['2F'].columns === 9 &&
            columnSegmentTruth.regular.counts.byFloor.RF.columns === 9 &&
            JSON.stringify(columnSegmentTruth.regular.counts) === JSON.stringify(columnSegmentTruth.regular.roundTripCounts) &&
            columnSegmentTruth.regular.topology.solverReady === true &&
            columnSegmentTruth.regular.csiCounts.columns === 27 &&
            columnSegmentTruth.regular.csiCounts.beams === 36 &&
            columnSegmentTruth.regular.csiCounts.slabs === 12 &&
            columnSegmentTruth.regular.staadLength > 1000 &&
            columnSegmentTruth.regular.etabsLength > 5000 &&
            columnSegmentTruth.regular.serialization.version === '2.9' &&
            columnSegmentTruth.regular.serialization.schemaVersion === '0.2.0' &&
            columnSegmentTruth.regular.serialization.minimumAppVersion === '3.16.119' &&
            columnSegmentTruth.regular.serialization.migrationSourceSchemaVersion === 'legacy-unversioned' &&
            columnSegmentTruth.regular.serialization.migrationSourceFileVersion === '2.8' &&
            columnSegmentTruth.regular.serialization.migrationApplied &&
            columnSegmentTruth.regular.serialization.noLegacyColumnWrites &&
            columnSegmentTruth.regular.serialization.noLegacyFloorDeletes,
            'Regular P0-C1A fixture changed geometry, solver readiness, or persistence truth',
            columnSegmentTruth.regular
        );
        assert(
            columnSegmentTruth.reconciler.regularCount === 9 &&
            columnSegmentTruth.reconciler.customCount === 1 &&
            columnSegmentTruth.reconciler.inactiveOverridePreserved &&
            columnSegmentTruth.reconciler.customPreserved &&
            JSON.stringify(columnSegmentTruth.reconciler.customPosition) === JSON.stringify(columnSegmentTruth.reconciler.hostMidpoint) &&
            columnSegmentTruth.reconciler.plantedGate?.code === 'planted_load_transfer_pending',
            'generateGrid did not reconcile persistent overrides and custom/planted columns',
            columnSegmentTruth.reconciler
        );
        assert(
            columnSegmentTruth.choices.deleteChoiceCount === 3 &&
            columnSegmentTruth.choices.terminationApplied &&
            columnSegmentTruth.choices.terminationPreview.affectedSegments.includes('A1::RF') &&
            columnSegmentTruth.choices.terminationPreview.dependentGeometryPolicy === 'preserve-and-mark-unresolved' &&
            columnSegmentTruth.choices.terminationCounts.beams === 36 &&
            columnSegmentTruth.choices.terminationRoundTrip.at2F.active === true &&
            columnSegmentTruth.choices.terminationRoundTrip.atRF.active === false &&
            columnSegmentTruth.choices.terminationAfterFloorAdd.insertedFloorId === '3F' &&
            columnSegmentTruth.choices.terminationAfterFloorAdd.insertedSegment?.active === false &&
            columnSegmentTruth.choices.terminationAfterFloorAdd.insertedSegment?.intent === 'terminated_above' &&
            columnSegmentTruth.choices.terminationAfterFloorAdd.roofSegment?.active === false &&
            columnSegmentTruth.choices.segmentApplied &&
            columnSegmentTruth.choices.segmentBlocked > 0 &&
            columnSegmentTruth.choices.segmentHasFloating &&
            columnSegmentTruth.choices.segmentRoundTripInactive &&
            columnSegmentTruth.choices.lineApplied &&
            columnSegmentTruth.choices.linePreview.foundationConnections.length > 0 &&
            columnSegmentTruth.choices.lineAudit.allInactive &&
            columnSegmentTruth.choices.lineAudit.governance.exportReadiness === 'NOT_EXPORTED' &&
            columnSegmentTruth.choices.lineAudit.beamsRetained === 36,
            'Column delete/termination choices, previews, retained dependencies, or persistence failed',
            columnSegmentTruth.choices
        );
        assert(
            columnSegmentTruth.legacyOmission.allInactive &&
            columnSegmentTruth.legacyOmission.intents.every(intent => intent === 'legacy_omitted_column_line') &&
            columnSegmentTruth.legacyOmission.topology.solverReady === true &&
            columnSegmentTruth.legacyOmission.topology.blocked === 0 &&
            columnSegmentTruth.legacyOmission.warningCodes.includes('legacy_omitted_column_line') &&
            columnSegmentTruth.legacyOmission.supportStatusCount > 0 &&
            columnSegmentTruth.legacyOmission.staadLength > 1000 &&
            columnSegmentTruth.legacyOmission.etabsLength > 5000 &&
            columnSegmentTruth.legacyOmission.serialization.schemaVersion === '0.2.0' &&
            columnSegmentTruth.legacyOmission.serialization.noLegacyColumnWrites &&
            columnSegmentTruth.legacyOmission.roundTrip.allInactive &&
            columnSegmentTruth.legacyOmission.roundTrip.intents.every(intent => intent === 'legacy_omitted_column_line') &&
            columnSegmentTruth.legacyOmission.roundTrip.topology.solverReady === true,
            'Legacy whole-column omission was converted into a new termination or solver blocker',
            columnSegmentTruth.legacyOmission
        );
        assert(
            columnSegmentTruth.terminated.legacyFieldsRemoved &&
            columnSegmentTruth.terminated.rfSegment.active === false &&
            columnSegmentTruth.terminated.rfSegment.source === 'segmentOverrides' &&
            columnSegmentTruth.terminated.counts.columnSegments === 26 &&
            columnSegmentTruth.terminated.counts.beams === 36 &&
            columnSegmentTruth.terminated.counts.slabs === 12 &&
            columnSegmentTruth.terminated.counts.byFloor.RF.columns === 8 &&
            columnSegmentTruth.terminated.counts.byFloor.RF.beams === 12 &&
            columnSegmentTruth.terminated.threeD.columns === 26 &&
            columnSegmentTruth.terminated.threeD.beams === 36 &&
            columnSegmentTruth.terminated.topology.solverReady === false &&
            columnSegmentTruth.terminated.topologyCodes.includes('unsupported_beam_endpoint') &&
            columnSegmentTruth.terminated.csiCounts.columns === 26 &&
            columnSegmentTruth.terminated.csiCounts.beams === 36 &&
            columnSegmentTruth.terminated.staad.blocked && /blocked/i.test(columnSegmentTruth.terminated.staad.message) &&
            columnSegmentTruth.terminated.etabs.blocked && /blocked/i.test(columnSegmentTruth.terminated.etabs.message) &&
            columnSegmentTruth.terminated.ifc.hasSegmentMetadata &&
            columnSegmentTruth.terminated.ifc.hasExportMetadata &&
            columnSegmentTruth.terminated.ifc.hasUnresolvedMetadata &&
            columnSegmentTruth.terminated.ifc.audit.counts.columns === 26 &&
            columnSegmentTruth.terminated.ifc.audit.counts.beams === 36 &&
            columnSegmentTruth.terminated.dxf.audit.columnTopology.solverReady === false &&
            columnSegmentTruth.terminated.dxf.hasArialStyle &&
            columnSegmentTruth.terminated.dxf.hasTerminationMarker &&
            columnSegmentTruth.terminated.dxf.hasUnresolvedMarker &&
            columnSegmentTruth.terminated.dxf.parserAudit.ok === true &&
            columnSegmentTruth.terminated.schedule.rows === 9 &&
            /Terminates at 2F/.test(columnSegmentTruth.terminated.schedule.a1Text) &&
            /Unsupported/.test(columnSegmentTruth.terminated.schedule.a1Text) &&
            columnSegmentTruth.terminated.report.hasArial &&
            columnSegmentTruth.terminated.report.hasLineId &&
            columnSegmentTruth.terminated.report.hasUnsupported &&
            columnSegmentTruth.terminated.report.hasSolverWarning &&
            columnSegmentTruth.terminated.serialization.schemaVersion === '0.2.0' &&
            columnSegmentTruth.terminated.serialization.noLegacyColumnWrites &&
            columnSegmentTruth.terminated.serialization.noLegacyFloorDeletes &&
            columnSegmentTruth.terminated.serialization.segmentOverrideCount > 0 &&
            columnSegmentTruth.terminated.roundTrip.active === false &&
            columnSegmentTruth.terminated.roundTrip.source === 'segmentOverrides',
            'Terminated legacy fixture failed plan/3D/schedule/report/DXF/IFC parity or solver gating',
            columnSegmentTruth.terminated
        );

        const verticalDatumFoundation = await tab.evaluate(`(() => {
            const fixture = ${serializedVerticalDatumFixture};
            const project = fixture.project;
            state.xSpans = [4, 4];
            state.ySpans = [5, 5];
            state.cantilevers = {
                top: [0, 0],
                bottom: [0, 0],
                left: [0, 0],
                right: [0, 0]
            };
            state.floors = fixture.floors.map(floor => createFloor(
                floor.id,
                floor.name,
                state.xSpans.length,
                state.ySpans.length,
                {
                    height: floor.height,
                    storeyHeight: floor.storeyHeight,
                    elevation: floor.elevation,
                    elevationMode: floor.elevationMode,
                    isRoof: floor.isRoof,
                    dlSuper: floor.isRoof ? 1.5 : 2,
                    liveLoad: floor.isRoof ? 1 : 2,
                    slabThickness: floor.isRoof ? 120 : 150,
                    wallLoad: floor.isRoof ? 0 : 6
                }
            ));
            state.currentFloorIndex = 0;
            state.gfSuspended = true;
            state.gradeElevation = project.gradeElevation;
            state.groundFloorElevation = project.groundFloorElevation;
            state.baseSupportElevation = project.baseSupportElevation;
            state.footingDepth = project.footingDepth;
            state.nominalFootingThickness = project.nominalFootingThickness;
            state.footingElevationMode = project.footingElevationMode;
            state.verticalDatums = { ...project };
            state.foundationMode = 'plan';
            state.columns = [];
            state.beams = [];
            state.slabs = [];
            state.stairs = [];
            state.nextStairId = 1;
            state.beamSizeOverrides = {};
            state.beamAlignmentOverrides = {};
            state.columnPositionOverrides = {};
            state.foundationTieBeamAlignmentOverrides = {};
            state.columnPositionLocked = false;
            currentProjectId = 'qa-fs123-raised-gf';
            currentProjectRevisionId = 'qa-fs123-raised-gf-r1';
            calculate();
            const beforeSave = getVerticalDatumContract();
            const saved = buildProjectData({ revisionId: currentProjectRevisionId });

            applyLoadedProject(saved, 'qa-fs123-raised-gf.fstr', {
                silent: true,
                skipAutosave: true,
                quarantineHiddenGeometry: true
            });
            calculate();
            const afterReload = getVerticalDatumContract();
            if (!view3DInitialized && typeof init3D === 'function') init3D();
            render3DFrame();
            const threeD = cloneSerializable(window.last3DModelDiagnostics, {});
            const gfColumnMesh = meshes3D.find(mesh =>
                mesh?.userData?.type === 'column' && mesh.userData.floorId === 'GF'
            );
            const footingMesh = meshes3D.find(mesh => mesh?.userData?.type === 'footing');
            const pedestalMesh = meshes3D.find(mesh => mesh?.userData?.type === 'pedestal');
            const tieBeamMesh = meshes3D.find(mesh => mesh?.userData?.type === 'tieBeam');

            const model = collectCSIExportModelData();
            const staad = generateSTAADContent(model);
            const etabs = generateETABSOAPIScript(model);
            const marker = "FromBase64String('";
            const encodedStart = etabs.indexOf(marker);
            const encodedEnd = encodedStart >= 0
                ? etabs.indexOf("')", encodedStart + marker.length)
                : -1;
            const encodedModel = encodedStart >= 0 && encodedEnd > encodedStart
                ? etabs.slice(encodedStart + marker.length, encodedEnd)
                : '';
            const etabsModel = encodedModel
                ? JSON.parse(new TextDecoder().decode(Uint8Array.from(
                    atob(encodedModel),
                    character => character.charCodeAt(0)
                )))
                : null;
            const ifc = generateIFCContent(model);
            window.__fsQaVerticalDatumIFC = ifc;
            const ifcAudit = cloneSerializable(window.lastIFCExportAudit, {});
            const dxf = generateDXFContent();

            let reportHtml = '';
            const originalOpen = window.open;
            window.open = () => ({
                document: {
                    write: html => { reportHtml += String(html); },
                    close: () => {}
                },
                print: () => {}
            });
            try {
                generatePDFReport();
            } finally {
                window.open = originalOpen;
            }

            setView('3d');
            return {
                fixtureId: fixture.fixtureId,
                beforeSave: cloneSerializable(beforeSave, {}),
                saved: {
                    gradeElevation: saved.gradeElevation,
                    groundFloorElevation: saved.groundFloorElevation,
                    baseSupportElevation: saved.baseSupportElevation,
                    footingDepth: saved.footingDepth,
                    verticalDatums: saved.verticalDatums,
                    floors: saved.floors.map(floor => ({
                        id: floor.id,
                        elevation: floor.elevation,
                        storeyHeight: floor.storeyHeight,
                        elevationMode: floor.elevationMode
                    }))
                },
                afterReload: cloneSerializable(afterReload, {}),
                threeD: {
                    diagnostics: threeD,
                    gfColumn: cloneSerializable(gfColumnMesh?.userData?.member, null),
                    footing: cloneSerializable(footingMesh?.userData?.member, null),
                    pedestal: cloneSerializable(pedestalMesh?.userData?.member, null),
                    tieBeam: cloneSerializable(tieBeamMesh?.userData?.member, null)
                },
                model: {
                    levels: cloneSerializable(model.levels, []),
                    verticalDatums: cloneSerializable(model.verticalDatums, {}),
                    counts: cloneSerializable(model.counts, {}),
                    firstGFColumn: cloneSerializable(
                        model.columns.find(column => column.floorId === 'GF'),
                        null
                    ),
                    firstFooting: cloneSerializable(model.foundation?.footings?.[0], null),
                    firstPedestal: cloneSerializable(model.foundation?.pedestals?.[0], null),
                    firstTieBeam: cloneSerializable(model.foundation?.tieBeams?.[0], null)
                },
                exports: {
                    staadHasBaseJoint: staad.includes(
                        ' ' + fixture.expected.baseSupportElevation.toFixed(6) + ' '
                    ),
                    etabsDecoded: !!etabsModel,
                    etabsVerticalDatums: cloneSerializable(etabsModel?.verticalDatums, null),
                    etabsLevels: cloneSerializable(etabsModel?.levels, []),
                    etabsUsesGovernedBase: etabs.includes('$model.verticalDatums.baseSupportElevation'),
                    ifcAudit,
                    ifcHasFoundationTypes:
                        ifc.includes('IFCFOOTING(') &&
                        ifc.includes("'Pedestal'") &&
                        ifc.includes("'Foundation Tie Beam'"),
                    ifcHasObjectMetadata:
                        ifc.includes("'FS_SupportedColumnId'") &&
                        ifc.includes("'FS_ProjectId'") &&
                        ifc.includes("'FS_RevisionId'") &&
                        ifc.includes("'FS_BuildId'"),
                    dxfHasDatums:
                        dxf.includes(
                            fixture.expected.gradeElevation.toFixed(3) + ' / ' +
                            fixture.expected.baseSupportElevation.toFixed(3) + ' m'
                        ) &&
                        dxf.includes(fixture.expected.groundFloorElevation.toFixed(3) + ' m') &&
                        dxf.includes('GF ' + fixture.expected.floorLevels.GF.toFixed(3)) &&
                        dxf.includes('2F ' + fixture.expected.floorLevels['2F'].toFixed(3)) &&
                        dxf.includes('RF ' + fixture.expected.floorLevels.RF.toFixed(3)),
                    reportHasDatums:
                        reportHtml.includes(fixture.expected.gradeElevation.toFixed(3) + ' m') &&
                        reportHtml.includes(fixture.expected.baseSupportElevation.toFixed(3) + ' m') &&
                        reportHtml.includes(fixture.expected.groundFloorElevation.toFixed(3) + ' m') &&
                        reportHtml.includes(
                            'GF ' + fixture.expected.floorLevels.GF.toFixed(3) +
                            ' m; 2F ' + fixture.expected.floorLevels['2F'].toFixed(3) +
                            ' m; RF ' + fixture.expected.floorLevels.RF.toFixed(3) + ' m'
                        )
                }
            };
        })()`);
        await wait(250);
        await tab.screenshot(verticalDatum3DScreenshotPath);
        const verticalDatumIFC = await tab.evaluate('window.__fsQaVerticalDatumIFC || ""');
        const expectedVerticalLevels = Object.entries(
            JSON.parse(serializedVerticalDatumFixture).expected.floorLevels
        ).map(([name, elevation]) => ({ name, elevation }));
        expectedVerticalLevels.unshift({
            name: 'BASE/FOUNDATION',
            elevation: JSON.parse(serializedVerticalDatumFixture).expected.baseSupportElevation
        });
        const verticalDatumIfcParser = validateIfcWithIfcOpenShell(
            verticalDatumIFC,
            'fs123-raised-gf-foundation',
            { expectedLevels: expectedVerticalLevels, exactLevelSet: true }
        );
        verticalDatumFoundation.exports.ifcParser = verticalDatumIfcParser;
        await tab.evaluate('window.__fsQaVerticalDatumIFC = ""');

        const verticalFixture = JSON.parse(serializedVerticalDatumFixture);
        const expectedVertical = verticalFixture.expected;
        const closeVertical = (actual, expected) =>
            Math.abs(Number(actual) - Number(expected)) <= 1e-6;
        assert(
            verticalDatumFoundation.fixtureId === verticalFixture.fixtureId &&
            verticalDatumFoundation.beforeSave.valid &&
            verticalDatumFoundation.afterReload.valid &&
            closeVertical(verticalDatumFoundation.afterReload.gradeElevation, expectedVertical.gradeElevation) &&
            closeVertical(verticalDatumFoundation.afterReload.groundFloorElevation, expectedVertical.groundFloorElevation) &&
            closeVertical(verticalDatumFoundation.afterReload.baseSupportElevation, expectedVertical.baseSupportElevation) &&
            closeVertical(verticalDatumFoundation.afterReload.footingBottomElevation, expectedVertical.footingBottomElevation) &&
            closeVertical(verticalDatumFoundation.afterReload.footingTopElevation, expectedVertical.footingTopElevation) &&
            Object.entries(expectedVertical.floorLevels).every(([floorId, elevation]) =>
                closeVertical(
                    verticalDatumFoundation.afterReload.floorLevels.find(level => level.id === floorId)?.elevation,
                    elevation
                )
            ),
            'Raised-GF vertical datum contract did not survive save/load',
            verticalDatumFoundation
        );
        assert(
            closeVertical(verticalDatumFoundation.threeD.gfColumn?.bottomElevation, expectedVertical.baseSupportElevation) &&
            closeVertical(verticalDatumFoundation.threeD.gfColumn?.topElevation, expectedVertical.groundFloorElevation) &&
            closeVertical(verticalDatumFoundation.threeD.footing?.bottomElevation, expectedVertical.footingBottomElevation) &&
            closeVertical(verticalDatumFoundation.threeD.footing?.topElevation, expectedVertical.footingTopElevation) &&
            closeVertical(verticalDatumFoundation.threeD.pedestal?.bottomElevation, expectedVertical.footingTopElevation) &&
            closeVertical(verticalDatumFoundation.threeD.pedestal?.topElevation, expectedVertical.baseSupportElevation) &&
            closeVertical(verticalDatumFoundation.threeD.tieBeam?.bottomElevation, expectedVertical.footingTopElevation) &&
            verticalDatumFoundation.threeD.diagnostics.beamSlabTopAligned === true &&
            verticalDatumFoundation.threeD.diagnostics.foundationCenterlineMaxDeltaM < 1e-9,
            '3D columns, slabs, footings, pedestals, or tie beams do not use the governed datums',
            verticalDatumFoundation.threeD
        );
        assert(
            Object.entries(expectedVertical.counts).every(([name, count]) =>
                verticalDatumFoundation.model.counts[name] === count
            ) &&
            closeVertical(verticalDatumFoundation.model.firstGFColumn?.z1, expectedVertical.baseSupportElevation) &&
            closeVertical(verticalDatumFoundation.model.firstGFColumn?.z2, expectedVertical.groundFloorElevation) &&
            closeVertical(verticalDatumFoundation.model.firstFooting?.bottomElevation, expectedVertical.footingBottomElevation) &&
            closeVertical(verticalDatumFoundation.model.firstFooting?.topElevation, expectedVertical.footingTopElevation) &&
            closeVertical(verticalDatumFoundation.model.firstPedestal?.topElevation, expectedVertical.baseSupportElevation) &&
            closeVertical(verticalDatumFoundation.model.firstTieBeam?.bottomElevation, expectedVertical.footingTopElevation),
            'Shared export model or foundation counts diverged from the frozen datum fixture',
            verticalDatumFoundation.model
        );
        assert(
            verticalDatumFoundation.exports.staadHasBaseJoint &&
            verticalDatumFoundation.exports.etabsDecoded &&
            verticalDatumFoundation.exports.etabsUsesGovernedBase &&
            closeVertical(
                verticalDatumFoundation.exports.etabsVerticalDatums?.baseSupportElevation,
                expectedVertical.baseSupportElevation
            ) &&
            verticalDatumFoundation.exports.ifcHasFoundationTypes &&
            verticalDatumFoundation.exports.ifcHasObjectMetadata &&
            verticalDatumFoundation.exports.dxfHasDatums &&
            verticalDatumFoundation.exports.reportHasDatums &&
            verticalDatumFoundation.exports.ifcParser.ok === true &&
            verticalDatumFoundation.exports.ifcParser.schemaValidationStatements === 0 &&
            Object.entries(expectedVertical.counts).every(([name, count]) =>
                name === 'stories'
                    ? verticalDatumFoundation.exports.ifcParser.counts.storeys === expectedVertical.counts.levels
                    : name === 'levels'
                        ? verticalDatumFoundation.exports.ifcParser.counts.storeys === count
                        : ['columns', 'beams', 'slabs', 'footings', 'pedestals', 'tieBeams'].includes(name)
                            ? verticalDatumFoundation.exports.ifcParser.counts[name] === count
                            : true
            ),
            'STAAD, ETABS, IFC, DXF, or report datum parity failed',
            verticalDatumFoundation.exports
        );

        let fs123AcceptanceArtifacts = null;
        if (fs123OutputDir) {
            const resolvedOutputDir = path.resolve(fs123OutputDir);
            const dateStamp = new Date().toISOString().slice(0, 10);
            const artifactStem = `FS123_RaisedGF_Foundation_${dateStamp}`;
            const ifcArtifactPath = path.join(resolvedOutputDir, `${artifactStem}.ifc`);
            const screenshotArtifactPath = path.join(resolvedOutputDir, `${artifactStem}_3D.png`);
            const evidenceArtifactPath = path.join(resolvedOutputDir, `${artifactStem}_evidence.json`);
            fs.mkdirSync(resolvedOutputDir, { recursive: true });
            fs.writeFileSync(ifcArtifactPath, verticalDatumIFC, 'utf8');
            fs.copyFileSync(verticalDatum3DScreenshotPath, screenshotArtifactPath);
            const evidence = {
                acceptanceId: 'FS-IFC-LEVELS-001',
                generatedAt: new Date().toISOString(),
                fixturePath: VERTICAL_DATUM_FOUNDATION_BASELINE,
                fixtureSha256: sha256File(VERTICAL_DATUM_FOUNDATION_BASELINE),
                ifcPath: ifcArtifactPath,
                ifcSha256: sha256File(ifcArtifactPath),
                screenshotPath: screenshotArtifactPath,
                screenshotSha256: sha256File(screenshotArtifactPath),
                expected: verticalFixture.expected,
                result: verticalDatumFoundation
            };
            fs.writeFileSync(evidenceArtifactPath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
            fs123AcceptanceArtifacts = {
                outputDir: resolvedOutputDir,
                ifcPath: ifcArtifactPath,
                ifcSha256: evidence.ifcSha256,
                screenshotPath: screenshotArtifactPath,
                screenshotSha256: evidence.screenshotSha256,
                evidencePath: evidenceArtifactPath,
                evidenceSha256: sha256File(evidenceArtifactPath)
            };
        }

        const relevantLogs = tab.logs.filter(log => ['error', 'warning', 'exception'].includes(log.type));
        return {
            result,
            dxfParserAudit,
            beforeReloadAutosave,
            afterReload,
            revisionProtection,
            columnSegmentTruth,
            verticalDatumFoundation,
            screenshotPath,
            stair3DScreenshotPath,
            revisionScreenshotPath,
            verticalDatum3DScreenshotPath,
            fs123AcceptanceArtifacts,
            relevantLogs
        };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function writeCanonicalSolverArtifacts(etabsScriptPath = null, staadPath = null, modelPath = null) {
    if (!etabsScriptPath && !staadPath && !modelPath) return null;
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    try {
        const payload = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            localStorage.removeItem('FutolStructure.autosave.healthy.v1');
            localStorage.removeItem('FutolStructure.autosave.quarantine.v1');
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
            const model = collectCSIExportModelData();
            return {
                model,
                etabs: generateETABSOAPIScript(model),
                staad: generateSTAADContent(model)
            };
        })()`);
        const paths = {};
        if (etabsScriptPath) {
            const resolvedPath = path.resolve(etabsScriptPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.etabs, 'utf8');
            paths.etabsScriptPath = resolvedPath;
        }
        if (staadPath) {
            const resolvedPath = path.resolve(staadPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.staad, 'utf8');
            paths.staadPath = resolvedPath;
        }
        if (modelPath) {
            const resolvedPath = path.resolve(modelPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, JSON.stringify(payload.model, null, 2) + '\n', 'utf8');
            paths.modelPath = resolvedPath;
        }
        return {
            ...paths,
            counts: payload.model.counts,
            levels: payload.model.levels.map(level => ({ id: level.id, elevation: level.elevation })),
            uniqueAnalyticalJoints: new Set(
                payload.model.columns.flatMap(column => [
                    [column.x, column.y, column.z1],
                    [column.x, column.y, column.z2]
                ]).map(point => point.map(value => Number(value).toFixed(6)).join('|'))
            ).size,
            etabsBytes: Buffer.byteLength(payload.etabs, 'utf8'),
            staadBytes: Buffer.byteLength(payload.staad, 'utf8')
        };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function writeEdgeCantileverSolverArtifacts(etabsScriptPath = null, staadPath = null, modelPath = null) {
    if (!etabsScriptPath && !staadPath && !modelPath) return null;
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    try {
        const payload = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            localStorage.removeItem('FutolStructure.autosave.healthy.v1');
            localStorage.removeItem('FutolStructure.autosave.quarantine.v1');
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
            undoHistory.length = 0;
            redoHistory.length = 0;
            calculate();
            refreshInputPanelsAfterStateRestore();
            const model = collectCSIExportModelData();
            const edgeBeams = model.beams.filter(beam => beam.type === 'cantilever_edge');
            const sideBeams = model.beams.filter(beam => beam.type === 'cantilever');
            const samePoint = (a, b) => Math.abs(Number(a?.x) - Number(b?.x)) <= 0.001 &&
                Math.abs(Number(a?.y) - Number(b?.y)) <= 0.001;
            const endpointChecks = edgeBeams.map(edgeBeam => {
                const side = sideBeams.filter(candidate => candidate.floorId === edgeBeam.floorId);
                const rawBeams = typeof state !== 'undefined' && Array.isArray(state.beams) ? state.beams : [];
                const rawBeam = rawBeams.find(candidate =>
                    candidate.id === edgeBeam.sourceId ||
                    candidate.id === edgeBeam.id ||
                    candidate.sourceId === edgeBeam.sourceId
                ) || null;
                const rawStart = rawBeam?.terminationStartBeamId || null;
                const rawEnd = rawBeam?.terminationEndBeamId || null;
                const rawStartBeam = rawStart
                    ? rawBeams.find(candidate => candidate.id === rawStart || candidate.sourceId === rawStart)
                    : null;
                const rawEndBeam = rawEnd
                    ? rawBeams.find(candidate => candidate.id === rawEnd || candidate.sourceId === rawEnd)
                    : null;
                const start = { x: edgeBeam.x1, y: edgeBeam.y1 };
                const end = { x: edgeBeam.x2, y: edgeBeam.y2 };
                const startConnected = side.some(candidate =>
                    samePoint(start, { x: candidate.x1, y: candidate.y1 }) ||
                    samePoint(start, { x: candidate.x2, y: candidate.y2 })
                );
                const endConnected = side.some(candidate =>
                    samePoint(end, { x: candidate.x1, y: candidate.y1 }) ||
                    samePoint(end, { x: candidate.x2, y: candidate.y2 })
                );
                const startOffset = edgeBeam.jointOffsets?.sharedSolverPlan?.start || {};
                const endOffset = edgeBeam.jointOffsets?.sharedSolverPlan?.end || {};
                return {
                    id: edgeBeam.id,
                    floorId: edgeBeam.floorId,
                    terminationStartBeamId: rawStart,
                    terminationEndBeamId: rawEnd,
                    resolvedStartBeam: rawStartBeam ? {
                        id: rawStartBeam.id,
                        sourceId: rawStartBeam.sourceId || null,
                        x1: rawStartBeam.x1,
                        y1: rawStartBeam.y1,
                        x2: rawStartBeam.x2,
                        y2: rawStartBeam.y2
                    } : null,
                    resolvedEndBeam: rawEndBeam ? {
                        id: rawEndBeam.id,
                        sourceId: rawEndBeam.sourceId || null,
                        x1: rawEndBeam.x1,
                        y1: rawEndBeam.y1,
                        x2: rawEndBeam.x2,
                        y2: rawEndBeam.y2
                    } : null,
                    startConnected,
                    endConnected,
                    faceTerminated: edgeBeam.physicalPlanAxis && edgeBeam.drawingAxis,
                    startOffset: { dx: Number(startOffset.dx) || 0, dy: Number(startOffset.dy) || 0 },
                    endOffset: { dx: Number(endOffset.dx) || 0, dy: Number(endOffset.dy) || 0 },
                    analyticalCardinalPoint: Number(edgeBeam.analyticalCardinalPoint),
                    analyticalAxis: edgeBeam.analyticalPlanAxis,
                    physicalAxis: edgeBeam.physicalPlanAxis,
                    drawingAxis: edgeBeam.drawingAxis
                };
            });
            return {
                model,
                etabs: generateETABSOAPIScript(model),
                staad: generateSTAADContent(model),
                edgeAcceptance: {
                    edgeBeamCount: edgeBeams.length,
                    sideBeamCount: sideBeams.length,
                    endpointChecks,
                    allEndpointsConnected: endpointChecks.length > 0 && endpointChecks.every(item => item.startConnected && item.endConnected),
                    allHaveOffsets: endpointChecks.length > 0 && endpointChecks.every(item =>
                        Math.abs(item.startOffset.dx) + Math.abs(item.startOffset.dy) +
                        Math.abs(item.endOffset.dx) + Math.abs(item.endOffset.dy) > 0.000001
                    ),
                    allTopCenter: endpointChecks.length > 0 && endpointChecks.every(item => item.analyticalCardinalPoint === 8)
                }
            };
        })()`);
        const paths = {};
        if (etabsScriptPath) {
            const resolvedPath = path.resolve(etabsScriptPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.etabs, 'utf8');
            paths.etabsScriptPath = resolvedPath;
        }
        if (staadPath) {
            const resolvedPath = path.resolve(staadPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.staad, 'utf8');
            paths.staadPath = resolvedPath;
        }
        if (modelPath) {
            const resolvedPath = path.resolve(modelPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, JSON.stringify({ ...payload.model, edgeAcceptance: payload.edgeAcceptance }, null, 2) + '\n', 'utf8');
            paths.modelPath = resolvedPath;
        }
        return {
            ...paths,
            counts: payload.model.counts,
            levels: payload.model.levels.map(level => ({ id: level.id, elevation: level.elevation })),
            edgeAcceptance: payload.edgeAcceptance,
            etabsBytes: Buffer.byteLength(payload.etabs, 'utf8'),
            staadBytes: Buffer.byteLength(payload.staad, 'utf8')
        };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function writeWallSolverArtifacts(etabsScriptPath = null, staadPath = null, modelPath = null) {
    if (!etabsScriptPath && !staadPath && !modelPath) return null;
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    try {
        const payload = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            localStorage.removeItem('FutolStructure.autosave.healthy.v1');
            localStorage.removeItem('FutolStructure.autosave.quarantine.v1');
            state.xSpans = [4, 4];
            state.ySpans = [3, 3];
            state.cantilevers = { top: [0, 0], bottom: [0, 0], left: [0, 0], right: [0, 0] };
            state.floors = [
                createFloor('2F', '2nd Floor', 2, 2, { wallLoad: 0 }),
                createFloor('RF', 'Roof', 2, 2, { isRoof: true, wallLoad: 0, slabThickness: 120 })
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
            const wall = {
                id: 'W-2F-BEAM-1',
                floorId: '2F',
                type: 'external',
                supportMode: 'on_beam',
                x1: 0.3,
                y1: 0.125,
                x2: 3.85,
                y2: 0.125,
                heightM: 3,
                thicknessMm: 150,
                plasterInsideMm: 20,
                plasterOutsideMm: 20,
                alignmentMode: 'flush-exterior',
                exportToSolvers: true,
                openings: [{ id: 'OPEN-W-2F-BEAM-1', type: 'door', widthM: 0.9, heightM: 2.1, count: 1 }],
                lintel: { id: 'L-W-2F-BEAM-1', widthMm: 150, depthMm: 200, designStatus: 'preliminary' },
                startSnap: { mode: 'beam', targetId: 'BEAM-BX-1-1-START', toleranceM: 0.45 },
                endSnap: { mode: 'beam', targetId: 'BEAM-BX-1-1-END', toleranceM: 0.45 }
            };
            state.floors[0].wallLoads = [wall];
            calculate();
            refreshInputPanelsAfterStateRestore();
            const model = collectCSIExportModelData();
            const explicitAssignments = model.wallSolverAssignments.filter(item => item.status === 'RESOLVED');
            const explicitBeams = model.beams.filter(beam => beam.wallLoadSource === 'explicit-wall-line');
            return {
                model,
                etabs: generateETABSOAPIScript(model),
                staad: generateSTAADContent(model),
                wallAcceptance: {
                    wallCount: model.wallInventory.walls.length,
                    optedInWallCount: model.wallInventory.solverWalls.length,
                    resolvedAssignmentCount: explicitAssignments.length,
                    unresolvedAssignmentCount: model.wallSolverAssignments.filter(item => item.status !== 'RESOLVED').length,
                    explicitBeamCount: explicitBeams.length,
                    explicitLineLoadKNm: explicitAssignments.reduce((sum, item) => sum + Number(item.lineLoadKNm || 0), 0),
                    eccentricityM: Number(explicitAssignments[0]?.eccentricityM || 0),
                    alignmentMode: explicitAssignments[0]?.alignmentMode || 'center',
                    wallPlacement: explicitAssignments[0]?.wallPlacement || null,
                    assignment: explicitAssignments[0] || null,
                    beamProbe: model.beams.filter(beam => beam.floorId === '2F').slice(0, 6).map(beam => ({
                        id: beam.id,
                        sourceId: beam.sourceId,
                        physicalPlanAxis: beam.physicalPlanAxis,
                        analyticalPlanAxis: beam.analyticalPlanAxis,
                        wallLoad: beam.wallLoad
                    })),
                    beam: explicitBeams[0] ? {
                        id: explicitBeams[0].id,
                        sourceId: explicitBeams[0].sourceId,
                        wallLoad: explicitBeams[0].wallLoad,
                        wallLoadSource: explicitBeams[0].wallLoadSource,
                        wallLoadAssignments: explicitBeams[0].wallLoadAssignments
                    } : null,
                    etabsHasWallLoad: generateETABSOAPIScript(model).includes('FS_WALL'),
                    staadHasWallLoad: generateSTAADContent(model).includes('MEMBER LOAD') && generateSTAADContent(model).includes('UNI GY')
                }
            };
        })()`);
        const paths = {};
        if (etabsScriptPath) {
            const resolvedPath = path.resolve(etabsScriptPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.etabs, 'utf8');
            paths.etabsScriptPath = resolvedPath;
        }
        if (staadPath) {
            const resolvedPath = path.resolve(staadPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, payload.staad, 'utf8');
            paths.staadPath = resolvedPath;
        }
        if (modelPath) {
            const resolvedPath = path.resolve(modelPath);
            fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
            fs.writeFileSync(resolvedPath, JSON.stringify({ ...payload.model, wallAcceptance: payload.wallAcceptance }, null, 2) + '\n', 'utf8');
            paths.modelPath = resolvedPath;
        }
        assert(payload.wallAcceptance.wallCount === 1 &&
            payload.wallAcceptance.optedInWallCount === 1 &&
            payload.wallAcceptance.resolvedAssignmentCount === 1 &&
            payload.wallAcceptance.unresolvedAssignmentCount === 0 &&
            payload.wallAcceptance.explicitBeamCount === 1 &&
            payload.wallAcceptance.explicitLineLoadKNm > 0 &&
            payload.wallAcceptance.alignmentMode === 'flush-exterior' &&
            payload.wallAcceptance.eccentricityM > 0 &&
            payload.wallAcceptance.etabsHasWallLoad &&
            payload.wallAcceptance.staadHasWallLoad,
        'Wall solver transfer fixture did not resolve an opted-in wall to a beam', payload.wallAcceptance);
        return {
            ...paths,
            counts: payload.model.counts,
            wallAcceptance: payload.wallAcceptance,
            etabsBytes: Buffer.byteLength(payload.etabs, 'utf8'),
            staadBytes: Buffer.byteLength(payload.staad, 'utf8')
        };
    } finally {
        tab.close();
        if (browser.process && !KEEP_BROWSER) {
            try { browser.process.kill(); } catch (err) { /* noop */ }
        }
    }
}

async function runProjectSmoke(projectPath, etabsScriptPath = null, staadPath = null, ifcPath = null, dxfPath = null) {
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
    const viewportSuffix = getArgValue('--viewport-width') && getArgValue('--viewport-height')
        ? `-${getArgValue('--viewport-width')}x${getArgValue('--viewport-height')}`
        : '';
    const screenshotPath = path.join(os.tmpdir(), `futolstructure-project-${path.basename(projectName, path.extname(projectName)).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}${viewportSuffix}.png`);

    try {
        const serializedProject = JSON.stringify(projectData);
        const serializedName = JSON.stringify(projectName);
        const result = await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            window.FS_ENABLE_3D_PIXEL_AUDIT = true;
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
                    const segmentOverride = override.segmentOverrides && override.segmentOverrides[floorId];
                    if (segmentOverride && segmentOverride.active === false) return false;
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
                edgeBeamDefaults: getFloorEdgeBeamDefaults(floor.id),
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
            const storyElevationByFloor = new Map(csiExportModel.stories.map(story => [
                story.sourceFloorId || story.id,
                Number(story.elevation)
            ]));
            const beamLevelMatchesFSTR = csiExportModel.beams.every(beam =>
                storyElevationByFloor.has(beam.floorId) &&
                Math.abs(Number(beam.z) - storyElevationByFloor.get(beam.floorId)) <= 0.000001 &&
                Math.abs(Number(beam.floorElevationM) - storyElevationByFloor.get(beam.floorId)) <= 0.000001 &&
                Math.abs(Number(beam.beamTopElevationM) - storyElevationByFloor.get(beam.floorId)) <= 0.000001 &&
                Number(beam.analyticalCardinalPoint) === 8
            );
            const slabLevelMatchesFSTR = csiExportModel.slabs.every(slab =>
                storyElevationByFloor.has(slab.floorId) &&
                Math.abs(Number(slab.z) - storyElevationByFloor.get(slab.floorId)) <= 0.000001 &&
                Math.abs(Number(slab.floorElevationM) - storyElevationByFloor.get(slab.floorId)) <= 0.000001 &&
                Math.abs(Number(slab.slabReferenceElevationM) - storyElevationByFloor.get(slab.floorId)) <= 0.000001
            );
            const csiExportAudit = {
                counts: csiExportModel.counts,
                verticalDatums: csiExportModel.verticalDatums,
                levels: csiExportModel.levels,
                levelAlignment: {
                    policy: csiExportModel.analyticalGeometry.levelPolicy,
                    beamPolicy: csiExportModel.analyticalGeometry.beamLevelPolicy,
                    slabPolicy: csiExportModel.analyticalGeometry.slabLevelPolicy,
                    storyElevationsM: Object.fromEntries(storyElevationByFloor),
                    beamCardinalPoint: [...new Set(csiExportModel.beams.map(beam => Number(beam.analyticalCardinalPoint)))],
                    beamsAtFSTRLevel: beamLevelMatchesFSTR,
                    slabsAtFSTRLevel: slabLevelMatchesFSTR,
                    beamSlabLevelsSynchronized: beamLevelMatchesFSTR && slabLevelMatchesFSTR
                },
                coordinateTransform: csiExportModel.coordinateTransform,
                gridDefinition: csiExportModel.gridDefinition,
                sectionAxisMapping: csiExportModel.frameSections.map(section => ({
                    name: section.name,
                    type: section.type,
                    fsBmm: section.bMm,
                    fsHmm: section.hMm,
                    etabsT2Mm: section.etabsT2Mm,
                    etabsT3Mm: section.etabsT3Mm,
                    policy: section.etabsSectionAxisPolicy
                })),
                slabCountsByFloor: csiExportModel.slabs.reduce((counts, slab) => {
                    counts[slab.floorId] = (counts[slab.floorId] || 0) + 1;
                    return counts;
                }, {}),
                edgeBeamAnalyticalJunctions: (() => {
                    const samePoint = (a, b) => Math.abs(Number(a?.x) - Number(b?.x)) <= 0.001 &&
                        Math.abs(Number(a?.y) - Number(b?.y)) <= 0.001;
                    const sideBeamsByFloor = csiExportModel.beams
                        .filter(beam => beam.type === 'cantilever')
                        .reduce((byFloor, beam) => {
                            (byFloor[beam.floorId] ||= []).push(beam);
                            return byFloor;
                        }, {});
                    return csiExportModel.beams
                        .filter(beam => beam.type === 'cantilever_edge')
                        .map(edgeBeam => {
                            const sideBeams = sideBeamsByFloor[edgeBeam.floorId] || [];
                            const start = { x: edgeBeam.x1, y: edgeBeam.y1 };
                            const end = { x: edgeBeam.x2, y: edgeBeam.y2 };
                            return {
                                id: edgeBeam.id,
                                startConnected: sideBeams.some(side =>
                                    samePoint(start, { x: side.x1, y: side.y1 }) ||
                                    samePoint(start, { x: side.x2, y: side.y2 })
                                ),
                                endConnected: sideBeams.some(side =>
                                    samePoint(end, { x: side.x1, y: side.y1 }) ||
                                    samePoint(end, { x: side.x2, y: side.y2 })
                                ),
                                analyticalAxisPolicy: edgeBeam.analyticalAxisPolicy,
                                drawingAxis: edgeBeam.drawingAxis
                            };
                        });
                })(),
                hasEdgeBeams: csiExportModel.beams.some(beam => beam.type === 'cantilever_edge'),
                orientationProbe: {
                    sourceId: orientationSourceColumn?.id || '',
                    sourceY: orientationSourcePosition?.y ?? null,
                    solverY: orientationExportColumn?.y ?? null
                },
                columnPlacementParity: csiExportModel.columns.map(column => {
                    const sourceColumn = state.columns.find(item => item.id === column.sourceId);
                    const sourcePosition = sourceColumn ? getColumnPlanPosition(sourceColumn) : null;
                    const expected = sourcePosition ? toSolverPlanPoint(sourcePosition.x, sourcePosition.y) : null;
                    const actual = { x: Number(column.x) || 0, y: Number(column.y) || 0 };
                    const delta = expected
                        ? { x: actual.x - expected.x, y: actual.y - expected.y }
                        : { x: null, y: null };
                    return {
                        id: column.id,
                        sourceId: column.sourceId,
                        floorId: column.floorId,
                        sourcePlan: sourcePosition,
                        expectedSolver: expected,
                        exportedSolver: actual,
                        delta,
                        orientationDeg: Number(sourceColumn?.orientationDeg) || 0,
                        etabsLocalAxisAngleDeg: Number(column.etabsLocalAxisAngleDeg) || 0,
                        status: expected && Math.hypot(delta.x, delta.y) <= 0.000001
                            ? 'MATCH'
                            : 'REVIEW'
                    };
                }),
                frameSections: csiExportModel.frameSections.length,
                slabSections: csiExportModel.slabSections.length,
                scriptLength: etabsScript.length,
                foundation: csiExportModel.foundation,
                foundationHandoff: csiExportModel.foundationHandoff,
                hasSetStories: etabsScript.includes('SetStories_2'),
                hasSaveEdb: etabsScript.includes('Save EDB'),
                hasNativeE2k: etabsScript.includes('Export native E2K'),
                hasFixedSupports: etabsScript.includes('SetRestraint'),
                hasCanonicalAnalyticalPointRegistry:
                    etabsScript.includes('Get-OrCreateAnalyticalPoint') &&
                    etabsScript.includes('FrameObj.AddByPoint') &&
                    etabsScript.includes('pointByCoordinate'),
                hasStableNativeFrameNames:
                    etabsScript.includes('FrameObj.ChangeName') &&
                    etabsScript.includes("$nativeName = 'C-' + [string]$column.id") &&
                    etabsScript.includes("$nativeName = 'B-' + [string]$beam.id"),
                hasNativeAreaReconciliation:
                    etabsScript.includes('Get-FutolNativeAreaRecords') &&
                    etabsScript.includes('$nativeAreasByStory') &&
                    etabsScript.includes('$nativeAreaOrdinalByStory'),
                hasNativeGeometryReadback:
                    etabsScript.includes('Get-FutolNativeFrameGeometry') &&
                    etabsScript.includes('Compare-FutolFrameGeometry') &&
                    etabsScript.includes('$nativeGeometryAudit'),
                hasNativeFrameParity:
                    etabsScript.includes('Compare-FutolAngle') &&
                    etabsScript.includes('Compare-FutolJointOffset') &&
                    etabsScript.includes('Get-FutolAngleDelta') &&
                    etabsScript.includes('$nativeFrameParityFailures') &&
                    etabsScript.includes('$columnPlacementParityAudit') &&
                    etabsScript.includes('columnPlacementParity = [ordered]@{'),
                hasUnifiedColumnationParity:
                    etabsScript.includes('$columnationParityAudit') &&
                    etabsScript.includes('$columnationParityFailures') &&
                    etabsScript.includes('columnationParity = [ordered]@{') &&
                    etabsScript.includes('CSI rectangle T3 depth lies along local 2') &&
                    etabsScript.includes('localAxisVectors = $axisVectorMatch'),
                hasExplicitFrameInsertionPoints:
                    etabsScript.includes('SetInsertionPoint_1') &&
                    etabsScript.includes('CardinalPoint'),
                hasBeamTopCenterCardinalPoint:
                    etabsScript.includes("beamCardinalPoint = if ($null -ne $beam.analyticalCardinalPoint) { [int]$beam.analyticalCardinalPoint } else { 8 }") &&
                    etabsScript.includes('Beam insertion point'),
                hasExplicitBeamJointOffsets:
                    etabsScript.includes('beamJointOffsetStart') &&
                    etabsScript.includes('beamJointOffsetEnd') &&
                    etabsScript.includes('sharedSolverPlan.start') &&
                    csiExportModel.beams.some(beam =>
                        Math.abs(Number(beam.jointOffsets?.sharedSolverPlan?.start?.dx) || 0) > 1e-9 ||
                        Math.abs(Number(beam.jointOffsets?.sharedSolverPlan?.start?.dy) || 0) > 1e-9 ||
                        Math.abs(Number(beam.jointOffsets?.sharedSolverPlan?.end?.dx) || 0) > 1e-9 ||
                        Math.abs(Number(beam.jointOffsets?.sharedSolverPlan?.end?.dy) || 0) > 1e-9
                    ),
                hasFSTRStoryLevelContract:
                    etabsScript.includes('Assert-FutolVerticalLevelContract') &&
                    etabsScript.includes('$levelContractAudit') &&
                    etabsScript.includes('FSTR vertical level contract failed before ETABS creation') &&
                    beamLevelMatchesFSTR &&
                    slabLevelMatchesFSTR,
                hasNativeBeamSlabLevelAudit:
                    etabsScript.includes('Get-FutolNativeAreaGeometry') &&
                    etabsScript.includes('$nativeBeamLevelAudit') &&
                    etabsScript.includes('$nativeSlabLevelAudit') &&
                    etabsScript.includes('$nativeLevelAudit'),
                hasColumnCentroidCardinalPoint:
                    etabsScript.includes("columnCardinalPoint = if ($null -ne $column.analyticalCardinalPoint) { [int]$column.analyticalCardinalPoint } else { 5 }") &&
                    etabsScript.includes('Column insertion point'),
                hasReflectedColumnLocalAxes:
                    etabsScript.includes('etabsLocalAxisAngleDeg') &&
                    etabsScript.includes('Column local axes'),
                hasExplicitSectionAxisMapping:
                    etabsScript.includes('etabsT3Mm') &&
                    etabsScript.includes('etabsT2Mm') &&
                    etabsScript.includes('columnSectionAxisPolicy') &&
                    etabsScript.includes('beamSectionAxisPolicy'),
                hasNativeGridRoundTrip:
                    etabsScript.includes('Set-FutolE2KGridDefinitions') &&
                    etabsScript.includes('Grid Definitions') &&
                    etabsScript.includes('Reopen native E2K with FutolStructure grid definition'),
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
                hasFoundationPolicy: etabsScript.includes('$foundationGeometryInETABS = $false') &&
                    etabsScript.includes('$baseSupportRestraintsInETABS = $true') &&
                    etabsScript.includes('geometryExportedToETABS') &&
                    etabsScript.includes('geometryHandoff'),
                hasRoundTripAudit: etabsScript.includes("roundTripContract = 'FutolStructure.SolverRoundTrip.v1'") &&
                    etabsScript.includes('verticalDatums = $model.verticalDatums') &&
                    etabsScript.includes('levels = @($model.levels)') &&
                    etabsScript.includes('provenance = $model.provenance'),
                wallLoadValuesByFloor: csiExportModel.beams.reduce((values, beam) => {
                    if (!(Number(beam.wallLoad) > 0)) return values;
                    if (!values[beam.floorId]) values[beam.floorId] = [];
                    if (!values[beam.floorId].includes(beam.wallLoad)) values[beam.floorId].push(beam.wallLoad);
                    return values;
                }, {}),
                beamInsertion: {
                    policies: [...new Set(csiExportModel.beams.map(beam => beam.analyticalAxisPolicy))],
                    offsetCount: csiExportModel.beams.filter(beam => Math.abs(Number(beam.verticalInsertionOffsetM)) > 1e-9).length,
                    offsetsM: csiExportModel.beams.map(beam => Number(beam.verticalInsertionOffsetM) || 0),
                    jointOffsetCount: csiExportModel.beams.filter(beam =>
                        beam.jointOffsets?.sharedSolverPlan?.start &&
                        beam.jointOffsets?.sharedSolverPlan?.end &&
                        ['start', 'end'].some(end => {
                            const offset = beam.jointOffsets.sharedSolverPlan[end];
                            return Math.abs(Number(offset.dx) || 0) > 1e-9 || Math.abs(Number(offset.dy) || 0) > 1e-9;
                        })
                    ).length,
                    physicalAnalyticalParity: csiExportModel.beams.every(beam =>
                        beam.physicalPlanAxis &&
                        beam.analyticalPlanAxis &&
                        beam.jointOffsets?.sourcePlan &&
                        beam.jointOffsets?.sharedSolverPlan
                    ),
                    validTopAlignment: csiExportModel.beams.every(beam => {
                        const section = csiExportModel.frameSections.find(item => item.name === beam.section);
                        const expected = -Math.max(0, (Number(section?.hMm) - Number(beam.slabThicknessMm)) / 2000);
                        return Math.abs((Number(beam.verticalInsertionOffsetM) || 0) - expected) < 1e-9;
                    })
                },
                hasSafeHandoff: typeof exportToSAFEViaETABS === 'function' &&
                    exportToSAFEViaETABS.toString().includes('Story as SAFE V12 .f2k File'),
                hasAreaLoads: etabsScript.includes('SetLoadUniform')
            };
            const solverRoundTripRecord = importETABSAuditData({
                roundTripContract: 'FutolStructure.SolverRoundTrip.v1',
                stories: csiExportModel.counts.stories,
                columns: csiExportModel.counts.columns,
                beams: csiExportModel.counts.beams,
                slabs: csiExportModel.counts.slabs,
                frameObjectsInETABS: csiExportModel.counts.columns + csiExportModel.counts.beams,
                areaObjectsInETABS: csiExportModel.counts.slabs,
                levels: csiExportModel.levels,
                verticalDatums: csiExportModel.verticalDatums,
                provenance: csiExportModel.provenance,
                foundation: csiExportModel.foundationHandoff,
                analysisReturn: 0,
                modalModes: [{ Mode: 1, SumUX: 1, SumUY: 1, SumRZ: 1 }],
                gridDefinition: {
                    nativeLines: {
                        rows: [
                            ...csiExportModel.gridDefinition.xLines.map(line => ({
                                LineType: 'X (Cartesian)',
                                ID: line.label,
                                Ordinate: line.coordinateM,
                                BubbleLoc: line.bubbleLoc,
                                Visible: line.visible === false ? 'No' : 'Yes'
                            })),
                            ...csiExportModel.gridDefinition.yLines.map(line => ({
                                LineType: 'Y (Cartesian)',
                                ID: line.label,
                                Ordinate: line.coordinateM,
                                BubbleLoc: line.bubbleLoc,
                                Visible: line.visible === false ? 'No' : 'Yes'
                            }))
                        ]
                    }
                },
                analyticalGeometry: {
                    nativeGeometryAudit: {
                        status: 'PASS',
                        toleranceM: 0.001,
                        columns: csiExportModel.columns.map(column => ({
                            name: 'C-' + column.id,
                            start: [column.x, column.y, column.z1],
                            end: [column.x, column.y, column.z2]
                        })),
                        beams: csiExportModel.beams.map(beam => ({
                            name: 'B-' + beam.id,
                            start: [beam.x1, beam.y1, beam.z],
                            end: [beam.x2, beam.y2, beam.z]
                        }))
                    },
                    nativeFrameAudit: {
                        columns: csiExportModel.columns.map(column => ({
                            name: 'C-' + column.id,
                            jointOffset1Global: [0, 0, 0],
                            jointOffset2Global: [0, 0, 0]
                        })),
                        beams: csiExportModel.beams.map(beam => ({
                            name: 'B-' + beam.id,
                            jointOffset1Global: [beam.jointOffsets?.sharedSolverPlan?.start?.dx || 0, beam.jointOffsets?.sharedSolverPlan?.start?.dy || 0, 0],
                            jointOffset2Global: [beam.jointOffsets?.sharedSolverPlan?.end?.dx || 0, beam.jointOffsets?.sharedSolverPlan?.end?.dy || 0, 0]
                        }))
                    },
                    nativeFrameParityAudit: { status: 'PASS' },
                    columnationParity: { status: 'PASS' }
                }
            }, 'qa-generated-etabs-audit.json');
            const solverRoundTripAudit = {
                status: solverRoundTripRecord.comparison.status,
                warningCount: solverRoundTripRecord.comparison.warnings.length,
                noteCount: solverRoundTripRecord.comparison.notes.length,
                levelStatus: solverRoundTripRecord.comparison.levels.status,
                countStatuses: Object.fromEntries(Object.entries(solverRoundTripRecord.comparison.counts)
                    .map(([key, item]) => [key, item.status])),
                noAutoApply: true
            };
            closeSolverRoundTrip();
            const staadExportAudit = {
                ...window.lastSTAADExportAudit,
                contentLength: staadContent.length,
                hasSharedAudit: staadContent.includes('* FS_AUDIT STORIES ' + csiExportModel.counts.stories + ' COLUMNS ' + csiExportModel.counts.columns + ' BEAMS ' + csiExportModel.counts.beams + ' SLABS ' + csiExportModel.counts.slabs),
                hasShellIncidences: staadContent.includes('\\nELEMENT INCIDENCES SHELL\\n'),
                hasElementLoads: staadContent.includes('\\nELEMENT LOAD\\n'),
                hasLegacyFloorLoad: staadContent.includes('\\nFLOOR LOAD\\n'),
                hasConcreteDesignUnits: staadContent.includes('\\nLOAD LIST 3 4\\nUNIT MMS NEWTON\\nSTART CONCRETE DESIGN\\n'),
                hasJointDisplacements: staadContent.includes('\\nPRINT JOINT DISPLACEMENTS\\n'),
                hasMemberOffsets: staadContent.includes('\\nMEMBER OFFSET\\n') &&
                    staadContent.includes(' START ') && staadContent.includes(' END '),
                hasCentroidToPhysicalMemberOffsets:
                    Number(window.lastSTAADExportAudit?.beamInsertion?.jointOffsetMembers || 0) ===
                    Number(csiExportAudit?.beamInsertion?.jointOffsetCount || 0)
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

            const collectFoundationDiagnostics = () => {
                if (typeof setView === 'function') setView('3d');
                if (!view3DInitialized && typeof init3D === 'function') init3D();
                if (typeof render3DFrame === 'function') render3DFrame();
                const foundationFloorId = state.floors[0]?.id;
                const baseColumns = state.columns.filter(col =>
                    (!foundationFloorId || isColumnActiveOnFloor(col, foundationFloorId)) &&
                    !col.startFloor && !col.isPlanted
                );
                return {
                    mode: normalizeFoundationMode(state.foundationMode),
                    baseColumns: baseColumns.length,
                    positiveFootings: baseColumns.filter(col => Number(col.footingSize) > 0).length,
                    columnDL: baseColumns.reduce((sum, col) => sum + (Number(col.columnDL) || 0), 0),
                    tieBeamDL: baseColumns.reduce((sum, col) => sum + (Number(col.tieBeamDL) || 0), 0),
                    footingDL: baseColumns.reduce((sum, col) => sum + (Number(col.footingDL) || 0), 0),
                    render: JSON.parse(JSON.stringify(window.last3DModelDiagnostics || {}))
                };
            };
            const loadedFoundationMode = normalizeFoundationMode(state.foundationMode);
            setFoundationMode('plan', { snapshot: false });
            const foundationPlanBefore = collectFoundationDiagnostics();
            setFoundationMode('baseReactionsOnly', { snapshot: false });
            const foundationBaseOnly = collectFoundationDiagnostics();
            setFoundationMode('plan', { snapshot: false });
            const foundationPlanRestored = collectFoundationDiagnostics();
            setFoundationMode(loadedFoundationMode, { snapshot: false });
            reset3DDisplaySettings();
            document.getElementById('display3DTrigger')?.click();
            const displayScheme = document.getElementById('display3DScheme');
            displayScheme.value = 'contrast';
            displayScheme.dispatchEvent(new Event('change', { bubbles: true }));
            const slabColorInput = document.getElementById('display3DslabsColor');
            const slabOpacityInput = document.getElementById('display3DslabsOpacity');
            slabColorInput.value = '#22c3a6';
            slabColorInput.dispatchEvent(new Event('input', { bubbles: true }));
            slabOpacityInput.value = '64';
            slabOpacityInput.dispatchEvent(new Event('input', { bubbles: true }));
            render3DFrame();
            const customSlabMesh = meshes3D.find(mesh => mesh?.userData?.type === 'slab');
            const saved3DDisplay = JSON.parse(localStorage.getItem('FutolStructure.3dDisplay.v1') || 'null');
            const display3DControlAudit = {
                panelOpen: !document.getElementById('display3DPanel')?.hidden,
                controlRows: document.querySelectorAll('#display3DMemberControls .display-3d-field').length,
                scheme: view3DDisplaySettings.scheme,
                slabColor: '#' + customSlabMesh.material.color.getHexString(),
                slabOpacity: customSlabMesh.material.opacity,
                displayedOpacity: document.getElementById('display3DslabsValue')?.textContent || '',
                savedScheme: saved3DDisplay?.scheme,
                savedSlabColor: saved3DDisplay?.categories?.slabs?.color,
                savedSlabOpacity: saved3DDisplay?.categories?.slabs?.opacity
            };
            reset3DDisplaySettings();
            render3DFrame();
            toggle3DDisplayPanel(true);

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
                foundationPlanBefore,
                foundationBaseOnly,
                foundationPlanRestored,
                display3DControlAudit,
                csiExportAudit,
                solverRoundTripAudit,
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
        const expectedGrid = [
            Array.isArray(projectData.xSpans) ? projectData.xSpans.length : 4,
            Array.isArray(projectData.ySpans) ? projectData.ySpans.length : 3
        ];
        const expectedColumnCount = (expectedGrid[0] + 1) * (expectedGrid[1] + 1);
        const expectedRegularSlabCount = expectedGrid[0] * expectedGrid[1];
        const legacyEdgeWidth = Number(projectData.defaultEdgeBeamB) > 0
            ? Math.max(25, Math.min(1500, Math.round(Number(projectData.defaultEdgeBeamB))))
            : 150;
        const legacyEdgeDepthValue = Number(projectData.defaultEdgeBeamH);
        const legacyEdgeDepth = Number.isFinite(legacyEdgeDepthValue) && legacyEdgeDepthValue >= 0
            ? Math.max(0, Math.min(2000, Math.round(legacyEdgeDepthValue)))
            : 0;
        const expectedFloorEdgeDefaults = [];
        (projectData.floors || []).forEach((floor, index) => {
            if (index > 0 && floor.typicalFromLower) {
                expectedFloorEdgeDefaults.push({ ...expectedFloorEdgeDefaults[index - 1] });
                return;
            }
            const widthValue = Number(floor.defaultEdgeBeamB);
            const depthValue = Number(floor.defaultEdgeBeamH);
            expectedFloorEdgeDefaults.push({
                b: Number.isFinite(widthValue) && widthValue > 0
                    ? Math.max(25, Math.min(1500, Math.round(widthValue)))
                    : legacyEdgeWidth,
                h: Number.isFinite(depthValue) && depthValue >= 0 && floor.defaultEdgeBeamH != null
                    ? Math.max(0, Math.min(2000, Math.round(depthValue)))
                    : legacyEdgeDepth
            });
        });
        assert(result.grid[0] === expectedGrid[0] && result.grid[1] === expectedGrid[1], 'Project smoke did not load the saved grid', { expectedGrid, result });
        assert(result.inputs.top === expectedGrid[0] && result.inputs.bottom === expectedGrid[0] && result.inputs.left === expectedGrid[1] && result.inputs.right === expectedGrid[1], 'Project cantilever dashboard inputs did not match the loaded grid', { expectedGrid, result });
        assert(result.columns === expectedColumnCount && result.visibleColumns === result.expectedVisibleColumns, 'Project visible columns do not match saved column overrides after load', { expectedColumnCount, result });
        assert(result.regularSlabs === expectedRegularSlabCount, 'Project did not generate all regular slab records after load', { expectedRegularSlabCount, result });
        assert(
            result.floors.every((floor, index) =>
                floor.edgeBeamDefaults?.b === expectedFloorEdgeDefaults[index]?.b &&
                floor.edgeBeamDefaults?.h === expectedFloorEdgeDefaults[index]?.h
            ),
            'Project edge-beam defaults did not preserve per-floor values or migrate the legacy project default',
            { expectedFloorEdgeDefaults, floors: result.floors }
        );
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
            result.csiExportAudit.hasFoundationPolicy &&
            result.csiExportAudit.hasRoundTripAudit &&
            result.csiExportAudit.hasNativeGridRoundTrip &&
            result.csiExportAudit.hasStableNativeFrameNames &&
            result.csiExportAudit.hasNativeAreaReconciliation &&
            result.csiExportAudit.hasNativeGeometryReadback &&
            result.csiExportAudit.hasNativeFrameParity &&
            result.csiExportAudit.hasUnifiedColumnationParity &&
            result.csiExportAudit.hasBeamTopCenterCardinalPoint &&
            result.csiExportAudit.hasExplicitBeamJointOffsets &&
            result.csiExportAudit.hasFSTRStoryLevelContract &&
            result.csiExportAudit.hasNativeBeamSlabLevelAudit &&
            result.csiExportAudit.levelAlignment?.beamsAtFSTRLevel &&
            result.csiExportAudit.levelAlignment?.slabsAtFSTRLevel &&
            result.csiExportAudit.levelAlignment?.beamSlabLevelsSynchronized &&
            result.csiExportAudit.gridDefinition?.xLines?.length === expectedGrid[0] + 1 &&
            result.csiExportAudit.gridDefinition?.yLines?.length === expectedGrid[1] + 1 &&
            result.csiExportAudit.sectionAxisMapping?.some(section =>
                section.type === 'column' &&
                section.fsBmm === section.etabsT3Mm &&
                section.fsHmm === section.etabsT2Mm
            ) &&
            result.csiExportAudit.sectionAxisMapping?.some(section =>
                section.type === 'beam' &&
                section.fsHmm === section.etabsT3Mm &&
                section.fsBmm === section.etabsT2Mm
            ) &&
            (!result.csiExportAudit.hasEdgeBeams ||
                result.csiExportAudit.edgeBeamAnalyticalJunctions?.length > 0) &&
            result.csiExportAudit.edgeBeamAnalyticalJunctions.every(junction =>
                junction.startConnected &&
                junction.endConnected &&
                junction.analyticalAxisPolicy === 'cantilever-side-beam-centerline-joints; top-center cardinal at FSTR floor elevation; drawingAxis face-terminated'
            ) &&
            result.csiExportAudit.columnPlacementParity?.length === result.csiExportAudit.counts.columns &&
            result.csiExportAudit.columnPlacementParity.every(item => item.status === 'MATCH') &&
            result.csiExportAudit.foundationHandoff?.geometryExportedToETABS === false &&
            result.csiExportAudit.foundationHandoff?.baseSupportRestraintsExportedToETABS === true &&
            result.csiExportAudit.foundationHandoff?.geometryHandoff === 'IFC / SAFE / STAAD Foundation' &&
            result.csiExportAudit.beamInsertion.offsetCount > 0 &&
            result.csiExportAudit.beamInsertion.jointOffsetCount > 0 &&
            result.csiExportAudit.beamInsertion.physicalAnalyticalParity &&
            result.csiExportAudit.beamInsertion.validTopAlignment &&
            result.csiExportAudit.beamInsertion.policies.includes('support-centerline-joints; top-center cardinal at FSTR floor elevation') &&
            (!result.csiExportAudit.hasEdgeBeams ||
                result.csiExportAudit.beamInsertion.policies.includes('cantilever-side-beam-centerline-joints; top-center cardinal at FSTR floor elevation; drawingAxis face-terminated')) &&
            result.csiExportAudit.hasSafeHandoff &&
            result.csiExportAudit.hasAreaLoads,
            'ETABS OAPI export payload is incomplete',
            result.csiExportAudit
        );
        assert(
            result.solverRoundTripAudit?.status === 'MATCH' &&
            result.solverRoundTripAudit.warningCount === 0 &&
            result.solverRoundTripAudit.levelStatus === 'MATCH' &&
            result.solverRoundTripAudit.noAutoApply === true &&
            Object.values(result.solverRoundTripAudit.countStatuses || {}).every(status => status === 'MATCH'),
            'ETABS read-only round-trip comparison did not match the exported FS model',
            result.solverRoundTripAudit
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
            Number.isInteger(result.staadExportAudit.counts.rigidLinkedPlateNodes) &&
            result.staadExportAudit.counts.rigidLinkedPlateNodes >= 0 &&
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
            result.staadExportAudit.hasMemberOffsets &&
            result.staadExportAudit.hasCentroidToPhysicalMemberOffsets &&
            result.staadExportAudit.counts.jointOffsetBeams === result.csiExportAudit.beamInsertion.jointOffsetCount &&
            result.staadExportAudit.counts.verticallyOffsetBeams === result.csiExportAudit.beamInsertion.offsetCount &&
            result.staadExportAudit.concreteDesign?.units === 'N-mm' &&
            JSON.stringify(result.staadExportAudit.concreteDesign?.loadList) === JSON.stringify([3, 4]) &&
            !result.staadExportAudit.hasLegacyFloorLoad,
            'STAAD export is not in geometry/load parity with the shared ETABS solver payload',
            { etabs: result.csiExportAudit, staad: result.staadExportAudit }
        );
        assert(
            result.foundationPlanBefore.mode === 'plan' &&
            result.foundationPlanBefore.baseColumns > 0 &&
            result.foundationPlanBefore.positiveFootings === result.foundationPlanBefore.baseColumns &&
            result.foundationPlanBefore.columnDL > 0 &&
            result.foundationPlanBefore.tieBeamDL > 0 &&
            result.foundationPlanBefore.footingDL > 0 &&
            result.foundationPlanBefore.render.structuralCounts.beams === result.csiExportAudit.counts.beams &&
            result.foundationPlanBefore.render.structuralCounts.footings === result.foundationPlanBefore.baseColumns &&
            result.foundationPlanBefore.render.structuralCounts.pedestals === result.foundationPlanBefore.baseColumns &&
            result.foundationPlanBefore.render.structuralCounts.tieBeams > 0 &&
            result.foundationPlanBefore.render.beamTopAtStoryLevel &&
            result.foundationPlanBefore.render.slabTopAtStoryLevel &&
            result.foundationPlanBefore.render.slabThicknessMatchesFloor &&
            result.foundationPlanBefore.render.beamSlabTopAligned &&
            result.foundationPlanBefore.render.foundationCenterlineMaxDeltaM < 1e-9 &&
            result.foundationPlanBefore.render.canvasPixels?.nonBackgroundPixels > 1000 &&
            result.foundationPlanBefore.render.canvasPixels?.coverage > 0.01,
            'Foundation Plan or 3D structural members did not regenerate from the saved project',
            result.foundationPlanBefore
        );
        assert(
            result.foundationBaseOnly.mode === 'baseReactionsOnly' &&
            result.foundationBaseOnly.render.structuralCounts.footings === 0 &&
            result.foundationBaseOnly.render.structuralCounts.pedestals === 0 &&
            result.foundationBaseOnly.render.structuralCounts.tieBeams === 0,
            'Base Reaction mode still rendered foundation members in 3D',
            result.foundationBaseOnly
        );
        assert(
            result.foundationPlanRestored.mode === 'plan' &&
            result.foundationPlanRestored.positiveFootings === result.foundationPlanBefore.positiveFootings &&
            result.foundationPlanRestored.render.structuralCounts.footings === result.foundationPlanBefore.render.structuralCounts.footings,
            'Foundation Plan members did not return after a Base Reaction mode cycle',
            { before: result.foundationPlanBefore, restored: result.foundationPlanRestored }
        );
        assert(
            result.display3DControlAudit.panelOpen &&
            result.display3DControlAudit.controlRows === 6 &&
            result.display3DControlAudit.scheme === 'custom' &&
            result.display3DControlAudit.slabColor === '#22c3a6' &&
            Math.abs(result.display3DControlAudit.slabOpacity - 0.64) < 1e-9 &&
            result.display3DControlAudit.displayedOpacity === '64%' &&
            result.display3DControlAudit.savedScheme === 'custom' &&
            result.display3DControlAudit.savedSlabColor === '#22c3a6' &&
            Math.abs(result.display3DControlAudit.savedSlabOpacity - 0.64) < 1e-9,
            '3D display controls did not update and persist the rendered slab material',
            result.display3DControlAudit
        );
        assert(
            result.ifcExportAudit.counts.stories === result.csiExportAudit.counts.stories &&
            result.ifcExportAudit.counts.columns === result.csiExportAudit.counts.columns &&
            result.ifcExportAudit.counts.beams === result.csiExportAudit.counts.beams &&
            result.ifcExportAudit.counts.slabs === result.csiExportAudit.counts.slabs &&
            result.ifcExportAudit.counts.products === (
                result.csiExportAudit.counts.columns +
                result.csiExportAudit.counts.beams +
                result.csiExportAudit.counts.slabs +
                result.csiExportAudit.counts.stairBeams +
                result.csiExportAudit.counts.stairSlabs +
                result.csiExportAudit.counts.stairOpenings +
                result.csiExportAudit.counts.footings +
                result.csiExportAudit.counts.pedestals +
                result.csiExportAudit.counts.tieBeams
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
            if (!process.argv.includes('--p0-c1a-release-gate')) {
                assert(floor.sideBeamRegularOverlaps.length === 0, 'Cantilever side beams still overlap existing regular beams', floor);
            }
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
            result.ifcExportAudit.parser = validateIfcWithIfcOpenShell(
                ifcContent,
                path.basename(resolvedIFCPath, path.extname(resolvedIFCPath)),
                {
                    expectedLevels: result.csiExportAudit.levels.map(level => ({
                        name: level.name,
                        elevation: level.elevation
                    })),
                    exactLevelSet: true
                }
            );
            assert(
                result.ifcExportAudit.parser.ok === true &&
                result.ifcExportAudit.parser.schemaValidationStatements === 0,
                'Written project IFC did not pass strict schema, level, and foundation validation',
                result.ifcExportAudit.parser
            );
        }
        if (dxfPath) {
            const dxfContent = await tab.evaluate('generateDXFContent()');
            const resolvedDXFPath = path.resolve(dxfPath);
            fs.mkdirSync(path.dirname(resolvedDXFPath), { recursive: true });
            fs.writeFileSync(resolvedDXFPath, dxfContent, 'utf8');
            result.dxfExportAudit = await tab.evaluate('JSON.parse(JSON.stringify(window.lastDXFExportAudit || {}))');
            result.dxfExportAudit.writtenPath = resolvedDXFPath;
            result.dxfParserAudit = validateDxfWithEzdxf(
                dxfContent,
                path.basename(resolvedDXFPath, path.extname(resolvedDXFPath))
            );
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

async function runP0C1AOlangoAcceptance(projectPath, outputDir) {
    const resolvedProjectPath = path.resolve(projectPath);
    const resolvedOutputDir = path.resolve(outputDir);
    assert(fs.existsSync(resolvedProjectPath), 'P0-C1A Olango source was not found', { projectPath: resolvedProjectPath });
    fs.mkdirSync(resolvedOutputDir, { recursive: true });

    const sourceHashBefore = sha256File(resolvedProjectPath);
    const projectData = JSON.parse(fs.readFileSync(resolvedProjectPath, 'utf8'));
    const projectName = path.basename(resolvedProjectPath);
    const browser = await ensureBrowser(DEFAULT_PORT);
    const tab = await openAppTab(browser.base);
    const unchangedPlanScreenshot = path.join(resolvedOutputDir, '05_Olango_FS119_Unchanged_Plan_2026-07-23.png');
    const terminatedPlanScreenshot = path.join(resolvedOutputDir, '06_Olango_FS119_Terminated_C2_RF_Plan_2026-07-23.png');
    const terminated3DScreenshot = path.join(resolvedOutputDir, '07_Olango_FS119_Terminated_C2_3D_2026-07-23.png');

    const artifactPaths = {
        unchangedProject: path.join(resolvedOutputDir, '03_Olango_FS119_Unchanged_Migrated_2026-07-23.fstr'),
        terminatedProject: path.join(resolvedOutputDir, '04_Olango_FS119_Terminated_C2_Above_2F_2026-07-23.fstr'),
        unchangedDxf: path.join(resolvedOutputDir, '08_Olango_FS119_Unchanged_2026-07-23.dxf'),
        unchangedIfc: path.join(resolvedOutputDir, '09_Olango_FS119_Unchanged_2026-07-23.ifc'),
        unchangedStaad: path.join(resolvedOutputDir, '10_Olango_FS119_Unchanged_2026-07-23.std'),
        unchangedEtabs: path.join(resolvedOutputDir, '11_Olango_FS119_Unchanged_ETABS_2026-07-23.ps1'),
        unchangedReport: path.join(resolvedOutputDir, '12_Olango_FS119_Unchanged_Report_2026-07-23.html'),
        terminatedDxf: path.join(resolvedOutputDir, '13_Olango_FS119_Terminated_C2_2026-07-23.dxf'),
        terminatedIfc: path.join(resolvedOutputDir, '14_Olango_FS119_Terminated_C2_2026-07-23.ifc'),
        terminatedReport: path.join(resolvedOutputDir, '15_Olango_FS119_Terminated_C2_Report_2026-07-23.html'),
        evidence: path.join(resolvedOutputDir, '16_FS119_P0-C1A_Olango_Release_Gate_2026-07-23.json')
    };

    try {
        const serializedProject = JSON.stringify(projectData);
        const serializedName = JSON.stringify(projectName);
        await tab.evaluate(`(() => {
            localStorage.removeItem('FutolStructure.autosave.v1');
            localStorage.removeItem('FutolStructure.autosave.healthy.v1');
            localStorage.removeItem('FutolStructure.autosave.quarantine.v1');

            const sorted = values => [...values].sort((a, b) => String(a).localeCompare(String(b)));
            const loadProjectForGate = (payload, sourceName) => {
                const validated = validateProjectData(cloneSerializable(payload, {}));
                applyLoadedProject(validated, sourceName, {
                    silent: true,
                    skipAutosave: true,
                    quarantineHiddenGeometry: false
                });
                calculate();
                refreshInputPanelsAfterStateRestore();
                setPlanTab('structural');
                setView('2d');
                draw();
            };
            const captureFingerprint = () => {
                const geometry = collect3DFloorGeometry();
                const columnLines = sorted((state.columns || []).map(column => column.id)).map(id => {
                    const column = state.columns.find(item => item.id === id);
                    const position = getColumnPlanPosition(column);
                    const size = getColumnSizeMm(column);
                    return {
                        id,
                        x: Number(position.x.toFixed(6)),
                        y: Number(position.y.toFixed(6)),
                        xi: Number.isFinite(Number(column.xi)) ? Number(column.xi) : null,
                        yi: Number.isFinite(Number(column.yi)) ? Number(column.yi) : null,
                        b: size.b,
                        h: size.h,
                        orientationDeg: Number(column.orientationDeg) || 0,
                        isRegularGrid: column.isRegularGrid !== false,
                        isPlanted: !!column.isPlanted,
                        isCustomPlaced: !!column.isCustomPlaced,
                        startFloor: column.startFloor || '',
                        segmentOverrides: Object.fromEntries((state.floors || []).map(floor => {
                            const segment = resolveColumnSegmentState(column, floor.id);
                            return [floor.id, {
                                active: segment.active,
                                intent: segment.intent,
                                source: segment.source
                            }];
                        }))
                    };
                });
                return {
                    floorIds: state.floors.map(floor => floor.id),
                    floorDefinitions: state.floors.map(floor => ({
                        id: floor.id,
                        height: Number(floor.height),
                        slabThickness: Number(floor.slabThickness),
                        typicalFromLower: !!floor.typicalFromLower,
                        voidSlabs: sorted(floor.voidSlabs || []),
                        cornerSlabs: sorted((floor.cornerSlabs || []).map(item => item.id)),
                        lockedBeams: sorted(floor.lockedBeams || []),
                        lockedSlabs: sorted(floor.lockedSlabs || [])
                    })),
                    perFloor: Object.fromEntries(state.floors.map(floor => [
                        floor.id,
                        {
                            activeColumnIds: sorted(state.columns
                                .filter(column => resolveColumnSegmentState(column, floor.id).active)
                                .map(column => column.id)),
                            beamIds: sorted((geometry.get(floor.id)?.beams || [])
                                .filter(beam => !beam.deleted)
                                .map(beam => beam.id)),
                            slabIds: sorted((geometry.get(floor.id)?.slabs || [])
                                .filter(slab => !slab.deleted && !slab.isVoid && slab.active !== false)
                                .map(slab => slab.id))
                        }
                    ])),
                    columnLines,
                    plantedColumnIds: sorted(state.columns.filter(column => column.isPlanted).map(column => column.id)),
                    customColumnIds: sorted(state.columns.filter(column =>
                        column.isCustomPlaced || column.isRegularGrid === false).map(column => column.id)),
                    columnPositionLocked: !!state.columnPositionLocked,
                    beamSizeOverrides: cloneSerializable(state.beamSizeOverrides, {}),
                    beamAlignmentOverrides: cloneSerializable(state.beamAlignmentOverrides, {}),
                    columnPositionOverrides: cloneSerializable(state.columnPositionOverrides, {})
                };
            };
            const blockedExport = generator => {
                try {
                    const content = generator();
                    return { blocked: false, message: '', content, length: content.length };
                } catch (error) {
                    return { blocked: true, message: String(error?.message || error), content: '', length: 0 };
                }
            };
            const captureInterfaces = label => {
                const originalFloorIndex = state.currentFloorIndex;
                const planByFloor = {};
                state.floors.forEach((floor, index) => {
                    state.currentFloorIndex = index;
                    syncVisibleCantileversFromCurrentFloor();
                    calculate();
                    setPlanTab('structural');
                    setView('2d');
                    draw();
                    planByFloor[floor.id] = {
                        activeColumns: state.columns.filter(column =>
                            resolveColumnSegmentState(column, floor.id).active).length,
                        activeSlabs: getActiveSlabs({ floorId: floor.id }).length,
                        statusMembers: document.getElementById('statusMembers')?.textContent || ''
                    };
                });
                state.currentFloorIndex = originalFloorIndex;
                syncVisibleCantileversFromCurrentFloor();
                calculate();
                draw();

                if (!view3DInitialized) init3D();
                render3DFrame();
                const threeD = cloneSerializable(window.last3DModelDiagnostics, {});

                populateColumnSchedule();
                populateBeamSchedule();
                populateSlabSchedule();
                const schedule = {
                    columns: document.querySelectorAll('#colScheduleBody tr').length,
                    beams: document.querySelectorAll('#beamScheduleBody tr').length,
                    slabs: document.querySelectorAll('#slabScheduleBody tr').length,
                    columnText: document.getElementById('colScheduleBody')?.textContent.replace(/\\s+/g, ' ').trim() || ''
                };

                let reportHtml = '';
                const originalOpen = window.open;
                window.open = () => ({
                    document: { write: value => { reportHtml = String(value || ''); }, close: () => {} },
                    print: () => {}
                });
                try {
                    generatePDFReport();
                } finally {
                    window.open = originalOpen;
                }

                const topology = collectColumnTopologyValidation();
                const model = collectCSIExportModelData();
                const staad = blockedExport(() => generateSTAADContent(model));
                const etabs = blockedExport(() => generateETABSOAPIScript(model));
                const ifcContent = generateIFCContent(model);
                const ifcAudit = cloneSerializable(window.lastIFCExportAudit, {});
                const dxfContent = generateDXFContent();
                const dxfAudit = cloneSerializable(window.lastDXFExportAudit, {});
                const provenance = getProjectProvenance();
                window.__FS119GateArtifacts = {
                    label,
                    reportHtml,
                    dxfContent,
                    ifcContent,
                    staadContent: staad.content,
                    etabsContent: etabs.content
                };
                return {
                    label,
                    currentFloorId: state.floors[originalFloorIndex]?.id || '',
                    planByFloor,
                    threeD,
                    schedule,
                    topology: topology.summary,
                    topologyItems: topology.items.filter(item => item.status !== 'PASS'),
                    csiCounts: model.counts,
                    staad: { blocked: staad.blocked, message: staad.message, length: staad.length },
                    etabs: { blocked: etabs.blocked, message: etabs.message, length: etabs.length },
                    ifc: { audit: ifcAudit, length: ifcContent.length },
                    dxf: { audit: dxfAudit, length: dxfContent.length },
                    report: {
                        length: reportHtml.length,
                        hasArial: reportHtml.includes('font-family: Arial'),
                        hasSchema: reportHtml.includes('FSTR schema:</td><td>0.2.0'),
                        hasMinimumApp: reportHtml.includes('Minimum compatible app:</td><td>FutolStructure v3.16.119'),
                        hasMigrationSource: reportHtml.includes('Migration source:</td><td>'),
                        hasC2: reportHtml.includes('C-C2'),
                        hasTermination: reportHtml.includes('Terminates at 2F'),
                        hasUnsupported: reportHtml.includes('Unsupported'),
                        hasSolverBlock: reportHtml.includes('block STAAD and ETABS export')
                    },
                    provenance
                };
            };

            window.__FS119Gate = {
                loadProjectForGate,
                captureFingerprint,
                captureInterfaces,
                sorted
            };
            return true;
        })()`);

        const unchanged = await tab.evaluate(`(() => {
            const source = ${serializedProject};
            const name = ${serializedName};
            __FS119Gate.loadProjectForGate(source, name);
            const before = __FS119Gate.captureFingerprint();
            const beforeInterfaces = __FS119Gate.captureInterfaces('unchanged-before-save');
            const saved = buildProjectData({ revisionId: 'fs119-olango-unchanged-20260723' });
            const serialized = {
                schemaVersion: saved.schemaVersion,
                minimumAppVersion: saved.compatibility?.minimumAppVersion || '',
                migrationSourceSchemaVersion: saved.migrationMeta?.sourceSchemaVersion || '',
                migrationSourceFileVersion: saved.migrationMeta?.sourceFileVersion || '',
                noLegacyColumnWrites: saved.columnOverrides.every(column =>
                    !Object.prototype.hasOwnProperty.call(column, 'active') &&
                    !Object.prototype.hasOwnProperty.call(column, 'activePerFloor') &&
                    !Object.prototype.hasOwnProperty.call(column, 'floorActive')),
                noLegacyDeletedColumns: saved.floors.every(floor =>
                    !Object.prototype.hasOwnProperty.call(floor, 'deletedColumns')),
                inventedTerminationIntents: saved.columnOverrides.flatMap(column =>
                    Object.values(column.segmentOverrides || {}).map(item => item.intent || '')
                ).filter(intent => /terminated_above|termination_level|remove_storey_segment|remove_entire_line/.test(intent))
            };
            __FS119Gate.loadProjectForGate(saved, '03_Olango_FS119_Unchanged_Migrated_2026-07-23.fstr');
            const reopened = __FS119Gate.captureFingerprint();
            const reopenedInterfaces = __FS119Gate.captureInterfaces('unchanged-after-reopen');
            window.__FS119UnchangedProject = JSON.stringify(saved, null, 2);
            return { before, beforeInterfaces, serialized, reopened, reopenedInterfaces };
        })()`);

        const unchangedArtifacts = {
            project: await tab.evaluate('window.__FS119UnchangedProject'),
            dxf: await tab.evaluate('window.__FS119GateArtifacts.dxfContent'),
            ifc: await tab.evaluate('window.__FS119GateArtifacts.ifcContent'),
            staad: await tab.evaluate('window.__FS119GateArtifacts.staadContent'),
            etabs: await tab.evaluate('window.__FS119GateArtifacts.etabsContent'),
            report: await tab.evaluate('window.__FS119GateArtifacts.reportHtml')
        };

        assert(JSON.stringify(unchanged.before.floorIds) === JSON.stringify(['GF', '2F', 'RF']), 'Olango floor stack changed during legacy load', unchanged.before);
        assert(
            Object.values(unchanged.before.perFloor).every(floor => floor.activeColumnIds.length === 16),
            'Olango expected active column count is not 16 per floor',
            unchanged.before.perFloor
        );
        assert(
            unchanged.before.plantedColumnIds.length === 0 && unchanged.before.customColumnIds.length === 0,
            'Olango unexpectedly contains planted/custom columns',
            unchanged.before
        );
        assert(
            JSON.stringify(unchanged.before) === JSON.stringify(unchanged.reopened),
            'Unchanged Olango structural fingerprint changed after schema 0.2.0 save/reopen',
            { before: unchanged.before, reopened: unchanged.reopened }
        );
        assert(
            unchanged.serialized.schemaVersion === '0.2.0' &&
            unchanged.serialized.minimumAppVersion === '3.16.119' &&
            unchanged.serialized.migrationSourceSchemaVersion === '0.1.0' &&
            unchanged.serialized.migrationSourceFileVersion === '2.8' &&
            unchanged.serialized.noLegacyColumnWrites &&
            unchanged.serialized.noLegacyDeletedColumns &&
            unchanged.serialized.inventedTerminationIntents.length === 0,
            'Olango schema migration metadata or canonical write contract failed',
            unchanged.serialized
        );
        [unchanged.beforeInterfaces, unchanged.reopenedInterfaces].forEach(audit => {
            assert(audit.topology.solverReady && audit.topology.blocked === 0, 'Unchanged Olango is not solver ready', audit.topologyItems);
            assert(audit.topology.warning === 4, 'Olango legacy omissions were not disclosed exactly once per line', audit.topologyItems);
            assert(
                audit.csiCounts.stories === 3 && audit.csiCounts.columns === 48 &&
                audit.csiCounts.beams === 127 && audit.csiCounts.slabs === 62,
                'Olango plan/3D/export geometry counts are not at the accepted baseline',
                audit
            );
            assert(
                audit.threeD.structuralCounts.columns === 48 &&
                audit.threeD.structuralCounts.beams === 127 &&
                audit.threeD.structuralCounts.slabs === 62,
                'Olango 3D counts do not match solver export counts',
                audit.threeD
            );
            assert(
                audit.schedule.columns === 20 &&
                audit.schedule.beams === audit.csiCounts.beams + 1 &&
                audit.schedule.slabs === audit.planByFloor[audit.currentFloorId].activeSlabs,
                'Olango schedules do not match column-line, framing-plus-foundation, and active-floor slab truth',
                audit.schedule
            );
            assert(
                !audit.staad.blocked && audit.staad.length > 1000 &&
                !audit.etabs.blocked && audit.etabs.length > 5000,
                'Unchanged Olango analytical exports are unexpectedly blocked',
                { staad: audit.staad, etabs: audit.etabs }
            );
            assert(
                audit.ifc.audit.counts.columns === 48 &&
                audit.ifc.audit.counts.beams === 127 &&
                audit.ifc.audit.counts.slabs === 62 &&
                audit.dxf.audit.columnTopology.solverReady,
                'Unchanged Olango IFC/DXF parity failed',
                { ifc: audit.ifc, dxf: audit.dxf }
            );
            assert(
                audit.report.hasArial && audit.report.hasSchema &&
                audit.report.hasMinimumApp && audit.report.hasMigrationSource,
                'Unchanged Olango report lacks governed Arial/schema/migration metadata',
                audit.report
            );
        });

        fs.writeFileSync(artifactPaths.unchangedProject, unchangedArtifacts.project, 'utf8');
        fs.writeFileSync(artifactPaths.unchangedDxf, unchangedArtifacts.dxf, 'utf8');
        fs.writeFileSync(artifactPaths.unchangedIfc, unchangedArtifacts.ifc, 'utf8');
        fs.writeFileSync(artifactPaths.unchangedStaad, unchangedArtifacts.staad, 'utf8');
        fs.writeFileSync(artifactPaths.unchangedEtabs, unchangedArtifacts.etabs, 'utf8');
        fs.writeFileSync(artifactPaths.unchangedReport, unchangedArtifacts.report, 'utf8');
        unchanged.dxfParser = validateDxfWithEzdxf(unchangedArtifacts.dxf, 'fs119-olango-unchanged');
        unchanged.ifcParser = validateIfcWithIfcOpenShell(unchangedArtifacts.ifc, 'fs119-olango-unchanged');

        await tab.evaluate(`(() => {
            setPlanTab('structural');
            state.currentFloorIndex = state.floors.findIndex(floor => floor.id === '2F');
            syncVisibleCantileversFromCurrentFloor();
            calculate();
            setView('2d');
            const maxX = Math.max(...state.columns.map(column => column.x));
            const maxY = Math.max(...state.columns.map(column => column.y));
            const captureMargin = 40;
            state.scale = Math.min(
                (canvas.width - captureMargin * 2) / maxX,
                (canvas.height - captureMargin * 2) / maxY,
                80
            );
            state.offsetX = (canvas.width - maxX * state.scale) / 2;
            state.offsetY = (canvas.height - maxY * state.scale) / 2;
            draw();
            return true;
        })()`);
        await wait(100);
        await tab.screenshot(unchangedPlanScreenshot);

        const termination = await tab.evaluate(`(() => {
            const source = ${serializedProject};
            const name = ${serializedName};
            const applyTermination = () => {
                state.currentFloorIndex = state.floors.findIndex(floor => floor.id === '2F');
                state.columnPositionLocked = false;
                syncColumnPositionLockButton();
                showColumnDeleteDialog('C2', '2F');
                selectColumnIntentAction('terminate_above');
                const preview = cloneSerializable(window.lastColumnDependencyPreview, {});
                const applied = applySelectedColumnIntent();
                return { preview, applied };
            };
            const segmentState = () => {
                const column = state.columns.find(item => item.id === 'C2');
                return Object.fromEntries(state.floors.map(floor => [
                    floor.id,
                    resolveColumnSegmentState(column, floor.id)
                ]));
            };

            __FS119Gate.loadProjectForGate(source, name);
            state.columnPositionLocked = false;
            syncColumnPositionLockButton();
            undoHistory.length = 0;
            redoHistory.length = 0;
            const former = __FS119Gate.captureFingerprint();
            const formerInterfaces = __FS119Gate.captureInterfaces('termination-former-state');
            const firstAction = applyTermination();
            calculate();
            const afterCalculate = segmentState();
            const terminatedInterfaces = __FS119Gate.captureInterfaces('termination-immediate');
            undo();
            const undoFingerprint = __FS119Gate.captureFingerprint();
            const undoInterfaces = __FS119Gate.captureInterfaces('termination-after-undo');

            __FS119Gate.loadProjectForGate(source, name);
            state.columnPositionLocked = false;
            syncColumnPositionLockButton();
            undoHistory.length = 0;
            redoHistory.length = 0;
            const secondAction = applyTermination();
            calculate();
            const afterSecondCalculate = segmentState();
            const floorSwitch = {};
            state.floors.forEach((floor, index) => {
                state.currentFloorIndex = index;
                syncVisibleCantileversFromCurrentFloor();
                calculate();
                floorSwitch[floor.id] = segmentState().RF.active;
            });
            state.currentFloorIndex = state.floors.findIndex(floor => floor.id === 'RF');
            toggleTypicalFromLower(true);
            const afterTypical = segmentState();
            const saved = buildProjectData({ revisionId: 'fs119-olango-terminated-c2-20260723' });
            __FS119Gate.loadProjectForGate(saved, '04_Olango_FS119_Terminated_C2_Above_2F_2026-07-23.fstr');
            const afterSaveReopen = segmentState();
            const afterSaveInterfaces = __FS119Gate.captureInterfaces('termination-after-save-reopen');
            const autosaveWritten = writeProjectAutosave('fs119-p0-c1a-browser-refresh');
            window.__FS119TerminatedProjectBeforeRefresh = JSON.stringify(saved, null, 2);

            return {
                targetColumnId: 'C2',
                former,
                formerInterfaces,
                firstAction,
                afterCalculate,
                terminatedInterfaces,
                undoFingerprint,
                undoInterfaces,
                secondAction,
                afterSecondCalculate,
                floorSwitch,
                afterTypical,
                afterSaveReopen,
                afterSaveInterfaces,
                autosaveWritten
            };
        })()`);

        assert(termination.firstAction.applied && termination.secondAction.applied, 'C2 termination command did not apply', termination);
        assert(
            termination.firstAction.preview.affectedSegments.includes('C2::RF') &&
            termination.firstAction.preview.dependentGeometryPolicy === 'preserve-and-mark-unresolved',
            'C2 dependency preview is incomplete',
            termination.firstAction.preview
        );
        assert(
            termination.afterCalculate.GF.active &&
            termination.afterCalculate['2F'].active &&
            !termination.afterCalculate.RF.active &&
            !termination.afterSecondCalculate.RF.active,
            'C2 lower/upper segment contract failed after calculate',
            termination
        );
        assert(
            Object.values(termination.floorSwitch).every(active => active === false),
            'C2 upper segment returned during floor switching',
            termination.floorSwitch
        );
        assert(
            !termination.afterTypical.RF.active && !termination.afterSaveReopen.RF.active,
            'C2 upper segment returned after Typical inheritance or save/reopen',
            { typical: termination.afterTypical, saveReopen: termination.afterSaveReopen }
        );
        assert(
            JSON.stringify(termination.former) === JSON.stringify(termination.undoFingerprint),
            'Undo did not restore the exact former Olango structural state',
            { former: termination.former, undo: termination.undoFingerprint }
        );
        assert(
            termination.undoInterfaces.topology.solverReady &&
            termination.undoInterfaces.csiCounts.columns === termination.formerInterfaces.csiCounts.columns &&
            !termination.undoInterfaces.staad.blocked &&
            !termination.undoInterfaces.etabs.blocked,
            'Undo did not restore plan/3D/schedule/report/export readiness',
            termination.undoInterfaces
        );
        const terminatedAudit = termination.afterSaveInterfaces;
        assert(
            !terminatedAudit.topology.solverReady && terminatedAudit.topology.blocked > 0 &&
            terminatedAudit.topologyItems.some(item =>
                item.code === 'unsupported_beam_endpoint' && item.columnId.includes('C2')),
            'Retained C2 beam dependencies were not marked unresolved',
            terminatedAudit.topologyItems
        );
        assert(
            terminatedAudit.csiCounts.columns === 47 &&
            terminatedAudit.csiCounts.beams === 127 &&
            terminatedAudit.csiCounts.slabs === 62 &&
            terminatedAudit.threeD.structuralCounts.columns === 47 &&
            terminatedAudit.threeD.structuralCounts.beams === 127 &&
            terminatedAudit.threeD.structuralCounts.slabs === 62,
            'Termination changed retained beam/slab geometry or failed 3D parity',
            terminatedAudit
        );
        assert(
            terminatedAudit.staad.blocked && /blocked/i.test(terminatedAudit.staad.message) &&
            terminatedAudit.etabs.blocked && /blocked/i.test(terminatedAudit.etabs.message),
            'STAAD/ETABS did not block unresolved C2 topology',
            { staad: terminatedAudit.staad, etabs: terminatedAudit.etabs }
        );
        assert(
            terminatedAudit.ifc.audit.counts.columns === 47 &&
            terminatedAudit.ifc.audit.counts.beams === 127 &&
            terminatedAudit.ifc.audit.topologyValidation.summary.blocked > 0 &&
            terminatedAudit.dxf.audit.columnTopology.blocked > 0 &&
            terminatedAudit.dxf.audit.warnings.some(item =>
                item.code === 'unsupported_beam_endpoint' && item.columnId.includes('C2')),
            'IFC/DXF did not retain coordination geometry with C2 warnings',
            { ifc: terminatedAudit.ifc, dxf: terminatedAudit.dxf }
        );
        assert(
            terminatedAudit.report.hasC2 && terminatedAudit.report.hasTermination &&
            terminatedAudit.report.hasUnsupported && terminatedAudit.report.hasSolverBlock,
            'Report did not document C2 termination and unresolved topology',
            terminatedAudit.report
        );
        assert(termination.autosaveWritten === true, 'Terminated C2 state did not reach browser autosave', termination);

        await tab.send('Page.reload', { ignoreCache: true });
        await waitForAppReady(tab);
        const refreshed = await tab.evaluate(`(() => {
            const column = state.columns.find(item => item.id === 'C2');
            const segments = Object.fromEntries(state.floors.map(floor => [
                floor.id,
                resolveColumnSegmentState(column, floor.id)
            ]));
            calculate();
            const topology = collectColumnTopologyValidation();
            const model = collectCSIExportModelData();
            const blocked = generator => {
                try {
                    generator();
                    return { blocked: false, message: '' };
                } catch (error) {
                    return { blocked: true, message: String(error?.message || error) };
                }
            };
            const staad = blocked(() => generateSTAADContent(model));
            const etabs = blocked(() => generateETABSOAPIScript(model));
            const ifcContent = generateIFCContent(model);
            const ifcAudit = cloneSerializable(window.lastIFCExportAudit, {});
            const dxfContent = generateDXFContent();
            const dxfAudit = cloneSerializable(window.lastDXFExportAudit, {});
            populateColumnSchedule();
            let reportHtml = '';
            const originalOpen = window.open;
            window.open = () => ({
                document: { write: value => { reportHtml = String(value || ''); }, close: () => {} },
                print: () => {}
            });
            try {
                generatePDFReport();
            } finally {
                window.open = originalOpen;
            }
            const saved = buildProjectData({ revisionId: 'fs119-olango-terminated-c2-refresh-20260723' });
            window.__FS119RefreshedArtifacts = {
                project: JSON.stringify(saved, null, 2),
                ifcContent,
                dxfContent,
                reportHtml
            };
            return {
                floorIds: state.floors.map(floor => floor.id),
                segments,
                typicalFromLower: !!state.floors.find(floor => floor.id === 'RF')?.typicalFromLower,
                topology: topology.summary,
                topologyItems: topology.items.filter(item => item.status !== 'PASS'),
                counts: model.counts,
                staad,
                etabs,
                ifcAudit,
                dxfAudit,
                scheduleText: document.getElementById('colScheduleBody')?.textContent.replace(/\\s+/g, ' ').trim() || '',
                report: {
                    hasC2: reportHtml.includes('C-C2'),
                    hasTermination: reportHtml.includes('Terminates at 2F'),
                    hasUnsupported: reportHtml.includes('Unsupported'),
                    hasSolverBlock: reportHtml.includes('block STAAD and ETABS export')
                },
                schemaVersion: saved.schemaVersion,
                minimumAppVersion: saved.compatibility?.minimumAppVersion || ''
            };
        })()`);

        assert(
            JSON.stringify(refreshed.floorIds) === JSON.stringify(['GF', '2F', 'RF']) &&
            refreshed.segments.GF.active && refreshed.segments['2F'].active &&
            !refreshed.segments.RF.active && refreshed.typicalFromLower,
            'C2 termination did not survive the real browser refresh',
            refreshed
        );
        assert(
            !refreshed.topology.solverReady &&
            refreshed.counts.columns === 47 && refreshed.counts.beams === 127 && refreshed.counts.slabs === 62 &&
            refreshed.staad.blocked && refreshed.etabs.blocked,
            'Browser-refreshed termination lost topology/export parity',
            refreshed
        );
        assert(
            /C-C2/.test(refreshed.scheduleText) &&
            /Terminates at 2F/.test(refreshed.scheduleText) &&
            /Unsupported/.test(refreshed.scheduleText) &&
            refreshed.report.hasC2 && refreshed.report.hasTermination &&
            refreshed.report.hasUnsupported && refreshed.report.hasSolverBlock,
            'Browser-refreshed schedule/report does not match terminated plan/3D',
            refreshed
        );
        assert(
            refreshed.schemaVersion === '0.2.0' && refreshed.minimumAppVersion === '3.16.119',
            'Browser-refreshed project lost schema compatibility metadata',
            refreshed
        );

        const terminatedArtifacts = {
            project: await tab.evaluate('window.__FS119RefreshedArtifacts.project'),
            dxf: await tab.evaluate('window.__FS119RefreshedArtifacts.dxfContent'),
            ifc: await tab.evaluate('window.__FS119RefreshedArtifacts.ifcContent'),
            report: await tab.evaluate('window.__FS119RefreshedArtifacts.reportHtml')
        };
        fs.writeFileSync(artifactPaths.terminatedProject, terminatedArtifacts.project, 'utf8');
        fs.writeFileSync(artifactPaths.terminatedDxf, terminatedArtifacts.dxf, 'utf8');
        fs.writeFileSync(artifactPaths.terminatedIfc, terminatedArtifacts.ifc, 'utf8');
        fs.writeFileSync(artifactPaths.terminatedReport, terminatedArtifacts.report, 'utf8');
        refreshed.dxfParser = validateDxfWithEzdxf(terminatedArtifacts.dxf, 'fs119-olango-terminated-c2');
        refreshed.ifcParser = validateIfcWithIfcOpenShell(terminatedArtifacts.ifc, 'fs119-olango-terminated-c2');

        await tab.evaluate(`(() => {
            state.currentFloorIndex = state.floors.findIndex(floor => floor.id === 'RF');
            syncVisibleCantileversFromCurrentFloor();
            calculate();
            setPlanTab('structural');
            setView('2d');
            const maxX = Math.max(...state.columns.map(column => column.x));
            const maxY = Math.max(...state.columns.map(column => column.y));
            const captureMargin = 40;
            state.scale = Math.min(
                (canvas.width - captureMargin * 2) / maxX,
                (canvas.height - captureMargin * 2) / maxY,
                80
            );
            state.offsetX = (canvas.width - maxX * state.scale) / 2;
            state.offsetY = (canvas.height - maxY * state.scale) / 2;
            draw();
            return true;
        })()`);
        await wait(100);
        await tab.screenshot(terminatedPlanScreenshot);
        await tab.evaluate(`(() => {
            setView('3d');
            return true;
        })()`);
        await wait(600);
        await tab.screenshot(terminated3DScreenshot);

        const sourceHashAfter = sha256File(resolvedProjectPath);
        assert(sourceHashAfter === sourceHashBefore, 'Original Olango source changed during acceptance', {
            before: sourceHashBefore,
            after: sourceHashAfter,
            projectPath: resolvedProjectPath
        });

        const relevantLogs = tab.logs.filter(log =>
            ['error', 'exception'].includes(log.type) ||
            (log.type === 'warning' && !String(log.args?.[0] || '').includes('Release manifest fallback active'))
        );
        assert(
            !relevantLogs.some(log => ['error', 'exception'].includes(log.type)),
            'Olango release gate produced browser errors',
            relevantLogs
        );

        const evidence = {
            gate: 'P0-C1A RELEASE GATE',
            date: '2026-07-23',
            source: {
                path: resolvedProjectPath,
                sha256Before: sourceHashBefore,
                sha256After: sourceHashAfter,
                unchanged: sourceHashBefore === sourceHashAfter
            },
            unchanged: {
                before: unchanged.before,
                serialized: unchanged.serialized,
                reopened: unchanged.reopened,
                beforeInterfaces: unchanged.beforeInterfaces,
                reopenedInterfaces: unchanged.reopenedInterfaces,
                dxfParser: unchanged.dxfParser,
                ifcParser: unchanged.ifcParser
            },
            termination: {
                targetColumnId: termination.targetColumnId,
                preview: termination.firstAction.preview,
                afterCalculate: termination.afterCalculate,
                floorSwitch: termination.floorSwitch,
                afterTypical: termination.afterTypical,
                afterSaveReopen: termination.afterSaveReopen,
                terminatedInterfaces: termination.afterSaveInterfaces,
                undoRestoredExactFingerprint: JSON.stringify(termination.former) === JSON.stringify(termination.undoFingerprint),
                undoInterfaces: termination.undoInterfaces,
                autosaveWritten: termination.autosaveWritten,
                refreshed
            },
            knownPreExistingOutOfScope: {
                cantileverSideBeamRegularOverlaps: 'Recorded by generic Olango smoke; not modified in P0-C1A.'
            },
            artifacts: {
                ...artifactPaths,
                unchangedPlanScreenshot,
                terminatedPlanScreenshot,
                terminated3DScreenshot
            },
            browserLogs: relevantLogs
        };
        fs.writeFileSync(artifactPaths.evidence, JSON.stringify(evidence, null, 2), 'utf8');
        return evidence;
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
        displayMarks: checkDisplayMarkOrdering(),
        releaseManifest: checkReleaseManifest(),
        historicalFixture: checkHistoricalFstrFixture(),
        columnSegmentFixtures: checkColumnSegmentFixtures(),
        columnSegmentSourceContract: checkColumnSegmentSourceContract(),
        dxfSourceContract: checkDxfSourceContract(),
        revitImportSourceContract: checkRevitImportSourceContract(),
        ifcSourceContract: checkIfcSourceContract(),
        stairSourceContract: checkStairSourceContract(),
        stairStructuralFixture: checkStairStructuralFixture(),
        verticalDatumSourceContract: checkVerticalDatumSourceContract(),
        verticalDatumFixture: checkVerticalDatumFixture(),
        solverRoundTripSourceContract: checkSolverRoundTripSourceContract(),
        canonicalAnalyticalFixtureSourceContract: checkCanonicalAnalyticalFixtureSourceContract(),
        analysisInputsSourceContract: checkAnalysisInputsSourceContract(),
        wallInventorySourceContract: checkWallInventorySourceContract(),
        wallSolverTransferSourceContract: checkWallSolverTransferSourceContract(),
        roofFrameSourceContract: checkRoofFrameSourceContract(),
        analysisOptimizationSourceContract: checkAnalysisOptimizationSourceContract(),
        desktopETABSBridge: checkDesktopETABSBridge()
    };
    const projectPath = getArgValue('--project');
    const etabsScriptPath = getArgValue('--write-etabs-script');
    const staadPath = getArgValue('--write-staad');
    const ifcPath = getArgValue('--write-ifc');
    const dxfPath = getArgValue('--write-dxf');
    const canonicalEtabsScriptPath = getArgValue('--write-canonical-etabs-script');
    const canonicalStaadPath = getArgValue('--write-canonical-staad');
    const canonicalModelPath = getArgValue('--write-canonical-model');
    const edgeEtabsScriptPath = getArgValue('--write-edge-etabs-script');
    const edgeStaadPath = getArgValue('--write-edge-staad');
    const edgeModelPath = getArgValue('--write-edge-model');
    const wallEtabsScriptPath = getArgValue('--write-wall-etabs-script');
    const wallStaadPath = getArgValue('--write-wall-staad');
    const wallModelPath = getArgValue('--write-wall-model');
    const fs123OutputDir = getArgValue('--fs123-output-dir');
    const projectOnly = process.argv.includes('--project-only');
    const wallOnly = process.argv.includes('--wall-only');
    const p0C1AReleaseGate = process.argv.includes('--p0-c1a-release-gate');
    const p0C1AOutputDir = getArgValue('--p0-c1a-output-dir');

    [
        'v3/engine/loads.js',
        'v3/engine/tributary.js',
        'v3/engine/stairs.js',
        'v3/engine/analysis-inputs.js',
        'v3/engine/walls.js',
        'v3/engine/roof-frame.js',
        'v3/engine/vertical-datums.js',
        'v3/persistence/project-revisions.js',
        'v3/solver-roundtrip.js'
    ].forEach(file => {
        checkNodeSyntax(file);
        summary.engines.push(file);
    });
    checkNodeSyntax('v3/dxf-export.js');
    summary.engines.push('v3/dxf-export.js');

    if (process.argv.includes('--no-browser')) {
        console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
        return;
    }

    assert(!projectOnly || projectPath, 'Project-only smoke requires --project <project.fstr>');
    const historicalFixture = JSON.parse(fs.readFileSync(HISTORICAL_FSTR_FIXTURE, 'utf8'));
    const browser = projectOnly || wallOnly ? null : await runBrowserSmoke(historicalFixture, fs123OutputDir);
    const canonicalSolverArtifacts = !projectOnly && !wallOnly
        ? await writeCanonicalSolverArtifacts(canonicalEtabsScriptPath, canonicalStaadPath, canonicalModelPath)
        : null;
    const edgeCantileverSolverArtifacts = !projectOnly && !wallOnly
        ? await writeEdgeCantileverSolverArtifacts(edgeEtabsScriptPath, edgeStaadPath, edgeModelPath)
        : null;
    const wallSolverArtifacts = !projectOnly
        ? await writeWallSolverArtifacts(wallEtabsScriptPath, wallStaadPath, wallModelPath)
        : null;
    const project = projectPath ? await runProjectSmoke(projectPath, etabsScriptPath, staadPath, ifcPath, dxfPath) : null;
    assert(!p0C1AReleaseGate || projectPath, 'P0-C1A release gate requires --project <Olango safety copy>');
    assert(!p0C1AReleaseGate || p0C1AOutputDir, 'P0-C1A release gate requires --p0-c1a-output-dir <acceptance directory>');
    const p0C1AAcceptance = p0C1AReleaseGate
        ? await runP0C1AOlangoAcceptance(projectPath, p0C1AOutputDir)
        : null;
    console.log(JSON.stringify({ ok: true, ...summary, browser, canonicalSolverArtifacts, edgeCantileverSolverArtifacts, wallSolverArtifacts, project, p0C1AAcceptance }, null, 2));
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
