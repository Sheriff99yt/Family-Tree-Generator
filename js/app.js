/**
 * app.js - Main application file
 * Imports and coordinates all modules
 */

import { 
    peopleData, 
    processSpouses, 
    processChild, 
    parseCsvForFullNames, 
    convertSheetUrlToCsvUrl 
} from './modules/data.js';

import { 
    createFamilyTrees, 
    drawNetwork, 
    toggleLayout, 
    fitView 
} from './modules/visualization.js';

import { 
    isDarkMode, 
    fuse, 
    toggleDarkMode, 
    toggleSidebar, 
    clearAll, 
    setupSearch, 
    showWelcome, 
    closeWelcome,
    closeDetailsPanel,
    initializeUI 
} from './modules/ui.js';

// Initialize the application
initializeUI();

// Make functions available globally
window.toggleDarkMode = toggleDarkMode;
window.toggleSidebar = toggleSidebar;
window.toggleLayout = toggleLayout;
window.clearAll = clearAll;
window.generateTree = generateTree;
window.fitView = fitView;
window.showWelcome = showWelcome;
window.closeWelcome = closeWelcome;
window.closeDetailsPanel = closeDetailsPanel;

/**
 * Generate the family tree from input
 */
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
    window.fuse = new Fuse(peopleList, {
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
} 