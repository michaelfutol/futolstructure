/**
 * engine/tributary.js — Tributary area helpers
 *
 * First extraction wave focuses on the pure custom-beam slab strip math so
 * the monolith can delegate the lowest-risk tributary calculation first.
 */
'use strict';

const EngineTributary = (function () {

    function getOverlapLength(start, end, min, max) {
        return Math.max(0, Math.min(end, max) - Math.max(start, min));
    }

    function getPolygonCentroid(poly) {
        let cx = 0;
        let cy = 0;
        const points = Array.isArray(poly) ? poly : [];

        if (points.length === 0) {
            return { cx: 0, cy: 0 };
        }

        for (const pt of points) {
            cx += pt.x;
            cy += pt.y;
        }

        return {
            cx: cx / points.length,
            cy: cy / points.length
        };
    }

    /**
     * Calculate the slab strip area tributary to a custom beam crossing a slab.
     * The beam receives load from both sides up to the 45-degree limit or slab edge.
     * @param {object} crossingBeam - Custom beam crossing descriptor
     * @param {object} slab - Slab geometry
     * @returns {number}
     */
    function calculateCustomBeamTributaryArea(crossingBeam, slab) {
        if (!crossingBeam || !slab) return 0;

        if (crossingBeam.splitDir === 'Y') {
            const tributaryWidthTop = Math.min(
                Math.max(0, crossingBeam.splitPos - slab.y1),
                slab.lx / 2
            );
            const tributaryWidthBottom = Math.min(
                Math.max(0, slab.y2 - crossingBeam.splitPos),
                slab.lx / 2
            );
            const beamLengthInSlab = getOverlapLength(crossingBeam.start, crossingBeam.end, slab.x1, slab.x2);
            return beamLengthInSlab * (tributaryWidthTop + tributaryWidthBottom);
        }

        const tributaryWidthLeft = Math.min(
            Math.max(0, crossingBeam.splitPos - slab.x1),
            slab.ly / 2
        );
        const tributaryWidthRight = Math.min(
            Math.max(0, slab.x2 - crossingBeam.splitPos),
            slab.ly / 2
        );
        const beamLengthInSlab = getOverlapLength(crossingBeam.start, crossingBeam.end, slab.y1, slab.y2);
        return beamLengthInSlab * (tributaryWidthLeft + tributaryWidthRight);
    }

    /**
     * Resolve the supporting grid beam and adjacent cantilever beams for a cantilever slab.
     * Prefers the slab's stored supportingBeamId and falls back to canonical ID construction.
     * @param {object} slab
     * @param {object} counts
     * @param {number} counts.xSpanCount
     * @param {number} counts.ySpanCount
     * @returns {object} { mainBeamId, cantileverBeamIds }
     */
    function getCantileverSupportBeamIds(slab, counts) {
        const edge = slab?.cantileverEdge;
        const spanIndex = Number(slab?.spanIndex) || 0;
        const grid = counts || {};
        let mainBeamId = slab?.supportingBeamId || null;

        if (!mainBeamId) {
            if (edge === 'top') {
                mainBeamId = `BX-1-${spanIndex + 1}`;
            } else if (edge === 'bottom') {
                mainBeamId = `BX-${(grid.ySpanCount || 0) + 1}-${spanIndex + 1}`;
            } else if (edge === 'left') {
                mainBeamId = `BY-1-${spanIndex + 1}`;
            } else if (edge === 'right') {
                mainBeamId = `BY-${(grid.xSpanCount || 0) + 1}-${spanIndex + 1}`;
            }
        }

        let cantileverBeamIds = [];
        if (edge === 'top' || edge === 'bottom') {
            const prefix = edge === 'top' ? 'BCY-T' : 'BCY-B';
            cantileverBeamIds = [`${prefix}-${spanIndex + 1}`, `${prefix}-${spanIndex + 2}`];
        } else if (edge === 'left' || edge === 'right') {
            const prefix = edge === 'left' ? 'BCX-L' : 'BCX-R';
            cantileverBeamIds = [`${prefix}-${spanIndex + 1}`, `${prefix}-${spanIndex + 2}`];
        }

        return { mainBeamId, cantileverBeamIds };
    }

    /**
     * Build a beam slice record with computed load-per-meter and polygon centroid.
     * @param {object} options
     * @param {string} options.slabId
     * @param {string} options.side
     * @param {number} options.area
     * @param {number} options.pu
     * @param {number} options.span
     * @param {Array} options.poly
     * @param {number} [options.wOverride]
     * @param {object} [options.extra]
     * @returns {object}
     */
    function createBeamSlice(options) {
        const opts = options || {};
        const area = opts.area || 0;
        const span = opts.span || 0;
        const poly = Array.isArray(opts.poly) ? opts.poly : [];
        const centroid = getPolygonCentroid(poly);
        const tributaryWidth = span > 0 ? area / span : 0;
        const w = opts.wOverride !== undefined ? opts.wOverride : (opts.pu || 0) * tributaryWidth;

        const slice = {
            slabId: opts.slabId,
            side: opts.side,
            area: area,
            w: w
        };

        if (opts.extra) {
            Object.assign(slice, opts.extra);
        }

        slice.poly = poly;
        slice.cx = centroid.cx;
        slice.cy = centroid.cy;

        return slice;
    }

    /**
     * Resolve final tributary width and factored line load for a beam.
     * @param {object} beam
     * @param {number} pu - Factored slab load per square meter
     * @param {number} wallLoad - Unfactored wall line load (kN/m)
     * @returns {object} { tributaryArea, tributaryWidth, wallLoad, w }
     */
    function calculateBeamLineLoad(beam, pu, wallLoad) {
        const tributaryArea = Math.max(0, beam?.tributaryArea || 0);
        const span = beam?.span || 0;
        const tributaryWidth = span > 0 ? tributaryArea / span : 0;
        const slabLoad = (pu || 0) * tributaryWidth;
        const factoredWallLoad = beam?.isCantilever || beam?.isEdgeBeam ? 0 : 1.2 * (wallLoad || 0);

        return {
            tributaryArea: tributaryArea,
            tributaryWidth: tributaryWidth,
            wallLoad: factoredWallLoad,
            w: slabLoad + factoredWallLoad
        };
    }

    return {
        calculateCustomBeamTributaryArea: calculateCustomBeamTributaryArea,
        getCantileverSupportBeamIds: getCantileverSupportBeamIds,
        createBeamSlice: createBeamSlice,
        calculateBeamLineLoad: calculateBeamLineLoad
    };

})();
