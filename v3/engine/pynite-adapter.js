(function attachPyNiteAdapter(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.PyNiteAdapter.v1';
    const RUN_REQUEST_CONTRACT = 'FutolStructure.PyNiteRunRequest.v1';
    const REQUEST_CONTRACT = 'FutolStructure.AnalysisRequest.v1';
    const FEATURE_MANIFEST = Object.freeze({
        contract: 'FutolStructure.AdapterFeatureManifest.v1',
        engine: 'pynite',
        supported: Object.freeze([
            'horizontal_frame_members',
            'horizontal_quad_slabs',
            'explicit_base_restraints',
            'governed_gravity_loads'
        ]),
        blockedUntilImplemented: Object.freeze([
            'physical_member_joint_offsets',
            'vertical_member_insertion_offsets',
            'sloped_members'
        ]),
        policy: 'unsupported_features_block_before_analysis'
    });

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

    function consolidateUnsupportedFeatures(findings) {
        const consolidated = new Map();
        for (const finding of asArray(findings)) {
            const feature = finding?.feature || 'unknown_feature';
            const elementId = finding?.elementId || '';
            const key = `${feature}|${elementId}`;
            const existing = consolidated.get(key);
            if (existing) {
                if (finding.path && !existing.paths.includes(finding.path)) existing.paths.push(finding.path);
                continue;
            }
            consolidated.set(key, {
                feature,
                elementId,
                path: finding?.path || '',
                paths: finding?.path ? [finding.path] : []
            });
        }
        return [...consolidated.values()];
    }

    function summarizeUnsupportedFeatures(findings) {
        const counts = new Map();
        for (const finding of asArray(findings)) {
            const feature = finding?.feature || 'unknown_feature';
            counts.set(feature, (counts.get(feature) || 0) + 1);
        }
        return [...counts.entries()]
            .map(([feature, count]) => `${feature}=${count} ${count === 1 ? 'member' : 'members'}`)
            .join(', ');
    }

    function finite(value) {
        if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function nonZero(value) {
        const parsed = finite(value);
        return parsed != null && Math.abs(parsed) > 1e-9;
    }

    function resolveRequest(value) {
        if (value?.contract === RUN_REQUEST_CONTRACT && value.request) return value.request;
        return value;
    }

    function collectUnsupportedFeatures(request) {
        const canonical = resolveRequest(request);
        const model = canonical?.canonicalModel || {};
        const findings = [];
        const inspectOffsetMap = (item, path, feature) => {
            const offset = item?.[path];
            if (!offset || typeof offset !== 'object') return;
            for (const end of ['start', 'end']) {
                const value = offset[end];
                if (value && (nonZero(value.dx) || nonZero(value.dy) || nonZero(value.dz))) {
                    findings.push({ feature, elementId: item.id || item.sourceId || '', path: `${path}.${end}` });
                }
            }
        };
        for (const item of asArray(model.beams)) {
            inspectOffsetMap(item, 'jointOffsets', 'physical_member_joint_offsets');
            for (const path of ['sharedSolverPlan', 'sourcePlan']) {
                const plan = item?.jointOffsets?.[path];
                if (!plan || typeof plan !== 'object') continue;
                for (const end of ['start', 'end']) {
                    const value = plan[end];
                    if (value && (nonZero(value.dx) || nonZero(value.dy) || nonZero(value.dz))) {
                        findings.push({
                            feature: 'physical_member_joint_offsets',
                            elementId: item.id || item.sourceId || '',
                            path: `jointOffsets.${path}.${end}`
                        });
                    }
                }
            }
            if (nonZero(item.verticalInsertionOffsetM)) {
                findings.push({ feature: 'vertical_member_insertion_offsets', elementId: item.id || item.sourceId || '', path: 'verticalInsertionOffsetM' });
            }
            const z1 = finite(item.z1 ?? item.startZ);
            const z2 = finite(item.z2 ?? item.endZ);
            if (z1 != null && z2 != null && Math.abs(z2 - z1) > 1e-9) {
                findings.push({ feature: 'sloped_members', elementId: item.id || item.sourceId || '', path: 'z1/z2' });
            }
        }
        for (const item of asArray(model.columns)) {
            const x1 = finite(item.x1 ?? item.startX);
            const y1 = finite(item.y1 ?? item.startY);
            const x2 = finite(item.x2 ?? item.endX);
            const y2 = finite(item.y2 ?? item.endY);
            if (x1 != null && y1 != null && x2 != null && y2 != null &&
                (Math.abs(x2 - x1) > 1e-9 || Math.abs(y2 - y1) > 1e-9)) {
                findings.push({ feature: 'sloped_members', elementId: item.id || item.sourceId || '', path: 'x/y endpoints' });
            }
        }
        return consolidateUnsupportedFeatures(findings);
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
        const unsupported = collectUnsupportedFeatures(canonical);
        if (unsupported.length) {
            blockers.push(`PyNite feature scope is unsupported until Phase 1B mapping is implemented: ${summarizeUnsupportedFeatures(unsupported)}.`);
        }
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
        const scopeAudit = collectUnsupportedFeatures(canonical);
        const runRequest = {
            contract: RUN_REQUEST_CONTRACT,
            createdAt: new Date().toISOString(),
            engine: 'pynite',
            mode: 'linear_static_gravity',
            status: blockers.length ? 'BLOCKED' : 'READY_FOR_RUN',
            blockers,
            warnings: collectWarnings(canonical),
            featureManifest: clone(FEATURE_MANIFEST, {}),
            scopeAudit: {
                status: scopeAudit.length ? 'BLOCKED' : 'SUPPORTED_BASELINE',
                unsupported: scopeAudit
            },
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
        featureManifest: FEATURE_MANIFEST,
        createRunRequest,
        prepareJob,
        collectBlockers,
        collectWarnings,
        collectUnsupportedFeatures
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSPyNite;
})(typeof window !== 'undefined' ? window : globalThis);
