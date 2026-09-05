(function attachRoofFrame(global) {
    'use strict';
    const CONTRACT = 'FutolStructure.RoofFrameModel.v1';
    function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
    function member(item, index) {
        const source = item || {};
        return {
            id: source.id || `RF-${index + 1}`, type: source.type || 'rafter',
            section: source.section || 'RHS-100x50x3', material: source.material || 'steel', grade: source.grade || 'Grade 350',
            start: { x: num(source.start?.x), y: num(source.start?.y), z: num(source.start?.z) },
            end: { x: num(source.end?.x), y: num(source.end?.y), z: num(source.end?.z) },
            releaseStart: !!source.releaseStart, releaseEnd: !!source.releaseEnd,
            exportToSolvers: source.exportToSolvers !== false, exportToIFC: source.exportToIFC !== false, notes: source.notes || ''
        };
    }
    function build(model = {}) {
        const source = model.roofFrame || {};
        const members = (source.members || []).map(member);
        const roof = (model.floors || []).find(floor => floor.isRoof) || null;
        return { contract: CONTRACT, enabled: source.enabled === true, roofFloorId: source.roofFloorId || roof?.id || '',
            framingSystem: source.framingSystem || 'steel_rafters_and_purlins',
            supportType: ['hinge', 'fixed', 'roller'].includes(source.supportType) ? source.supportType : 'hinge', members,
            solverMembers: members.filter(item => item.exportToSolvers),
            loadPolicy: source.loadPolicy || 'roof-cladding-and-maintenance-loads-assigned-explicitly',
            validation: { status: source.enabled === true && members.length ? 'READY_FOR_COORDINATION' : 'DRAFT', warnings: source.enabled === true && !members.length ? ['Roof frame is enabled but has no members.'] : [] } };
    }
    global.FSRoofFrame = Object.freeze({ contract: CONTRACT, build, normalizeMember: member });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSRoofFrame;
})(typeof window !== 'undefined' ? window : globalThis);
