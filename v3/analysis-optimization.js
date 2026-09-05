(function attachAnalysisOptimization(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.AnalysisOptimization.v1';
    const REQUEST_CONTRACT = 'FutolStructure.AnalysisRequest.v1';
    const JOB_CONTRACT = 'FutolStructure.AnalysisOptimizationJob.v1';

    const ENGINE_REGISTRY = Object.freeze({
        pynite: Object.freeze({
            id: 'pynite',
            name: 'PyNite',
            family: 'analysis',
            capability: 'linear_static_gravity',
            phase: 'P7.2',
            adapterStatus: 'planned',
            purpose: 'Fast internal gravity and load-path benchmark',
            resultPolicy: 'compare-only-until-validated'
        }),
        opensees: Object.freeze({
            id: 'opensees',
            name: 'OpenSees',
            family: 'analysis',
            capability: 'nonlinear_seismic_dynamic',
            phase: 'P7.3',
            adapterStatus: 'planned',
            purpose: 'Advanced nonlinear and seismic analysis adapter',
            resultPolicy: 'compare-only-until-validated'
        }),
        qubo: Object.freeze({
            id: 'qubo',
            name: 'QUBO',
            family: 'optimization',
            capability: 'member_size_optimization',
            phase: 'P7.4',
            adapterStatus: 'planned',
            purpose: 'Constrained member-size candidate generation',
            resultPolicy: 'proposal-only-engineer-approval'
        })
    });

    function finiteNumber(value) {
        if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function clone(value, fallback) {
        if (value == null) return fallback;
        return JSON.parse(JSON.stringify(value));
    }

    function freezeSnapshot(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freezeSnapshot);
            Object.freeze(value);
        }
        return value;
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function getEngineDefinition(engineId) {
        const key = String(engineId || '').trim().toLowerCase();
        return ENGINE_REGISTRY[key] || null;
    }

    function listEngineDefinitions() {
        return Object.values(ENGINE_REGISTRY).map(engine => ({ ...engine }));
    }

    function summarizeModel(model) {
        if (!model || typeof model !== 'object' || Array.isArray(model)) {
            throw new Error('A canonical FutolStructure CSI model is required.');
        }
        const counts = model.counts || {};
        return {
            schema: model.schema || '',
            provenance: clone(model.provenance, {}),
            verticalDatums: clone(model.verticalDatums, {}),
            levels: asArray(model.levels).map(level => ({
                id: level?.id || '',
                name: level?.name || level?.id || '',
                elevation: finiteNumber(level?.elevation),
                kind: level?.kind || ''
            })),
            counts: {
                stories: Number(counts.stories) || 0,
                columns: Number(counts.columns) || 0,
                beams: Number(counts.beams) || 0,
                slabs: Number(counts.slabs) || 0,
                stairs: Number(counts.stairs) || 0,
                stairBeams: Number(counts.stairBeams) || 0,
                stairSlabs: Number(counts.stairSlabs) || 0,
                footings: Number(counts.footings) || 0,
                pedestals: Number(counts.pedestals) || 0,
                tieBeams: Number(counts.tieBeams) || 0
            }
        };
    }

    function collectReadiness(model) {
        const summary = summarizeModel(model);
        const blockers = [];
        const warnings = [];
        if (summary.schema !== 'FutolStructure.CSIExportModel.v1') {
            blockers.push('The request is not based on the canonical CSI export model.');
        }
        if (!summary.counts.stories) blockers.push('At least one governed storey is required.');
        if (!summary.counts.columns) blockers.push('At least one active column segment is required.');
        if (!summary.counts.beams) blockers.push('At least one active beam is required.');
        if (!summary.levels.length) blockers.push('Governed absolute levels are missing.');
        if (summary.levels.some(level => level.elevation == null)) {
            blockers.push('Every exported level must have an absolute elevation.');
        }
        for (const [label, validation] of [
            ['Column topology', model.topologyValidation],
            ['Stair topology', model.stairTopologyValidation],
            ['Member sizes', model.memberSizeGovernance],
            ['Shared analytical inputs', model.analysisInputValidation]
        ]) {
            if (validation?.summary?.solverReady === false || Number(validation?.summary?.blocked) > 0 || validation?.status === 'BLOCKED') {
                blockers.push(`${label} is blocked by the canonical model checks.`);
            }
            for (const item of asArray(validation?.items)) {
                const message = `${label}: ${item.message || item.code || item.id || item.segmentId || item.stairId || item.status}`;
                if (item.status === 'BLOCKED') blockers.push(message);
                else if (item.status && item.status !== 'PASS') warnings.push(message);
            }
        }
        if (model.coordinateTransform?.source !== 'FutolStructure X-right/Y-down') {
            warnings.push('Coordinate transform provenance is not the governed FutolStructure transform.');
        }
        if (!summary.provenance?.projectId) warnings.push('Project provenance is not stamped.');
        if (!summary.provenance?.sourceRevisionId) warnings.push('Source revision is not stamped.');
        const pending = ['Engine adapter and native result validation'];
        if (!model.loadCases) pending.push('Shared load-case definitions');
        if (!model.loadCombinations?.length) pending.push('Shared load-combination definitions');
        if (!model.massSource) pending.push('Shared mass-source definition');
        if (!model.supports?.length) pending.push('Explicit analysis support assignments');
        return {
            status: blockers.length ? 'BLOCKED' : 'DRAFT_ONLY',
            blockers,
            warnings,
            pending,
            summary
        };
    }

    function createCanonicalRequest(model, options = {}) {
        const readiness = collectReadiness(model);
        return freezeSnapshot({
            contract: REQUEST_CONTRACT,
            createdAt: new Date().toISOString(),
            source: {
                schema: model.schema || '',
                provenance: clone(model.provenance, {}),
                revisionPolicy: 'immutable-source-snapshot'
            },
            units: { length: 'm', force: 'kN', stress: 'MPa', density: 'kN/m3' },
            // Retain the full source, including fields not yet mapped by an adapter.
            canonicalModel: clone(model, {}),
            materials: { fcMPa: model.fcMPa, fyMPa: model.fyMPa, concreteDensity: model.concreteDensity },
            analyticalGeometry: clone(model.analyticalGeometry, {}),
            coordinateTransform: clone(model.coordinateTransform, {}),
            verticalDatums: clone(model.verticalDatums, {}),
            levels: clone(model.levels, []),
            gridDefinition: clone(model.gridDefinition, {}),
            sections: {
                frame: clone(model.frameSections, []),
                slab: clone(model.slabSections, [])
            },
            geometry: {
                columns: clone(model.columns, []),
                beams: clone(model.beams, []),
                slabs: clone(model.slabs, []),
                stairBeams: clone(model.stairBeams, []),
                stairSlabs: clone(model.stairSlabs, []),
                stairOpenings: clone(model.stairOpenings, []),
                stairSupportReactions: clone(model.stairSupportReactions, []),
                foundation: clone(model.foundation, {})
            },
            loads: {
                model: clone(model.loads || model.loadCases || {}, {}),
                combinations: clone(model.loadCombinations || model.combinations, []),
                massSource: clone(model.massSource || {}, {})
            },
            governance: {
                topology: clone(model.topologyValidation, {}),
                stairs: clone(model.stairTopologyValidation, {}),
                memberSizes: clone(model.memberSizeGovernance, {}),
            analyticalInputs: clone(model.analysisInputValidation, {}),
                wallInventory: clone(model.wallInventory, {}),
                wallElevations: clone(model.wallElevations, []),
                foundationHandoff: clone(model.foundationHandoff, {}),
                noSilentGeometryRewrite: true
            },
            options: clone(options, {}),
            readiness
        });
    }

    let nextJobId = 0;
    function createEngineJob(engineId, model, options = {}) {
        const engine = getEngineDefinition(engineId);
        if (!engine) throw new Error(`Unknown analysis engine: ${engineId || 'none'}.`);
        const request = createCanonicalRequest(model, options);
        const suffix = `${Date.now().toString(36).toUpperCase()}-${++nextJobId}`;
        const status = request.readiness.status === 'BLOCKED' ? 'BLOCKED' : 'ADAPTER_PENDING';
        return freezeSnapshot({
            contract: JOB_CONTRACT,
            jobId: `FS-${engine.id.toUpperCase()}-${suffix}`,
            createdAt: new Date().toISOString(),
            engine: { ...engine },
            status,
            execution: {
                mode: 'governed-adapter',
                runAllowed: false,
                applyResultsAllowed: false,
                reason: status === 'BLOCKED'
                    ? 'Resolve model readiness blockers before adapter execution.'
                    : 'Adapter is not yet attached to the shared runtime contract.'
            },
            request
        });
    }

    function createOptimizationProposal(model, options = {}) {
        const job = createEngineJob('qubo', model, options);
        return freezeSnapshot({
            contract: CONTRACT,
            proposalId: `${job.jobId}-PROPOSAL`,
            status: job.status === 'BLOCKED' ? 'BLOCKED' : 'DRAFT',
            candidates: [],
            objective: options.objective || 'minimize embodied cost subject to governed strength and service constraints',
            constraints: asArray(options.constraints).length
                ? clone(options.constraints, [])
                : ['deterministic FS baseline required', 'section catalog must be explicit', 'engineer approval required before apply'],
            sourceJob: job,
            applyPolicy: 'never-write-directly-to-canonical-model'
        });
    }

    global.FSAnalysisOptimization = Object.freeze({
        contract: CONTRACT,
        requestContract: REQUEST_CONTRACT,
        jobContract: JOB_CONTRACT,
        engines: ENGINE_REGISTRY,
        getEngineDefinition,
        listEngineDefinitions,
        summarizeModel,
        collectReadiness,
        createCanonicalRequest,
        createEngineJob,
        createOptimizationProposal
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSAnalysisOptimization;
})(typeof window !== 'undefined' ? window : globalThis);
