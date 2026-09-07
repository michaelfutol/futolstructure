(function attachRoofFrame(global) {
    'use strict';
    const CONTRACT = 'FutolStructure.RoofFrameModel.v1';
    const SUPPORT_TYPES = ['hinge', 'fixed', 'roller'];
    function num(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
    function member(item, index) {
        const source = item || {};
        return {
            id: source.id || `RF-${index + 1}`, type: source.type || 'rafter',
            section: source.section || 'RHS-100x50x3', material: source.material || 'steel', grade: source.grade || 'Grade 350',
            start: { x: num(source.start?.x), y: num(source.start?.y), z: num(source.start?.z) },
            end: { x: num(source.end?.x), y: num(source.end?.y), z: num(source.end?.z) },
            startSnap: source.startSnap || source.start?.snap || {}, endSnap: source.endSnap || source.end?.snap || {},
            deadLoadKNm: Math.max(0, num(source.deadLoadKNm)), liveLoadKNm: Math.max(0, num(source.liveLoadKNm)),
            releaseStart: !!source.releaseStart, releaseEnd: !!source.releaseEnd,
            exportToSolvers: source.exportToSolvers === true, exportToIFC: source.exportToIFC !== false, notes: source.notes || ''
        };
    }
    function supportNode(item, index) {
        const source = item || {};
        return {
            id: String(source.id || source.referenceId || ('SUP-' + (index + 1))),
            x: num(source.x ?? source.point?.x),
            y: num(source.y ?? source.point?.y),
            z: num(source.z ?? source.point?.z),
            source: String(source.source || 'column'),
            override: SUPPORT_TYPES.includes(source.supportType) ? source.supportType : ''
        };
    }
    function inferFrameAxis(members) {
        let xSpan = 0;
        let ySpan = 0;
        (members || []).forEach(item => {
            xSpan += Math.abs(num(item.end?.x) - num(item.start?.x));
            ySpan += Math.abs(num(item.end?.y) - num(item.start?.y));
        });
        return ySpan > xSpan ? 'Y' : 'X';
    }
    function uniqueSupportNodes(items) {
        const nodes = [];
        (items || []).map(supportNode).forEach(node => {
            const existing = nodes.find(item => Math.hypot(item.x - node.x, item.y - node.y) < 0.001);
            if (!existing) nodes.push(node);
            else if (node.override) existing.override = node.override;
        });
        return nodes;
    }
    function deriveSupportAssignments({ supports = [], members = [], policy = 'auto' } = {}) {
        const normalizedPolicy = policy === 'auto' || SUPPORT_TYPES.includes(policy) ? policy : 'auto';
        const nodes = uniqueSupportNodes(supports);
        const axis = inferFrameAxis(members);
        const ordered = [...nodes].sort((left, right) => {
            const primary = axis === 'X' ? left.x - right.x : left.y - right.y;
            return primary || (axis === 'X' ? left.y - right.y : left.x - right.x) || left.id.localeCompare(right.id);
        });
        const assignments = ordered.map((node, index) => {
            const explicit = node.override;
            if (explicit) {
                return { ...node, supportType: explicit, mode: 'explicit-node', reason: 'Node-specific override' };
            }
            if (normalizedPolicy !== 'auto') {
                return { ...node, supportType: normalizedPolicy, mode: 'manual-global', reason: 'Global ' + normalizedPolicy + ' override' };
            }
            const isPrimary = index === 0;
            const isExpansion = ordered.length > 1 && index === ordered.length - 1;
            return {
                ...node,
                supportType: isExpansion ? 'roller' : 'hinge',
                mode: 'auto',
                reason: isPrimary
                    ? 'Primary restraint: hinge resists translation without assuming a moment frame'
                    : isExpansion
                        ? 'Expansion restraint along ' + axis + ': roller releases one in-plane translation'
                        : 'Secondary support: hinge keeps the roof support path stable'
            };
        });
        const warnings = [];
        if (!nodes.length) warnings.push('No roof support nodes were supplied; verify column/support mapping before solver export.');
        if (normalizedPolicy === 'auto' && nodes.length === 1) warnings.push('Only one roof support node is available; AUTO assigned hinge and no roller could be created.');
        if (normalizedPolicy === 'auto' && nodes.length > 1) warnings.push('AUTO is a preliminary support convention; verify expansion direction and diaphragm/action path in the target solver.');
        if (normalizedPolicy === 'fixed') warnings.push('All supports are fixed by explicit global override; confirm columns and foundations are designed for moment transfer.');
        return {
            policy: normalizedPolicy,
            frameAxis: axis,
            recommendation: normalizedPolicy === 'auto' ? 'HINGE + ROLLER expansion pair; no automatic fixed supports' : 'All supports: ' + normalizedPolicy,
            assignments,
            warnings,
            solverReady: assignments.length > 0
        };
    }
    function build(model = {}) {
        const source = model.roofFrame || {};
        const members = (source.members || []).map(member);
        const roof = (model.floors || []).find(floor => floor.isRoof) || null;
        const policy = ['auto', ...SUPPORT_TYPES].includes(source.supportType) ? source.supportType : 'auto';
        const explicitSupports = Array.isArray(source.supportAssignments) ? source.supportAssignments : [];
        const candidateSupports = explicitSupports.length
            ? explicitSupports
            : (model.supports || model.columns || []);
        const supportPlan = deriveSupportAssignments({
            supports: candidateSupports,
            members,
            policy
        });
        return { contract: CONTRACT, enabled: source.enabled === true, roofFloorId: source.roofFloorId || roof?.id || '',
            framingSystem: source.framingSystem || 'steel_rafters_and_purlins',
            supportType: policy, supportPolicy: policy, supportPlan, supports: supportPlan.assignments, members,
            solverMembers: members.filter(item => item.exportToSolvers),
            loadPolicy: source.loadPolicy || 'roof-cladding-and-maintenance-line-loads-assigned-explicitly',
            loads: members.flatMap(item => [
                ...(item.deadLoadKNm > 0 ? [{ memberId: item.id, caseId: 'FS_ROOF_DL', valueKNm: item.deadLoadKNm }] : []),
                ...(item.liveLoadKNm > 0 ? [{ memberId: item.id, caseId: 'FS_ROOF_LL', valueKNm: item.liveLoadKNm }] : [])
            ]),
            validation: { status: source.enabled === true && members.length ? 'READY_FOR_COORDINATION' : 'DRAFT', warnings: [
                ...(source.enabled === true && !members.length ? ['Roof frame is enabled but has no members.'] : []),
                ...supportPlan.warnings
            ] } };
    }
    global.FSRoofFrame = Object.freeze({ contract: CONTRACT, build, normalizeMember: member, deriveSupportAssignments });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.FSRoofFrame;
})(typeof window !== 'undefined' ? window : globalThis);
