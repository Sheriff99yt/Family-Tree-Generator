let peopleData = new Map();
let isDarkMode = true;
let network;
let fuse;
let layoutModeIndex = 0;
const layoutModes = ["up-to-down", "down-to-up", "left-to-right", "right-to-left"];
let currentNodeId = null;

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    if (network) network.redraw();
}

// Updated generateTree to support Google Sheets link input
async function generateTree() {
    let rawInput = document.getElementById('input').value.trim();
    let input;
    let additionalData = new Map();

    // Handle Google Sheets input
    if (rawInput.startsWith("http") && rawInput.includes("docs.google.com")) {
        const csvUrl = convertSheetUrlToCsvUrl(rawInput);
        try {
            const csvData = await fetch(csvUrl).then(res => res.text());
            const parsedData = parseCsvForFullNames(csvData);
            input = parsedData.map(p => p.name).join("\n");
            
            // Store additional data in the Map
            parsedData.forEach(person => {
                additionalData.set(person.name, {
                    birthDate: person.birthDate,
                    endDate: person.endDate,
                    picture: person.picture
                    // Don't store rootName from spreadsheet as we'll calculate it
                });
            });
        } catch (e) {
            alert("Failed to fetch Google Sheet data");
            return;
        }
    } else {
        input = rawInput;
    }
    
    // Start processing tree with the (possibly modified) input
    peopleData.clear();
    const spouseRelations = new Set();
    const mothers = new Set();

    input.split('\n').forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.includes('+')) {
            const [left, right] = line.split('+').map(s => s.trim());
            processSpouses(peopleData, spouseRelations, left, right, mothers);
        } else {
            processChild(peopleData, line, mothers);
        }
    });

    // Add the additional data to the peopleData entries
    additionalData.forEach((data, name) => {
        if (peopleData.has(name)) {
            const person = peopleData.get(name);
            person.birthDate = data.birthDate;
            person.endDate = data.endDate;
            person.picture = data.picture;
            // Root name is already set by buildAncestryChain
        }
    });

    peopleData.forEach(person => {
        person.children.forEach(child => {
            person.spouses.forEach(spouse => {
                const spouseNode = peopleData.get(spouse);
                if (spouseNode && !spouseNode.children.includes(child)) {
                    spouseNode.children.push(child);
                }
            });
        });
    });

    const { nodes, edges } = createFamilyTrees(peopleData, mothers);
    drawNetwork(nodes, edges, mothers);

    const peopleList = Array.from(peopleData.values()).map(p => ({ name: p.name, displayName: p.displayName }));
    fuse = new Fuse(peopleList, {
        keys: ['name'],
        threshold: 0.4,
        includeScore: true,
        shouldSort: true,
    });
    setupSearch();

    // Retract the panel after generating the tree:
    const sidebar = document.querySelector('.sidebar');
    const mobileToggle = document.querySelector('.mobile-toggle');
    sidebar.classList.remove('open');
    mobileToggle.classList.remove('open');

    // Update edge smoothing based on current layout mode
    updateEdgeSmoothing();

    // Apply the last selected layout rotation
    applyLayoutRotation();
}

