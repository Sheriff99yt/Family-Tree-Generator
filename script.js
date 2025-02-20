let peopleData = new Map();
let isDarkMode = true;
let network;
let fuse;
let layoutMode = 'vertical';

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    if (network) network.redraw();
}

function generateTree() {
    const input = document.getElementById('input').value.trim();
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

function toggleLayout() {
    layoutMode = layoutMode === 'vertical' ? 'horizontal' : 'vertical';
    if (network) {
        const direction = layoutMode === 'vertical' ? 'UD' : 'LR';
        const edgeType = layoutMode === 'vertical' ? 'vertical' : 'horizontal';
        network.setOptions({
            layout: {
                hierarchical: {
                    direction: direction
                }
            },
            edges: {
                smooth: {
                    type: edgeType
                }
            }
        });
    }
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
    while (true) {
        const parentName = extractParentName(current);
        if (!parentName) break;

        if (!people.has(parentName)) {
            const parentDisplayName = parentName.split(' ').slice(0, 2).join(' ');
            people.set(parentName, createPerson(parentName, parentDisplayName));
        }

        linkParentChild(people, parentName, current);
        current = parentName;
    }
}

function createPerson(name, displayName) {
    return {
        name: name,
        displayName: displayName,
        parents: [],
        spouses: new Set(),
        children: [],
        processed: false
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
    const queue = [{ person: root, level: 0 }];
    while (queue.length > 0) {
        const { person, level } = queue.shift();
        addNodeAndConnections(person, level, surname, people, nodes, edges, processedPairs, queue, mothers);
    }
}

function addNodeAndConnections(person, level, surname, people, nodes, edges, processedPairs, queue, mothers) {
    const nodeId = `${person.name}@${surname}`;
    if (!nodes.some(n => n.id === nodeId)) {
        nodes.push(createNode(person, nodeId, level, surname));
    }

    person.spouses.forEach(spouseName => {
        const spouse = people.get(spouseName);
        const spouseId = `${spouse.name}@${surname}`;
        if (!nodes.some(n => n.id === spouseId)) {
            nodes.push(createNode(spouse, spouseId, level, surname));
        }
        addSpouseEdge(nodeId, spouseId, edges, processedPairs);
    });

    person.children.forEach(childName => {
        const child = people.get(childName);
        queue.push({ person: child, level: level + 1 });
        const childId = `${child.name}@${surname}`;
        addParentChildEdge(nodeId, childId, edges, processedPairs, mothers.has(person.name));
    });
}

function createNode(person, nodeId, level, group) {
    const baseColor = stringToColor(group);
    const desaturatedColor = desaturateColor(baseColor, 70);
    return {
        id: nodeId,
        label: person.displayName,
        level: level,
        group: group,
        shape: 'box',
        margin: 10,
        font: { size: 14 },
        color: {
            background: desaturatedColor,
            border: darkenColor(desaturatedColor, 20),
            highlight: {
                background: '#FFFF00',
                border: '#000000'
            }
        }
    };
}

function addSpouseEdge(from, to, edges, processedPairs) {
    const edgePair = [from, to].sort().join('+');
    if (!processedPairs.has(edgePair)) {
        edges.push({
            from: from,
            to: to,
            color: '#FF0000',
            dashes: true,
            width: 2
        });
        processedPairs.add(edgePair);
    }
}

function addParentChildEdge(from, to, edges, processedPairs, isMother) {
    const edgeId = `${from}->${to}`;
    if (!processedPairs.has(edgeId)) {
        edges.push({
            from: from,
            to: to,
            arrows: 'to',
            color: '#2B7CE9'
        });
        processedPairs.add(edgeId);
    }
}

function drawNetwork(nodes, edges) {
    const container = document.getElementById('network');
    if (network) network.destroy();

    network = new vis.Network(container, { nodes, edges }, {
        layout: {
            hierarchical: {
                enabled: true,
                direction: layoutMode === 'vertical' ? 'UD' : 'LR',
                sortMethod: 'directed',
                levelSeparation: 200,
                nodeSpacing: 200,
                treeSpacing: 200
            }
        },
        edges: {
            smooth: {
                type: layoutMode === 'vertical' ? 'vertical' : 'horizontal'
            }
        },
        physics: true,
        interaction: {
            dragNodes: true,
            dragView: true,
            zoomView: true
        }
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
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Make sure we have a positive number and use only the last 6 digits
    const positiveHash = Math.abs(hash) % 16777215; // 16777215 is FFFFFF in decimal
    const color = positiveHash.toString(16);
    // Pad with leading zeros if needed
    return '#' + '0'.repeat(Math.max(0, 6 - color.length)) + color;
}

function desaturateColor(hexColor, percentage) {
    const rgb = hexToRgb(hexColor);
    const gray = (rgb.r + rgb.g + rgb.b) / 3;
    const factor = percentage / 100;
    
    return rgbToHex({
        r: Math.round(rgb.r + (gray - rgb.r) * factor),
        g: Math.round(rgb.g + (gray - rgb.g) * factor),
        b: Math.round(rgb.b + (gray - rgb.b) * factor)
    });
}

function darkenColor(hexColor, percentage) {
    const rgb = hexToRgb(hexColor);
    const factor = (100 - percentage) / 100;
    
    return rgbToHex({
        r: Math.round(rgb.r * factor),
        g: Math.round(rgb.g * factor),
        b: Math.round(rgb.b * factor)
    });
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

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
