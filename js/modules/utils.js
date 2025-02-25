/**
 * utils.js - Utility functions module
 * Contains general utility functions used across the application
 */

/**
 * Generate a color for a family based on surname
 * @param {string} surname - Family surname
 * @returns {string} HSL color string
 */
function generateFamilyColor(surname) {
    let hash = 0;
    for (let i = 0; i < surname.length; i++) {
        hash = surname.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    // Use pastel colors with better contrast
    return `hsl(${hue}, 55%, 65%)`;
}

/**
 * Create a family tree node
 * @param {Object} person - Person object
 * @param {string} nodeId - Node ID
 * @param {number} level - Level in the tree
 * @param {string} surname - Family surname
 * @returns {Object} Node object for visualization
 */
function createNode(person, nodeId, level, surname) {
    const familyColor = generateFamilyColor(surname);
    const textColor = '#1a1a1a'; // Dark gray text for better readability
    return {
        id: nodeId,
        label: person.displayName,
        level: level,
        color: {
            background: familyColor,
            border: familyColor,
            highlight: {
                background: familyColor,
                border: `hsl(${familyColor.match(/\d+/)[0]}, 65%, 55%)`, // Slightly darker on highlight
            }
        },
        font: {
            color: textColor,
            size: 14,
            face: 'Inter'
        },
        shape: 'box',
        margin: 10,
        shadow: {
            enabled: true,
            color: 'rgba(0,0,0,0.2)',
            size: 3,
            x: 1,
            y: 1
        }
    };
}

/**
 * Add a spouse edge to the graph
 * @param {string} from - Source node ID
 * @param {string} to - Target node ID
 * @param {Array} edges - Edges array
 * @param {Set} processedPairs - Set of processed edge pairs
 */
function addSpouseEdge(from, to, edges, processedPairs) {
    const edgePair = [from, to].sort().join('+');
    if (!processedPairs.has(edgePair)) {
        const surname = from.split('@')[1]; // Get surname from nodeId
        const familyColor = generateFamilyColor(surname);
        edges.push({
            from: from,
            to: to,
            color: familyColor,
            dashes: true,
            width: 2
        });
        processedPairs.add(edgePair);
    }
}

/**
 * Add a parent-child edge to the graph
 * @param {string} from - Source node ID (parent)
 * @param {string} to - Target node ID (child)
 * @param {Array} edges - Edges array
 * @param {Set} processedPairs - Set of processed edge pairs
 */
function addParentChildEdge(from, to, edges, processedPairs) {
    const edgeId = `${from}->${to}`;
    if (!processedPairs.has(edgeId)) {
        const surname = from.split('@')[1]; // Get surname from nodeId
        const familyColor = generateFamilyColor(surname);
        edges.push({
            from: from,
            to: to,
            arrows: 'to',
            color: familyColor
        });
        processedPairs.add(edgeId);
    }
}

/**
 * Calculate custom positions for nodes in the family tree
 * @param {Array} nodes - Nodes array
 * @param {Array} edges - Edges array
 * @returns {Map} Map of node positions
 */
function calculateCustomPositions(nodes, edges) {
    const nodePositions = new Map();
    const baseWidth = 100; // minimum width for a group

    // Get spacing values from sliders (vertical from slider; horizontal remains for sibling spacing)
    const verticalSpacing = parseInt(document.getElementById("verticalSpacing").value) || 300;
    const horizontalGap = parseInt(document.getElementById("horizontalSpacing").value) || 50;

    // Build union-find for spouse groups based on dashed edges
    const parentUF = {};
    function find(x) {
        if (parentUF[x] === undefined) { parentUF[x] = x; return x; }
        if (parentUF[x] !== x) { parentUF[x] = find(parentUF[x]); }
        return parentUF[x];
    }
    function union(x, y) {
        const rx = find(x), ry = find(y);
        if (rx !== ry) parentUF[ry] = rx;
    }
    nodes.forEach(n => find(n.id));
    edges.forEach(edge => { if (edge.dashes) { union(edge.from, edge.to); } });
    const repMap = {};
    nodes.forEach(n => { repMap[n.id] = find(n.id); });
    const groupNodes = new Map();
    nodes.forEach(n => {
        const rep = repMap[n.id];
        if (!groupNodes.has(rep)) groupNodes.set(rep, []);
        groupNodes.get(rep).push(n.id);
    });

    // Build parent-child mapping using spouse groups (from non-dashed edges)
    const parentChildMap = new Map();
    const allChildReps = new Set();
    edges.forEach(edge => {
        if (!edge.dashes) {
            const pRep = repMap[edge.from], cRep = repMap[edge.to];
            if (pRep === cRep) return;
            if (!parentChildMap.has(pRep)) parentChildMap.set(pRep, new Set());
            parentChildMap.get(pRep).add(cRep);
            allChildReps.add(cRep);
        }
    });
    const rootGroups = [];
    groupNodes.forEach((_, rep) => { if (!allChildReps.has(rep)) { rootGroups.push(rep); } });

    // First pass: recursively compute subtree widths for each spouse group
    const subtreeWidths = new Map();
    function computeSubtreeWidth(groupRep) {
        if (!parentChildMap.has(groupRep)) {
            subtreeWidths.set(groupRep, baseWidth);
            return baseWidth;
        }
        const children = Array.from(parentChildMap.get(groupRep));
        let total = 0;
        children.forEach((childRep, idx) => {
            const childWidth = computeSubtreeWidth(childRep);
            total += childWidth;
            if (idx < children.length - 1) total += horizontalGap;
        });
        const width = Math.max(baseWidth, total);
        subtreeWidths.set(groupRep, width);
        return width;
    }
    rootGroups.forEach(rep => computeSubtreeWidth(rep));

    // Second pass: recursively assign positions for each spouse group with custom spouse offset logic
    function assignPositions(groupRep, xStart, level) {
        const width = subtreeWidths.get(groupRep);
        const baseX = xStart + width / 2;  // base center for this group
        const group = groupNodes.get(groupRep);
        let main = group[0];
        for (let i = 0; i < group.length; i++) {
            let hasChild = false;
            edges.forEach(edge => { if (!edge.dashes && edge.from === group[i]) { hasChild = true; } });
            if (hasChild) { main = group[i]; break; }
        }
        nodePositions.set(main, { x: baseX, y: level * verticalSpacing });
        group.forEach(nodeId => {
            if (nodeId === main) return;
            let hasChild = false;
            edges.forEach(edge => { if (!edge.dashes && edge.from === nodeId) { hasChild = true; } });
            const nodeObj = nodes.find(n => n.id === nodeId);
            const labelWidth = nodeObj ? (nodeObj.label.length * 8) : 80;
            // Multiply labelWidth by 1.5 for spouse spacing
            if (!hasChild) {
                nodePositions.set(nodeId, { x: baseX + labelWidth * 1.5, y: level * verticalSpacing });
            } else {
                let mainPos = nodePositions.get(main);
                mainPos.x -= (labelWidth * 1.5) / 2;
                nodePositions.set(main, mainPos);
                nodePositions.set(nodeId, { x: mainPos.x + (labelWidth * 1.5), y: level * verticalSpacing });
            }
        });
        if (parentChildMap.has(groupRep)) {
            const children = Array.from(parentChildMap.get(groupRep));
            let currentX = xStart;
            children.forEach(childRep => {
                const childWidth = subtreeWidths.get(childRep);
                assignPositions(childRep, currentX, level + 1);
                currentX += childWidth + horizontalGap;
            });
        }
    }
    let globalOffsetX = 0;
    // Use fixed 200 pixel gap between tree clusters instead of the slider value
    rootGroups.forEach(rep => {
        const treeWidth = subtreeWidths.get(rep);
        assignPositions(rep, globalOffsetX, 0);
        globalOffsetX += treeWidth + 200; // fixed 200 pixel gap between trees
    });
    const totalWidth = globalOffsetX - 200; // subtract final fixed gap
    const centerOffset = -totalWidth / 2;
    nodePositions.forEach(pos => { pos.x += centerOffset; });
    return nodePositions;
}

// Export the module
export {
    generateFamilyColor,
    createNode,
    addSpouseEdge,
    addParentChildEdge,
    calculateCustomPositions
}; 