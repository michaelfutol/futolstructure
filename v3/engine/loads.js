/**
 * engine/loads.js — Structural Load Calculation Module
 * Extracted from FutolStructure v3
 *
 * All functions accept explicit parameters instead of reading global state.
 * This module has zero DOM dependencies and can be tested standalone.
 *
 * NSCP 2015 (National Structural Code of the Philippines) / ACI 318-14
 */
'use strict';

const EngineLoads = (function () {

    // ========================
    // Floor / Column Helpers
    // ========================

    /**
     * Check if floorId is at or above startFloor in the floors array.
     * Higher index = higher floor (GF=0, 2F=1, RF=2).
     * @param {Array} floors - The floors array
     * @param {string} floorId - Floor to check
     * @param {string} startFloor - Reference floor
     * @returns {boolean}
     */
    function isFloorAtOrAbove(floors, floorId, startFloor) {
        const floorIdx = floors.findIndex(f => f.id === floorId);
        const startIdx = floors.findIndex(f => f.id === startFloor);
        return floorIdx >= startIdx;
    }

    /**
     * Resolve one physical column segment without mutating compatibility state.
     * C1A segmentOverrides are authoritative. Older visibility fields remain
     * readable only so legacy .fstr files can migrate without reactivating
     * intentionally hidden or removed segments.
     * @param {object} col - Column line/runtime object
     * @param {string} floorId - Storey segment identifier
     * @param {Array} floors - Ordered floors (low to high)
     * @returns {object} Canonical segment state
     */
    function resolveColumnSegmentState(col, floorId, floors) {
        const orderedFloors = Array.isArray(floors) ? floors : [];
        const floor = orderedFloors.find(item => item?.id === floorId);
        const segmentId = `${String(col?.id || 'COLUMN')}::${String(floorId || 'UNKNOWN')}`;
        if (!col || !floorId || !floor) {
            return {
                segmentId,
                columnId: col?.id || '',
                floorId: floorId || '',
                active: false,
                intent: 'invalid_reference',
                source: 'validation'
            };
        }

        const startFloorId = col.startFloor || null;
        if (startFloorId && !isFloorAtOrAbove(orderedFloors, floorId, startFloorId)) {
            return {
                segmentId,
                columnId: col.id,
                floorId,
                active: false,
                intent: 'below_start_level',
                source: 'startFloor',
                startFloorId
            };
        }

        const override = col.segmentOverrides && typeof col.segmentOverrides === 'object'
            ? col.segmentOverrides[floorId]
            : null;
        if (override && typeof override === 'object' && typeof override.active === 'boolean') {
            return {
                segmentId: override.segmentId || segmentId,
                columnId: col.id,
                floorId,
                active: override.active,
                intent: override.intent || (override.active ? 'explicit_active' : 'remove_segment'),
                source: 'segmentOverrides',
                startFloorId,
                updatedAt: override.updatedAt || ''
            };
        }

        // A false compatibility flag wins. This conservatively resolves old
        // files that contain conflicting activePerFloor and floorActive maps.
        const compatibilityFlags = [];
        if (col.activePerFloor && Object.prototype.hasOwnProperty.call(col.activePerFloor, floorId)) {
            compatibilityFlags.push({ source: 'activePerFloor', active: col.activePerFloor[floorId] !== false });
        }
        if (col.floorActive && Object.prototype.hasOwnProperty.call(col.floorActive, floorId)) {
            compatibilityFlags.push({ source: 'floorActive', active: col.floorActive[floorId] !== false });
        }
        if (Array.isArray(floor.deletedColumns) && floor.deletedColumns.includes(col.id)) {
            compatibilityFlags.push({ source: 'floor.deletedColumns', active: false });
        }
        const inactiveCompatibility = compatibilityFlags.find(item => item.active === false);
        if (inactiveCompatibility) {
            return {
                segmentId,
                columnId: col.id,
                floorId,
                active: false,
                intent: 'legacy_inactive',
                source: inactiveCompatibility.source,
                startFloorId
            };
        }
        if (compatibilityFlags.length) {
            return {
                segmentId,
                columnId: col.id,
                floorId,
                active: true,
                intent: 'legacy_active',
                source: compatibilityFlags[0].source,
                startFloorId
            };
        }

        return {
            segmentId,
            columnId: col.id,
            floorId,
            active: col.active !== false,
            intent: col.active === false ? 'legacy_line_inactive' : 'continuous',
            source: 'active',
            startFloorId
        };
    }

    function isColumnActiveOnFloor(col, floorId, floors) {
        return resolveColumnSegmentState(col, floorId, floors).active;
    }

    // ========================
    // Member Sizing (NSCP)
    // ========================

    /**
     * Size a column per NSCP 410 based on axial load.
     * @param {number} Pu_kN - Factored axial load (kN)
     * @param {number} height_m - Unsupported height (m)
     * @param {object} params - Material/default parameters
     * @param {number} params.fc - Concrete f'c (MPa)
     * @param {number} params.fy - Steel fy (MPa)
     * @param {number} params.defaultColumnB - User override width (mm), 0=auto
     * @param {number} params.defaultColumnH - User override depth (mm), 0=auto
     * @param {number} params.concreteDensity - kN/m3
     * @returns {object} { b, h, Ast, selfWeight_kN, isOverride, capacityRatio, slendernessRatio, isSlender, Pn_max_kN }
     */
    function sizeColumn(Pu_kN, height_m, params) {
        const phi = 0.65;   // NSCP reduction factor for tied columns
        const rho = 0.01;   // 1% minimum steel ratio (NSCP 410.6.1.1)
        const fc = params.fc;
        const fy = params.fy;
        const Pu = Pu_kN * 1000;  // Convert kN to N

        let b, h;
        let isOverride = false;

        // Check for user override (rectangular columns)
        if (params.defaultColumnB > 0) {
            b = params.defaultColumnB;
            h = params.defaultColumnH > 0 ? params.defaultColumnH : b;
            isOverride = true;
        } else {
            // Required gross area (mm²) per NSCP 410.3.5.2
            const Ag_required = Pu / (phi * 0.80 * (0.85 * fc * (1 - rho) + fy * rho));

            // Size as square column, round up to nearest 50mm
            let side = Math.ceil(Math.sqrt(Math.max(0, Ag_required)) / 50) * 50;
            const codeMinimumSide = Number(params.minColumnSideMm) > 0 ? Number(params.minColumnSideMm) : 200;
            const practicalMinimumSide = Number(params.practicalColumnSideMm) > 0 ? Number(params.practicalColumnSideMm) : 300;
            // Auto sizing respects both: code minimum as the hard floor, practical
            // residential minimum as the normal baseline, then axial demand above that.
            side = Math.max(side, codeMinimumSide, practicalMinimumSide);
            b = side;
            h = side;
        }

        // Actual gross area and required steel
        const Ag_actual = b * h;
        const Ast = Math.ceil(rho * Ag_actual);

        // Capacity check (DCR)
        const Pn_max = phi * 0.80 * (0.85 * fc * (Ag_actual - Ast) + fy * Ast) / 1000; // kN
        const capacityRatio = Pn_max > 0 ? Pu_kN / Pn_max : 0;

        // Slenderness ratio check (klu/r)
        const lu = height_m * 1000;
        const r = Math.min(b, h) * 0.3;
        const k = 1.0;
        const slendernessRatio = r > 0 ? (k * lu) / r : 0;

        // Column self-weight
        const volume_m3 = (b / 1000) * (h / 1000) * height_m;
        const selfWeight_kN = volume_m3 * params.concreteDensity;

        return {
            b, h, Ast, selfWeight_kN, isOverride,
            capacityRatio,
            slendernessRatio,
            isSlender: slendernessRatio > 22,
            Pn_max_kN: Pn_max
        };
    }

    /**
     * Size a beam per NSCP Table 409.3.1.1 (span-to-depth ratio).
     * @param {number} span_m - Beam span (m)
     * @param {boolean} isCantilever - Cantilever beam flag
     * @param {object} params - Default sizing parameters
     * @param {number} params.defaultBeamB - User override width (mm), 0=auto
     * @param {number} params.defaultBeamH - User override depth (mm), 0=auto
     * @returns {object} { b, h, aspectRatio, spanToDepthRatio, isAdequate }
     */
    function sizeBeam(span_m, isCantilever, params) {
        let b, h;

        if (params.defaultBeamH > 0) {
            h = params.defaultBeamH;
            b = params.defaultBeamB || 250;
        } else {
            const L = span_m * 1000;
            const minDepthRatio = isCantilever ? 8 : 16;
            h = Math.ceil((L / minDepthRatio) / 50) * 50;
            h = Math.max(h, 300);

            b = params.defaultBeamB > 0
                ? params.defaultBeamB
                : Math.max(200, Math.ceil((h * 0.4) / 50) * 50);
        }

        const aspectRatio = h / b;
        const spanToDepthRatio = (span_m * 1000) / h;

        return {
            b, h,
            aspectRatio,
            spanToDepthRatio,
            isAdequate: spanToDepthRatio <= (isCantilever ? 8 : 16)
        };
    }

    /**
     * Apply sizing to all columns and beams. Mutates in-place.
     * @param {Array} columns - Column objects
     * @param {Array} beams - Beam objects
     * @param {object} params - Material/default parameters (fc, fy, defaultColumn/BeamB/H, concreteDensity, floorHeight)
     * @returns {object} { totalColumnSelfWeight, totalBeamSelfWeight }
     */
    function sizeMembers(columns, beams, params) {
        const positiveNumber = value => {
            const n = Number(value);
            return Number.isFinite(n) && n > 0 ? n : null;
        };

        let totalColumnSelfWeight = 0;
        for (let col of columns) {
            const activeOnAnyFloor = Array.isArray(params.floors) && params.floors.length
                ? params.floors.some(floor => isColumnActiveOnFloor(col, floor.id, params.floors))
                : col.active !== false;
            if (!activeOnAnyFloor) continue;
            const sizing = sizeColumn(col.totalLoad, params.floorHeight, params);
            const manualB = positiveNumber(col.webB) || positiveNumber(col.overrideB) || positiveNumber(col.b);
            const manualH = positiveNumber(col.webD) || positiveNumber(col.overrideH) || positiveNumber(col.h);
            const b = manualB || sizing.b;
            const h = manualH || manualB || sizing.h;

            col.suggestedB = b;
            col.suggestedH = h;
            col.suggestedAst = sizing.Ast;
            col.selfWeight = params.concreteDensity * (b / 1000) * (h / 1000) * params.floorHeight;
            col.isOverride = sizing.isOverride || !!manualB || !!manualH;
            totalColumnSelfWeight += col.selfWeight;
        }

        let totalBeamSelfWeight = 0;
        for (let beam of beams) {
            const sizing = sizeBeam(beam.span, beam.isCantilever || false, params);
            const manualB = positiveNumber(beam.webW) || positiveNumber(beam.overrideB) || positiveNumber(beam.b);
            const manualH = positiveNumber(beam.webD) || positiveNumber(beam.overrideH) || positiveNumber(beam.h);
            const b = manualB || sizing.b;
            const h = manualH || sizing.h;

            beam.suggestedB = b;
            beam.suggestedH = h;

            const bM = b / 1000;
            const hM = h / 1000;
            beam.selfWeight = params.concreteDensity * bM * hM * beam.span;
            beam.selfWeightPerM = params.concreteDensity * bM * hM;
            totalBeamSelfWeight += beam.selfWeight;
        }

        return { totalColumnSelfWeight, totalBeamSelfWeight };
    }

    // ========================
    // Load Calculations
    // ========================

    /**
     * Calculate beam end reactions (simply supported / cantilever).
     * Mutates beam.Rleft and beam.Rright in-place.
     * @param {Array} beams - Beam objects (must have .w, .span set)
     */
    function calculateBeamReactions(beams) {
        for (let beam of beams) {
            if (beam.isCantilever) {
                const totalLoad = beam.w * beam.span;
                if (beam.startCol) {
                    beam.Rleft = totalLoad;
                    beam.Rright = 0;
                } else {
                    beam.Rleft = 0;
                    beam.Rright = totalLoad;
                }
            } else if (beam.isEdgeBeam) {
                beam.Rleft = beam.w * beam.span / 2;
                beam.Rright = beam.w * beam.span / 2;
            } else {
                beam.Rleft = beam.w * beam.span / 2;
                beam.Rright = beam.w * beam.span / 2;
            }
        }
    }

    /**
     * Accumulate beam reactions + beam self-weight DL onto columns for one floor.
     * Mutates columns in-place (col.floorLoads, col.totalLoad, col.loadPerFloor).
     * @param {Array} columns - Column objects
     * @param {Array} beams - Beam objects (must have Rleft/Rright/selfWeight set)
     * @param {Array} floors - Floors array (for helper lookups)
     * @param {string} floorId - Current floor ID
     */
    function calculateColumnLoadsForFloor(columns, beams, floors, floorId) {
        for (let col of columns) {
            if (col.startFloor && !isFloorAtOrAbove(floors, floorId, col.startFloor)) {
                col.floorLoads.push({ floorId, load: 0, isPlanted: true });
                continue;
            }

            if (!isColumnActiveOnFloor(col, floorId, floors)) {
                col.floorLoads.push({ floorId, load: 0, isInactive: true });
                continue;
            }

            let floorLoad = 0;
            let beamDL = 0;
            for (let beam of beams) {
                if (beam.startCol === col.id) floorLoad += beam.Rleft;
                if (beam.endCol === col.id) floorLoad += beam.Rright;

                if (beam.selfWeight) {
                    const halfWeight = beam.selfWeight / 2 * 1.2;
                    if (beam.startCol === col.id) beamDL += halfWeight;
                    if (beam.endCol === col.id) beamDL += halfWeight;
                }
            }
            const totalFloorLoad = floorLoad + beamDL;
            col.floorLoads.push({ floorId, load: totalFloorLoad, slabLoad: floorLoad, beamDL: beamDL });
            col.totalLoad += totalFloorLoad;
            col.loadPerFloor = totalFloorLoad;
        }
    }

    /**
     * Calculate footing sizes for all columns. Mutates columns in-place.
     * @param {Array} columns - Column objects (must have suggestedB/H, totalLoad set)
     * @param {object} params - Configuration object
     * @param {number} params.soilBearing - Allowable soil bearing (kPa)
     * @param {number} params.numFloors - Total number of floors
     * @param {number} params.floorHeight - First floor height (m)
     * @param {number} params.concreteDensity - kN/m3
     * @param {Array} params.xSpans - X bay widths
     * @param {Array} params.ySpans - Y bay widths
     * @returns {object} { tieBeamW, tieBeamH } - Calculated tie beam dimensions
     */
    function calculateFootingSizes(columns, params) {
        const q = params.soilBearing;

        // Tie beam sizing from longest span unless manually set in the app.
        const longestSpan = Math.max(...params.xSpans, ...params.ySpans);
        const manualTieBeamW = Number(params.tieBeamWidth);
        const manualTieBeamH = Number(params.tieBeamDepth);
        const tieBeamH = Number.isFinite(manualTieBeamH) && manualTieBeamH > 0
            ? manualTieBeamH / 1000
            : Math.max(0.3, Math.ceil(longestSpan / 10 * 20) / 20);
        const tieBeamW = Number.isFinite(manualTieBeamW) && manualTieBeamW > 0
            ? manualTieBeamW / 1000
            : 0.25;

        // Tie beam DL per column
        const avgSpan = (params.xSpans.reduce((a, b) => a + b, 0) + params.ySpans.reduce((a, b) => a + b, 0)) /
            (params.xSpans.length + params.ySpans.length);
        const tieBeamVolume = tieBeamW * tieBeamH * avgSpan;
        const tieBeamWeight = tieBeamVolume * params.concreteDensity;
        const tieBeamDLPerColumn = tieBeamWeight * 1.2;

        const foundationFloorId = Array.isArray(params.floors) ? params.floors[0]?.id : null;
        for (let col of columns) {
            const activeAtFoundation = foundationFloorId
                ? isColumnActiveOnFloor(col, foundationFloorId, params.floors)
                : col.active !== false;
            if (!activeAtFoundation) {
                col.footingSize = 0;
                col.footingThick = 0;
                continue;
            }

            if (col.startFloor) {
                col.footingSize = 0;
                col.footingThick = 0;
                col.isPlanted = true;
                continue;
            }

            const colB = (col.suggestedB || 250) / 1000;
            const colH = (col.suggestedH || 250) / 1000;
            const colVolume = colB * colH * params.floorHeight;
            const colDL = colVolume * params.concreteDensity * params.numFloors * 1.2;

            const totalFactored = col.totalLoad + colDL + tieBeamDLPerColumn;
            col.totalLoadWithDL = totalFactored;

            const P_service = totalFactored / 1.4;
            const A_req = P_service / q;

            let side = Math.sqrt(A_req);
            side = Math.max(0.6, Math.ceil(side * 10) / 10);

            const fixedThicknessMm = Number(params.fixedFootingThicknessMm);
            const thick = Number.isFinite(fixedThicknessMm) && fixedThicknessMm > 0
                ? Math.max(0.3, fixedThicknessMm / 1000)
                : Math.max(0.3, Math.round(side / 4 * 10) / 10);

            col.footingSize = side;
            col.footingThick = thick;
            col.columnDL = colDL;
            col.tieBeamDL = tieBeamDLPerColumn;

            const footingVolume = side * side * thick;
            col.footingDL = footingVolume * params.concreteDensity * 1.2;
        }

        return { tieBeamW, tieBeamH };
    }

    /**
     * Structural design of a single isolated footing per ACI 318-14.
     * Checks punching shear, wide-beam shear, and flexural reinforcement.
     * Mutates col.footingDesign and col.footingThick in-place.
     * @param {object} col - Column object (must have footingSize, totalLoadWithDL, suggestedB/H)
     * @param {object} params - { fc, fy }
     * @returns {object|undefined} footingDesign result, or undefined if no footing
     */
    function designFooting(col, params) {
        if (!col.footingSize || col.footingSize <= 0) return;

        const fc = params.fc || 21;
        const fy = params.fy || 415;
        const phi_v = 0.75;
        const phi_b = 0.90;
        const cover = 75;
        const barDia = 16;
        const Pu = col.totalLoadWithDL || col.totalLoad || 0;
        const colB = (col.suggestedB || 250) / 1000;
        const colH = (col.suggestedH || 250) / 1000;
        const fixedThicknessMm = Number(params.fixedFootingThicknessMm);
        const widthFirst = !!params.preferFootingWidthOverDepth && Number.isFinite(fixedThicknessMm) && fixedThicknessMm >= 300;

        function evaluateShear(side, d) {
            const qu = Pu / (side * side);
            const d_m = d / 1000;
            const bo = 2 * ((colB + d_m) + (colH + d_m));
            const Ap = (colB + d_m) * (colH + d_m);
            const Vu_punch = Pu - qu * Ap;
            const beta_c = Math.max(colH, colB) / Math.min(colH, colB);
            const lambda = 1.0;
            const Vc1 = 0.33 * lambda * Math.sqrt(fc) * bo * d / 1000;
            const Vc2 = (0.17 * (1 + 2 / beta_c)) * lambda * Math.sqrt(fc) * bo * d / 1000;
            const alpha_s = 40;
            const Vc3 = (0.083 * (alpha_s * d / (bo * 1000) + 2)) * lambda * Math.sqrt(fc) * bo * d / 1000;
            const Vc = Math.min(Vc1, Vc2, Vc3);
            const phiVc = phi_v * Vc;

            const cantilever = Math.max(0, (side - colB) / 2);
            const Vu_wide = Math.max(0, qu * side * (cantilever - d_m));
            const Vc_wide = 0.17 * Math.sqrt(fc) * (side * 1000) * d / 1000;
            const phiVc_wide = phi_v * Vc_wide;

            return {
                qu,
                punchingVu: Vu_punch,
                punchingPhiVc: phiVc,
                punchingOK: phiVc >= Vu_punch,
                wideVu: Vu_wide,
                widePhiVc: phiVc_wide,
                wideOK: phiVc_wide >= Vu_wide
            };
        }

        let L = col.footingSize;
        let hFinal;
        let dFinal;
        let shear;
        let widenedForFixedDepth = false;

        if (widthFirst) {
            hFinal = fixedThicknessMm;
            dFinal = hFinal - cover - barDia / 2;
            shear = evaluateShear(L, dFinal);
            // Keep residential preliminary footing size governed by soil bearing.
            // If 300mm thickness does not satisfy shear, report it instead of
            // silently creating an impractically wide footing.
        } else {
            let d = (col.footingThick || 0.3) * 1000 - cover - barDia / 2;

            for (let iter = 0; iter < 5; iter++) {
                shear = evaluateShear(L, d);
                if (shear.punchingOK) break;
                d += 25;
            }

            shear = evaluateShear(L, d);
            while (!shear.wideOK && d < 1500) {
                d += 25;
                shear = evaluateShear(L, d);
            }

            const hReq = d + cover + barDia / 2;
            hFinal = Math.max(300, Math.ceil(hReq / 50) * 50);
            dFinal = hFinal - cover - barDia / 2;
            shear = evaluateShear(L, dFinal);
        }

        // Flexural reinforcement
        const qu = shear.qu;
        const Mu_total = qu * L * Math.pow((L - colB) / 2, 2) / 2;
        const b_mm = L * 1000;
        const Rn = (Mu_total * 1e6) / (phi_b * b_mm * dFinal * dFinal);

        const discriminant = 1 - (2 * Rn) / (0.85 * fc);
        let rho;
        if (discriminant > 0) {
            rho = (0.85 * fc / fy) * (1 - Math.sqrt(discriminant));
        } else {
            rho = 0.85 * fc / fy * 0.5;
        }

        const rho_min = fy >= 400 ? 0.0018 : 0.0020;
        rho = Math.max(rho, rho_min);

        const As_req = rho * b_mm * dFinal;
        const Ab = Math.PI * barDia * barDia / 4;
        const nBars = Math.max(2, Math.ceil(As_req / Ab));
        const spacing = Math.floor((b_mm - 2 * cover) / (nBars - 1));

        col.footingDesign = {
            L: L,
            h: hFinal,
            d: dFinal,
            qu: qu.toFixed(1),
            punchingVu: shear.punchingVu.toFixed(1),
            punchingPhiVc: shear.punchingPhiVc.toFixed(1),
            punchingOK: shear.punchingOK,
            wideVu: shear.wideVu.toFixed(1),
            widePhiVc: shear.widePhiVc.toFixed(1),
            wideOK: shear.wideOK,
            Mu: Mu_total.toFixed(1),
            rho: (rho * 100).toFixed(3),
            As: As_req.toFixed(0),
            nBars: nBars,
            barDia: barDia,
            spacing: spacing,
            rebarStr: nBars + '-ø' + barDia + 'mm @ ' + spacing + 'mm c/c EW',
            thicknessPolicy: widthFirst ? '300mm fixed residential preliminary; bearing-sized with shear review' : 'depth-by-shear preliminary',
            widenedForFixedDepth,
            requiresDepthReview: widthFirst && !(shear.punchingOK && shear.wideOK)
        };

        col.footingThick = hFinal / 1000;

        return col.footingDesign;
    }

    // ========================
    // Public API
    // ========================

    return {
        isFloorAtOrAbove: isFloorAtOrAbove,
        resolveColumnSegmentState: resolveColumnSegmentState,
        isColumnActiveOnFloor: isColumnActiveOnFloor,
        sizeColumn: sizeColumn,
        sizeBeam: sizeBeam,
        sizeMembers: sizeMembers,
        calculateBeamReactions: calculateBeamReactions,
        calculateColumnLoadsForFloor: calculateColumnLoadsForFloor,
        calculateFootingSizes: calculateFootingSizes,
        designFooting: designFooting
    };

})();
