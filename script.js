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
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loading-indicator';
    loadingIndicator.innerHTML = '<div class="spinner"></div><p>Loading data...</p>';
    document.body.appendChild(loadingIndicator);
    
    let rawInput = document.getElementById('input').value.trim();
    let input;
    let additionalData = new Map();

    try {
        // Handle Google Sheets input
        if (rawInput.startsWith("http") && rawInput.includes("docs.google.com")) {
            try {
                const result = await fetchGoogleSheetsData(rawInput);
                if (!result.success) {
                    throw new Error(result.errorMessage);
                }
                
                input = result.parsedData.map(p => p.name).join("\n");
                
                // Store additional data in the Map
                result.parsedData.forEach(person => {
                    additionalData.set(person.name, {
                        birthDate: person.birthDate,
                        endDate: person.endDate,
                        picture: person.picture
                    });
                });
            } catch (e) {
                showErrorNotification(e.message);
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
    } finally {
        // Remove loading indicator regardless of success/failure
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
    }
}

// Helper function: Convert Google Sheets URL to CSV export URL
function convertSheetUrlToCsvUrl(url) {
    // Parse out the spreadsheet ID and gid from the URL
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=(\d+)/);
    
    if (!sheetIdMatch) {
        throw new Error("Invalid Google Sheets URL format. Expected format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...");
    }
    
    const spreadsheetId = sheetIdMatch[1];
    const gid = gidMatch ? gidMatch[1] : '0';
    
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}&gid=${gid}`;
}

/**
 * Fetches and parses data from a Google Sheet URL
 * @param {string} url - The Google Sheets URL
 * @returns {Promise<Object>} - Object containing success status, parsed data, and error message if any
 */
async function fetchGoogleSheetsData(url) {
    // Extract the spreadsheet ID
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!sheetIdMatch) {
        return {
            success: false,
            errorMessage: "Invalid Google Sheets URL format. Expected format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/..."
        };
    }
    const spreadsheetId = sheetIdMatch[1];
    const gidMatch = url.match(/gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    
    // Try multiple approaches to get the data
    const methods = [
        tryGoogleSheetsAPI,
        tryPublicJsonApi,
        tryCorsProxies
    ];
    
    for (const method of methods) {
        try {
            const result = await method(spreadsheetId, gid);
            if (result && result.success) {
                return result;
            }
        } catch (error) {
            console.log(`Method failed: ${error.message}`);
            // Continue to next method
        }
    }
    
    // If all methods failed
    return {
        success: false,
        errorMessage: `Unable to access Google Sheet. Please ensure:
        1. The sheet is publicly accessible (Anyone with the link can view)
        2. Your sheet has a column titled exactly "Full Names"
        3. You're connected to the internet`
    };
}

/**
 * Try to use the Google Sheets API to fetch the data
 */
async function tryGoogleSheetsAPI(spreadsheetId, gid) {
    try {
        // Use the Google Visualization API which has less CORS restrictions
        const apiUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${gid}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const csvData = await response.text();
        const parsedData = parseCsvForFullNames(csvData);
        
        if (parsedData.length === 0) {
            throw new Error("No valid data found");
        }
        
        return {
            success: true,
            parsedData
        };
    } catch (error) {
        console.log("Google Sheets API approach failed:", error);
        throw error;
    }
}

/**
 * Try to use public APIs that allow CORS
 */
