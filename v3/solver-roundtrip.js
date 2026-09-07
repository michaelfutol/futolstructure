(function attachSolverRoundTrip(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.SolverRoundTrip.v1';
    const MODEL_SUMMARY_CONTRACT = 'FutolStructure.SolverRoundTripModelSummary.v1';

    function finiteNumber(value) {
        if (value == null || typeof value === 'boolean') return null;
        if (typeof value === 'string' && value.trim() === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function integerCount(value) {
        const number = finiteNumber(value);
        return number == null || !Number.isInteger(number) || number < 0 ? null : number;
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
        const solverNumber = finiteNumber(solverValue);
        if (fs == null || solverNumber == null) {
            return {
                label,
                fs,
                solver: solverNumber,
                delta: null,
                status: 'NOT_REPORTED'
            };
        }
        if (!Number.isInteger(solverNumber) || solverNumber < 0) {
            return {
                label,
                fs,
                solver: solverNumber,
                delta: null,
                status: 'INVALID'
            };
        }
        return {
            label,
            fs,
            solver: solverNumber,
            delta: solverNumber - fs,
            status: fs === solverNumber ? 'MATCH' : 'DIFF'
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
            gridDefinition: clone(model.gridDefinition, {}),
            geometry: {
                columns: clone(model.columns, []).map(column => ({
                    id: column?.id || '',
                    name: `C-${column?.id || ''}`,
                    start: [finiteNumber(column?.x), finiteNumber(column?.y), finiteNumber(column?.z1)],
                    end: [finiteNumber(column?.x), finiteNumber(column?.y), finiteNumber(column?.z2)]
                })),
                beams: clone(model.beams, []).map(beam => ({
                    id: beam?.id || '',
                    name: `B-${beam?.id || ''}`,
                    start: [finiteNumber(beam?.x1), finiteNumber(beam?.y1), finiteNumber(beam?.z ?? beam?.floorElevationM)],
                    end: [finiteNumber(beam?.x2), finiteNumber(beam?.y2), finiteNumber(beam?.z ?? beam?.floorElevationM)],
                    jointOffsets: clone(beam?.jointOffsets, {})
                }))
            },
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

    function nativePoint(value) {
        if (Array.isArray(value)) return value.slice(0, 3).map(finiteNumber);
        if (!value || typeof value !== 'object') return [null, null, null];
        return [finiteNumber(value[0] ?? value.x), finiteNumber(value[1] ?? value.y), finiteNumber(value[2] ?? value.z)];
    }

    function addPoints(left, right) {
        return left.map((value, index) =>
            value == null || right[index] == null ? null : value + right[index]
        );
    }

    function expectedJointOffset(source, end) {
        const offset = source?.jointOffsets?.sharedSolverPlan?.[end];
        return [finiteNumber(offset?.dx) ?? 0, finiteNumber(offset?.dy) ?? 0, finiteNumber(offset?.dz) ?? 0];
    }

    function comparePointArrays(expected, actual, tolerance) {
        const delta = expected.map((value, index) =>
            value == null || actual[index] == null ? null : actual[index] - value
        );
        return {
            delta,
            status: delta.every(value => value != null && Math.abs(value) <= tolerance) ? 'MATCH' : 'DIFF'
        };
    }

    function compareNativeGeometry(fsSummary, audit) {
        const geometryAudit = audit.analyticalGeometry?.nativeGeometryAudit;
        if (!geometryAudit || typeof geometryAudit !== 'object') {
            return {
                status: 'NOT_REPORTED',
                toleranceM: 0.001,
                columns: [],
                beams: [],
                failures: [],
                message: 'ETABS audit does not contain native frame geometry readback.'
            };
        }
        const toleranceM = finiteNumber(geometryAudit.toleranceM) ?? 0.001;
        const frameAudit = audit.analyticalGeometry?.nativeFrameAudit || {};
        const compareMembers = (kind, expected, actual, prefix) => {
            const rows = [];
            const actualRows = Array.isArray(actual) ? actual : [];
            const frameRows = Array.isArray(frameAudit[`${kind}s`]) ? frameAudit[`${kind}s`] : [];
            for (const source of expected) {
                const expectedName = `${prefix}-${source.id}`;
                const native = actualRows.find(item => String(item?.name || '') === expectedName);
                const nativeFrame = frameRows.find(item => String(item?.name || '') === expectedName);
                const expectedStart = source.start;
                const expectedEnd = source.end;
                const nativeStart = nativePoint(native?.start);
                const nativeEnd = nativePoint(native?.end);
                const deltas = expectedStart.map((value, index) =>
                    value == null || nativeStart[index] == null ? null : nativeStart[index] - value
                ).concat(expectedEnd.map((value, index) =>
                    value == null || nativeEnd[index] == null ? null : nativeEnd[index] - value
                ));
                const valid = !!native && deltas.every(delta => delta != null && Math.abs(delta) <= toleranceM);
                const expectedOffsetStart = expectedJointOffset(source, 'start');
                const expectedOffsetEnd = expectedJointOffset(source, 'end');
                const nativeOffsetStart = nativePoint(nativeFrame?.jointOffset1Global);
                const nativeOffsetEnd = nativePoint(nativeFrame?.jointOffset2Global);
                const offsetStart = comparePointArrays(expectedOffsetStart, nativeOffsetStart, toleranceM);
                const offsetEnd = comparePointArrays(expectedOffsetEnd, nativeOffsetEnd, toleranceM);
                const expectedPhysicalStart = addPoints(expectedStart, expectedOffsetStart);
                const expectedPhysicalEnd = addPoints(expectedEnd, expectedOffsetEnd);
                const nativePhysicalStart = addPoints(nativeStart, nativeOffsetStart);
                const nativePhysicalEnd = addPoints(nativeEnd, nativeOffsetEnd);
                const physicalStart = comparePointArrays(expectedPhysicalStart, nativePhysicalStart, toleranceM);
                const physicalEnd = comparePointArrays(expectedPhysicalEnd, nativePhysicalEnd, toleranceM);
                const offsetsReported = !!nativeFrame;
                const physicalStatus = !offsetsReported
                    ? 'NOT_REPORTED'
                    : physicalStart.status === 'MATCH' && physicalEnd.status === 'MATCH'
                        ? 'MATCH'
                        : 'DIFF';
                rows.push({
                    kind,
                    id: source.id,
                    name: expectedName,
                    expected: { start: expectedStart, end: expectedEnd },
                    native: native ? { start: nativeStart, end: nativeEnd } : null,
                    delta: deltas,
                    status: valid ? 'MATCH' : 'DIFF',
                    offsets: {
                        reported: offsetsReported,
                        expected: { start: expectedOffsetStart, end: expectedOffsetEnd },
                        native: nativeFrame ? { start: nativeOffsetStart, end: nativeOffsetEnd } : null,
                        start: offsetStart,
                        end: offsetEnd
                    },
                    physicalEndpoints: {
                        expected: { start: expectedPhysicalStart, end: expectedPhysicalEnd },
                        native: nativeFrame && native ? { start: nativePhysicalStart, end: nativePhysicalEnd } : null,
                        start: physicalStart,
                        end: physicalEnd,
                        status: physicalStatus
                    }
                });
            }
            return rows;
        };
        const columns = compareMembers('column', fsSummary.geometry.columns, geometryAudit.columns, 'C');
        const beams = compareMembers('beam', fsSummary.geometry.beams, geometryAudit.beams, 'B');
        const members = [...columns, ...beams];
        const failures = members.filter(item => item.status !== 'MATCH' || item.physicalEndpoints.status !== 'MATCH');
        const sourceStatus = String(geometryAudit.status || '').toUpperCase();
        const frameParity = audit.analyticalGeometry?.nativeFrameParityAudit;
        const columnationParity = audit.analyticalGeometry?.columnationParity;
        const parityFailures = [frameParity, columnationParity]
            .filter(item => item && String(item.status || '').toUpperCase() !== 'PASS')
            .map(item => ({ status: item.status || 'REVIEW', policy: item.policy || '' }));
        const status = failures.length || parityFailures.length || sourceStatus === 'FAIL'
            ? 'DIFF'
            : columns.length || beams.length ? 'MATCH' : 'NOT_REPORTED';
        return {
            status,
            toleranceM,
            columns,
            beams,
            failures,
            physicalEndpointFailures: members.filter(item => item.physicalEndpoints.status !== 'MATCH'),
            parityFailures,
            message: status === 'DIFF'
                ? 'ETABS native geometry, section/orientation parity, joint offsets, or offset-adjusted physical endpoints differ from the FS analytical payload.'
                : ''
        };
    }

    function compareGridDefinition(fsSummary, audit) {
        const source = fsSummary.gridDefinition || {};
        const expected = [
            ...(Array.isArray(source.xLines) ? source.xLines.map(line => ({ ...line, lineType: 'X (Cartesian)' })) : []),
            ...(Array.isArray(source.yLines) ? source.yLines.map(line => ({ ...line, lineType: 'Y (Cartesian)' })) : [])
        ];
        const nativeRows = audit.gridDefinition?.nativeLines?.rows;
        if (!Array.isArray(nativeRows) || !nativeRows.length) {
            return {
                status: 'NOT_REPORTED',
                expected,
                native: [],
                failures: [],
                message: 'ETABS audit does not contain native grid-line rows.'
            };
        }
        const rows = expected.map(line => {
            const native = nativeRows.find(item =>
                String(item?.LineType || item?.lineType || '').toUpperCase() === line.lineType.toUpperCase() &&
                String(item?.ID || item?.id || '').trim() === String(line.label || line.id || '').trim()
            );
            const expectedCoordinate = finiteNumber(line.coordinateM);
            const nativeCoordinate = finiteNumber(native?.Ordinate ?? native?.ordinateM ?? native?.coordinateM);
            const coordinateStatus = expectedCoordinate != null && nativeCoordinate != null &&
                Math.abs(nativeCoordinate - expectedCoordinate) <= 0.001;
            const bubbleStatus = String(native?.BubbleLoc ?? native?.bubbleLoc ?? '') === String(line.bubbleLoc || '');
            const visibilityStatus = String(native?.Visible ?? native?.visible ?? '').toLowerCase() === (line.visible === false ? 'no' : 'yes');
            return {
                lineType: line.lineType,
                id: line.label || line.id || '',
                expected: { coordinateM: expectedCoordinate, bubbleLoc: line.bubbleLoc || '', visible: line.visible !== false },
                native: native ? { coordinateM: nativeCoordinate, bubbleLoc: native?.BubbleLoc ?? native?.bubbleLoc ?? '', visible: native?.Visible ?? native?.visible ?? '' } : null,
                deltaM: expectedCoordinate == null || nativeCoordinate == null ? null : nativeCoordinate - expectedCoordinate,
                status: native && coordinateStatus && bubbleStatus && visibilityStatus ? 'MATCH' : 'DIFF'
            };
        });
        const failures = rows.filter(row => row.status !== 'MATCH');
        const unmatchedNative = nativeRows.filter(native => !expected.some(line =>
            String(native?.LineType || native?.lineType || '').toUpperCase() === line.lineType.toUpperCase() &&
            String(native?.ID || native?.id || '').trim() === String(line.label || line.id || '').trim()
        ));
        return {
            status: failures.length || unmatchedNative.length ? 'DIFF' : 'MATCH',
            expected,
            native: nativeRows,
            rows,
            failures,
            unmatchedNative,
            message: failures.length || unmatchedNative.length
                ? 'ETABS native grid lines do not reproduce the FS axis labels, ordinates, bubble locations, and visibility.'
                : ''
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
            if (item.status === 'INVALID') warnings.push(`${item.label}: ETABS reported an invalid non-negative integer count.`);
        });

        const levels = compareLevels(fsSummary, audit);
        if (levels.status === 'DIFF') warnings.push('One or more exported level elevations differ from FutolStructure.');
        if (levels.status === 'NOT_REPORTED') notes.push(levels.message);

        const geometry = compareNativeGeometry(fsSummary, audit);
        if (geometry.status === 'DIFF') warnings.push(geometry.message);
        if (geometry.status === 'NOT_REPORTED' &&
            (fsSummary.geometry.columns.length || fsSummary.geometry.beams.length)) {
            notes.push(geometry.message);
        }

        const grid = compareGridDefinition(fsSummary, audit);
        if (grid.status === 'DIFF') warnings.push(grid.message);
        if (grid.status === 'NOT_REPORTED' && fsSummary.gridDefinition?.xLines?.length) notes.push(grid.message);

        const analysisReturn = finiteNumber(audit.analysisReturn);
        if (analysisReturn != null && analysisReturn !== 0) {
            warnings.push(`ETABS analysis returned code ${analysisReturn}.`);
        }
        if (analysisReturn == null) notes.push('Analysis return code was not reported by ETABS.');
        if (!Array.isArray(audit.modalModes) || audit.modalModes.length === 0) {
            notes.push('Modal participation rows were not reported by ETABS.');
        }

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
        Object.entries(foundationComparison).forEach(([key, item]) => {
            if (item.status !== 'MATCH') warnings.push(`Foundation policy requires review: ${key}.`);
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
        if (!Object.keys(provenance.solver || {}).length) notes.push('Solver provenance was not reported by ETABS.');

        const status = warnings.length ? 'REVIEW' : notes.length ? 'INCOMPLETE' : 'MATCH';
        return {
            contract: CONTRACT,
            solver: 'ETABS',
            importedAt: new Date().toISOString(),
            sourceFileName: audit.sourceFileName || sourceFileName || '',
            solverAudit: clone(audit, {}),
            fsSummary,
            comparison: {
                status,
                complete: notes.length === 0,
                warnings,
                notes,
                counts,
                levels,
                grid,
                geometry,
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
