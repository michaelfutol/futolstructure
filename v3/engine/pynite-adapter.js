(function attachPyNiteAdapter(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.PyNiteAdapter.v1';
    const RUN_REQUEST_CONTRACT = 'FutolStructure.PyNiteRunRequest.v1';
    const REQUEST_CONTRACT = 'FutolStructure.AnalysisRequest.v1';

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

    function unique(values) {
        return [...new Set(values.filter(Boolean))];
    }

    function resolveRequest(value) {
        if (value?.contract === RUN_REQUEST_CONTRACT && value.request) return value.request;
        return value;
    }

    function collectBlockers(request) {
        const canonical = resolveRequest(request);
        const blockers = [
            ...asArray(canonical?.readiness?.blockers),
            ...asArray(canonical?.canonicalModel?.analysisInputValidation?.blockers)
        ];
        if (canonical?.contract !== REQUEST_CONTRACT) blockers.push('PyNite requires FutolStructure.AnalysisRequest.v1.');
        if (!canonical?.canonicalModel?.analysisInputValidation?.solverReady) {
            blockers.push('Shared analytical inputs are not solver-ready.');
        }
        if (!asArray(canonical?.loads?.combinations).length) blockers.push('No governed load combinations are available.');
        if (!asArray(canonical?.canonicalModel?.supports).length) blockers.push('No explicit base supports are available.');
        return unique(blockers);
    }

    function collectWarnings(request) {
        const canonical = resolveRequest(request);
        const model = canonical?.canonicalModel || {};
        const warnings = [
            ...asArray(canonical?.readiness?.warnings),
            'PyNite results are comparison evidence only until benchmarked against an accepted native solver model.',
            'No PyNite result may be applied directly to the canonical FutolStructure model.'
        ];
        if (asArray(model.stairBeams).length || asArray(model.stairSlabs).length) {
            warnings.push('Stair components remain pending native connectivity/load validation.');
        }
        if (model.foundationHandoff?.geometryExportedToETABS === false) {
            warnings.push('Foundation geometry is coordination-only; base restraints remain the analytical support contract.');
        }
        return unique(warnings);
    }

    function createRunRequest(request, options = {}) {
        const canonical = resolveRequest(request);
        const blockers = collectBlockers(canonical);
        const runRequest = {
            contract: RUN_REQUEST_CONTRACT,
            createdAt: new Date().toISOString(),
            engine: 'pynite',
            mode: 'linear_static_gravity',
            status: blockers.length ? 'BLOCKED' : 'READY_FOR_RUN',
            blockers,
            warnings: collectWarnings(canonical),
            source: clone(canonical?.source, {}),
            provenance: clone(canonical?.canonicalModel?.provenance, {}),
            options: {
                includeModal: false,
                applyResults: false,
                cancellationSupported: true,
                requestedCombinations: clone(options.requestedCombinations, null),
                ...clone(options, {})
            },
            request: clone(canonical, {})
        };
        return freezeSnapshot(runRequest);
    }

    function prepareJob(model, options = {}) {
        if (!global.FSAnalysisOptimization?.createEngineJob) {
            throw new Error('The shared analysis request engine is not loaded.');
        }
        const draft = global.FSAnalysisOptimization.createEngineJob('pynite', model, options);
        const runRequest = createRunRequest(draft.request, options);
        const blocked = draft.status === 'BLOCKED' || runRequest.status === 'BLOCKED';
        const status = blocked ? 'BLOCKED' : 'READY_FOR_RUN';
        return freezeSnapshot({
            ...draft,
            contract: CONTRACT,
            status,
            adapter: {
                contract: CONTRACT,
                runner: 'v3/tools/run-pynite.py',
                requirements: 'v3/tools/requirements-pynite.txt',
                resultPolicy: 'compare-only-until-validated'
            },
            execution: {
                ...draft.execution,
                mode: 'pynite-python-runner',
                runAllowed: !blocked,
                applyResultsAllowed: false,
                reason: blocked
                    ? 'Resolve analytical-input and topology blockers before preparing a PyNite run.'
                    : 'Runner request is ready; execution requires the controlled desktop Python environment.'
            },
            runRequest
        });
    }

    global.FSPyNite = Object.freeze({
        contract: CONTRACT,
        runRequestContract: RUN_REQUEST_CONTRACT,
        createRunRequest,
        prepareJob,
        collectBlockers,
        collectWarnings
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSPyNite;
})(typeof window !== 'undefined' ? window : globalThis);
