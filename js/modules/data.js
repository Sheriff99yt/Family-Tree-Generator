/**
 * data.js - Data processing and management module
 * Handles family data structures, relationships, and data processing
 */

// Data storage
let peopleData = new Map();

/**
 * Creates a new person object
 * @param {string} name - Full name of the person
 * @param {string} displayName - Display name (usually first two parts of the name)
 * @returns {Object} Person object
 */
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

/**
 * Process spouse relationships
 * @param {Map} people - Map of people data
 * @param {Set} spouseRelations - Set of spouse relations
 * @param {string} left - First spouse name
 * @param {string} right - Second spouse name
 * @param {Set} mothers - Set of mothers
 */
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

/**
 * Process child relationships
 * @param {Map} people - Map of people data
 * @param {string} child - Child name
 * @param {Set} mothers - Set of mothers
 */
function processChild(people, child, mothers) {
    addPersonWithAncestry(people, child);
    const potentialParent = findExistingParent(people, child, mothers);
    if (potentialParent) {
        linkParentChild(people, potentialParent, child);
    }
}

/**
 * Add a person with their ancestry chain
 * @param {Map} people - Map of people data
 * @param {string} name - Person name
 */
function addPersonWithAncestry(people, name) {
    if (!people.has(name)) {
        const displayName = name.split(' ').slice(0, 2).join(' ');
        people.set(name, createPerson(name, displayName));
        buildAncestryChain(people, name);
    }
}

/**
 * Build ancestry chain for a person
 * @param {Map} people - Map of people data
 * @param {string} name - Person name
 */
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

/**
 * Link parent and child
 * @param {Map} people - Map of people data
 * @param {string} parent - Parent name
 * @param {string} child - Child name
 */
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

/**
 * Extract parent name from child name
 * @param {string} name - Child name
 * @returns {string|null} Parent name or null
 */
function extractParentName(name) {
    return name.split(' ').slice(1).join(' ') || null;
}

/**
 * Find existing parent for a child
 * @param {Map} people - Map of people data
 * @param {string} child - Child name
 * @param {Set} mothers - Set of mothers
 * @returns {string|null} Parent name or null
 */
function findExistingParent(people, child, mothers) {
    const person = people.get(child);
    if (person.parents.length) {
        return person.parents.find(p => mothers.has(p)) || person.parents[0];
    }
    return null;
}

/**
 * Get family roots (surnames)
 * @param {Map} people - Map of people data
 * @returns {Array} Array of surnames
 */
function getFamilyRoots(people) {
    const surnames = new Set();
    for (const [name] of people) {
        surnames.add(getSurname(name));
    }
    return Array.from(surnames);
}

/**
 * Get surname from full name
 * @param {string} name - Full name
 * @returns {string} Surname
 */
function getSurname(name) {
    return name.split(' ').pop();
}

/**
 * Parse CSV data for full names
 * @param {string} csvText - CSV text
 * @returns {Array} Array of person objects
 */
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

/**
 * Convert Google Sheets URL to CSV export URL
 * @param {string} url - Google Sheets URL
 * @returns {string} CSV export URL
 */
function convertSheetUrlToCsvUrl(url) {
    // Example link: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=SHEET_ID
    const sheetIdMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/gid=(\d+)/);
    if (!sheetIdMatch) return url;
    const spreadsheetId = sheetIdMatch[1];
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&id=${spreadsheetId}&gid=${gid}`;
}

/**
 * Calculate age based on birth and end dates
 * @param {string} birthDate - Birth date in DD-MM-YYYY format
 * @param {string} endDate - End date in DD-MM-YYYY format
 * @returns {string} Age string
 */
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

// Export the module
export {
    peopleData,
    createPerson,
    processSpouses,
    processChild,
    addPersonWithAncestry,
    buildAncestryChain,
    linkParentChild,
    extractParentName,
    findExistingParent,
    getFamilyRoots,
    getSurname,
    parseCsvForFullNames,
    convertSheetUrlToCsvUrl,
    calculateAge
}; 