async function tryPublicJsonApi(spreadsheetId, gid) {
    try {
        // Try using the sheetdb.io API which handles CORS
        const apiUrl = `https://opensheet.elk.sh/${spreadsheetId}/${gid}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const jsonData = await response.json();
        
        if (!jsonData || !Array.isArray(jsonData) || jsonData.length === 0) {
            throw new Error("No data returned from API");
        }
        
        // Convert JSON to expected format
        const parsedData = jsonData.map(row => {
            // Find the "Full Names" or equivalent field
            const fullNameKey = Object.keys(row).find(key => 
                key.toLowerCase().includes("full") && key.toLowerCase().includes("name"));
            
            const birthDateKey = Object.keys(row).find(key => 
                key.toLowerCase().includes("birth") && key.toLowerCase().includes("date"));
            
            const endDateKey = Object.keys(row).find(key => 
                (key.toLowerCase().includes("end") || key.toLowerCase().includes("death")) && 
                key.toLowerCase().includes("date"));
            
            const pictureKey = Object.keys(row).find(key => 
                key.toLowerCase().includes("picture") || key.toLowerCase().includes("photo"));
            
            const rootNameKey = Object.keys(row).find(key => 
                key.toLowerCase().includes("root") && key.toLowerCase().includes("name"));
                
            if (!fullNameKey || !row[fullNameKey]) {
                return null;
            }
            
            return {
                name: row[fullNameKey],
                birthDate: birthDateKey ? row[birthDateKey] : null,
                endDate: endDateKey ? row[endDateKey] : null,
                picture: pictureKey ? row[pictureKey] : null,
                rootName: rootNameKey ? row[rootNameKey] : null
            };
        }).filter(Boolean); // Remove null entries
        
        if (parsedData.length === 0) {
            throw new Error("No valid entries found after parsing");
        }
        
        return {
            success: true,
            parsedData
        };
    } catch (error) {
        console.log("Public JSON API approach failed:", error);
        throw error;
    }
}

/**
 * Try various CORS proxies as a last resort
 */
async function tryCorsProxies(spreadsheetId, gid) {
    const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}&gid=${gid}`;
    
    // List of available CORS proxies to try
    const corsProxies = [
        "https://api.allorigins.win/raw?url=",
        "https://corsproxy.io/?",
        "https://bypass-cors.herokuapp.com/",
        "https://cors-anywhere.herokuapp.com/",
        "https://crossorigin.me/"
    ];
    
    // Try each proxy until one works
    for (const proxy of corsProxies) {
        try {
            const proxyUrl = `${proxy}${encodeURIComponent(csvUrl)}`;
            const response = await fetch(proxyUrl);
            
            if (!response.ok) {
                throw new Error(`Proxy returned status: ${response.status}`);
            }
            
            const csvData = await response.text();
            const parsedData = parseCsvForFullNames(csvData);
            
            if (parsedData.length === 0) {
                throw new Error("No valid data found");
            }
            
            return {
                success: true,
                parsedData
            };
        } catch (error) {
            console.log(`Proxy ${proxy} failed:`, error);
            // Continue to next proxy
        }
    }
    
    throw new Error("All CORS proxies failed");
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
    
    // Validate required columns exist
    if (columnIndices.fullName === -1) {
        throw new Error("Required column 'Full Names' not found in the spreadsheet");
    }

    // Process each line
    const peopleData = [];
    for (let i = 1; i < lines.length; i++) {
        // Handle quoted CSV values correctly
        let cols = [];
        let inQuote = false;
        let currentCol = '';
        let line = lines[i];
        
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            
            if (char === '"' && (j === 0 || line[j-1] !== '\\')) {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                cols.push(currentCol.trim());
                currentCol = '';
            } else {
                currentCol += char;
            }
        }
        
        // Add the last column
        cols.push(currentCol.trim());
        
        if (cols[columnIndices.fullName]) {
            const person = {
                name: cols[columnIndices.fullName].replace(/^"|"$/g, ''), // Remove surrounding quotes
                birthDate: columnIndices.birthDate >= 0 ? cols[columnIndices.birthDate].replace(/^"|"$/g, '') : null,
                endDate: columnIndices.endDate >= 0 ? cols[columnIndices.endDate].replace(/^"|"$/g, '') : null,
                picture: null, // We can't get embedded images from CSV
                rootName: columnIndices.rootName >= 0 ? cols[columnIndices.rootName].replace(/^"|"$/g, '') : null
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

    // Get all required DOM elements
    const elements = {
        rootName: document.getElementById('root-name'),
        birthDate: document.getElementById('birth-date'),
        age: document.getElementById('age'),
        endDate: document.getElementById('end-date'),
        personImg: document.getElementById('person-image'),
        personName: document.getElementById('person-name'),
        detailsPanel: document.getElementById('details-panel')
    };

    // Check if all elements exist
    for (const element of Object.values(elements)) {
        if (!element) {
            console.error('Missing required DOM element in details panel');
            return;
        }
    }

    // Update root name
    elements.rootName.textContent = person.rootName || 'N/A';
    elements.rootName.style.cursor = 'pointer';
    elements.rootName.style.color = 'var(--primary)';
    elements.rootName.style.textDecoration = 'underline';
    elements.rootName.onclick = () => {
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

    // Update person details
    elements.birthDate.textContent = person.birthDate || 'N/A';
    elements.age.textContent = calculateAge(person.birthDate, person.endDate);
    elements.endDate.textContent = person.endDate || 'N/A';

    // Update person image and name
    if (person.picture) {
        elements.personImg.src = person.picture;
        elements.personImg.onerror = () => {
            elements.personImg.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        };
    } else {
        elements.personImg.src = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
    }

    elements.personName.textContent = person.name || 'N/A';
    elements.personName.style.cursor = 'pointer';
    elements.personName.style.color = 'var(--primary)';

    elements.personName.onclick = () => {
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

    // Show the panel
    elements.detailsPanel.classList.add('open');
}

function closeDetailsPanel() {
    document.getElementById('details-panel').classList.remove('open');
}

/**
 * Displays a user-friendly error notification
 * @param {string} message - The error message to display
 */
function showErrorNotification(message) {
    // Remove any existing notifications
    const existingNotification = document.getElementById('error-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'error-notification';
    notification.className = 'notification error';
    
    // Add heading and message
    const heading = document.createElement('h3');
    heading.textContent = 'Error';
    
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.className = 'close-notification';
    closeButton.onclick = function() {
        notification.remove();
    };
    
    // Add help text for Google Sheets errors
    if (message.includes('Google Sheet')) {
        const helpText = document.createElement('div');
        helpText.className = 'help-text';
        helpText.innerHTML = `
            <p><strong>Troubleshooting:</strong></p>
            <ol>
                <li>Ensure your Google Sheet is publicly shared (Anyone with the link can view)</li>
                <li>Verify your sheet has a column titled exactly "Full Names"</li>
                <li>Try using a different browser or clearing your cache</li>
            </ol>
        `;
        notification.appendChild(helpText);
    }
    
    // Assemble and add to document
    notification.appendChild(closeButton);
    notification.appendChild(heading);
    notification.appendChild(messageElement);
    
    document.body.appendChild(notification);
    
    // Auto-remove after 15 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
        }
    }, 15000);
}