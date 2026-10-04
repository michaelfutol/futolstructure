(function attachFrameGeometry(global) {
    'use strict';

    // Clip a line in the column's local frame, not its axis-aligned bounding box.
    function columnLineInterval(start, end, column) {
        if (!column) return null;
        const angle = column.orientationDeg * Math.PI / 180;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const dx = end.x - start.x, dy = end.y - start.y;
        const ox = start.x - column.center.x, oy = start.y - column.center.y;
        const origins = [ox * cos + oy * sin, -ox * sin + oy * cos];
        const directions = [dx * cos + dy * sin, -dx * sin + dy * cos];
        const halves = [column.size.b / 2000, column.size.h / 2000];
        let enter = -Infinity, exit = Infinity;
        for (let i = 0; i < 2; i++) {
            if (Math.abs(directions[i]) < 1e-12) {
                if (Math.abs(origins[i]) > halves[i] + 1e-9) return null;
                continue;
            }
            const a = (-halves[i] - origins[i]) / directions[i];
            const b = (halves[i] - origins[i]) / directions[i];
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
        }
        return enter <= exit + 1e-9 && Number.isFinite(enter) && Number.isFinite(exit)
            ? { enter, exit } : null;
    }

    function beamCorners(axis, widthM) {
        const dx = axis.x2 - axis.x1, dy = axis.y2 - axis.y1;
        const length = Math.hypot(dx, dy);
        if (length < 1e-9) return [];
        const nx = -dy / length * widthM / 2, ny = dx / length * widthM / 2;
        return [
            { x: axis.x1 - nx, y: axis.y1 - ny },
            { x: axis.x2 - nx, y: axis.y2 - ny },
            { x: axis.x2 + nx, y: axis.y2 + ny },
            { x: axis.x1 + nx, y: axis.y1 + ny }
        ];
    }

    const api = { columnLineInterval, beamCorners };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.EngineFrameGeometry = api;
})(typeof window !== 'undefined' ? window : globalThis);
