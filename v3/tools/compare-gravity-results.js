'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function getArg(name, fallback = '') {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : fallback;
}

function reaction(result, combination) {
    const value = Number(result?.results?.reactionSums?.[combination]?.FZ);
    assert(Number.isFinite(value), `Missing PyNite FZ reaction for ${combination}.`);
    return value;
}

function staadPrimaryLoads(text) {
    const values = {};
    const pattern = /TOTAL APPLIED LOAD[\s\S]{0,300}?\(LOADING\s+(\d+)\s*\)[\s\S]{0,300}?SUMMATION FORCE-Y\s*=\s*([-+0-9.E]+)/gi;
    for (const match of text.matchAll(pattern)) {
        const signedKN = Number(match[2]);
        values[Number(match[1])] = { signedKN, magnitudeKN: Math.abs(signedKN) };
    }
    assert(Number.isFinite(values[1]?.magnitudeKN), 'Missing STAAD primary dead-load total.');
    assert(Number.isFinite(values[2]?.magnitudeKN), 'Missing STAAD primary live-load total.');
    return {
        deadKN: values[1].magnitudeKN,
        liveKN: values[2].magnitudeKN,
        signedDeadKN: values[1].signedKN,
        signedLiveKN: values[2].signedKN
    };
}

function difference(actual, reference) {
    const absoluteKN = actual - reference;
    return {
        absoluteKN,
        percent: reference === 0 ? null : absoluteKN / reference * 100
    };
}

function withinTolerance(result, percentTolerance, zeroReferenceToleranceKN) {
    if (result.percent == null) return Math.abs(result.absoluteKN) <= zeroReferenceToleranceKN;
    return Math.abs(result.percent) <= percentTolerance;
}

function main() {
    const pyniteArgument = getArg('--pynite');
    const staadArgument = getArg('--staad');
    const outputArgument = getArg('--output');
    assert(pyniteArgument, 'Use --pynite <result.json>.');
    assert(staadArgument, 'Use --staad <result.ANL>.');
    const pynitePath = path.resolve(pyniteArgument);
    const staadPath = path.resolve(staadArgument);
    const deadTolerancePercent = Number(getArg('--dead-tolerance-percent', '2'));
    const liveTolerancePercent = Number(getArg('--live-tolerance-percent', '0.01'));
    const deadZeroToleranceKN = Number(getArg('--dead-zero-tolerance-kn', '0.01'));
    const liveZeroToleranceKN = Number(getArg('--live-zero-tolerance-kn', '0.01'));
    assert(fs.existsSync(pynitePath), `PyNite result not found: ${pynitePath}`);
    assert(fs.existsSync(staadPath), `STAAD result not found: ${staadPath}`);

    const pynite = JSON.parse(fs.readFileSync(pynitePath, 'utf8'));
    assert.equal(pynite.status, 'COMPLETED');
    const uls14D = reaction(pynite, 'ULS-1.4D');
    const uls12D16L = reaction(pynite, 'ULS-1.2D+1.6L');
    const pyniteDeadKN = uls14D / 1.4;
    const pyniteLiveKN = (uls12D16L - 1.2 * pyniteDeadKN) / 1.6;
    const staad = staadPrimaryLoads(fs.readFileSync(staadPath, 'utf8'));
    const deadDifference = difference(pyniteDeadKN, staad.deadKN);
    const liveDifference = difference(pyniteLiveKN, staad.liveKN);
    const checks = {
        deadWithinTolerance: withinTolerance(deadDifference, deadTolerancePercent, deadZeroToleranceKN),
        liveWithinTolerance: withinTolerance(liveDifference, liveTolerancePercent, liveZeroToleranceKN),
        unresolvedLoadsZero: Number(pynite.counts?.unresolvedLoads) === 0
    };
    const audit = {
        contract: 'FutolStructure.GravitySolverComparison.v1',
        generatedAt: new Date().toISOString(),
        status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
        source: { pynite: pynitePath, staad: staadPath },
        tolerances: {
            deadPercent: deadTolerancePercent,
            livePercent: liveTolerancePercent,
            deadZeroKN: deadZeroToleranceKN,
            liveZeroKN: liveZeroToleranceKN
        },
        reactionsKN: {
            pynite: { dead: pyniteDeadKN, live: pyniteLiveKN },
            staad: { dead: staad.deadKN, live: staad.liveKN, signedDead: staad.signedDeadKN, signedLive: staad.signedLiveKN }
        },
        differences: { dead: deadDifference, live: liveDifference },
        checks,
        comparisonBasis: 'STAAD primary applied-load magnitudes; signed source values are retained for traceability. This is not a support-reaction comparison.',
        interpretation: 'Dead-load tolerance permits documented solver self-weight overlap/end-length treatment differences. Zero references use an explicit absolute tolerance; live-load mapping must remain effectively exact.'
    };
    if (outputArgument) {
        const outputPath = path.resolve(outputArgument);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2) + '\n', 'utf8');
    }
    console.log(JSON.stringify(audit, null, 2));
    if (audit.status !== 'PASS') process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { staadPrimaryLoads, difference, withinTolerance };
