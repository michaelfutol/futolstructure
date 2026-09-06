(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.EngineStairs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SCHEMA = 'FutolStructure.StairStructuralModel.v1';
    const DEFAULT_SECTIONS = {
        stairBeam: { widthMm: 200, depthMm: 350 },
        landingBeam: { widthMm: 200, depthMm: 350 }
    };
    const DEFAULT_LOADS = {
        finishesKPa: 1.5,
        liveLoadKPa: 4.8,
        railingLoadKNPerM: 0,
        wallLoadKNPerM: 0
    };

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function positive(value, fallback, minimum = 0.001) {
        return Math.max(minimum, finite(value, fallback));
    }

    function clone(value, fallback) {
        try {
            return JSON.parse(JSON.stringify(value == null ? fallback : value));
        } catch (error) {
            return JSON.parse(JSON.stringify(fallback));
        }
    }

    function normalizeRotation(value, axis = 'X') {
        const fallback = axis === 'Y' ? 90 : 0;
        const normalized = ((Math.round(finite(value, fallback) / 90) * 90) % 360 + 360) % 360;
        return [0, 90, 180, 270].includes(normalized) ? normalized : fallback;
    }

    function normalizeBounds(bounds, stair) {
        const source = bounds || {};
        const x1 = finite(source.x1, finite(stair && stair.x1, NaN));
        const y1 = finite(source.y1, finite(stair && stair.y1, NaN));
        const x2 = finite(source.x2, finite(stair && stair.x2, NaN));
        const y2 = finite(source.y2, finite(stair && stair.y2, NaN));
        if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
        const normalized = {
            x1: Math.min(x1, x2),
            y1: Math.min(y1, y2),
            x2: Math.max(x1, x2),
            y2: Math.max(y1, y2)
        };
        return normalized.x2 - normalized.x1 > 0.01 && normalized.y2 - normalized.y1 > 0.01
            ? normalized
            : null;
    }

    function normalizeSection(raw, defaults) {
        return {
            widthMm: Math.max(100, Math.round(finite(raw && raw.widthMm, defaults.widthMm))),
            depthMm: Math.max(150, Math.round(finite(raw && raw.depthMm, defaults.depthMm)))
        };
    }

    function normalizeStair(stair, index = 0) {
        const source = stair || {};
        const bounds = normalizeBounds(source.bounds, source);
        if (!bounds) return null;
        const axis = source.axis === 'Y' ? 'Y' : 'X';
        const rotationDeg = normalizeRotation(source.rotationDeg, axis);
        const sections = source.sections || {};
        const loads = source.loads || {};
        const integration = source.integration || {};
        const placement = source.placement || {};
        const normalized = {
            id: String(source.id || `ST-${index + 1}`).trim() || `ST-${index + 1}`,
            type: source.type === 'straight' ? 'straight' : 'dogleg',
            fromFloorId: String(source.fromFloorId || ''),
            toFloorId: String(source.toFloorId || ''),
            bayX: Math.max(0, Math.floor(finite(source.bayX, 0))),
            bayY: Math.max(0, Math.floor(finite(source.bayY, 0))),
            axis: rotationDeg % 180 === 0 ? 'X' : 'Y',
            rotationDeg,
            insertionAnchor: [
                'bay_center',
                'lower_landing_corner',
                'stair_centerline',
                'support_beam_line'
            ].includes(source.insertionAnchor) ? source.insertionAnchor : 'bay_center',
            widthM: positive(source.widthM, 1, 0.75),
            landingM: positive(source.landingM, 1.1, 0.75),
            gapM: Math.max(0, finite(source.gapM, 0)),
            treadMm: positive(source.treadMm, 275, 230),
            preferredRiseMm: positive(source.preferredRiseMm, 175, 140),
            actualRiseMm: positive(source.actualRiseMm, finite(source.preferredRiseMm, 175), 1),
            waistMm: positive(source.waistMm, 150, 100),
            risers: Math.max(2, Math.round(finite(source.risers, 18))),
            flightRunM: positive(source.flightRunM, 2.2, 0.5),
            bounds,
            opening: source.opening ? clone(source.opening, null) : null,
            placement: {
                offsetXM: finite(placement.offsetXM, 0),
                offsetYM: finite(placement.offsetYM, 0),
                snapMode: ['grid', 'column', 'free'].includes(placement.snapMode)
                    ? placement.snapMode
                    : 'free',
                snapTargetId: String(placement.snapTargetId || '')
            },
            material: String(source.material || 'Concrete'),
            sections: {
                stairBeam: normalizeSection(sections.stairBeam, DEFAULT_SECTIONS.stairBeam),
                landingBeam: normalizeSection(sections.landingBeam, DEFAULT_SECTIONS.landingBeam)
            },
            loads: {
                finishesKPa: Math.max(0, finite(loads.finishesKPa, DEFAULT_LOADS.finishesKPa)),
                liveLoadKPa: Math.max(0, finite(loads.liveLoadKPa, DEFAULT_LOADS.liveLoadKPa)),
                railingLoadKNPerM: Math.max(0, finite(loads.railingLoadKNPerM, DEFAULT_LOADS.railingLoadKNPerM)),
                wallLoadKNPerM: Math.max(0, finite(loads.wallLoadKNPerM, DEFAULT_LOADS.wallLoadKNPerM))
            },
            integration: {
                anchorGridId: String(integration.anchorGridId || ''),
                engineerApproved: integration.engineerApproved === true,
                supportMappings: clone(integration.supportMappings, {}),
                status: String(integration.status || 'detached_draft'),
                alignedAt: String(integration.alignedAt || ''),
                approvedAt: String(integration.approvedAt || '')
            },
            analysisExport: String(source.analysisExport || 'pending-validation')
        };
        if (source.structuralModel && source.structuralModel.schema === SCHEMA) {
            normalized.structuralModel = clone(source.structuralModel, null);
        }
        return normalized;
    }

    function makeCoordinatePrimer(stair, context) {
        const b = stair.bounds;
        const rotation = stair.rotationDeg;
        const runAlongX = rotation % 180 === 0;
        const lowerElevation = finite(context.lowerElevation, 0);
        const upperElevation = finite(context.upperElevation, lowerElevation + 3);
        const landingElevation = stair.type === 'dogleg'
            ? lowerElevation + (upperElevation - lowerElevation) / 2
            : upperElevation;

        const toWorld = (run, cross) => {
            if (rotation === 90) return { x: b.x2 - cross, y: b.y1 + run };
            if (rotation === 180) return { x: b.x2 - run, y: b.y2 - cross };
            if (rotation === 270) return { x: b.x1 + cross, y: b.y2 - run };
            return { x: b.x1 + run, y: b.y1 + cross };
        };
        const pointAtWorldCross = (run, crossCoordinate) => {
            if (runAlongX) {
                return {
                    x: rotation === 180 ? b.x2 - run : b.x1 + run,
                    y: crossCoordinate
                };
            }
            return {
                x: crossCoordinate,
                y: rotation === 270 ? b.y2 - run : b.y1 + run
            };
        };

        return {
            rotationDeg: rotation,
            axis: runAlongX ? 'X' : 'Y',
            lowerElevation,
            upperElevation,
            landingElevation,
            storeyHeightM: upperElevation - lowerElevation,
            toWorld,
            pointAtWorldCross
        };
    }

    function makeSlabComponent(stair, primer, options) {
        const topVertices = [
            { ...primer.toWorld(options.run1, options.cross1), z: options.z1 },
            { ...primer.toWorld(options.run2, options.cross1), z: options.z2 },
            { ...primer.toWorld(options.run2, options.cross2), z: options.z2 },
            { ...primer.toWorld(options.run1, options.cross2), z: options.z1 }
        ];
        const thicknessM = positive(options.thicknessMm, stair.waistMm, 50) / 1000;
        const bottomVertices = topVertices.map(point => ({ ...point, z: point.z - thicknessM }));
        const planRun = Math.abs(options.run2 - options.run1);
        const rise = Math.abs(options.z2 - options.z1);
        const width = Math.abs(options.cross2 - options.cross1);
        const planAreaM2 = planRun * width;
        const surfaceAreaM2 = Math.hypot(planRun, rise) * width;
        return {
            id: options.id,
            stairId: stair.id,
            memberType: options.memberType,
            source: options.source,
            floorId: stair.fromFloorId,
            destinationFloorId: stair.toFloorId,
            material: stair.material,
            thicknessMm: Math.round(thicknessM * 1000),
            topVertices,
            bottomVertices,
            planAreaM2,
            surfaceAreaM2,
            diaphragmPolicy: 'excluded_from_horizontal_rigid_diaphragm',
            loadSource: 'stair_surface_loads',
            solverExportReadiness: 'pending_support_and_engineer_approval'
        };
    }

    function makeBeamComponent(stair, primer, options) {
        const startPlan = options.worldCross
            ? primer.pointAtWorldCross(options.run1, options.cross1)
            : primer.toWorld(options.run1, options.cross1);
        const endPlan = options.worldCross
            ? primer.pointAtWorldCross(options.run2, options.cross2)
            : primer.toWorld(options.run2, options.cross2);
        const section = normalizeSection(options.section, DEFAULT_SECTIONS.stairBeam);
        const start = { ...startPlan, z: options.z1 };
        const end = { ...endPlan, z: options.z2 };
        return {
            id: options.id,
            stairId: stair.id,
            memberType: options.memberType,
            source: options.source,
            floorId: stair.fromFloorId,
            destinationFloorId: stair.toFloorId,
            material: stair.material,
            start,
            end,
            widthMm: section.widthMm,
            depthMm: section.depthMm,
            section: `${section.widthMm}x${section.depthMm}`,
            lengthM: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
            levelOffsetM: options.z1 - primer.lowerElevation,
            supportTopology: clone(options.supportTopology, []),
            loadSource: clone(options.loadSource, []),
            appliedLoads: [],
            reactionHandoffStatus: 'preliminary',
            solverExportReadiness: 'pending_support_and_engineer_approval'
        };
    }

    function resolveExternalSupport(stair, context, request) {
        const persisted = stair.integration.supportMappings &&
            stair.integration.supportMappings[request.reactionId];
        let resolved = persisted && persisted.referenceId
            ? clone(persisted, null)
            : null;
        if (typeof context.resolveSupport === 'function') {
            const candidate = context.resolveSupport(request);
            if (candidate && candidate.referenceId) resolved = clone(candidate, null);
        }
        if (!resolved || !resolved.referenceId) {
            return {
                kind: 'unresolved',
                referenceId: '',
                floorId: request.floorId,
                status: 'unresolved'
            };
        }
        return {
            kind: String(resolved.kind || 'member'),
            referenceId: String(resolved.referenceId),
            floorId: String(resolved.floorId || request.floorId),
            status: 'resolved'
        };
    }

    function assignLoads(stair, slabs, beams, concreteDensity) {
        let slabDeadKN = 0;
        let slabLiveKN = 0;
        slabs.forEach(slab => {
            const rise = Math.max(...slab.topVertices.map(point => point.z)) -
                Math.min(...slab.topVertices.map(point => point.z));
            const stepAllowanceKN = slab.memberType === 'stair_flight_slab'
                ? slab.planAreaM2 * concreteDensity * Math.max(0, rise) /
                    Math.max(2, stair.type === 'dogleg' ? stair.risers / 2 : stair.risers) / 2
                : 0;
            const selfWeightKN = slab.surfaceAreaM2 * slab.thicknessMm / 1000 * concreteDensity + stepAllowanceKN;
            const finishesKN = slab.planAreaM2 * stair.loads.finishesKPa;
            const liveKN = slab.planAreaM2 * stair.loads.liveLoadKPa;
            slab.loads = {
                selfWeightKN,
                stepAllowanceKN,
                finishesKN,
                liveKN,
                deadLoadCase: 'FS_STAIR_DL',
                liveLoadCase: 'FS_STAIR_LL',
                status: 'preliminary'
            };
            slabDeadKN += selfWeightKN + finishesKN;
            slabLiveKN += liveKN;
        });

        let beamSelfWeightKN = 0;
        beams.forEach(beam => {
            const selfWeightKN = beam.lengthM * beam.widthMm / 1000 * beam.depthMm / 1000 * concreteDensity;
            beam.appliedLoads.push({
                loadCase: 'FS_DEAD',
                type: 'self_weight',
                totalKN: selfWeightKN,
                status: 'automatic_once'
            });
            beamSelfWeightKN += selfWeightKN;
        });

        const slopingLength = slabs
            .filter(slab => slab.memberType === 'stair_flight_slab')
            .reduce((sum, slab) => sum + slab.surfaceAreaM2 / Math.max(0.01, stair.widthM), 0);
        const permanentEdgeLoadKN = slopingLength *
            (stair.loads.railingLoadKNPerM + stair.loads.wallLoadKNPerM);
        const totalDeadKN = slabDeadKN + beamSelfWeightKN + permanentEdgeLoadKN;
        const totalLiveKN = slabLiveKN;

        const supportBeams = beams.filter(beam =>
            beam.source === 'lower_support' ||
            beam.source === 'upper_support'
        );
        supportBeams.forEach(beam => {
            beam.appliedLoads.push({
                loadCase: 'FS_STAIR_DL',
                type: 'preliminary_line_handoff',
                totalKN: totalDeadKN / Math.max(1, supportBeams.length),
                lineLoadKNPerM: totalDeadKN / Math.max(1, supportBeams.length) / Math.max(0.01, beam.lengthM),
                status: 'preliminary_not_applied_when_shells_are_exported'
            });
            beam.appliedLoads.push({
                loadCase: 'FS_STAIR_LL',
                type: 'preliminary_line_handoff',
                totalKN: totalLiveKN / Math.max(1, supportBeams.length),
                lineLoadKNPerM: totalLiveKN / Math.max(1, supportBeams.length) / Math.max(0.01, beam.lengthM),
                status: 'preliminary_not_applied_when_shells_are_exported'
            });
        });

        return {
            concreteDensityKNPerM3: concreteDensity,
            flightAndLandingDeadKN: slabDeadKN,
            beamSelfWeightKN,
            railingAndWallDeadKN: permanentEdgeLoadKN,
            totalDeadKN,
            totalLiveKN,
            loadCases: ['FS_DEAD', 'FS_STAIR_DL', 'FS_STAIR_LL'],
            distributionMethod: 'symmetric_preliminary_to_lower_and_upper_support_beams',
            doubleCountPolicy: 'export_shells_and_frames_or_reactions_never_both',
            status: 'preliminary'
        };
    }

    function buildStairStructuralModel(rawStair, context = {}) {
        const stair = normalizeStair(rawStair, 0);
        if (!stair) {
            return {
                schema: SCHEMA,
                stairId: '',
                validation: {
                    status: 'BLOCKED',
                    errors: ['invalid_stair_bounds'],
                    warnings: []
                },
                components: [],
                flightSlabs: [],
                landingSlabs: [],
                beams: [],
                openings: [],
                supportReactions: [],
                integration: {
                    status: 'detached_draft',
                    aligned: false,
                    supportMapped: false,
                    loadMapped: false,
                    engineerApproved: false,
                    solverReady: false
                }
            };
        }

        const primer = makeCoordinatePrimer(stair, context);
        const errors = [];
        const warnings = [];
        if (!stair.fromFloorId || !stair.toFloorId || stair.fromFloorId === stair.toFloorId) {
            errors.push('invalid_floor_pair');
        }
        if (!(primer.upperElevation > primer.lowerElevation)) errors.push('invalid_vertical_range');
        if (context.clashFree === false) errors.push('stair_clash_detected');
        if (!stair.opening || !stair.opening.slabId) warnings.push('destination_opening_not_mapped');

        const run = stair.flightRunM;
        const long = run + stair.landingM;
        const cross = stair.type === 'dogleg' ? stair.widthM * 2 + stair.gapM : stair.widthM;
        const expectedRun = primer.axis === 'X'
            ? stair.bounds.x2 - stair.bounds.x1
            : stair.bounds.y2 - stair.bounds.y1;
        const expectedCross = primer.axis === 'X'
            ? stair.bounds.y2 - stair.bounds.y1
            : stair.bounds.x2 - stair.bounds.x1;
        if (Math.abs(expectedRun - long) > 0.03 || Math.abs(expectedCross - cross) > 0.03) {
            warnings.push('stored_footprint_reconciled_to_stair_parameters');
        }

        const flightSlabs = [];
        const landingSlabs = [];
        const beams = [];
        const stairSection = stair.sections.stairBeam;
        const landingSection = stair.sections.landingBeam;
        const lower = primer.lowerElevation;
        const upper = primer.upperElevation;
        const mid = primer.landingElevation;
        const lowerFloorId = stair.fromFloorId;
        const upperFloorId = stair.toFloorId;

        if (stair.type === 'dogleg') {
            flightSlabs.push(makeSlabComponent(stair, primer, {
                id: `${stair.id}-FS1`,
                memberType: 'stair_flight_slab',
                source: 'flight_1',
                run1: 0,
                run2: run,
                cross1: 0,
                cross2: stair.widthM,
                z1: lower,
                z2: mid,
                thicknessMm: stair.waistMm
            }));
            flightSlabs.push(makeSlabComponent(stair, primer, {
                id: `${stair.id}-FS2`,
                memberType: 'stair_flight_slab',
                source: 'flight_2',
                run1: run,
                run2: 0,
                cross1: stair.widthM + stair.gapM,
                cross2: cross,
                z1: mid,
                z2: upper,
                thicknessMm: stair.waistMm
            }));
            landingSlabs.push(makeSlabComponent(stair, primer, {
                id: `${stair.id}-LS1`,
                memberType: 'landing_slab',
                source: 'intermediate_landing',
                run1: run,
                run2: long,
                cross1: 0,
                cross2: cross,
                z1: mid,
                z2: mid,
                thicknessMm: stair.waistMm
            }));
        } else {
            flightSlabs.push(makeSlabComponent(stair, primer, {
                id: `${stair.id}-FS1`,
                memberType: 'stair_flight_slab',
                source: 'flight_1',
                run1: 0,
                run2: run,
                cross1: 0,
                cross2: stair.widthM,
                z1: lower,
                z2: upper,
                thicknessMm: stair.waistMm
            }));
            landingSlabs.push(makeSlabComponent(stair, primer, {
                id: `${stair.id}-LS1`,
                memberType: 'landing_slab',
                source: 'upper_landing',
                run1: run,
                run2: long,
                cross1: 0,
                cross2: stair.widthM,
                z1: upper,
                z2: upper,
                thicknessMm: stair.waistMm
            }));
        }

        const bayBounds = normalizeBounds(context.bayBounds, null) || stair.bounds;
        const worldCrossStart = primer.axis === 'X' ? bayBounds.y1 : bayBounds.x1;
        const worldCrossEnd = primer.axis === 'X' ? bayBounds.y2 : bayBounds.x2;
        const addBeam = options => {
            const beam = makeBeamComponent(stair, primer, options);
            beams.push(beam);
            return beam;
        };

        const lowerSupport = addBeam({
            id: `${stair.id}-SB-BOT`,
            memberType: 'stair_beam',
            source: 'lower_support',
            run1: 0,
            run2: 0,
            cross1: worldCrossStart,
            cross2: worldCrossEnd,
            z1: lower,
            z2: lower,
            worldCross: true,
            section: stairSection
        });
        const topLaneStart = stair.type === 'dogleg' ? stair.widthM + stair.gapM : 0;
        const topSupport = addBeam({
            id: `${stair.id}-SB-TOP`,
            memberType: 'stair_beam',
            source: 'upper_support',
            run1: stair.type === 'dogleg' ? 0 : run,
            run2: stair.type === 'dogleg' ? 0 : run,
            cross1: worldCrossStart,
            cross2: worldCrossEnd,
            z1: upper,
            z2: upper,
            worldCross: true,
            section: stairSection
        });
        const landingSupport = addBeam({
            id: `${stair.id}-LB-IN`,
            memberType: 'landing_beam',
            source: stair.type === 'dogleg' ? 'intermediate_landing_support' : 'upper_landing_support',
            run1: run,
            run2: run,
            cross1: worldCrossStart,
            cross2: worldCrossEnd,
            z1: stair.type === 'dogleg' ? mid : upper,
            z2: stair.type === 'dogleg' ? mid : upper,
            worldCross: true,
            section: landingSection
        });
        const landingOuter = addBeam({
            id: `${stair.id}-LB-OUT`,
            memberType: 'landing_beam',
            source: 'landing_outer_edge',
            run1: long,
            run2: long,
            cross1: 0,
            cross2: cross,
            z1: stair.type === 'dogleg' ? mid : upper,
            z2: stair.type === 'dogleg' ? mid : upper,
            section: landingSection
        });

        const flight1Left = addBeam({
            id: `${stair.id}-SB-F1-L`,
            memberType: 'stair_beam',
            source: 'flight_1_left_edge',
            run1: 0,
            run2: run,
            cross1: 0,
            cross2: 0,
            z1: lower,
            z2: stair.type === 'dogleg' ? mid : upper,
            section: stairSection
        });
        const flight1Right = addBeam({
            id: `${stair.id}-SB-F1-R`,
            memberType: 'stair_beam',
            source: 'flight_1_right_edge',
            run1: 0,
            run2: run,
            cross1: stair.widthM,
            cross2: stair.widthM,
            z1: lower,
            z2: stair.type === 'dogleg' ? mid : upper,
            section: stairSection
        });

        let flight2Left = null;
        let flight2Right = null;
        if (stair.type === 'dogleg') {
            flight2Left = addBeam({
                id: `${stair.id}-SB-F2-L`,
                memberType: 'stair_beam',
                source: 'flight_2_left_edge',
                run1: run,
                run2: 0,
                cross1: topLaneStart,
                cross2: topLaneStart,
                z1: mid,
                z2: upper,
                section: stairSection
            });
            flight2Right = addBeam({
                id: `${stair.id}-SB-F2-R`,
                memberType: 'stair_beam',
                source: 'flight_2_right_edge',
                run1: run,
                run2: 0,
                cross1: cross,
                cross2: cross,
                z1: mid,
                z2: upper,
                section: stairSection
            });
        }

        const landingLeft = addBeam({
            id: `${stair.id}-LB-L`,
            memberType: 'landing_beam',
            source: 'landing_left_edge',
            run1: run,
            run2: long,
            cross1: 0,
            cross2: 0,
            z1: stair.type === 'dogleg' ? mid : upper,
            z2: stair.type === 'dogleg' ? mid : upper,
            section: landingSection
        });
        const landingRight = addBeam({
            id: `${stair.id}-LB-R`,
            memberType: 'landing_beam',
            source: 'landing_right_edge',
            run1: run,
            run2: long,
            cross1: cross,
            cross2: cross,
            z1: stair.type === 'dogleg' ? mid : upper,
            z2: stair.type === 'dogleg' ? mid : upper,
            section: landingSection
        });

        lowerSupport.supportTopology = [
            { end: 'start', kind: 'main_frame', role: 'lower_left' },
            { end: 'end', kind: 'main_frame', role: 'lower_right' }
        ];
        topSupport.supportTopology = [
            { end: 'start', kind: 'main_frame', role: 'upper_left' },
            { end: 'end', kind: 'main_frame', role: 'upper_right' }
        ];
        landingSupport.supportTopology = stair.type === 'dogleg'
            ? [
                { end: 'start', kind: 'stair_member', referenceId: flight1Left.id },
                { end: 'end', kind: 'stair_member', referenceId: flight2Right.id }
            ]
            : [
                { end: 'start', kind: 'stair_member', referenceId: flight1Left.id },
                { end: 'end', kind: 'stair_member', referenceId: flight1Right.id }
            ];
        landingOuter.supportTopology = [
            { end: 'start', kind: 'stair_member', referenceId: landingLeft.id },
            { end: 'end', kind: 'stair_member', referenceId: landingRight.id }
        ];
        flight1Left.supportTopology = [
            { end: 'start', kind: 'stair_member', referenceId: lowerSupport.id },
            { end: 'end', kind: 'stair_member', referenceId: landingSupport.id }
        ];
        flight1Right.supportTopology = clone(flight1Left.supportTopology, []);
        if (flight2Left && flight2Right) {
            flight2Left.supportTopology = [
                { end: 'start', kind: 'stair_member', referenceId: landingSupport.id },
                { end: 'end', kind: 'stair_member', referenceId: topSupport.id }
            ];
            flight2Right.supportTopology = clone(flight2Left.supportTopology, []);
        }
        landingLeft.supportTopology = [
            { end: 'start', kind: 'stair_member', referenceId: landingSupport.id },
            { end: 'end', kind: 'stair_member', referenceId: landingOuter.id }
        ];
        landingRight.supportTopology = clone(landingLeft.supportTopology, []);

        const concreteDensity = positive(context.concreteDensityKNPerM3, 24, 1);
        const loadHandoff = assignLoads(stair, [...flightSlabs, ...landingSlabs], beams, concreteDensity);
        const supportReactions = [];
        [
            { beam: lowerSupport, floorId: lowerFloorId, rolePrefix: 'lower' },
            { beam: topSupport, floorId: upperFloorId, rolePrefix: 'upper' }
        ].forEach(entry => {
            ['start', 'end'].forEach((endName, endIndex) => {
                const reactionId = `${stair.id}-RXN-${entry.rolePrefix.toUpperCase()}-${endIndex + 1}`;
                const point = entry.beam[endName];
                const support = resolveExternalSupport(stair, context, {
                    reactionId,
                    stairId: stair.id,
                    beamId: entry.beam.id,
                    role: `${entry.rolePrefix}_${endName}`,
                    floorId: entry.floorId,
                    elevation: point.z,
                    point: { x: point.x, y: point.y }
                });
                supportReactions.push({
                    id: reactionId,
                    stairId: stair.id,
                    memberType: 'stair_support_reaction',
                    sourceBeamId: entry.beam.id,
                    floorId: entry.floorId,
                    point: { x: point.x, y: point.y, z: point.z },
                    support,
                    deadKN: loadHandoff.totalDeadKN / 4,
                    liveKN: loadHandoff.totalLiveKN / 4,
                    loadCases: ['FS_STAIR_DL', 'FS_STAIR_LL'],
                    status: 'preliminary',
                    handoffPolicy: 'not_applied_when_explicit_stair_shells_and_frames_are_exported'
                });
            });
        });

        const supportMapped = supportReactions.length > 0 &&
            supportReactions.every(reaction => reaction.support.status === 'resolved');
        const engineerApproved = stair.integration.engineerApproved === true;
        const solverConnectionValidated = context.solverConnectionValidated === true;
        const aligned = errors.length === 0;
        const loadMapped = aligned && loadHandoff.totalDeadKN > 0;
        const solverReady = aligned && supportMapped && loadMapped &&
            engineerApproved && solverConnectionValidated;
        const integrationStatus = !aligned
            ? 'detached_draft'
            : (!supportMapped
                ? 'aligned'
                : (!engineerApproved
                    ? 'engineer_review_required'
                    : (!solverConnectionValidated ? 'solver_validation_required' : 'solver_ready')));
        const exportReadiness = solverReady
            ? 'solver-ready'
            : (!supportMapped
                ? 'blocked-unresolved-supports'
                : (!engineerApproved ? 'blocked-engineer-review' : 'blocked-native-solver-validation'));
        beams.forEach(beam => {
            beam.reactionHandoffStatus = supportMapped ? 'mapped_preliminary' : 'unresolved';
            beam.solverExportReadiness = exportReadiness;
        });
        [...flightSlabs, ...landingSlabs].forEach(slab => {
            slab.solverExportReadiness = exportReadiness;
        });

        const opening = stair.opening ? {
            id: `${stair.id}-OPENING`,
            stairId: stair.id,
            memberType: 'stair_opening',
            floorId: stair.toFloorId,
            slabId: String(stair.opening.slabId || ''),
            bounds: clone(stair.bounds, {}),
            bottomElevation: upper - positive(
                context.destinationSlabThicknessMm,
                stair.waistMm,
                50
            ) / 1000,
            topElevation: upper,
            status: 'coordinated'
        } : null;

        const components = [
            ...flightSlabs,
            ...landingSlabs,
            ...beams,
            ...(opening ? [opening] : []),
            ...supportReactions
        ];
        return {
            schema: SCHEMA,
            stairId: stair.id,
            generatedAt: String(context.generatedAt || ''),
            sourceSignature: JSON.stringify({
                id: stair.id,
                type: stair.type,
                floors: [stair.fromFloorId, stair.toFloorId],
                rotationDeg: stair.rotationDeg,
                bounds: stair.bounds,
                dimensions: [
                    stair.widthM,
                    stair.landingM,
                    stair.gapM,
                    stair.treadMm,
                    stair.actualRiseMm,
                    stair.waistMm
                ],
                sections: stair.sections,
                loads: stair.loads,
                elevations: [lower, mid, upper]
            }),
            coordinatePrimer: {
                anchorGridId: stair.integration.anchorGridId,
                insertionAnchor: stair.insertionAnchor,
                rotationDeg: primer.rotationDeg,
                lowerElevation: lower,
                landingElevations: stair.type === 'dogleg' ? [mid] : [],
                upperElevation: upper,
                fromFloorId: stair.fromFloorId,
                toFloorId: stair.toFloorId,
                bayX: stair.bayX,
                bayY: stair.bayY
            },
            integration: {
                status: integrationStatus,
                aligned,
                supportMapped,
                loadMapped,
                engineerApproved,
                solverConnectionValidated,
                solverReady,
                slopedShellDiaphragmPolicy: 'excluded'
            },
            validation: {
                status: errors.length ? 'BLOCKED' : (solverReady ? 'PASS' : 'WARNING'),
                errors,
                warnings: [
                    ...warnings,
                    ...(!supportMapped ? ['main_frame_supports_unresolved'] : []),
                    ...(!engineerApproved ? ['engineer_approval_required'] : []),
                    ...(!solverConnectionValidated ? ['native_solver_connectivity_validation_required'] : [])
                ]
            },
            components,
            flightSlabs,
            landingSlabs,
            beams,
            openings: opening ? [opening] : [],
            supportReactions,
            loadHandoff,
            counts: {
                flightSlabs: flightSlabs.length,
                landingSlabs: landingSlabs.length,
                stairBeams: beams.filter(beam => beam.memberType === 'stair_beam').length,
                landingBeams: beams.filter(beam => beam.memberType === 'landing_beam').length,
                openings: opening ? 1 : 0,
                supportReactions: supportReactions.length
            }
        };
    }

    function summarize(models) {
        const list = (Array.isArray(models) ? models : []).filter(Boolean);
        return {
            stairs: list.length,
            flightSlabs: list.reduce((sum, model) => sum + (model.counts && model.counts.flightSlabs || 0), 0),
            landingSlabs: list.reduce((sum, model) => sum + (model.counts && model.counts.landingSlabs || 0), 0),
            stairBeams: list.reduce((sum, model) => sum + (model.counts && model.counts.stairBeams || 0), 0),
            landingBeams: list.reduce((sum, model) => sum + (model.counts && model.counts.landingBeams || 0), 0),
            openings: list.reduce((sum, model) => sum + (model.counts && model.counts.openings || 0), 0),
            supportReactions: list.reduce((sum, model) => sum + (model.counts && model.counts.supportReactions || 0), 0),
            solverReady: list.filter(model => model.integration && model.integration.solverReady).length,
            blocked: list.filter(model => !model.integration || !model.integration.solverReady).length,
            totalDeadKN: list.reduce((sum, model) => sum + finite(model.loadHandoff && model.loadHandoff.totalDeadKN, 0), 0),
            totalLiveKN: list.reduce((sum, model) => sum + finite(model.loadHandoff && model.loadHandoff.totalLiveKN, 0), 0)
        };
    }

    return {
        SCHEMA,
        DEFAULT_SECTIONS: clone(DEFAULT_SECTIONS, {}),
        DEFAULT_LOADS: clone(DEFAULT_LOADS, {}),
        normalizeStair,
        buildStairStructuralModel,
        summarize
    };
});
