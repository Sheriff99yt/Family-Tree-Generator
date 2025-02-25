/**
 * visualization.js - Tree visualization module
 * Handles the creation and rendering of family trees
 */

import { getFamilyRoots, getSurname } from './data.js';
import { createNode, addSpouseEdge, addParentChildEdge, calculateCustomPositions } from './utils.js';
import { showDetailsPanel, closeDetailsPanel } from './ui.js';

// Global variables
let network;
let layoutModeIndex = 0;
const layoutModes = ["up-to-down", "down-to-up", "left-to-right", "right-to-left"];

/**
 * Create family trees from people data
 * @param {Map} people - Map of people data
 * @param {Set} mothers - Set of mothers
 * @returns {Object} Object containing nodes and edges arrays
 */
function createFamilyTrees(people, mothers) {
    const nodes = [];
    const edges = [];
    const processedPairs = new Set();
    const surnames = getFamilyRoots(people);

    surnames.forEach(surname => {
        const roots = Array.from(people.values())
            .filter(p => p.parents.length === 0 && getSurname(p.name) === surname)
            .sort((a, b) => a.name.localeCompare(b.name));

        roots.forEach(root => processFamilyTree(root, people, nodes, edges, processedPairs, surname, mothers));
    });

    return { nodes, edges };
}

/**
 * Process a family tree starting from a root
 * @param {Object} root - Root person object
 * @param {Map} people - Map of people data
 * @param {Array} nodes - Nodes array
 * @param {Array} edges - Edges array
 * @param {Set} processedPairs - Set of processed edge pairs
 * @param {string} surname - Family surname
 * @param {Set} mothers - Set of mothers
 */
function processFamilyTree(root, people, nodes, edges, processedPairs, surname, mothers) {
    processNodeDFS(root, people, nodes, edges, processedPairs, surname, mothers, 0);
}

/**
 * Process a node using depth-first search
 * @param {Object} person - Person object
 * @param {Map} people - Map of people data
 * @param {Array} nodes - Nodes array
 * @param {Array} edges - Edges array
 * @param {Set} processedPairs - Set of processed edge pairs
 * @param {string} surname - Family surname
 * @param {Set} mothers - Set of mothers
 * @param {number} level - Level in the tree
 */
function processNodeDFS(person, people, nodes, edges, processedPairs, surname, mothers, level) {
    // Set to track processed persons to avoid infinite loops in spouse networks
    const processedInThisChain = new Set();
    processPersonAndSpouseNetwork(person, people, nodes, edges, processedPairs, surname, mothers, level, processedInThisChain);
}

/**
 * Process a person and their spouse network
 * @param {Object} person - Person object
 * @param {Map} people - Map of people data
 * @param {Array} nodes - Nodes array
 * @param {Array} edges - Edges array
 * @param {Set} processedPairs - Set of processed edge pairs
 * @param {string} surname - Family surname
 * @param {Set} mothers - Set of mothers
 * @param {number} level - Level in the tree
 * @param {Set} processedInThisChain - Set of processed persons in this chain
 */
function processPersonAndSpouseNetwork(person, people, nodes, edges, processedPairs, surname, mothers, level, processedInThisChain) {
    if (processedInThisChain.has(person.name)) return;
    processedInThisChain.add(person.name);

    const nodeId = `${person.name}@${surname}`;
    if (!nodes.some(n => n.id === nodeId)) {
        nodes.push(createNode(person, nodeId, level, surname));
    }

    // Process children first
    person.children.forEach(childName => {
        const child = people.get(childName);
        const childId = `${child.name}@${surname}`;
        
        // Check if this person is the actual father
        const childNameParts = child.name.split(' ');
        const isFather = childNameParts.length > 1 && childNameParts.slice(1).join(' ') === person.name;
        
        if (isFather) {
            if (!nodes.some(n => n.id === childId)) {
                nodes.push(createNode(child, childId, level + 1, surname));
            }
            addParentChildEdge(nodeId, childId, edges, processedPairs);
            // Process child's subtree immediately
            processPersonAndSpouseNetwork(child, people, nodes, edges, processedPairs, surname, mothers, level + 1, new Set());
        }
    });

    // Process spouses after children
    person.spouses.forEach(spouseName => {
        const spouse = people.get(spouseName);
        const spouseId = `${spouse.name}@${surname}`;
        
        if (!nodes.some(n => n.id === spouseId)) {
            nodes.push(createNode(spouse, spouseId, level, surname));
        }
        addSpouseEdge(nodeId, spouseId, edges, processedPairs);

        // Process spouse's other relationships
        processPersonAndSpouseNetwork(spouse, people, nodes, edges, processedPairs, surname, mothers, level, processedInThisChain);
    });
}

