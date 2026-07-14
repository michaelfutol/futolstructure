(function (global) {
    'use strict';

    const DATABASE_NAME = 'FutolStructureProjectRevisions';
    const DATABASE_VERSION = 1;
    const STORE_NAME = 'revisions';
    const MAX_REVISIONS_PER_PROJECT = 50;
    const SUMMARY_FIELDS = [
        'floors',
        'activeColumns',
        'activeBeams',
        'activeSlabs',
        'lockedColumns',
        'lockedBeams',
        'lockedSlabs',
        'offsets',
        'voids',
        'deletions',
        'cantilevers',
        'cornerSlabs'
    ];

    function clone(value, fallback = null) {
        return JSON.parse(JSON.stringify(value == null ? fallback : value));
    }

    function createId(prefix) {
        const uuid = global.crypto?.randomUUID?.();
        if (uuid) return `${prefix}-${uuid}`;
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }

    function finiteOrNull(value) {
        if (value == null || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function countArray(value) {
        return Array.isArray(value) ? new Set(value.filter(Boolean)).size : 0;
    }

    function countOverrideEntries(value) {
        if (!value || typeof value !== 'object') return 0;
        return Object.values(value).reduce((count, entry) => {
            if (entry == null) return count;
            if (typeof entry !== 'object') return count + 1;
            const hasValue = Object.values(entry).some(item => {
                if (item == null || item === '' || item === false) return false;
                if (typeof item === 'number') return Math.abs(item) > 1e-9;
                return true;
            });
            return count + (hasValue ? 1 : 0);
        }, 0);
    }

    function cantileverCount(cantilevers) {
        return ['top', 'right', 'bottom', 'left'].reduce((sum, edge) => {
            return sum + (Array.isArray(cantilevers?.[edge])
                ? cantilevers[edge].filter(value => {
                    const projection = typeof value === 'object'
                        ? Number(value.projection ?? value.length ?? value.depth ?? value.value)
                        : Number(value);
                    return Number.isFinite(projection) && projection > 0;
                }).length
                : 0);
        }, 0);
    }

    function summarizePersistedProject(projectData) {
        const floors = Array.isArray(projectData?.floors) ? projectData.floors : [];
        const columns = Array.isArray(projectData?.columnOverrides) ? projectData.columnOverrides : [];
        const bayCount = Math.max(0,
            (Array.isArray(projectData?.xSpans) ? projectData.xSpans.length : 0) *
            (Array.isArray(projectData?.ySpans) ? projectData.ySpans.length : 0));
        const perFloor = floors.map(floor => {
            const activeColumns = columns.filter(column => {
                const perFloorState = column?.activePerFloor;
                if (perFloorState && Object.prototype.hasOwnProperty.call(perFloorState, floor.id)) {
                    return perFloorState[floor.id] !== false;
                }
                return column?.active !== false;
            }).length;
            const regularVoids = (floor.voidSlabs || []).filter(id => /^S\d+$/i.test(String(id))).length;
            return {
                id: floor.id,
                activeColumns,
                activeBeams: null,
                activeSlabs: Math.max(0, bayCount - regularVoids) + cantileverCount(floor.cantilevers),
                lockedBeams: countArray(floor.lockedBeams),
                lockedSlabs: countArray(floor.lockedSlabs),
                voids: countArray(floor.voidSlabs),
                deletions: countArray(floor.deletedBeams) + countArray(floor.deletedColumns),
                cantilevers: cantileverCount(floor.cantilevers),
                cornerSlabs: countArray(floor.cornerSlabs)
            };
        });
        const sum = field => perFloor.reduce((total, floor) => total + (finiteOrNull(floor[field]) || 0), 0);
        const summary = {
            floors: floors.length,
            activeColumns: sum('activeColumns'),
            activeBeams: null,
            activeSlabs: sum('activeSlabs'),
            lockedColumns: projectData?.columnPositionLocked ? sum('activeColumns') : 0,
            lockedBeams: sum('lockedBeams'),
            lockedSlabs: sum('lockedSlabs'),
            offsets: countOverrideEntries(projectData?.columnPositionOverrides) +
                countOverrideEntries(projectData?.beamAlignmentOverrides) +
                countOverrideEntries(projectData?.foundationTieBeamAlignmentOverrides),
            voids: sum('voids'),
            deletions: sum('deletions'),
            cantilevers: sum('cantilevers'),
            cornerSlabs: sum('cornerSlabs')
        };
        return {
            projectId: String(projectData?.projectId || ''),
            projectName: String(projectData?.projectInfo?.title || projectData?.name || ''),
            schemaVersion: String(projectData?.schemaVersion || 'legacy'),
            appVersion: String(projectData?.releaseManifest?.appVersion || projectData?.version || 'legacy'),
            totals: summary,
            perFloor
        };
    }

    function compareSummaries(baseline, current) {
        const fields = {};
        const destructive = [];
        const baselineTotals = baseline?.totals || {};
        const currentTotals = current?.totals || {};

        SUMMARY_FIELDS.forEach(field => {
            const before = finiteOrNull(baselineTotals[field]);
            const after = finiteOrNull(currentTotals[field]);
            const delta = before == null || after == null ? null : after - before;
            fields[field] = { before, after, delta };

            if (delta == null || delta === 0) return;
            if (['floors', 'activeColumns', 'activeBeams', 'activeSlabs', 'lockedColumns',
                'lockedBeams', 'lockedSlabs', 'offsets', 'cantilevers', 'cornerSlabs'].includes(field) && delta < 0) {
                destructive.push(`${field}: ${before} -> ${after}`);
            }
            if (['voids', 'deletions'].includes(field) && delta > 0) {
                destructive.push(`${field}: ${before} -> ${after}`);
            }
        });

        const schemaChanged = String(baseline?.schemaVersion || '') !== String(current?.schemaVersion || '');
        const buildChanged = String(baseline?.appVersion || '') !== String(current?.appVersion || '');
        return {
            fields,
            destructive,
            significant: destructive.length > 0,
            schemaChanged,
            buildChanged,
            baselineSchemaVersion: baseline?.schemaVersion || '',
            currentSchemaVersion: current?.schemaVersion || '',
            baselineAppVersion: baseline?.appVersion || '',
            currentAppVersion: current?.appVersion || ''
        };
    }

    function assessHealth(summary) {
        const totals = summary?.totals || {};
        const issues = [];
        let score = 100;
        const floors = finiteOrNull(totals.floors) || 0;
        const activeColumns = finiteOrNull(totals.activeColumns) || 0;
        const activeBeams = finiteOrNull(totals.activeBeams);
        const activeSlabs = finiteOrNull(totals.activeSlabs) || 0;

        if (floors < 1) {
            issues.push({ level: 'critical', message: 'No structural floor is present.' });
            score -= 70;
        }
        if (activeSlabs > 0 && activeColumns < 2) {
            issues.push({ level: 'critical', message: 'Slab regions exist with fewer than two active columns.' });
            score -= 60;
        }
        if (activeSlabs > 0 && activeBeams != null && activeBeams < 1) {
            issues.push({ level: 'critical', message: 'Slab regions exist without active beams.' });
            score -= 45;
        }
        (summary?.perFloor || []).forEach(floor => {
            if ((finiteOrNull(floor.activeSlabs) || 0) > 0 && (finiteOrNull(floor.activeColumns) || 0) < 2) {
                issues.push({ level: 'critical', message: `${floor.id || 'Floor'} has slabs with insufficient active supports.` });
                score -= 20;
            }
        });
        if ((finiteOrNull(totals.voids) || 0) > activeSlabs + 20) {
            issues.push({ level: 'warning', message: 'Hidden or void slab count is unusually high.' });
            score -= 10;
        }

        score = Math.max(0, Math.min(100, score));
        return {
            score,
            valid: score >= 60 && !issues.some(issue => issue.level === 'critical'),
            label: score >= 90 ? 'Healthy' : score >= 70 ? 'Review' : 'Blocked',
            issues
        };
    }

    function requestResult(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
        });
    }

    function transactionComplete(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
        });
    }

    function openDatabase() {
        if (!global.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
        return new Promise((resolve, reject) => {
            const request = global.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                const store = database.objectStoreNames.contains(STORE_NAME)
                    ? request.transaction.objectStore(STORE_NAME)
                    : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                if (!store.indexNames.contains('projectId')) store.createIndex('projectId', 'projectId', { unique: false });
                if (!store.indexNames.contains('createdAt')) store.createIndex('createdAt', 'createdAt', { unique: false });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Revision database could not be opened.'));
        });
    }

    function metadata(record) {
        if (!record) return null;
        const { projectData, ...meta } = record;
        return clone(meta, {});
    }

    async function listRevisions(projectId = '') {
        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const records = projectId
                ? await requestResult(store.index('projectId').getAll(projectId))
                : await requestResult(store.getAll());
            return records
                .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                .map(metadata);
        } finally {
            database.close();
        }
    }

    async function getRevision(id) {
        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            return clone(await requestResult(transaction.objectStore(STORE_NAME).get(id)), null);
        } finally {
            database.close();
        }
    }

    async function pruneProject(projectId) {
        const records = await listRevisions(projectId);
        const stale = records.slice(MAX_REVISIONS_PER_PROJECT);
        if (!stale.length) return;
        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            stale.forEach(record => transaction.objectStore(STORE_NAME).delete(record.id));
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    async function saveRevision(input) {
        if (!input?.projectData || typeof input.projectData !== 'object') {
            throw new Error('A protected revision requires project data.');
        }
        const summary = clone(input.summary || summarizePersistedProject(input.projectData), {});
        const health = clone(input.health || assessHealth(summary), {});
        const record = {
            id: createId('revision'),
            projectId: String(input.projectId || input.projectData.projectId || createId('project')),
            projectName: String(input.projectName || input.sourceName || 'Untitled project'),
            sourceName: String(input.sourceName || ''),
            reason: String(input.reason || 'pre-overwrite'),
            createdAt: input.createdAt || new Date().toISOString(),
            appVersion: String(input.appVersion || input.projectData.releaseManifest?.appVersion || summary.appVersion || ''),
            buildId: String(input.buildId || input.projectData.releaseManifest?.buildId || ''),
            schemaVersion: String(input.schemaVersion || input.projectData.schemaVersion || summary.schemaVersion || ''),
            sourceRevisionId: String(input.sourceRevisionId || input.projectData.revisionMeta?.revisionId || ''),
            summary,
            health,
            delta: clone(input.delta, null),
            projectData: clone(input.projectData, {})
        };

        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).add(record);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
        await pruneProject(record.projectId);
        return metadata(record);
    }

    async function deleteRevision(id) {
        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).delete(id);
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    async function clearAll() {
        const database = await openDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).clear();
            await transactionComplete(transaction);
        } finally {
            database.close();
        }
    }

    global.FSProtectedRevisions = Object.freeze({
        databaseName: DATABASE_NAME,
        maxPerProject: MAX_REVISIONS_PER_PROJECT,
        createId,
        summarizePersistedProject,
        compareSummaries,
        assessHealth,
        saveRevision,
        listRevisions,
        getRevision,
        deleteRevision,
        clearAll
    });
})(window);
