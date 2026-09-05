(function attachSolverRoundTrip(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.SolverRoundTrip.v1';
    const MODEL_SUMMARY_CONTRACT = 'FutolStructure.SolverRoundTripModelSummary.v1';

    function finiteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function integerCount(value) {
        const number = finiteNumber(value);
        return number == null ? null : Math.max(0, Math.round(number));
    }

    function clone(value, fallback) {
        if (value == null) return fallback;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return fallback;
        }
    }

    function valueAt(object, key) {
        if (!object || typeof object !== 'object') return undefined;
        if (Object.prototype.hasOwnProperty.call(object, key)) return object[key];
        if (object.counts && Object.prototype.hasOwnProperty.call(object.counts, key)) {
            return object.counts[key];
        }
        return undefined;
    }

    function levelKey(level) {
        return String(level?.id || level?.name || '').trim().toUpperCase();
    }

    function compareNumber(label, fsValue, solverValue, tolerance = 0.0001) {
        const fs = finiteNumber(fsValue);
        const solver = finiteNumber(solverValue);
        if (fs == null || solver == null) {
            return {
                label,
                fs,
                solver,
                delta: null,
                status: 'NOT_REPORTED'
            };
        }
        const delta = solver - fs;
        return {
            label,
            fs,
            solver,
            delta,
            status: Math.abs(delta) <= tolerance ? 'MATCH' : 'DIFF'
        };
    }

    function compareCount(label, fsValue, solverValue) {
        const fs = integerCount(fsValue);
        const solver = integerCount(solverValue);
        if (fs == null || solver == null) {
            return {
                label,
                fs,
                solver,
                delta: null,
                status: 'NOT_REPORTED'
            };
        }
        return {
            label,
            fs,
            solver,
            delta: solver - fs,
            status: fs === solver ? 'MATCH' : 'DIFF'
        };
    }

    function summarizeCurrentModel(model) {
        if (!model || typeof model !== 'object') {
            throw new Error('Current FutolStructure model is required for round-trip comparison.');
        }
        const counts = model.counts || {};
        const foundation = model.foundation || {};
        const foundationHandoff = model.foundationHandoff || {};
        const levels = Array.isArray(model.levels) ? model.levels : [];
        return {
            contract: MODEL_SUMMARY_CONTRACT,
            provenance: clone(model.provenance, {}),
            verticalDatums: clone(model.verticalDatums, {}),
            counts: {
                stories: integerCount(counts.stories),
                columns: integerCount(counts.columns),
                beams: integerCount(counts.beams),
                slabs: integerCount(counts.slabs),
                footings: integerCount(counts.footings ?? foundation.footings?.length),
                pedestals: integerCount(counts.pedestals ?? foundation.pedestals?.length),
                tieBeams: integerCount(counts.tieBeams ?? foundation.tieBeams?.length),
                frameObjects: (integerCount(counts.columns) || 0) + (integerCount(counts.beams) || 0),
                areaObjects: integerCount(counts.slabs)
            },
            levels: clone(levels, []).map(level => ({
                id: level?.id || '',
                name: level?.name || level?.id || '',
                elevation: finiteNumber(level?.elevation),
                kind: level?.kind || ''
            })),
            foundation: {
                mode: foundationHandoff.mode || (foundation.enabled ? 'plan' : 'baseReactionsOnly'),
                geometryExportedToETABS: foundationHandoff.geometryExportedToETABS === true,
                baseSupportRestraintsExportedToETABS: foundationHandoff.baseSupportRestraintsExportedToETABS === true,
                geometryHandoff: foundationHandoff.geometryHandoff || '',
                footingsInSource: integerCount(foundationHandoff.footingsInSource ?? counts.footings),
                pedestalsInSource: integerCount(foundationHandoff.pedestalsInSource ?? counts.pedestals),
                tieBeamsInSource: integerCount(foundationHandoff.tieBeamsInSource ?? counts.tieBeams)
            }
        };
    }

    function normalizeETABSAudit(rawAudit, sourceFileName = '') {
        if (!rawAudit || typeof rawAudit !== 'object' || Array.isArray(rawAudit)) {
            throw new Error('ETABS audit must be a JSON object.');
        }
        const wrapped = rawAudit.audit && typeof rawAudit.audit === 'object'
            ? rawAudit.audit
            : rawAudit;
        const solver = String(rawAudit.solver || wrapped.solver || 'ETABS').toUpperCase();
        if (solver !== 'ETABS') {
            throw new Error(`Unsupported solver audit: ${solver || 'unknown'}. Select an ETABS audit JSON.`);
        }
        const hasModelEvidence = [
            'stories', 'columns', 'beams', 'slabs', 'frameObjectsInETABS', 'areaObjectsInETABS',
            'modalModes', 'analysisReturn', 'foundation', 'levels', 'verticalDatums'
        ].some(key => wrapped[key] !== undefined || wrapped.counts?.[key] !== undefined);
        if (!hasModelEvidence) {
            throw new Error('The JSON does not contain a recognizable FutolStructure ETABS audit.');
        }
        return {
            ...clone(wrapped, {}),
            solver: 'ETABS',
            sourceFileName: sourceFileName || rawAudit.sourceFileName || wrapped.sourceFileName || ''
        };
    }

    function compareLevels(fsSummary, audit) {
        const solverLevels = Array.isArray(audit.levels) ? audit.levels : [];
        if (!solverLevels.length) {
            return {
                status: 'NOT_REPORTED',
                items: [],
                message: 'ETABS audit does not contain exported level elevations.'
            };
        }
        const fsByKey = new Map(fsSummary.levels.map(level => [levelKey(level), level]));
        const items = solverLevels.map(level => {
            const key = levelKey(level);
            const fsLevel = fsByKey.get(key);
            if (!fsLevel) {
                return {
                    id: level?.id || level?.name || '',
                    name: level?.name || level?.id || '',
                    fs: null,
                    solver: finiteNumber(level?.elevation),
                    delta: null,
                    status: 'ADDED_IN_SOLVER'
                };
            }
            return {
                id: fsLevel.id,
                name: fsLevel.name,
                ...compareNumber('level elevation', fsLevel.elevation, level?.elevation)
            };
        });
        fsSummary.levels.forEach(level => {
            if (!solverLevels.some(item => levelKey(item) === levelKey(level))) {
                items.push({
                    id: level.id,
                    name: level.name,
                    fs: finiteNumber(level.elevation),
                    solver: null,
                    delta: null,
                    status: 'MISSING_IN_SOLVER'
                });
            }
        });
        return {
            status: items.every(item => item.status === 'MATCH') ? 'MATCH' : 'DIFF',
            items,
            message: ''
        };
    }

    function buildETABSAuditRecord(rawAudit, model, sourceFileName = '') {
        const audit = normalizeETABSAudit(rawAudit, sourceFileName);
        const fsSummary = summarizeCurrentModel(model);
        const counts = {};
        const countSpecs = [
            ['stories', 'stories'],
            ['columns', 'columns'],
            ['beams', 'beams'],
            ['slabs', 'slabs'],
            ['frameObjects', 'frameObjectsInETABS'],
            ['areaObjects', 'areaObjectsInETABS'],
            ['footings', 'foundation.footingsInSource'],
            ['pedestals', 'foundation.pedestalsInSource'],
            ['tieBeams', 'foundation.tieBeamsInSource']
        ];
        const readAuditValue = key => key.startsWith('foundation.')
            ? audit.foundation?.[key.slice('foundation.'.length)]
            : valueAt(audit, key);
        countSpecs.forEach(([label, auditKey]) => {
            counts[label] = compareCount(label, fsSummary.counts[label], readAuditValue(auditKey));
        });

        const warnings = [];
        const notes = [];
        Object.values(counts).forEach(item => {
            if (item.status === 'DIFF') warnings.push(`${item.label}: FS ${item.fs}, ETABS ${item.solver}.`);
            if (item.status === 'NOT_REPORTED') notes.push(`${item.label} was not reported by ETABS.`);
        });

        const levels = compareLevels(fsSummary, audit);
        if (levels.status === 'DIFF') warnings.push('One or more exported level elevations differ from FutolStructure.');
        if (levels.status === 'NOT_REPORTED') notes.push(levels.message);

        const analysisReturn = finiteNumber(audit.analysisReturn);
        if (analysisReturn != null && analysisReturn !== 0) {
            warnings.push(`ETABS analysis returned code ${analysisReturn}.`);
        }
        if (analysisReturn == null) notes.push('Analysis return code was not reported by ETABS.');

        const foundation = audit.foundation || {};
        const expectedFoundation = fsSummary.foundation;
        const foundationComparison = {
            mode: {
                fs: expectedFoundation.mode,
                solver: foundation.mode || null,
                status: foundation.mode && foundation.mode === expectedFoundation.mode ? 'MATCH' : 'REVIEW'
            },
            geometryExportedToETABS: {
                fs: expectedFoundation.geometryExportedToETABS,
                solver: foundation.geometryExportedToETABS,
                status: foundation.geometryExportedToETABS === expectedFoundation.geometryExportedToETABS ? 'MATCH' : 'DIFF'
            },
            baseSupportRestraintsExportedToETABS: {
                fs: expectedFoundation.baseSupportRestraintsExportedToETABS,
                solver: foundation.baseSupportRestraintsExportedToETABS,
                status: foundation.baseSupportRestraintsExportedToETABS === expectedFoundation.baseSupportRestraintsExportedToETABS ? 'MATCH' : 'DIFF'
            }
        };
        ['geometryExportedToETABS', 'baseSupportRestraintsExportedToETABS'].forEach(key => {
            if (foundationComparison[key].status === 'DIFF') {
                warnings.push(`Foundation policy mismatch: ${key}.`);
            }
        });
        if (!audit.foundation) notes.push('Foundation policy was not reported by ETABS.');

        const provenance = {
            fs: clone(fsSummary.provenance, {}),
            solver: clone(audit.provenance || audit.sourceProvenance, {})
        };
        if (provenance.solver?.projectId && provenance.fs?.projectId &&
            provenance.solver.projectId !== provenance.fs.projectId) {
            warnings.push('Project provenance does not match the current FS project.');
        }
        if (provenance.solver?.sourceRevisionId && provenance.fs?.sourceRevisionId &&
            provenance.solver.sourceRevisionId !== provenance.fs.sourceRevisionId) {
            warnings.push('The ETABS audit came from a different FS source revision.');
        }

        const status = warnings.length ? 'REVIEW' : 'MATCH';
        return {
            contract: CONTRACT,
            solver: 'ETABS',
            importedAt: new Date().toISOString(),
            sourceFileName: audit.sourceFileName || sourceFileName || '',
            solverAudit: clone(audit, {}),
            fsSummary,
            comparison: {
                status,
                warnings,
                notes,
                counts,
                levels,
                analysis: {
                    returnCode: analysisReturn,
                    modalModes: Array.isArray(audit.modalModes) ? audit.modalModes.length : null,
                    maxSumUX: Array.isArray(audit.modalModes) ? Math.max(0, ...audit.modalModes.map(mode => Number(mode?.SumUX) || 0)) : null,
                    maxSumUY: Array.isArray(audit.modalModes) ? Math.max(0, ...audit.modalModes.map(mode => Number(mode?.SumUY) || 0)) : null,
                    maxSumRZ: Array.isArray(audit.modalModes) ? Math.max(0, ...audit.modalModes.map(mode => Number(mode?.SumRZ) || 0)) : null
                },
                foundation: foundationComparison,
                provenance
            }
        };
    }

    global.FSSolverRoundTrip = Object.freeze({
        contract: CONTRACT,
        modelSummaryContract: MODEL_SUMMARY_CONTRACT,
        summarizeCurrentModel,
        normalizeETABSAudit,
        compareETABSAuditToModel(rawAudit, model, sourceFileName = '') {
            return buildETABSAuditRecord(rawAudit, model, sourceFileName).comparison;
        },
        buildETABSAuditRecord
    });
})(typeof window !== 'undefined' ? window : globalThis);