/**
 * Draw the network visualization
 * @param {Array} nodes - Nodes array
 * @param {Array} edges - Edges array
 * @param {Set} mothers - Set of mothers
 */
function drawNetwork(nodes, edges, mothers) {
    const container = document.getElementById('network');
    if (network) network.destroy();
    
    // Calculate custom positions
    const positions = calculateCustomPositions(nodes, edges);
    
    // Apply positions to nodes
    nodes.forEach(node => {
        const pos = positions.get(node.id);
        if (pos) {
            node.x = pos.x;
            node.y = pos.y;
        }
    });

    network = new vis.Network(container, {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    }, {
        layout: {
            hierarchical: {
                enabled: false
            }
        },
        physics: {
            enabled: false
        },
        edges: {
            smooth: {
                type: 'cubicBezier',
                roundness: 0.5
            }
        },
        interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true,
            hover: true
        }
    });

    // Expose network to window object
    window.network = network;

    // Add event listeners for the details panel
    network.on('selectNode', function(params) {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0].split('@')[0]; // Get the name part before @
            showDetailsPanel(nodeId);
        }
    });

    network.on('deselectNode', function(params) {
        closeDetailsPanel();
    });

    // Fit the view after drawing
    network.once('afterDrawing', () => {
        network.fit({
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
    });
}

/**
 * Toggle the layout direction
 */
function toggleLayout() {
    // Cycle mode
    layoutModeIndex = (layoutModeIndex + 1) % layoutModes.length;
    
    // Update edge smoothing based on current layout mode
    updateEdgeSmoothing();
    
    // Apply the layout rotation
    applyLayoutRotation();
}

/**
 * Apply rotation based on the current layout mode
 */
function applyLayoutRotation() {
    const mode = layoutModes[layoutModeIndex];
    let angle = 0;
    if (mode === "up-to-down") {
        angle = 0;
    } else if (mode === "down-to-up") {
        angle = Math.PI;
    } else if (mode === "left-to-right") {
        angle = Math.PI / 2;
    } else if (mode === "right-to-left") {
        angle = -Math.PI / 2;
    }
    
    // Get the current positions from network and recalculate rotated positions
    const positions = calculateCustomPositions(network.body.data.nodes.get(), network.body.data.edges.get());
    const rotatedPositions = new Map();
    let xs = [];
    positions.forEach((pos, id) => {
        const newX = pos.x * Math.cos(angle) - pos.y * Math.sin(angle);
        const newY = pos.x * Math.sin(angle) + pos.y * Math.cos(angle);
        rotatedPositions.set(id, { x: newX, y: newY });
        xs.push(newX);
    });
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const centerOffset = -((minX + maxX) / 2);
    rotatedPositions.forEach(pos => { pos.x += centerOffset; });
    
    // Update positions in the network
    network.body.data.nodes.update(
        Array.from(rotatedPositions.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }))
    );
}

/**
 * Update edge smoothing based on layout mode
 */
function updateEdgeSmoothing() {
    const mode = layoutModes[layoutModeIndex];
    // Swap edge smoothing: use "horizontal" for vertical modes and vice-versa
    const edgeType = (mode === "up-to-down" || mode === "down-to-up") ? "horizontal" : "vertical";
    network.setOptions({ edges: { smooth: { type: edgeType, roundness: 0.5 } } });
}

/**
 * Fit the network view to the screen
 */
function fitView() {
    if (network) network.fit({
        animation: {
            duration: 1000,
            easingFunction: 'easeInOutQuad'
        }
    });
}

/**
 * Find a node ID by person name
 * @param {string} name - Person name
 * @returns {string|null} Node ID or null if not found
 */
function findNodeIdByName(name) {
    if (!network || !network.body || !network.body.data || !network.body.data.nodes) {
        return null;
    }

    const allNodeIds = network.body.data.nodes.getIds();
    return allNodeIds.find(id => id.split('@')[0] === name);
}

// Expose findNodeIdByName to window object
window.findNodeIdByName = findNodeIdByName;

// Export the module
export {
    network,
    layoutModeIndex,
    layoutModes,
    createFamilyTrees,
    drawNetwork,
    toggleLayout,
    applyLayoutRotation,
    updateEdgeSmoothing,
    fitView,
    findNodeIdByName
}; 