// Helper function: Convert Google Sheets URL to CSV export URL
function convertSheetUrlToCsvUrl(url) {
    // Example link: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=SHEET_ID
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=(\d+)/);
    if (!sheetIdMatch) return url;
    const spreadsheetId = sheetIdMatch[1];
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}&gid=${gid}`;
}

// Helper function: Parse CSV and extract names from the "Full Names" column
function parseCsvForFullNames(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    // Parse headers and find required column indices
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const columnIndices = {
        fullName: headers.findIndex(h => h === "full names"),
        birthDate: headers.findIndex(h => h === "birth date"),
        endDate: headers.findIndex(h => h === "end date"),
        picture: headers.findIndex(h => h === "person picture"),
        rootName: headers.findIndex(h => h === "root name")
    };

    // Process each line
    const peopleData = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(col => col.trim());
        if (cols[columnIndices.fullName]) {
            const person = {
                name: cols[columnIndices.fullName],
                birthDate: columnIndices.birthDate >= 0 ? cols[columnIndices.birthDate] : null,
                endDate: columnIndices.endDate >= 0 ? cols[columnIndices.endDate] : null,
                picture: null, // We can't get embedded images from CSV
                rootName: columnIndices.rootName >= 0 ? cols[columnIndices.rootName] : null
            };
            peopleData.push(person);
        }
    }
    return peopleData;
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mobileToggle = document.querySelector('.mobile-toggle');
    
    sidebar.classList.toggle('open');
    mobileToggle.classList.toggle('open');
}

// Touch event handlers
let touchStartX = 0;
const swipeThreshold = 50;

document.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
});

document.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX;
    
    if (Math.abs(deltaX) > swipeThreshold && window.innerWidth < 768) {
        if (deltaX < 0) {
            document.querySelector('.sidebar').classList.remove('open');
            document.querySelector('.mobile-toggle').classList.remove('open');
        }
    }
});

// Updated toggleLayout function to update edge smoothing based on layout mode
function toggleLayout() {
    // Cycle mode
    layoutModeIndex = (layoutModeIndex + 1) % layoutModes.length;
    const mode = layoutModes[layoutModeIndex];
    
    // Determine rotation angle in radians
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
    
    // Swap edge smoothing: use "horizontal" for vertical modes and vice-versa
    const edgeType = (mode === "up-to-down" || mode === "down-to-up") ? "horizontal" : "vertical";
    network.setOptions({ edges: { smooth: { type: edgeType, roundness: 0.5 } } });
    
    // Recalculate original positions using calculateCustomPositions
    const positions = calculateCustomPositions(network.body.data.nodes.get(), network.body.data.edges.get());
    
    // Apply rotation to each position
    const rotatedPositions = new Map();
    let xs = [];
    positions.forEach((pos, id) => {
        const newX = pos.x * Math.cos(angle) - pos.y * Math.sin(angle);
        const newY = pos.x * Math.sin(angle) + pos.y * Math.cos(angle);
        rotatedPositions.set(id, { x: newX, y: newY });
        xs.push(newX);
    });
    // Recenter horizontally based on rotated positions
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const centerOffset = -((minX + maxX) / 2);
    rotatedPositions.forEach(pos => { pos.x += centerOffset; });
    
    // Update positions in the network
    network.body.data.nodes.update(
        Array.from(rotatedPositions.entries()).map(([id, pos]) => ({ id, x: pos.x, y: pos.y }))
    );
}

function clearAll() {
    document.getElementById('input').value = '';
    if (network) network.destroy();
    peopleData.clear();
    fuse = null;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchResults').style.display = 'none';
}

function fitView() {
    if (network) network.fit({
        animation: {
            duration: 1000,
            easingFunction: 'easeInOutQuad'
        }
    });
}

function processSpouses(people, spouseRelations, left, right, mothers) {
    addPersonWithAncestry(people, left);
    addPersonWithAncestry(people, right);

    const key = [left, right].sort().join('+');
    if (!spouseRelations.has(key)) {
        people.get(left).spouses.add(right);
        people.get(right).spouses.add(left);
        spouseRelations.add(key);
        mothers.add(right);
    }
}

function processChild(people, child, mothers) {
    addPersonWithAncestry(people, child);
    const potentialParent = findExistingParent(people, child, mothers);
    if (potentialParent) {
        linkParentChild(people, potentialParent, child);
    }
}

function addPersonWithAncestry(people, name) {
    if (!people.has(name)) {
        const displayName = name.split(' ').slice(0, 2).join(' ');
        people.set(name, createPerson(name, displayName));
        buildAncestryChain(people, name);
    }
}

function buildAncestryChain(people, name) {
    let current = name;
    let rootName = name; // Track the root ancestor

    while (true) {
        const parentName = extractParentName(current);
        if (!parentName) break;

        if (!people.has(parentName)) {
            const parentDisplayName = parentName.split(' ').slice(0, 2).join(' ');
            people.set(parentName, createPerson(parentName, parentDisplayName));
        }

        linkParentChild(people, parentName, current);
        current = parentName;
        rootName = parentName; // Update root name to the current ancestor
    }

    // Set the root name for the original person
    const person = people.get(name);
    person.rootName = rootName;
}

function createPerson(name, displayName) {
    return {
        name: name,
        displayName: displayName,
        parents: [],
        spouses: new Set(),
        children: [],
        processed: false,
        rootName: name // Initialize with own name, will be updated if there's an ancestor
    };
}

function linkParentChild(people, parent, child) {
    const childObj = people.get(child);
    if (!childObj.parents.includes(parent)) {
        childObj.parents.push(parent);
    }
    const parentObj = people.get(parent);
    if (!parentObj.children.includes(child)) {
        parentObj.children.push(child);
    }
}

function extractParentName(name) {
    return name.split(' ').slice(1).join(' ') || null;
}

function findExistingParent(people, child, mothers) {
    const person = people.get(child);
    if (person.parents.length) {
        return person.parents.find(p => mothers.has(p)) || person.parents[0];
    }
    return null;
}

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

function processFamilyTree(root, people, nodes, edges, processedPairs, surname, mothers) {
    processNodeDFS(root, people, nodes, edges, processedPairs, surname, mothers, 0);
}

function processNodeDFS(person, people, nodes, edges, processedPairs, surname, mothers, level) {
    // Set to track processed persons to avoid infinite loops in spouse networks
    const processedInThisChain = new Set();
    processPersonAndSpouseNetwork(person, people, nodes, edges, processedPairs, surname, mothers, level, processedInThisChain);
}

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

function generateFamilyColor(surname) {
    let hash = 0;
    for (let i = 0; i < surname.length; i++) {
        hash = surname.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    // Use pastel colors with better contrast
    return `hsl(${hue}, 55%, 65%)`;
}

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

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value;
        if (!fuse || query.trim() === '') {
            searchResults.innerHTML = '';
            searchResults.style.display = 'none';
            return;
        }
        const results = fuse.search(query);
        displaySearchResults(results);
        searchResults.style.display = results.length > 0 ? 'block' : 'none';
    });

    // Close search results when clicking outside
    document.addEventListener('click', (event) => {
        if (!searchResults.contains(event.target) && !searchInput.contains(event.target)) {
            searchResults.style.display = 'none';
        }
    });
}

function displaySearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    searchResults.innerHTML = '';
    results.slice(0, 10).forEach(result => {
        const item = document.createElement('div');
        item.classList.add('search-result-item');
        item.textContent = result.item.name;
        item.addEventListener('click', () => {
            handleSearchResultClick(result.item.name);
            searchResults.style.display = 'none';
            document.getElementById('searchInput').value = result.item.name;
        });
        searchResults.appendChild(item);
    });
}

function findNodeIdByName(name) {
    if (!network || !network.body || !network.body.data || !network.body.data.nodes) {
        return null;
    }

    const allNodeIds = network.body.data.nodes.getIds();
    return allNodeIds.find(id => id.split('@')[0] === name);
}

function handleSearchResultClick(name) {
    if (!network) return;

    const nodeId = findNodeIdByName(name);
    if (nodeId) {
        network.focus(nodeId, {
            scale: 1.5,
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });
        network.selectNodes([nodeId]);
    }
}

// Utility functions
function getFamilyRoots(people) {
    const surnames = new Set();
    for (const [name] of people) {
        surnames.add(getSurname(name));
    }
    return Array.from(surnames);
}

function getSurname(name) {
    return name.split(' ').pop();
}

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

// New function to apply rotation based on the last selected layout mode
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

// New helper function to update edge smoothing
function updateEdgeSmoothing() {
    const mode = layoutModes[layoutModeIndex];
    // Swap edge smoothing: use "horizontal" for vertical modes and vice-versa
    const edgeType = (mode === "up-to-down" || mode === "down-to-up") ? "horizontal" : "vertical";
    network.setOptions({ edges: { smooth: { type: edgeType, roundness: 0.5 } } });
}

function showWelcome() {
    const overlay = document.getElementById('welcomeOverlay');
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
}

function closeWelcome() {
    const overlay = document.getElementById('welcomeOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

// Initialize welcome card
document.addEventListener('DOMContentLoaded', function() {
    const overlay = document.getElementById('welcomeOverlay');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    
    // Show welcome card on initial load
    showWelcome();
});

function calculateAge(birthDate, endDate) {
    if (!birthDate) return 'N/A';
    
    // Convert date string from "DD-MM-YYYY" to Date object
    const [birthDay, birthMonth, birthYear] = birthDate.split('-').map(num => parseInt(num));
    if (isNaN(birthYear)) return 'N/A';
    
    const birthDateObj = new Date(birthYear, birthMonth - 1, birthDay); // month is 0-based in JS
    
    let endDateObj;
    if (endDate) {
        const [endDay, endMonth, endYear] = endDate.split('-').map(num => parseInt(num));
        if (isNaN(endYear)) return 'N/A';
        endDateObj = new Date(endYear, endMonth - 1, endDay);
    } else {
        endDateObj = new Date(); // Current date for living persons
    }
    
    // Calculate age considering months and days
    let age = endDateObj.getFullYear() - birthDateObj.getFullYear();
    const monthDiff = endDateObj.getMonth() - birthDateObj.getMonth();
    
    // Adjust age if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && endDateObj.getDate() < birthDateObj.getDate())) {
        age--;
    }
    
    if (age < 0) return 'N/A';
    
    if (endDate) {
        return `${age} (deceased)`;
    } else {
        return `${age}`;
    }
}

function showDetailsPanel(nodeId) {
    const person = peopleData.get(nodeId);
    if (!person) return;

    // Update details panel content and make full name clickable
    const fullNameSpan = document.getElementById('full-name');
    
    // Create clickable root name element
    const rootNameSpan = document.getElementById('root-name');
    rootNameSpan.textContent = person.rootName || 'N/A';
    rootNameSpan.style.cursor = 'pointer';
    rootNameSpan.style.color = 'var(--primary)';
    rootNameSpan.style.textDecoration = 'underline';
    rootNameSpan.onclick = () => {
        if (person.rootName) {
            const rootNodeId = findNodeIdByName(person.rootName);
            if (rootNodeId) {
                network.focus(rootNodeId, {
                    scale: 1.5,
                    animation: {
                        duration: 500,
                        easingFunction: 'easeInOutQuad'
                    }
                });
                network.selectNodes([rootNodeId]);
            }
        }
    };

    document.getElementById('birth-date').textContent = person.birthDate || 'N/A';
    document.getElementById('age').textContent = calculateAge(person.birthDate, person.endDate);
    document.getElementById('end-date').textContent = person.endDate || 'N/A';

    // Handle person image and name
    const personImgContainer = document.querySelector('.image-container');
    const personImg = document.getElementById('person-image');
    const personNameSpan = document.getElementById('person-name');
    personImgContainer.style.display = 'block';

    personNameSpan.textContent = person.name || 'N/A';
    personNameSpan.style.cursor = 'pointer';
    personNameSpan.style.color = 'var(--primary)';
    personNameSpan.style.textDecoration = 'underline';
    personNameSpan.onclick = () => {
        const personNodeId = findNodeIdByName(person.name);
        if (personNodeId) {
            network.focus(personNodeId, {
                scale: 1.5,
                animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad'
                }
            });
            network.selectNodes([personNodeId]);
        }
    };

    if (person.picture) {
        personImg.src = person.picture;
        personImg.onerror = () => {
            personImg.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        };
    } else {
        personImg.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    }

    // Show the panel
    document.getElementById('details-panel').classList.add('open');

    document.getElementById('person-name').textContent = person.name || 'N/A';
}

function closeDetailsPanel() {
    document.getElementById('details-panel').classList.remove('open');
}