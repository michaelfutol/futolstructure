#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const manifestPath = process.argv[2];
if (!manifestPath) {
    console.error('Usage: node v3/tools/check-revit-manifest.cjs <manifest.json>');
    process.exit(2);
}

const resolvedPath = path.resolve(manifestPath);
const errors = [];
const warnings = [];
let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
} catch (error) {
    console.error(`Could not read manifest: ${error.message}`);
    process.exit(1);
}

const has = (value, key) => value && Object.prototype.hasOwnProperty.call(value, key);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const requiredString = (value, key, label) => {
    if (!has(value, key) || typeof value[key] !== 'string' || !value[key].trim()) {
        errors.push(`${label} is missing '${key}'.`);
        return false;
    }
    return true;
};
const requiredNumber = (value, key, label) => {
    if (!has(value, key) || !finite(value[key])) {
        errors.push(`${label} is missing finite '${key}'.`);
        return false;
    }
    return true;
};
const requiredArray = (value, key, label) => {
    if (!has(value, key) || !Array.isArray(value[key])) {
        errors.push(`${label} is missing array '${key}'.`);
        return [];
    }
    return value[key];
};
const checkAxis = (beam, key) => {
    const axis = beam[key];
    if (!axis || typeof axis !== 'object') {
        errors.push(`Beam ${beam.id || '<unknown>'} is missing ${key}.`);
        return;
    }
    for (const coordinate of ['x1', 'y1', 'x2', 'y2']) requiredNumber(axis, coordinate, `Beam ${beam.id} ${key}`);
};

if (manifest.contract !== 'FutolStructure.RevitNativeImport.v1')
    errors.push(`Unsupported contract '${manifest.contract || '<missing>'}'.`);

const model = manifest.model || {};
const provenance = model.provenance || {};
for (const key of ['projectId', 'sourceRevisionId', 'buildId', 'appVersion', 'schemaVersion'])
    requiredString(provenance, key, 'Model provenance');

const levels = requiredArray(model, 'levels', 'Model');
const levelNames = new Set();
for (const level of levels) {
    requiredString(level, 'id', 'Level');
    requiredString(level, 'name', `Level ${level.id || '<unknown>'}`);
    requiredNumber(level, 'elevation', `Level ${level.id || '<unknown>'}`);
    if (levelNames.has(level.name)) errors.push(`Duplicate governed level '${level.name}'.`);
    levelNames.add(level.name);
}
for (const expected of ['BASE/FOUNDATION', 'GF', '2F', 'RF']) {
    if (!levelNames.has(expected)) warnings.push(`Governed level '${expected}' is not present in this manifest.`);
}

const columns = requiredArray(model, 'columns', 'Model');
for (const column of columns) {
    const label = `Column ${column.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'section', 'startLevel', 'endLevel']) requiredString(column, key, label);
    for (const key of ['x', 'y', 'z1', 'z2', 'sourceSizeBmm', 'sourceSizeHmm', 'sourceOrientationDeg'])
        requiredNumber(column, key, label);
}

const beams = requiredArray(model, 'beams', 'Model');
for (const beam of beams) {
    const label = `Beam ${beam.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'floorId', 'section']) requiredString(beam, key, label);
    for (const key of ['z', 'analyticalCardinalPoint']) requiredNumber(beam, key, label);
    if (beam.analyticalCardinalPoint !== 8) errors.push(`${label} must use analytical cardinal point 8.`);
    for (const key of ['drawingAxis', 'physicalPlanAxis', 'analyticalPlanAxis']) checkAxis(beam, key);
    if (!beam.jointOffsets?.sharedSolverPlan?.start || !beam.jointOffsets?.sharedSolverPlan?.end)
        errors.push(`${label} is missing shared solver joint offsets.`);
}

const slabs = requiredArray(model, 'slabs', 'Model');
for (const slab of slabs) {
    const label = `Slab ${slab.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'floorId', 'section']) requiredString(slab, key, label);
    for (const key of ['z', 'thicknessMm']) requiredNumber(slab, key, label);
    const points = requiredArray(slab, 'points', label);
    if (points.length < 3) errors.push(`${label} needs at least three footprint points.`);
    for (const point of points) {
        requiredNumber(point, 'x', `${label} footprint point`);
        requiredNumber(point, 'y', `${label} footprint point`);
    }
}

const foundation = model.foundation || {};
for (const key of ['footings', 'pedestals', 'tieBeams']) requiredArray(foundation, key, 'Foundation');
for (const footing of foundation.footings || []) {
    const label = `Footing ${footing.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'supportedColumnId', 'floorId', 'material', 'designStatus'])
        requiredString(footing, key, label);
    for (const key of ['x', 'y', 'width', 'length', 'thickness', 'bottomElevation', 'topElevation'])
        requiredNumber(footing, key, label);
}
for (const pedestal of foundation.pedestals || []) {
    const label = `Pedestal ${pedestal.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'supportedColumnId', 'floorId', 'material', 'designStatus'])
        requiredString(pedestal, key, label);
    for (const key of ['x', 'y', 'width', 'length', 'bottomElevation', 'topElevation'])
        requiredNumber(pedestal, key, label);
}
for (const tieBeam of foundation.tieBeams || []) {
    const label = `Tie beam ${tieBeam.id || '<unknown>'}`;
    for (const key of ['id', 'sourceId', 'floorId', 'material', 'designStatus']) requiredString(tieBeam, key, label);
    for (const key of ['width', 'depth', 'bottomElevation', 'topElevation']) requiredNumber(tieBeam, key, label);
    const footprint = requiredArray(tieBeam, 'footprint', label);
    if (footprint.length < 3) errors.push(`${label} needs at least three footprint points.`);
}

const result = {
    ok: errors.length === 0,
    manifest: resolvedPath,
    contract: manifest.contract || null,
    provenance,
    levels: levels.length,
    columns: columns.length,
    beams: beams.length,
    slabs: slabs.length,
    footings: (foundation.footings || []).length,
    pedestals: (foundation.pedestals || []).length,
    tieBeams: (foundation.tieBeams || []).length,
    warnings,
    errors
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = errors.length === 0 ? 0 : 1;
