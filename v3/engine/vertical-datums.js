(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.EngineVerticalDatums = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA = 'FutolStructure.VerticalDatums.v1';
    const DEFAULT_FOOTING_THICKNESS_M = 0.3;
    const EPSILON = 1e-9;

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function positive(value, fallback, minimum = 0.01) {
        return Math.max(minimum, finite(value, fallback));
    }

    function firstFinite(values, fallback) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return fallback;
    }

    function floorId(floor, index) {
        return String(floor && floor.id || `F${index + 1}`);
    }

    function hasGovernedElevation(floor) {
        if (!floor) return false;
        return floor.elevationMode === 'absolute' && Number.isFinite(Number(floor.elevation));
    }

    /**
     * Resolve all project elevations from one explicit contract.
     *
     * Legacy migration:
     * - a suspended GF height is interpreted as its offset above grade;
     * - ordinary floor.height remains the storey rise to that floor;
     * - stale legacy floor.elevation values are ignored unless marked governed.
     */
    function resolveVerticalDatums(project = {}, floors = []) {
        const nested = project.verticalDatums || {};
        const source = {
            ...nested,
            ...project
        };
        const gradeElevation = firstFinite(
            [source.gradeElevation],
            0
        );
        const gf = (floors || []).find(floor => floorId(floor, 0) === 'GF');
        const legacyGroundFloorElevation = project.gfSuspended && gf
            ? gradeElevation + Math.max(0, finite(gf.height, 0))
            : gradeElevation;
        const groundFloorElevation = firstFinite(
            [source.groundFloorElevation],
            legacyGroundFloorElevation
        );
        const baseSupportElevation = firstFinite(
            [source.baseSupportElevation],
            gradeElevation
        );
        const footingDepth = positive(
            firstFinite([source.footingDepth], 1.5),
            1.5,
            0.1
        );
        const nominalFootingThickness = positive(
            firstFinite(
                [
                    source.nominalFootingThickness,
                    source.footingThickness,
                    source.footingThicknessM
                ],
                DEFAULT_FOOTING_THICKNESS_M
            ),
            DEFAULT_FOOTING_THICKNESS_M,
            0.1
        );
        const footingElevationMode = source.footingElevationMode === 'absolute'
            ? 'absolute'
            : 'derived';
        const footingBottomElevation = footingElevationMode === 'absolute'
            ? firstFinite([source.footingBottomElevation], gradeElevation - footingDepth)
            : gradeElevation - footingDepth;
        const footingTopElevation = footingElevationMode === 'absolute'
            ? firstFinite(
                [source.footingTopElevation],
                footingBottomElevation + nominalFootingThickness
            )
            : footingBottomElevation + nominalFootingThickness;

        const floorLevels = [];
        let previousElevation = groundFloorElevation;
        (floors || []).forEach((floor, index) => {
            const id = floorId(floor, index);
            let elevation;
            let storeyHeight;
            if (id === 'GF') {
                elevation = groundFloorElevation;
                storeyHeight = elevation - baseSupportElevation;
            } else {
                const fallbackHeight = positive(
                    firstFinite([floor && floor.storeyHeight, floor && floor.height], 3),
                    3
                );
                const explicitElevation = hasGovernedElevation(floor)
                    ? Number(floor.elevation)
                    : NaN;
                elevation = Number.isFinite(explicitElevation)
                    ? explicitElevation
                    : previousElevation + fallbackHeight;
                storeyHeight = elevation - previousElevation;
            }
            floorLevels.push({
                id,
                name: String(floor && floor.name || id),
                elevation,
                storeyHeight,
                floorIndex: index
            });
            previousElevation = elevation;
        });

        const namedLevels = [
            {
                id: 'BASE/FOUNDATION',
                name: 'BASE/FOUNDATION',
                elevation: baseSupportElevation,
                kind: 'foundation'
            },
            {
                id: 'GF',
                name: 'GF',
                elevation: groundFloorElevation,
                kind: floorLevels.some(level => level.id === 'GF') ? 'floor' : 'reference'
            },
            ...floorLevels
                .filter(level => level.id !== 'GF')
                .map(level => ({
                    id: level.id,
                    name: level.id,
                    elevation: level.elevation,
                    storeyHeight: level.storeyHeight,
                    floorIndex: level.floorIndex,
                    kind: 'floor'
                }))
        ];
        const uniqueLevels = [];
        const seenLevelIds = new Set();
        namedLevels.forEach(level => {
            if (seenLevelIds.has(level.id)) return;
            seenLevelIds.add(level.id);
            uniqueLevels.push(level);
        });

        const issues = [];
        if (groundFloorElevation < baseSupportElevation - EPSILON) {
            issues.push('Ground-floor elevation must not be below the base-support elevation.');
        }
        if (!(footingTopElevation > footingBottomElevation + EPSILON)) {
            issues.push('Footing top elevation must be above footing bottom elevation.');
        }
        if (footingTopElevation > baseSupportElevation + EPSILON) {
            issues.push('Base-support elevation must not be below the footing top elevation.');
        }
        floorLevels.forEach((level, index) => {
            const lower = index === 0 ? baseSupportElevation : floorLevels[index - 1].elevation;
            if (!Number.isFinite(level.elevation) || level.elevation <= lower + EPSILON) {
                issues.push(`${level.id} must be above its supporting level.`);
            }
            if (!Number.isFinite(level.storeyHeight) || level.storeyHeight <= EPSILON) {
                issues.push(`${level.id} requires a positive storey height.`);
            }
        });

        return {
            schema: SCHEMA,
            units: 'm',
            gradeElevation,
            groundFloorElevation,
            baseSupportElevation,
            footingDepth,
            nominalFootingThickness,
            footingElevationMode,
            footingBottomElevation,
            footingTopElevation,
            belowGroundFloorColumnLength: groundFloorElevation - baseSupportElevation,
            floorLevels,
            namedLevels: uniqueLevels,
            storyElevations: [baseSupportElevation, ...floorLevels.map(level => level.elevation)],
            valid: issues.length === 0,
            issues
        };
    }

    function serializeVerticalDatums(contract) {
        const resolved = contract || resolveVerticalDatums();
        return {
            schema: SCHEMA,
            units: 'm',
            gradeElevation: resolved.gradeElevation,
            groundFloorElevation: resolved.groundFloorElevation,
            baseSupportElevation: resolved.baseSupportElevation,
            footingDepth: resolved.footingDepth,
            nominalFootingThickness: resolved.nominalFootingThickness,
            footingElevationMode: resolved.footingElevationMode,
            footingBottomElevation: resolved.footingBottomElevation,
            footingTopElevation: resolved.footingTopElevation
        };
    }

    return Object.freeze({
        SCHEMA,
        DEFAULT_FOOTING_THICKNESS_M,
        resolveVerticalDatums,
        serializeVerticalDatums
    });
});
