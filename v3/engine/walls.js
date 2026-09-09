(function attachWalls(global) {
    'use strict';

    const CONTRACT = 'FutolStructure.WallInventory.v1';
    const CHB_THICKNESS_OPTIONS_MM = Object.freeze([100, 150, 200]);
    const CHB_FACE_WEIGHT_KPA = Object.freeze({
        100: 1.65,
        150: 2.33,
        200: 3.10
    });
    const DEFAULTS = Object.freeze({
        chbThicknessMm: 150,
        wallHeightM: 3,
        plasterEachSideMm: 20,
        plasterInsideMm: 20,
        plasterOutsideMm: 20,
        plasterUnitWeightKNM3: 23,
        plasterWeightKPaPerMm: 0.023,
        openingDeductionMode: 'area'
    });
    const OPENING_SNAP_STEP_M = 0.05;

    function num(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function clone(value, fallback) {
        return value == null ? fallback : JSON.parse(JSON.stringify(value));
    }

    function normalizeChbThickness(value, fallback = DEFAULTS.chbThicknessMm) {
        const raw = Number(value);
        const target = Number.isFinite(raw) && raw > 0 ? raw : fallback;
        return CHB_THICKNESS_OPTIONS_MM.reduce((nearest, option) =>
            Math.abs(option - target) < Math.abs(nearest - target) ? option : nearest,
            CHB_THICKNESS_OPTIONS_MM[0]
        );
    }

    function normalizeOpening(opening, index) {
        const item = opening || {};
        const rawOffset = Number(item.offsetM ?? item.positionM);
        return {
            id: item.id || `OPEN-${index + 1}`,
            type: ['door', 'window', 'other'].includes(String(item.type || '').toLowerCase())
                ? String(item.type).toLowerCase() : 'window',
            widthM: Math.max(0, num(item.widthM ?? item.width)),
            heightM: Math.max(0, num(item.heightM ?? item.height)),
            sillHeightM: Math.max(0, num(item.sillHeightM ?? item.sillHeight)),
            offsetM: Number.isFinite(rawOffset)
                ? Math.max(0, Number((Math.round(rawOffset / OPENING_SNAP_STEP_M) * OPENING_SNAP_STEP_M).toFixed(3)))
                : null,
            count: Math.max(1, Math.round(num(item.count, 1))),
            notes: item.notes || ''
        };
    }

    function normalizeSnap(snap, endpoint = 'start') {
        const item = snap || {};
        const mode = ['grid', 'column', 'beam', 'free'].includes(String(item.mode || '').toLowerCase())
            ? String(item.mode).toLowerCase() : 'free';
        return {
            endpoint,
            mode,
            targetId: item.targetId || item.gridId || item.columnId || item.beamId || '',
            toleranceM: Math.max(0.001, num(item.toleranceM, 0.15)),
            offsetM: num(item.offsetM),
            locked: item.locked === true
        };
    }

    function normalizeWall(wall, floor, index) {
        const item = wall || {};
        const ref = item.reference || item;
        const thickness = normalizeChbThickness(item.thicknessMm ?? item.chbThicknessMm ?? item.chbSize);
        const height = Math.max(0, num(item.heightM ?? item.height, num(floor?.height, DEFAULTS.wallHeightM)));
        const plasterEachSide = Math.max(0, num(item.plasterEachSideMm, DEFAULTS.plasterEachSideMm));
        const plasterInside = Math.max(0, num(item.plasterInsideMm, plasterEachSide));
        const plasterOutside = Math.max(0, num(item.plasterOutsideMm, plasterEachSide));
        const alignmentMode = ['center', 'flush-exterior', 'flush-interior'].includes(String(item.alignmentMode || item.placementMode || '').toLowerCase())
            ? String(item.alignmentMode || item.placementMode).toLowerCase()
            : 'center';
        const x1 = num(ref.x1, NaN);
        const y1 = num(ref.y1, NaN);
        const x2 = num(ref.x2, NaN);
        const y2 = num(ref.y2, NaN);
        const length = [x1, y1, x2, y2].every(Number.isFinite)
            ? Math.hypot(x2 - x1, y2 - y1) : Math.max(0, num(item.lengthM ?? item.length));
        const openings = (item.openings || []).map(normalizeOpening);
        const openingArea = openings.reduce((sum, opening) => sum + opening.widthM * opening.heightM * opening.count, 0);
        const grossArea = length * height;
        const netArea = Math.max(0, grossArea - Math.min(openingArea, grossArea));
        // A legacy wall record may persist a zero placeholder for face weight.
        // Treat that placeholder as "use the governed CHB default" so the
        // elevation diagram and solver line-load assignment cannot disagree.
        const suppliedChbFaceWeightKPa = num(
            item.chbFaceWeightKPa ?? item.faceWeightKPa,
            NaN
        );
        const suppliedLegacyWallWeightKPa = num(item.wallWeightKPa, NaN);
        const chbFaceWeightKPa = suppliedChbFaceWeightKPa > 0
            ? suppliedChbFaceWeightKPa
            : suppliedLegacyWallWeightKPa > 0
                ? suppliedLegacyWallWeightKPa
                : CHB_FACE_WEIGHT_KPA[thickness];
        const plasterWeightKPaPerMm = Math.max(0, num(
            item.plasterWeightKPaPerMm,
            num(item.plasterUnitWeightKNM3, DEFAULTS.plasterUnitWeightKNM3) / 1000
        ));
        const wallWeightKPa = chbFaceWeightKPa + ((plasterInside + plasterOutside) * plasterWeightKPaPerMm);
        const lineLoadKNm = Math.max(0, netArea * wallWeightKPa / Math.max(length, 0.001));
        const lintel = item.lintel ? {
            id: item.lintel.id || `L-${item.id || index + 1}`,
            widthMm: Math.max(100, num(item.lintel.widthMm, thickness)),
            depthMm: Math.max(100, num(item.lintel.depthMm, 200)),
            material: item.lintel.material || 'reinforced_concrete',
            designStatus: item.lintel.designStatus || 'preliminary'
        } : null;
        const elevationBaseM = num(item.elevationBaseM ?? floor?.elevation, 0);
        const elevationTopM = elevationBaseM + height;
        return {
            id: item.id || `WL-${floor?.id || 'F'}-${index + 1}`,
            floorId: floor?.id || item.floorId || '',
            type: item.type || item.wallType || 'external',
            supportMode: item.supportMode || 'on_beam',
            x1, y1, x2, y2, lengthM: length,
            endpoints: {
                start: { x: x1, y: y1, snap: normalizeSnap(item.startSnap || item.snapStart, 'start') },
                end: { x: x2, y: y2, snap: normalizeSnap(item.endSnap || item.snapEnd, 'end') }
            },
            heightM: height,
            elevationBaseM,
            elevationTopM,
            chbThicknessMm: thickness,
            wallTotalThicknessMm: thickness + plasterInside + plasterOutside,
            alignmentMode,
            plasterInsideMm: plasterInside,
            plasterOutsideMm: plasterOutside,
            chbFaceWeightKPa,
            plasterUnitWeightKNM3: plasterWeightKPaPerMm * 1000,
            plasterWeightKPaPerMm,
            openings,
            openingAreaM2: openingArea,
            wallWeightKPa,
            lineLoadKNm,
            lintel,
            exportToSolvers: item.exportToSolvers === true,
            exportToIFC: item.exportToIFC !== false,
            source: item.source || 'manual-wall-line',
            reference: clone(item.reference, {}),
            notes: item.notes || item.note || ''
        };
    }

    function build(model) {
        const walls = [];
        (model.floors || []).forEach(floor => {
            (floor.wallLoads || []).forEach((wall, index) => walls.push(normalizeWall(wall, floor, index)));
        });
        const openings = walls.flatMap(wall => wall.openings.map(opening => ({ ...opening, wallId: wall.id, floorId: wall.floorId })));
        const lintels = walls.filter(wall => wall.lintel).map(wall => ({ ...wall.lintel, wallId: wall.id, floorId: wall.floorId }));
        const elevations = walls.map(wall => ({
            id: `WE-${wall.id}`,
            wallId: wall.id,
            floorId: wall.floorId,
            baseElevationM: wall.elevationBaseM,
            topElevationM: wall.elevationTopM,
            wallHeightM: wall.heightM,
            openings: wall.openings.map(opening => ({
                ...opening,
                headElevationM: wall.elevationBaseM + opening.sillHeightM + opening.heightM
            })),
            lintel: wall.lintel ? { ...wall.lintel, elevationM: wall.elevationBaseM + wall.heightM } : null
        }));
        const solverWalls = walls.filter(wall => wall.exportToSolvers && Number.isFinite(wall.x1) && Number.isFinite(wall.y1) && Number.isFinite(wall.x2) && Number.isFinite(wall.y2));
        const warnings = walls.filter(wall => !Number.isFinite(wall.x1) || !Number.isFinite(wall.y1) || !Number.isFinite(wall.x2) || !Number.isFinite(wall.y2))
            .map(wall => ({ code: 'wall_geometry_unresolved', wallId: wall.id, message: 'Wall line needs two plan endpoints before solver export.' }));
        return {
            contract: CONTRACT,
            policy: {
                solverExportDefault: false,
                unresolvedGeometry: 'coordination-only-with-warning',
                openings: 'deduct net wall area and retain opening metadata',
                chbThicknessOptionsMm: [...CHB_THICKNESS_OPTIONS_MM],
                plasterDefaultMmEachSide: DEFAULTS.plasterEachSideMm,
                placement: 'center|flush-exterior|flush-interior; effective geometry retains eccentricity metadata',
                lintels: 'explicit member metadata; design remains preliminary until reviewed'
            },
            walls, openings, lintels, elevations,
            solverWalls,
            validation: {
                status: warnings.length ? 'REVIEW' : 'READY_FOR_COORDINATION',
                warnings,
                solverExportCount: solverWalls.length
            }
        };
    }

    global.FSWalls = Object.freeze({
        contract: CONTRACT,
        build,
        normalizeWall,
        normalizeOpening,
        normalizeSnap,
        normalizeChbThickness,
        chbThicknessOptionsMm: CHB_THICKNESS_OPTIONS_MM
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSWalls;
})(typeof window !== 'undefined' ? window : globalThis);
