(function () {
    'use strict';

    const DXF_PACKAGE_BUILD = 'FS-117';
    const DXF_TEXT_LAYER = 'S-TEXT';
    const GRID_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

    function finite(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function fixed(value) {
        return finite(value).toFixed(4);
    }

    function cleanText(value) {
        return String(value == null ? '' : value)
            .replace(/[\r\n\t]+/g, ' ')
            .replace(/[\u00d7\u2715]/g, 'x')
            .replace(/[\u00b2]/g, '2')
            .replace(/[\u00b3]/g, '3')
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 240);
    }

    function escapeFilename(value) {
        return cleanText(value)
            .replace(/[^A-Za-z0-9_.-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '') || 'Model';
    }

    function localDateStamp(date = new Date()) {
        const pad = value => String(value).padStart(2, '0');
        return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
    }

    class DxfWriter {
        constructor() {
            this.entities = [];
            this.entityCounts = { LINE: 0, TEXT: 0, CIRCLE: 0 };
            this.layerUsage = {};
            this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        }

        record(layer, type, points) {
            this.entityCounts[type] = (this.entityCounts[type] || 0) + 1;
            this.layerUsage[layer] = (this.layerUsage[layer] || 0) + 1;
            points.forEach(point => {
                if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
                this.bounds.minX = Math.min(this.bounds.minX, point.x);
                this.bounds.minY = Math.min(this.bounds.minY, point.y);
                this.bounds.maxX = Math.max(this.bounds.maxX, point.x);
                this.bounds.maxY = Math.max(this.bounds.maxY, point.y);
            });
        }

        line(x1, y1, x2, y2, layer, options = {}) {
            const values = [x1, y1, x2, y2].map(Number);
            if (!values.every(Number.isFinite)) return;
            const [sx, sy, ex, ey] = values;
            const linetype = options.linetype ? `6\n${cleanText(options.linetype)}\n` : '';
            this.entities.push(
                `0\nLINE\n8\n${layer}\n${linetype}10\n${fixed(sx)}\n20\n${fixed(sy)}\n30\n0\n` +
                `11\n${fixed(ex)}\n21\n${fixed(ey)}\n31\n0\n`
            );
            this.record(layer, 'LINE', [{ x: sx, y: sy }, { x: ex, y: ey }]);
        }

        rectangle(x1, y1, x2, y2, layer, options = {}) {
            const left = Math.min(finite(x1), finite(x2));
            const right = Math.max(finite(x1), finite(x2));
            const bottom = Math.min(finite(y1), finite(y2));
            const top = Math.max(finite(y1), finite(y2));
            this.line(left, bottom, right, bottom, layer, options);
            this.line(right, bottom, right, top, layer, options);
            this.line(right, top, left, top, layer, options);
            this.line(left, top, left, bottom, layer, options);
        }

        polyline(points, layer, options = {}) {
            const valid = (points || []).filter(point => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)));
            if (valid.length < 2) return;
            for (let index = 0; index < valid.length - 1; index += 1) {
                this.line(valid[index].x, valid[index].y, valid[index + 1].x, valid[index + 1].y, layer, options);
            }
            if (options.closed) {
                this.line(valid[valid.length - 1].x, valid[valid.length - 1].y, valid[0].x, valid[0].y, layer, options);
            }
        }

        circle(x, y, radius, layer) {
            const cx = Number(x);
            const cy = Number(y);
            const r = Number(radius);
            if (![cx, cy, r].every(Number.isFinite) || r <= 0) return;
            this.entities.push(`0\nCIRCLE\n8\n${layer}\n10\n${fixed(cx)}\n20\n${fixed(cy)}\n30\n0\n40\n${fixed(r)}\n`);
            this.record(layer, 'CIRCLE', [{ x: cx - r, y: cy - r }, { x: cx + r, y: cy + r }]);
        }

        text(x, y, value, layer = DXF_TEXT_LAYER, height = 0.2, rotation = 0) {
            const px = Number(x);
            const py = Number(y);
            const text = cleanText(value);
            if (!Number.isFinite(px) || !Number.isFinite(py) || !text) return;
            const size = Math.max(0.05, finite(height, 0.2));
            const angle = finite(rotation, 0);
            this.entities.push(
                `0\nTEXT\n8\n${layer}\n10\n${fixed(px)}\n20\n${fixed(py)}\n30\n0\n40\n${fixed(size)}\n` +
                `1\n${text}\n50\n${fixed(angle)}\n7\nSTANDARD\n`
            );
            this.record(layer, 'TEXT', [{ x: px, y: py }, { x: px + text.length * size * 0.65, y: py + size }]);
        }

        content() {
            return this.entities.join('');
        }
    }

    function generatePackageLinetypeTable() {
        return generateDXFLinetypeTable();
    }

    function generatePackageTextStyleTable() {
        return generateDXFTextStyleTable();
    }

    function getGridCoordinates() {
        if (typeof getGridCoordinatesForLabels === 'function') return getGridCoordinatesForLabels();
        const xCoords = [0];
        const yCoords = [0];
        (state.xSpans || []).forEach(span => xCoords.push(xCoords[xCoords.length - 1] + finite(span)));
        (state.ySpans || []).forEach(span => yCoords.push(yCoords[yCoords.length - 1] + finite(span)));
        return { xCoords, yCoords };
    }

    function isStructuralFloor(floor) {
        return floor?.id !== 'GF' || !!state.gfSuspended;
    }

    function withFloorGeometry(floor, geometry, callback) {
        const previous = {
            beams: state.beams,
            slabs: state.slabs,
            floorIndex: state.currentFloorIndex
        };
        try {
            state.beams = geometry?.beams || [];
            state.slabs = geometry?.slabs || [];
            const index = (state.floors || []).findIndex(item => item.id === floor?.id);
            if (index >= 0) state.currentFloorIndex = index;
            return callback();
        } finally {
            state.beams = previous.beams;
            state.slabs = previous.slabs;
            state.currentFloorIndex = previous.floorIndex;
        }
    }

    function getFloorColumns(floor) {
        const deleted = new Set(floor?.deletedColumns || []);
        return (state.columns || []).filter(col =>
            col && !deleted.has(col.id) &&
            (typeof isColumnActiveOnFloor !== 'function' || isColumnActiveOnFloor(col, floor?.id))
        );
    }

    function getSlabMarks(slabs) {
        const ordered = (slabs || []).filter(slab => slab && !slab.isVoid).slice().sort((a, b) => {
            const ay = Math.min(finite(a.y1), finite(a.y2));
            const by = Math.min(finite(b.y1), finite(b.y2));
            if (Math.abs(ay - by) > 0.001) return ay - by;
            const ax = Math.min(finite(a.x1), finite(a.x2));
            const bx = Math.min(finite(b.x1), finite(b.x2));
            if (Math.abs(ax - bx) > 0.001) return ax - bx;
            return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
        });
        let regular = 0;
        let cantilever = 0;
        const marks = new Map();
        ordered.forEach(slab => {
            const mark = slab.isCantilever ? `CS-${++cantilever}` : `S${++regular}`;
            marks.set(slab, mark);
        });
        return marks;
    }

    function calculatePlanBounds(floorGeometryById) {
        const { xCoords, yCoords } = getGridCoordinates();
        const bounds = {
            minX: Math.min(0, ...xCoords),
            maxX: Math.max(0, ...xCoords),
            minY: Math.min(0, ...yCoords),
            maxY: Math.max(0, ...yCoords)
        };
        const include = (x, y) => {
            if (Number.isFinite(Number(x))) {
                bounds.minX = Math.min(bounds.minX, Number(x));
                bounds.maxX = Math.max(bounds.maxX, Number(x));
            }
            if (Number.isFinite(Number(y))) {
                bounds.minY = Math.min(bounds.minY, Number(y));
                bounds.maxY = Math.max(bounds.maxY, Number(y));
            }
        };
        (state.floors || []).forEach(floor => {
            const geometry = floorGeometryById.get(floor.id) || { beams: [], slabs: [] };
            (geometry.slabs || []).forEach(slab => {
                include(slab.x1, slab.y1);
                include(slab.x2, slab.y2);
            });
            (geometry.beams || []).forEach(beam => {
                include(beam.x1, beam.y1);
                include(beam.x2, beam.y2);
            });
        });
        (state.columns || []).forEach(col => {
            const position = typeof getColumnPlanPosition === 'function'
                ? getColumnPlanPosition(col)
                : { x: finite(col.x), y: finite(col.y) };
            const size = typeof getColumnSizeMm === 'function' ? getColumnSizeMm(col) : { b: 300, h: 300 };
            include(position.x - size.b / 2000, position.y - size.h / 2000);
            include(position.x + size.b / 2000, position.y + size.h / 2000);
            if (isFoundationPlanEnabled()) {
                const half = Math.max(0.5, finite(col.footingSize, 1) / 2);
                include(position.x - half, position.y - half);
                include(position.x + half, position.y + half);
            }
        });
        normalizeStairList(state.stairs).forEach(stair => {
            include(stair.bounds.x1, stair.bounds.y1);
            include(stair.bounds.x2, stair.bounds.y2);
        });
        bounds.minX -= 0.35;
        bounds.maxX += 0.35;
        bounds.minY -= 0.35;
        bounds.maxY += 0.35;
        bounds.width = Math.max(1, bounds.maxX - bounds.minX);
        bounds.height = Math.max(1, bounds.maxY - bounds.minY);
        return bounds;
    }

    function makePlanTransform(originX, originY, bounds) {
        return {
            point(x, y) {
                return {
                    x: originX + finite(x) - bounds.minX,
                    y: originY - (finite(y) - bounds.minY)
                };
            },
            rect(x1, y1, x2, y2) {
                const first = this.point(x1, y1);
                const second = this.point(x2, y2);
                return {
                    x1: Math.min(first.x, second.x),
                    y1: Math.min(first.y, second.y),
                    x2: Math.max(first.x, second.x),
                    y2: Math.max(first.y, second.y)
                };
            }
        };
    }

    function drawPlanHeading(writer, transform, bounds, title, subtitle) {
        const start = transform.point(bounds.minX, bounds.minY);
        const end = transform.point(bounds.maxX, bounds.minY);
        writer.text(start.x, start.y + 2.25, title, DXF_LAYER.TEXT, 0.36);
        if (subtitle) writer.text(start.x, start.y + 1.78, subtitle, DXF_LAYER.TEXT, 0.18);
        writer.line(start.x, start.y + 1.55, end.x, end.y + 1.55, DXF_LAYER.TEXT);
    }

    function drawGridAndDimensions(writer, transform, bounds) {
        const { xCoords, yCoords } = getGridCoordinates();
        const gridTop = bounds.minY - 0.2;
        const gridBottom = bounds.maxY + 0.2;
        const gridLeft = bounds.minX - 0.2;
        const gridRight = bounds.maxX + 0.2;

        xCoords.forEach((x, index) => {
            const start = transform.point(x, gridTop);
            const end = transform.point(x, gridBottom);
            writer.line(start.x, start.y, end.x, end.y, DXF_LAYER.GRID);
            const bubble = transform.point(x, bounds.minY - 0.82);
            writer.circle(bubble.x, bubble.y, 0.25, DXF_LAYER.TEXT);
            writer.text(bubble.x - 0.07, bubble.y - 0.08, GRID_LETTERS[index] || `X${index + 1}`, DXF_LAYER.TEXT, 0.2);
        });
        yCoords.forEach((y, index) => {
            const start = transform.point(gridLeft, y);
            const end = transform.point(gridRight, y);
            writer.line(start.x, start.y, end.x, end.y, DXF_LAYER.GRID);
            const bubble = transform.point(bounds.minX - 0.82, y);
            writer.circle(bubble.x, bubble.y, 0.25, DXF_LAYER.TEXT);
            writer.text(bubble.x - 0.07, bubble.y - 0.08, String(index + 1), DXF_LAYER.TEXT, 0.2);
        });

        const horizontalY = bounds.minY - 1.38;
        if (xCoords.length > 1) {
            const start = transform.point(xCoords[0], horizontalY);
            const end = transform.point(xCoords[xCoords.length - 1], horizontalY);
            writer.line(start.x, start.y, end.x, end.y, DXF_LAYER.TEXT);
            for (let index = 0; index < xCoords.length; index += 1) {
                const tick = transform.point(xCoords[index], horizontalY);
                writer.line(tick.x, tick.y - 0.12, tick.x, tick.y + 0.12, DXF_LAYER.TEXT);
                if (index < xCoords.length - 1) {
                    const mid = transform.point((xCoords[index] + xCoords[index + 1]) / 2, horizontalY);
                    writer.text(mid.x - 0.18, mid.y + 0.12, Math.round((xCoords[index + 1] - xCoords[index]) * 1000), DXF_LAYER.TEXT, 0.18);
                }
            }
        }

        const verticalX = bounds.minX - 1.38;
        if (yCoords.length > 1) {
            const start = transform.point(verticalX, yCoords[0]);
            const end = transform.point(verticalX, yCoords[yCoords.length - 1]);
            writer.line(start.x, start.y, end.x, end.y, DXF_LAYER.TEXT);
            for (let index = 0; index < yCoords.length; index += 1) {
                const tick = transform.point(verticalX, yCoords[index]);
                writer.line(tick.x - 0.12, tick.y, tick.x + 0.12, tick.y, DXF_LAYER.TEXT);
                if (index < yCoords.length - 1) {
                    const mid = transform.point(verticalX, (yCoords[index] + yCoords[index + 1]) / 2);
                    writer.text(mid.x - 0.12, mid.y - 0.25, Math.round((yCoords[index + 1] - yCoords[index]) * 1000), DXF_LAYER.TEXT, 0.18, 90);
                }
            }
        }
    }

    function drawSlabs(writer, transform, slabs, floor, options = {}) {
        const marks = getSlabMarks(slabs);
        (slabs || []).filter(slab => slab && !slab.isVoid).forEach(slab => {
            const rect = transform.rect(slab.x1, slab.y1, slab.x2, slab.y2);
            writer.rectangle(rect.x1, rect.y1, rect.x2, rect.y2, DXF_LAYER.SLAB);
            const center = transform.point((finite(slab.x1) + finite(slab.x2)) / 2, (finite(slab.y1) + finite(slab.y2)) / 2);
            if (!options.tributary) {
                writer.text(center.x - 0.28, center.y + 0.05, `${marks.get(slab) || slab.id} (${Math.round(finite(floor?.slabThickness, 150))})`, DXF_LAYER.TEXT, 0.17);
            } else {
                writer.text(center.x - 0.18, center.y, marks.get(slab) || slab.id, DXF_LAYER.TEXT, 0.15);
            }
        });
        return marks;
    }

    function drawBeam(writer, transform, beam, floor, rowNumber, hiddenBeamIds, tributary = false) {
        if (!beam || beam.deleted) return null;
        const geometry = getBeamPlanDrawGeometry(beam, floor.id, { trimToJunction: true });
        const rect = transform.rect(geometry.rect.left, geometry.rect.top, geometry.rect.right, geometry.rect.bottom);
        const hidden = hiddenBeamIds?.has(beam.id);
        const lineOptions = hidden ? { linetype: 'HIDDEN2' } : {};
        const beamLayer = getBeamGovernanceType(beam) === 'stair' ? DXF_LAYER.STAIR : DXF_LAYER.BEAM;
        writer.rectangle(rect.x1, rect.y1, rect.x2, rect.y2, beamLayer, lineOptions);

        const center = transform.point(geometry.cx, geometry.cy);
        if (tributary) {
            writer.text(center.x + 0.08, center.y + 0.08,
                `A=${finite(beam.tributaryArea).toFixed(2)} m2 W=${finite(beam.w).toFixed(2)} kN/m`,
                DXF_LAYER.TEXT, 0.13, beam.direction === 'Y' ? 90 : 0);
        } else {
            const size = geometry.beamSize;
            const tag = getBeamPlanTableTag(beam, floor.id, rowNumber);
            const label = `${tag} (${Math.round(size.b)}x${Math.round(size.h)})`;
            if (beam.direction === 'Y') {
                writer.text(center.x + geometry.beamWidthM * 0.5 + 0.16, center.y - 0.25, label, DXF_LAYER.TEXT, 0.16, 90);
            } else {
                writer.text(center.x - Math.min(0.7, label.length * 0.035), center.y + geometry.beamWidthM * 0.5 + 0.16, label, DXF_LAYER.TEXT, 0.16);
            }
        }
        return geometry;
    }

    function drawColumns(writer, transform, floor) {
        getFloorColumns(floor).forEach(col => {
            const position = getColumnPlanPosition(col);
            const size = getColumnSizeMm(col);
            const rect = transform.rect(
                position.x - size.b / 2000,
                position.y - size.h / 2000,
                position.x + size.b / 2000,
                position.y + size.h / 2000
            );
            writer.rectangle(rect.x1, rect.y1, rect.x2, rect.y2, DXF_LAYER.COLUMN);
            const center = transform.point(position.x, position.y);
            writer.text(center.x + size.b / 2000 + 0.05, center.y - 0.08, col.id, DXF_LAYER.TEXT, 0.15);
        });
    }

    function drawStairs(writer, transform, floor) {
        normalizeStairList(state.stairs).forEach(stair => {
            if (stair.fromFloorId !== floor.id && stair.toFloorId !== floor.id) return;
            const bounds = stair.bounds;
            const rect = transform.rect(bounds.x1, bounds.y1, bounds.x2, bounds.y2);
            writer.rectangle(rect.x1, rect.y1, rect.x2, rect.y2, DXF_LAYER.STAIR);
            const center = transform.point((bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2);
            const label = stair.fromFloorId === floor.id ? stair.id : `${stair.id}-OPENING`;
            writer.text(center.x - 0.3, center.y, label, DXF_LAYER.TEXT, 0.16);
            if (stair.fromFloorId !== floor.id) return;
            const isX = stair.axis === 'X';
            const runStart = isX ? bounds.x1 : bounds.y1;
            const runEnd = (isX ? bounds.x2 : bounds.y2) - finite(stair.landingM, 1.1);
            const spacing = Math.max(0.23, finite(stair.treadMm, 275) / 1000);
            for (let value = runStart + spacing; value < runEnd - 0.01; value += spacing) {
                const first = isX ? transform.point(value, bounds.y1) : transform.point(bounds.x1, value);
                const second = isX ? transform.point(value, bounds.y2) : transform.point(bounds.x2, value);
                writer.line(first.x, first.y, second.x, second.y, DXF_LAYER.STAIR);
            }
        });
    }

    function drawTributarySlices(writer, transform, beams) {
        const seen = new Set();
        (beams || []).forEach(beam => {
            (beam.slices || []).forEach(slice => {
                const points = (slice.poly || []).map(point => transform.point(point.x, point.y));
                if (points.length < 3) return;
                const key = points.map(point => `${fixed(point.x)},${fixed(point.y)}`).join('|');
                if (seen.has(key)) return;
                seen.add(key);
                writer.polyline(points, DXF_LAYER.TEXT, { closed: true });
            });
        });
    }

    function drawFloorPlan(writer, floor, geometry, origin, bounds, tributary) {
        return withFloorGeometry(floor, geometry, () => {
            const transform = makePlanTransform(origin.x, origin.y, bounds);
            const planName = tributary ? 'TRIBUTARY PLAN' : 'STRUCTURAL LAYOUT PLAN';
            drawPlanHeading(writer, transform, bounds, `${floor.id} - ${planName}`,
                tributary ? 'Factored tributary areas and beam line loads' : `Slab thickness ${Math.round(finite(floor.slabThickness, 150))} mm`);
            drawGridAndDimensions(writer, transform, bounds);
            drawSlabs(writer, transform, geometry.slabs, floor, { tributary });
            if (tributary) drawTributarySlices(writer, transform, geometry.beams);
            const hiddenBeamIds = typeof getCornerSlabHiddenBeamIds === 'function'
                ? getCornerSlabHiddenBeamIds(floor.id)
                : new Set();
            (geometry.beams || []).forEach((beam, index) => drawBeam(writer, transform, beam, floor, index + 1, hiddenBeamIds, tributary));
            drawColumns(writer, transform, floor);
            drawStairs(writer, transform, floor);
            return { beamCount: geometry.beams?.length || 0, slabCount: geometry.slabs?.length || 0 };
        });
    }

    function getFootingTypeMap(columns) {
        const sizes = [...new Set((columns || []).map(col => finite(col.footingSize, 1).toFixed(3)))].sort((a, b) => Number(a) - Number(b));
        return new Map(sizes.map((size, index) => [size, `F${index + 1}`]));
    }

    function drawReactionArrow(writer, transform, x, y) {
        const top = transform.point(x, y - 0.8);
        const tip = transform.point(x, y - 0.22);
        writer.line(top.x, top.y, tip.x, tip.y, DXF_LAYER.TEXT);
        writer.line(tip.x, tip.y, tip.x - 0.12, tip.y + 0.16, DXF_LAYER.TEXT);
        writer.line(tip.x, tip.y, tip.x + 0.12, tip.y + 0.16, DXF_LAYER.TEXT);
    }

    function drawFoundationPlanPackage(writer, floor, geometry, origin, bounds) {
        return withFloorGeometry(floor, geometry, () => {
            const transform = makePlanTransform(origin.x, origin.y, bounds);
            const planEnabled = isFoundationPlanEnabled();
            drawPlanHeading(writer, transform, bounds, planEnabled ? 'FOUNDATION PLAN' : 'BASE REACTION PLAN',
                planEnabled ? 'Isolated footings, tie beams, and column stubs' : 'Footings disabled; reactions retained for external foundation design');
            drawGridAndDimensions(writer, transform, bounds);
            const columns = (state.columns || []).filter(col => isFoundationColumnForPlan(col, floor.id));

            if (planEnabled) {
                const typeMap = getFootingTypeMap(columns);
                getFoundationTieBeamSegmentsForPlan().forEach(segment => {
                    const rect = transform.rect(segment.x1, segment.y1, segment.x2, segment.y2);
                    writer.rectangle(rect.x1, rect.y1, rect.x2, rect.y2, DXF_LAYER.BEAM);
                });
                columns.forEach(col => {
                    const position = getColumnPlanPosition(col);
                    const footingSize = Math.max(0.5, finite(col.footingSize, 1));
                    const footingRect = transform.rect(
                        position.x - footingSize / 2,
                        position.y - footingSize / 2,
                        position.x + footingSize / 2,
                        position.y + footingSize / 2
                    );
                    writer.rectangle(footingRect.x1, footingRect.y1, footingRect.x2, footingRect.y2, DXF_LAYER.FOUNDATION, { linetype: 'HIDDEN2' });
                    const mark = typeMap.get(footingSize.toFixed(3)) || 'F1';
                    const label = transform.point(position.x - footingSize / 2, position.y - footingSize / 2 - 0.18);
                    writer.text(label.x, label.y, `${mark}-${getColumnGridLabel(col)} ${Math.round(footingSize * 1000)}x${Math.round(footingSize * 1000)}`, DXF_LAYER.TEXT, 0.16);
                });
            } else {
                getBaseReactionRows().forEach(row => {
                    drawReactionArrow(writer, transform, row.xPlanM, row.yPlanM);
                    const label = transform.point(row.xPlanM + 0.22, row.yPlanM - 0.05);
                    writer.text(label.x, label.y, `${row.grid} Pu=${row.factoredReactionKn.toFixed(1)} kN`, DXF_LAYER.TEXT, 0.15);
                });
            }
            drawColumns(writer, transform, floor);
            return { foundationMode: planEnabled ? 'plan' : 'baseReactionsOnly', columnCount: columns.length };
        });
    }

    function truncateCell(value, width, textHeight) {
        const text = cleanText(value);
        const limit = Math.max(4, Math.floor(width / Math.max(0.05, textHeight * 0.62)));
        return text.length > limit ? `${text.slice(0, Math.max(1, limit - 3))}...` : text;
    }

    function drawTable(writer, x, topY, title, columns, rows, options = {}) {
        const rowHeight = finite(options.rowHeight, 0.48);
        const textHeight = finite(options.textHeight, 0.16);
        const widths = columns.map(column => finite(column.width, 2));
        const totalWidth = widths.reduce((sum, width) => sum + width, 0);
        const titleHeight = 0.64;
        const headerHeight = 0.54;
        const totalHeight = titleHeight + headerHeight + rows.length * rowHeight;
        writer.rectangle(x, topY - totalHeight, x + totalWidth, topY, DXF_LAYER.TEXT);
        writer.line(x, topY - titleHeight, x + totalWidth, topY - titleHeight, DXF_LAYER.TEXT);
        writer.line(x, topY - titleHeight - headerHeight, x + totalWidth, topY - titleHeight - headerHeight, DXF_LAYER.TEXT);
        writer.text(x + 0.12, topY - 0.42, title, DXF_LAYER.TEXT, 0.24);

        let cursorX = x;
        columns.forEach((column, index) => {
            if (index > 0) writer.line(cursorX, topY - titleHeight, cursorX, topY - totalHeight, DXF_LAYER.TEXT);
            writer.text(cursorX + 0.08, topY - titleHeight - 0.36, truncateCell(column.label, widths[index], textHeight), DXF_LAYER.TEXT, textHeight);
            cursorX += widths[index];
        });

        rows.forEach((row, rowIndex) => {
            const rowTop = topY - titleHeight - headerHeight - rowIndex * rowHeight;
            const rowBottom = rowTop - rowHeight;
            writer.line(x, rowBottom, x + totalWidth, rowBottom, DXF_LAYER.TEXT);
            let cellX = x;
            columns.forEach((column, columnIndex) => {
                const rawValue = typeof column.value === 'function' ? column.value(row, rowIndex) : row[column.key];
                writer.text(cellX + 0.08, rowBottom + 0.15, truncateCell(rawValue, widths[columnIndex], textHeight), DXF_LAYER.TEXT, textHeight);
                cellX += widths[columnIndex];
            });
        });

        return { width: totalWidth, height: totalHeight, bottomY: topY - totalHeight };
    }

    function buildScheduleData(floorGeometryById) {
        const columnRows = (state.columns || []).filter(col => (state.floors || []).some(floor =>
            isColumnActiveOnFloor(col, floor.id) && !(floor.deletedColumns || []).includes(col.id)
        )).map(col => {
            const size = getColumnSizeMm(col);
            const floors = (state.floors || []).filter(floor => isColumnActiveOnFloor(col, floor.id) && !(floor.deletedColumns || []).includes(col.id));
            return {
                mark: `C-${col.id}`,
                grid: getColumnGridLabel(col),
                floors: floors.map(floor => floor.id).join(','),
                size: `${size.b}x${size.h}`,
                load: finite(col.totalLoadWithDL || col.totalLoad).toFixed(1),
                footing: col.startFloor ? 'PLANTED' : `F-${col.id}`
            };
        });

        const beamRows = [];
        const slabRows = [];
        (state.floors || []).forEach(floor => {
            const geometry = floorGeometryById.get(floor.id) || { beams: [], slabs: [] };
            withFloorGeometry(floor, geometry, () => {
                (geometry.beams || []).forEach((beam, index) => {
                    const size = getBeamSizeMm(beam, floor.id);
                    beamRows.push({
                        mark: getBeamPlanTableTag(beam, floor.id, index + 1),
                        type: getBeamGovernanceLabel(beam),
                        dir: getBeamDirectionLabel(beam),
                        span: finite(beam.span || Math.hypot(finite(beam.x2) - finite(beam.x1), finite(beam.y2) - finite(beam.y1))).toFixed(2),
                        size: `${size.b}x${size.h}`,
                        area: finite(beam.tributaryArea).toFixed(2),
                        load: finite(beam.w).toFixed(2),
                        reaction: `${finite(beam.Rleft).toFixed(1)}/${finite(beam.Rright).toFixed(1)}`
                    });
                });
                const marks = getSlabMarks(geometry.slabs);
                (geometry.slabs || []).filter(slab => slab && !slab.isVoid).forEach(slab => {
                    slabRows.push({
                        mark: `${floor.id}-${marks.get(slab) || slab.id}`,
                        type: slab.isCornerSlab ? 'corner cant.' : (slab.isCantilever ? 'cantilever' : (slab.isTwoWay ? 'two-way' : 'one-way')),
                        size: `${finite(slab.lx || slab.width).toFixed(2)}x${finite(slab.ly || slab.height).toFixed(2)}`,
                        area: finite(slab.netArea || slab.area).toFixed(2),
                        thickness: Math.round(finite(floor.slabThickness, 150))
                    });
                });
            });
        });

        const foundationColumns = (state.columns || []).filter(col => isFoundationColumnForPlan(col, state.floors?.[0]?.id));
        const footingTypes = getFootingTypeMap(foundationColumns);
        const foundationRows = isFoundationPlanEnabled()
            ? foundationColumns.map(col => {
                const size = Math.max(0.5, finite(col.footingSize, 1));
                const thickness = finite(col.footingDesign?.h, finite(col.footingThick, 0.3) * 1000);
                return {
                    mark: `${footingTypes.get(size.toFixed(3)) || 'F1'}-${getColumnGridLabel(col)}`,
                    column: col.id,
                    size: `${Math.round(size * 1000)}x${Math.round(size * 1000)}`,
                    thickness: Math.round(thickness),
                    factored: finite(col.totalLoadWithDL || col.totalLoad).toFixed(1),
                    bearing: finite(state.soilBearing, 150).toFixed(0)
                };
            })
            : getBaseReactionRows().map(row => ({
                mark: `BR-${row.grid}`,
                column: row.columnId,
                size: '-',
                thickness: '-',
                factored: row.factoredReactionKn.toFixed(1),
                bearing: row.serviceReactionKn.toFixed(1)
            }));

        return { columnRows, beamRows, slabRows, foundationRows };
    }

    function buildQuantityData(floorGeometryById) {
        let columnCount = 0;
        let columnVolume = 0;
        (state.columns || []).forEach(col => {
            const size = getColumnSizeMm(col);
            (state.floors || []).forEach(floor => {
                if (!isColumnActiveOnFloor(col, floor.id) || (floor.deletedColumns || []).includes(col.id)) return;
                columnCount += 1;
                columnVolume += size.b / 1000 * (size.h / 1000) * finite(floor.height, 3);
            });
        });

        let beamCount = 0;
        let beamVolume = 0;
        let slabCount = 0;
        let slabVolume = 0;
        (state.floors || []).forEach(floor => {
            if (!isStructuralFloor(floor)) return;
            const geometry = floorGeometryById.get(floor.id) || { beams: [], slabs: [] };
            withFloorGeometry(floor, geometry, () => {
                (geometry.beams || []).forEach(beam => {
                    const size = getBeamSizeMm(beam, floor.id);
                    const length = finite(beam.span || Math.hypot(finite(beam.x2) - finite(beam.x1), finite(beam.y2) - finite(beam.y1)));
                    beamCount += 1;
                    beamVolume += size.b / 1000 * (size.h / 1000) * length;
                });
                (geometry.slabs || []).filter(slab => slab && !slab.isVoid).forEach(slab => {
                    slabCount += 1;
                    slabVolume += finite(slab.netArea || slab.area) * finite(floor.slabThickness, 150) / 1000;
                });
            });
        });

        const foundationFloor = state.floors?.[0];
        const foundationGeometry = floorGeometryById.get(foundationFloor?.id) || { beams: [], slabs: [] };
        let footingCount = 0;
        let footingVolume = 0;
        let tieBeamCount = 0;
        let tieBeamVolume = 0;
        if (foundationFloor && isFoundationPlanEnabled()) {
            withFloorGeometry(foundationFloor, foundationGeometry, () => {
                const baseColumns = (state.columns || []).filter(col => isFoundationColumnForPlan(col, foundationFloor.id));
                baseColumns.forEach(col => {
                    const size = Math.max(0.5, finite(col.footingSize, 1));
                    const thickness = finite(col.footingDesign?.h, finite(col.footingThick, 0.3) * 1000) / 1000;
                    footingCount += 1;
                    footingVolume += size * size * thickness;
                });
                const width = finite(state.tieBeamWidth, 200) / 1000;
                const depth = finite(state.tieBeamDepth, 350) / 1000;
                getFoundationTieBeamSegmentsForPlan().forEach(segment => {
                    tieBeamCount += 1;
                    tieBeamVolume += Math.max(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1)) * width * depth;
                });
            });
        }

        const concreteRows = [
            { item: 'Columns', count: columnCount, unit: 'segments', volume: columnVolume.toFixed(2) },
            { item: 'Beams', count: beamCount, unit: 'members', volume: beamVolume.toFixed(2) },
            { item: 'Slabs', count: slabCount, unit: 'panels', volume: slabVolume.toFixed(2) },
            { item: 'Footings', count: footingCount, unit: 'pcs', volume: footingVolume.toFixed(2) },
            { item: 'Tie beams', count: tieBeamCount, unit: 'members', volume: tieBeamVolume.toFixed(2) }
        ];
        const totalConcrete = columnVolume + beamVolume + slabVolume + footingVolume + tieBeamVolume;
        return {
            concreteRows,
            totalConcrete,
            rebarEstimateKg: totalConcrete * 80
        };
    }

    function buildLoadSummaryRows(floorGeometryById) {
        return (state.floors || []).map(floor => {
            const geometry = floorGeometryById.get(floor.id) || { beams: [], slabs: [] };
            const area = (geometry.slabs || []).filter(slab => slab && !slab.isVoid)
                .reduce((sum, slab) => sum + finite(slab.netArea || slab.area), 0);
            const slabWeight = finite(state.concreteDensity, 24) * finite(floor.slabThickness, 150) / 1000;
            const pu = 1.2 * (finite(floor.dlSuper) + slabWeight) + 1.6 * finite(floor.liveLoad);
            const beamDead = (geometry.beams || []).reduce((sum, beam) => sum + finite(beam.selfWeight), 0);
            return {
                floor: floor.id,
                area: area.toFixed(2),
                thickness: Math.round(finite(floor.slabThickness, 150)),
                dead: finite(floor.dlSuper).toFixed(2),
                live: finite(floor.liveLoad).toFixed(2),
                pu: pu.toFixed(2),
                beamDead: beamDead.toFixed(1)
            };
        });
    }

    function drawPackageTables(writer, topY, floorGeometryById, audit) {
        const schedules = buildScheduleData(floorGeometryById);
        const quantities = buildQuantityData(floorGeometryById);
        const loadRows = buildLoadSummaryRows(floorGeometryById);
        const drawingRows = [];
        (state.floors || []).forEach(floor => {
            drawingRows.push({ id: `L-${floor.id}`, title: `${floor.id} Structural Layout Plan` });
            drawingRows.push({ id: `T-${floor.id}`, title: `${floor.id} Tributary Plan` });
        });
        drawingRows.push({ id: 'F-01', title: isFoundationPlanEnabled() ? 'Foundation Plan' : 'Base Reaction Plan' });
        drawingRows.push({ id: 'S-01', title: 'Member Schedules' });
        drawingRows.push({ id: 'Q-01', title: 'Preliminary Bill of Quantities' });

        let groupX = 0;
        let stackY = topY;
        const indexTable = drawTable(writer, groupX, stackY, 'DRAWING PACKAGE INDEX', [
            { key: 'id', label: 'ID', width: 2.2 },
            { key: 'title', label: 'DRAWING / TABLE', width: 8.8 }
        ], drawingRows);
        stackY = indexTable.bottomY - 1;

        const modelRows = [
            { item: 'Build', value: DXF_PACKAGE_BUILD },
            { item: 'FSTR schema', value: window.getProjectProvenance?.().fstrSchemaVersion || 'unknown' },
            { item: 'Source revision', value: window.getProjectProvenance?.().sourceRevisionId || 'unsaved working state' },
            { item: 'Floors', value: state.floors?.length || 0 },
            { item: 'Grid', value: `${state.xSpans?.length || 0}x${state.ySpans?.length || 0}` },
            { item: 'Concrete', value: `fc'=${finite(state.fc, 21)} MPa` },
            { item: 'Rebar', value: `fy=${finite(state.fy, 415)} MPa` },
            { item: 'Foundation mode', value: isFoundationPlanEnabled() ? 'Footings' : 'Base reactions' },
            { item: 'Layer source', value: 'FT_LayerMap structural layers' }
        ];
        const modelTable = drawTable(writer, groupX, stackY, 'MODEL SUMMARY', [
            { key: 'item', label: 'PARAMETER', width: 4.2 },
            { key: 'value', label: 'VALUE', width: 6.8 }
        ], modelRows);
        stackY = modelTable.bottomY - 1;

        const loadTable = drawTable(writer, groupX, stackY, 'FLOOR LOAD SUMMARY', [
            { key: 'floor', label: 'FLOOR', width: 1.4 },
            { key: 'area', label: 'AREA m2', width: 1.8 },
            { key: 'thickness', label: 't mm', width: 1.3 },
            { key: 'dead', label: 'SDL kPa', width: 1.7 },
            { key: 'live', label: 'LL kPa', width: 1.7 },
            { key: 'pu', label: 'Pu kPa', width: 1.7 },
            { key: 'beamDead', label: 'BEAM DL kN', width: 2.1 }
        ], loadRows, { textHeight: 0.14 });
        stackY = loadTable.bottomY - 1;

        const concreteRows = quantities.concreteRows.concat([{ item: 'TOTAL CONCRETE', count: '', unit: 'm3', volume: quantities.totalConcrete.toFixed(2) }]);
        const boqTable = drawTable(writer, groupX, stackY, 'BILL OF QUANTITIES - CONCRETE (PRELIMINARY)', [
            { key: 'item', label: 'ITEM', width: 4.3 },
            { key: 'count', label: 'COUNT', width: 1.5 },
            { key: 'unit', label: 'UNIT', width: 1.7 },
            { key: 'volume', label: 'VOLUME m3', width: 2.3 }
        ], concreteRows);
        stackY = boqTable.bottomY - 1;
        drawTable(writer, groupX, stackY, 'BILL OF QUANTITIES - REBAR ALLOWANCE', [
            { key: 'basis', label: 'BASIS', width: 6.8 },
            { key: 'quantity', label: 'ESTIMATE kg', width: 3.0 }
        ], [{ basis: 'Preliminary allowance: 80 kg/m3 concrete', quantity: quantities.rebarEstimateKg.toFixed(0) }]);

        groupX += 13;
        const columnTable = drawTable(writer, groupX, topY, 'COLUMN SCHEDULE', [
            { key: 'mark', label: 'MARK', width: 2.4 },
            { key: 'grid', label: 'GRID', width: 1.4 },
            { key: 'floors', label: 'FLOORS', width: 3.1 },
            { key: 'size', label: 'B x H mm', width: 2.1 },
            { key: 'load', label: 'Pu kN', width: 1.7 },
            { key: 'footing', label: 'SUPPORT', width: 2.4 }
        ], schedules.columnRows, { textHeight: 0.14 });

        groupX += columnTable.width + 2;
        const beamTable = drawTable(writer, groupX, topY, 'BEAM SCHEDULE - PLAN TAGS', [
            { key: 'mark', label: 'PLAN / TABLE MARK', width: 5.2 },
            { key: 'type', label: 'TYPE', width: 2.5 },
            { key: 'dir', label: 'DIR', width: 1.1 },
            { key: 'span', label: 'SPAN m', width: 1.6 },
            { key: 'size', label: 'B x H mm', width: 2.1 },
            { key: 'area', label: 'TRIB m2', width: 1.7 },
            { key: 'load', label: 'W kN/m', width: 1.8 },
            { key: 'reaction', label: 'R1/R2 kN', width: 2.3 }
        ], schedules.beamRows, { textHeight: 0.13, rowHeight: 0.44 });

        groupX += beamTable.width + 2;
        const slabTable = drawTable(writer, groupX, topY, 'SLAB SCHEDULE - PLAN TAGS', [
            { key: 'mark', label: 'MARK', width: 2.8 },
            { key: 'type', label: 'TYPE', width: 2.5 },
            { key: 'size', label: 'PANEL m', width: 2.4 },
            { key: 'area', label: 'AREA m2', width: 1.8 },
            { key: 'thickness', label: 't mm', width: 1.4 }
        ], schedules.slabRows, { textHeight: 0.14 });

        groupX += slabTable.width + 2;
        drawTable(writer, groupX, topY, isFoundationPlanEnabled() ? 'FOOTING SCHEDULE' : 'BASE REACTION SCHEDULE', [
            { key: 'mark', label: 'MARK', width: 2.4 },
            { key: 'column', label: 'COLUMN', width: 1.7 },
            { key: 'size', label: isFoundationPlanEnabled() ? 'B x L mm' : 'SIZE', width: 2.4 },
            { key: 'thickness', label: isFoundationPlanEnabled() ? 't mm' : 'SERVICE kN', width: 2.1 },
            { key: 'factored', label: 'Pu kN', width: 1.8 },
            { key: 'bearing', label: isFoundationPlanEnabled() ? 'q kPa' : 'Ps kN', width: 1.7 }
        ], schedules.foundationRows, { textHeight: 0.14 });

        audit.tables = {
            drawingIndex: drawingRows.length,
            modelSummary: modelRows.length,
            floorLoadSummary: loadRows.length,
            columnSchedule: schedules.columnRows.length,
            beamSchedule: schedules.beamRows.length,
            slabSchedule: schedules.slabRows.length,
            foundationSchedule: schedules.foundationRows.length,
            boqConcrete: concreteRows.length,
            boqRebar: 1
        };
        audit.quantities = {
            totalConcreteM3: Number(quantities.totalConcrete.toFixed(3)),
            preliminaryRebarKg: Number(quantities.rebarEstimateKg.toFixed(0))
        };
    }

    function buildDXFDocument(writer) {
        const bounds = Number.isFinite(writer.bounds.minX)
            ? writer.bounds
            : { minX: 0, minY: 0, maxX: 100, maxY: 100 };
        let dxf = '0\nSECTION\n2\nHEADER\n';
        dxf += '9\n$ACADVER\n1\nAC1009\n';
        dxf += `9\n$EXTMIN\n10\n${fixed(bounds.minX)}\n20\n${fixed(bounds.minY)}\n30\n0\n`;
        dxf += `9\n$EXTMAX\n10\n${fixed(bounds.maxX)}\n20\n${fixed(bounds.maxY)}\n30\n0\n`;
        dxf += '0\nENDSEC\n';
        dxf += '0\nSECTION\n2\nTABLES\n';
        dxf += generatePackageLinetypeTable();
        dxf += generateDXFLayerTable();
        dxf += generatePackageTextStyleTable();
        dxf += '0\nENDSEC\n';
        dxf += '0\nSECTION\n2\nENTITIES\n';
        dxf += writer.content();
        dxf += '0\nENDSEC\n0\nEOF\n';
        return dxf.replace(/\r?\n/g, '\r\n');
    }

    function generateCoordinatedDXFContent() {
        if (!state?.floors?.length) throw new Error('No floors are available to export.');
        if (!state?.columns?.length && typeof calculate === 'function') calculate();
        const floorGeometryById = collect3DFloorGeometry();
        const planBounds = calculatePlanBounds(floorGeometryById);
        const writer = new DxfWriter();
        const audit = {
            build: DXF_PACKAGE_BUILD,
            layerSource: 'FT_LayerMap.xlsx structural mapping embedded in FutolStructure',
            floorIds: state.floors.map(floor => floor.id),
            plans: { layouts: 0, tributary: 0, foundation: 0 },
            tables: {},
            warnings: []
        };

        const cellWidth = planBounds.width + 5.2;
        const cellHeight = planBounds.height + 5.2;
        const packageTop = 0;
        writer.text(0, packageTop + 4.1, 'FUTOLSTRUCTURE - COORDINATED DXF DRAWING PACKAGE', DXF_LAYER.TEXT, 0.48);
        writer.text(0, packageTop + 3.45, `${DXF_PACKAGE_BUILD} | UNITS: METERS | GENERATED ${localDateStamp()}`, DXF_LAYER.TEXT, 0.2);
        writer.text(0, packageTop + 3.05, 'Plans, schedules, load summary, and preliminary BOQ use FT structural layer mapping.', DXF_LAYER.TEXT, 0.18);

        (state.floors || []).forEach((floor, rowIndex) => {
            const geometry = floorGeometryById.get(floor.id) || { beams: [], slabs: [] };
            const rowY = packageTop - rowIndex * cellHeight;
            drawFloorPlan(writer, floor, geometry, { x: 2, y: rowY }, planBounds, false);
            drawFloorPlan(writer, floor, geometry, { x: 2 + cellWidth, y: rowY }, planBounds, true);
            audit.plans.layouts += 1;
            audit.plans.tributary += 1;
        });

        const foundationFloor = state.floors[0];
        if (foundationFloor) {
            const geometry = floorGeometryById.get(foundationFloor.id) || { beams: [], slabs: [] };
            const foundationY = packageTop - state.floors.length * cellHeight;
            drawFoundationPlanPackage(writer, foundationFloor, geometry, { x: 2, y: foundationY }, planBounds);
            audit.plans.foundation = 1;
        }

        const tablesTop = packageTop - (state.floors.length + 1) * cellHeight - 2;
        drawPackageTables(writer, tablesTop, floorGeometryById, audit);

        const dxf = buildDXFDocument(writer);
        audit.entityCounts = { ...writer.entityCounts };
        audit.layerUsage = { ...writer.layerUsage };
        audit.bytes = new TextEncoder().encode(dxf).length;
        audit.dxfVersion = 'AC1009';
        audit.lineEnding = 'CRLF';
        audit.validTerminator = dxf.endsWith('0\r\nEOF\r\n');
        audit.requiredLayerEntities = [DXF_LAYER.GRID, DXF_LAYER.TEXT, DXF_LAYER.COLUMN, DXF_LAYER.BEAM, DXF_LAYER.SLAB]
            .every(layer => (writer.layerUsage[layer] || 0) > 0);
        window.lastDXFExportAudit = audit;
        return dxf;
    }

    function exportCoordinatedDXF() {
        try {
            const dxf = generateCoordinatedDXFContent();
            const date = localDateStamp();
            const activeProjectName = typeof currentProjectFileName !== 'undefined'
                ? currentProjectFileName
                : window.currentProjectFileName;
            const rawModelName = String(activeProjectName || 'Model')
                .replace(/\.fstr$/i, '')
                .replace(/^FutolStructure[\s_-]*/i, '');
            const modelName = escapeFilename(rawModelName);
            const filename = `FutolStructure_${modelName}_Drawing_Package_${date}.dxf`;
            const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.style.display = 'none';
            anchor.href = url;
            anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            window.lastDXFExportAudit.filename = filename;
            setTimeout(() => {
                if (anchor.parentNode) anchor.parentNode.removeChild(anchor);
                URL.revokeObjectURL(url);
            }, 10000);
            const status = document.getElementById('statusText');
            if (status) status.textContent = 'DXF package exported';
            alert(
                `DXF drawing package exported.\n\n` +
                `${window.lastDXFExportAudit.plans.layouts} layout plans\n` +
                `${window.lastDXFExportAudit.plans.tributary} tributary plans\n` +
                `${window.lastDXFExportAudit.plans.foundation} foundation/base reaction plan\n` +
                `Schedules, load summary, and preliminary BOQ tables\n\n` +
                `File: ${filename}`
            );
        } catch (error) {
            console.error('DXF export failed:', error);
            const status = document.getElementById('statusText');
            if (status) status.textContent = 'DXF export failed';
            alert(`DXF export failed: ${error.message}`);
        }
    }

    window.generateDXFContent = generateCoordinatedDXFContent;
    window.exportToDXF = exportCoordinatedDXF;
})();
