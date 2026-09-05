(function attachAnalysisInputs(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.AnalyticalInputs.v1';
    const LOAD_CASES = Object.freeze([
        { id: 'FS_DEAD', type: 'DEAD', purpose: 'element_self_weight', selfWeightMultiplier: 1, massEligible: false },
        { id: 'FS_SDL', type: 'SUPERDEAD', purpose: 'superimposed_dead', selfWeightMultiplier: 0, massEligible: true },
        { id: 'FS_WALL', type: 'SUPERDEAD', purpose: 'permanent_wall_partition', selfWeightMultiplier: 0, massEligible: true },
        { id: 'FS_LIVE', type: 'LIVE', purpose: 'occupancy_live', selfWeightMultiplier: 0, massEligible: false },
        { id: 'FS_STAIR_DL', type: 'SUPERDEAD', purpose: 'stair_dead_surface', selfWeightMultiplier: 0, massEligible: true },
        { id: 'FS_STAIR_LL', type: 'LIVE', purpose: 'stair_live_surface', selfWeightMultiplier: 0, massEligible: false }
    ]);

    function number(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function positive(value) {
        return Math.max(0, number(value));
    }

    function clone(value, fallback) {
        return value == null ? fallback : JSON.parse(JSON.stringify(value));
    }

    function loadAssignments(model) {
        const slabArea = [];
        const beamLine = [];
        const stairArea = [];
        (model.slabs || []).forEach(slab => {
            const area = Math.max(0, number(slab.areaM2 || slab.area));
            if (positive(slab.superDead) > 0) slabArea.push({ elementId: slab.id, caseId: 'FS_SDL', value: positive(slab.superDead), unit: 'kPa', areaM2: area });
            if (positive(slab.live) > 0) slabArea.push({ elementId: slab.id, caseId: 'FS_LIVE', value: positive(slab.live), unit: 'kPa', areaM2: area });
        });
        (model.beams || []).forEach(beam => {
            if (positive(beam.wallLoad) > 0) beamLine.push({ elementId: beam.id, caseId: 'FS_WALL', value: positive(beam.wallLoad), unit: 'kN/m' });
        });
        (model.stairSlabs || []).forEach(slab => {
            if (positive(slab.superDead) > 0) stairArea.push({ elementId: slab.id, caseId: 'FS_STAIR_DL', value: positive(slab.superDead), unit: 'kPa' });
            if (positive(slab.live) > 0) stairArea.push({ elementId: slab.id, caseId: 'FS_STAIR_LL', value: positive(slab.live), unit: 'kPa' });
        });
        return { slabArea, beamLine, stairArea };
    }

    function buildCombinations() {
        return [
            { id: 'ULS-1.4D', type: 'ULTIMATE', factors: [
                { caseId: 'FS_DEAD', factor: 1.4 }, { caseId: 'FS_SDL', factor: 1.4 },
                { caseId: 'FS_WALL', factor: 1.4 }, { caseId: 'FS_STAIR_DL', factor: 1.4 }
            ] },
            { id: 'ULS-1.2D+1.6L', type: 'ULTIMATE', factors: [
                { caseId: 'FS_DEAD', factor: 1.2 }, { caseId: 'FS_SDL', factor: 1.2 },
                { caseId: 'FS_WALL', factor: 1.2 }, { caseId: 'FS_STAIR_DL', factor: 1.2 },
                { caseId: 'FS_LIVE', factor: 1.6 }, { caseId: 'FS_STAIR_LL', factor: 1.6 }
            ] },
            { id: 'SLS-D+L', type: 'SERVICE', factors: [
                { caseId: 'FS_DEAD', factor: 1 }, { caseId: 'FS_SDL', factor: 1 },
                { caseId: 'FS_WALL', factor: 1 }, { caseId: 'FS_STAIR_DL', factor: 1 },
                { caseId: 'FS_LIVE', factor: 1 }, { caseId: 'FS_STAIR_LL', factor: 1 }
            ] }
        ];
    }

    function buildSupports(model) {
        const baseElevation = number(model.verticalDatums?.baseSupportElevation, NaN);
        const registry = new Map();
        (model.columns || []).forEach(column => {
            if (baseElevation !== baseElevation || Math.abs(number(column.z1, NaN) - baseElevation) > 1e-6) return;
            const key = `${number(column.x).toFixed(6)}:${number(column.y).toFixed(6)}`;
            if (!registry.has(key)) registry.set(key, {
                id: `SUP-${registry.size + 1}`,
                nodeX: number(column.x),
                nodeY: number(column.y),
                elevation: baseElevation,
                restraint: [true, true, true, true, true, true],
                sourceColumnIds: []
            });
            registry.get(key).sourceColumnIds.push(column.id);
        });
        return [...registry.values()];
    }

    function validate(inputs) {
        const blockers = [];
        const warnings = [];
        const selfWeightCases = inputs.loadCases.filter(item => item.selfWeightMultiplier > 0);
        if (selfWeightCases.length !== 1 || selfWeightCases[0].selfWeightMultiplier !== 1) {
            blockers.push('Element self-weight must be present exactly once in FS_DEAD.');
        }
        if (inputs.massSource.includeLive) blockers.push('Live load is included in the mass source without an occupancy decision.');
        if (!inputs.massSource.elementSelfMassOnce) blockers.push('Mass source does not explicitly govern element self-mass exactly once.');
        if (!inputs.massSource.includedCaseIds.includes('FS_SDL') || !inputs.massSource.includedCaseIds.includes('FS_WALL')) {
            blockers.push('Mass source must include superimposed dead and permanent wall load.');
        }
        if (!inputs.supports.length) blockers.push('No explicit base support assignments were resolved.');
        if (!inputs.combinations.length) blockers.push('No load combinations were defined.');
        if (!inputs.assignments.slabArea.length) warnings.push('No slab area load assignments were found.');
        return {
            status: blockers.length ? 'BLOCKED' : 'READY_FOR_ADAPTER',
            solverReady: blockers.length === 0,
            blockers,
            warnings,
            checks: {
                elementSelfMassOnce: selfWeightCases.length === 1 && selfWeightCases[0].selfWeightMultiplier === 1,
                liveMassExcluded: inputs.massSource.includeLive === false,
                sdlIncluded: inputs.massSource.includedCaseIds.includes('FS_SDL'),
                wallIncluded: inputs.massSource.includedCaseIds.includes('FS_WALL'),
                explicitSupports: inputs.supports.length > 0
            }
        };
    }

    function build(model) {
        const assignments = loadAssignments(model);
        const inputs = {
            contract: CONTRACT,
            units: { force: 'kN', length: 'm', areaLoad: 'kPa', lineLoad: 'kN/m' },
            policy: {
                elementSelfMassOnce: 'FS_DEAD selfWeightMultiplier=1; adapters must not add member self-weight again',
                superimposedDead: 'FS_SDL only',
                permanentWalls: 'FS_WALL only',
                liveMass: 'excluded_pending_occupancy_decision',
                supports: 'explicit base restraints derived from governed BASE/FOUNDATION elevation'
            },
            loadCases: clone(LOAD_CASES, []),
            combinations: buildCombinations(),
            massSource: {
                id: 'MS-FS-GOVERNED',
                elementSelfMassOnce: true,
                includedCaseIds: ['FS_SDL', 'FS_WALL', 'FS_STAIR_DL'],
                includeLive: false,
                liveLoadDecision: 'excluded_pending_occupancy_decision'
            },
            supports: buildSupports(model),
            assignments,
            provenance: {
                source: 'FutolStructure governed analytical-input policy',
                verticalDatumSchema: model.verticalDatums?.schema || '',
                modelBuildId: model.provenance?.buildId || ''
            }
        };
        inputs.validation = validate(inputs);
        return inputs;
    }

    global.FSAnalysisInputs = Object.freeze({ contract: CONTRACT, loadCases: LOAD_CASES, build, validate });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSAnalysisInputs;
})(typeof window !== 'undefined' ? window : globalThis);
