#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(message, details) {
    const error = new Error(message);
    error.details = details;
    throw error;
}

function getArg(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : '';
}

function countEntities(content, type) {
    return (content.match(new RegExp(`#[0-9]+=${type}\\(`, 'g')) || []).length;
}

function readStoreyNames(content) {
    return [...content.matchAll(/#[0-9]+=IFCBUILDINGSTOREY\('[^']*',#[0-9]+,'([^']*)'/g)]
        .map(match => match[1]);
}

function readProperty(content, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`IFCPROPERTYSINGLEVALUE\\('${escaped}',\\$,(?:IFCLABEL|IFCTEXT)\\('([^']*)'\\)`, 's'));
    return match ? match[1] : '';
}

function validate(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) fail('IFC file does not exist', { file: resolved });
    const content = fs.readFileSync(resolved, 'utf8');
    const levels = readStoreyNames(content);
    const expectedLevels = (getArg('--levels') || 'BASE/FOUNDATION,GF,2F,RF')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const counts = {
        projects: countEntities(content, 'IFCPROJECT'),
        buildings: countEntities(content, 'IFCBUILDING'),
        storeys: countEntities(content, 'IFCBUILDINGSTOREY'),
        columns: countEntities(content, 'IFCCOLUMN'),
        beams: countEntities(content, 'IFCBEAM'),
        slabs: countEntities(content, 'IFCSLAB'),
        footings: countEntities(content, 'IFCFOOTING'),
        properties: countEntities(content, 'IFCPROPERTYSINGLEVALUE')
    };
    const result = {
        ok: true,
        file: resolved,
        schema: (content.match(/FILE_SCHEMA\(\('([^']+)'\)\)/) || [])[1] || '',
        levels,
        counts,
        foundation: {
            pedestalColumns: (content.match(/IFCCOLUMN\('[^']*',#[0-9]+,'P-[^']*','Pedestal [^']*'/g) || []).length,
            tieBeams: (content.match(/IFCBEAM\('[^']*',#[0-9]+,'TB-[^']*','Foundation Tie Beam/g) || []).length
        },
        metadata: {
            projectId: readProperty(content, 'FS_ProjectId'),
            revisionId: readProperty(content, 'FS_RevisionId'),
            buildId: readProperty(content, 'FS_BuildId'),
            exportContract: readProperty(content, 'FS_ExportContract')
        },
        bytes: Buffer.byteLength(content),
        terminator: content.trimEnd().endsWith('END-ISO-10303-21;')
    };
    const failures = [];
    if (result.schema !== 'IFC2X3') failures.push(`Expected IFC2X3, got ${result.schema || 'missing'}`);
    if (levels.length !== expectedLevels.length || expectedLevels.some((level, index) => levels[index] !== level)) {
        failures.push(`Storey sequence mismatch: expected ${expectedLevels.join(', ')}; got ${levels.join(', ')}`);
    }
    ['projects', 'buildings', 'storeys', 'columns', 'beams', 'slabs', 'footings'].forEach(key => {
        if (counts[key] < 1) failures.push(`Missing IFC entity class: ${key}`);
    });
    if (result.foundation.pedestalColumns < 1) failures.push('Missing pedestal metadata/entities');
    if (result.foundation.tieBeams < 1) failures.push('Missing foundation tie beams');
    if (!result.metadata.projectId || !result.metadata.revisionId || !result.metadata.buildId) {
        failures.push('Missing FutolStructure project/revision/build metadata');
    }
    if (!result.terminator) failures.push('Missing ISO-10303-21 terminator');
    if (/NaN|undefined|null/.test(content)) failures.push('IFC contains an invalid scalar token');
    result.ok = failures.length === 0;
    result.failures = failures;
    return result;
}

const filePath = process.argv.find(value => value.toLowerCase().endsWith('.ifc'));
if (!filePath) {
    console.error('Usage: node v3/tools/validate-ifc-lite.js <file.ifc> [--levels BASE/FOUNDATION,GF,2F,RF]');
    process.exit(2);
}

try {
    const result = validate(filePath);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
} catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message, details: error.details || null }, null, 2));
    process.exitCode = 1;
}
