/**
 * ui.js - User Interface module
 * Handles UI interactions, search, and details panel
 */

import { peopleData, calculateAge } from './data.js';

// Global variables
let isDarkMode = true;
let fuse;
let currentNodeId = null;

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    if (window.network) window.network.redraw();
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const mobileToggle = document.querySelector('.mobile-toggle');
    
    sidebar.classList.toggle('open');
    mobileToggle.classList.toggle('open');
}

/**
 * Clear all input and output
 */
function clearAll() {
    document.getElementById('input').value = '';
    if (window.network) window.network.destroy();
    peopleData.clear();
    fuse = null;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchResults').style.display = 'none';
}

/**
 * Set up search functionality
 */
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

/**
 * Display search results
 * @param {Array} results - Search results
 */
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

/**
 * Handle search result click
 * @param {string} name - Person name
 */
function handleSearchResultClick(name) {
    if (!window.network) return;

    const nodeId = window.findNodeIdByName(name);
    if (nodeId) {
        window.network.focus(nodeId, {
            scale: 1.5,
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad'
            }
        });
        window.network.selectNodes([nodeId]);
    }
}

/**
 * Show welcome overlay
 */
function showWelcome() {
    const overlay = document.getElementById('welcomeOverlay');
    overlay.style.display = 'flex';
    overlay.style.opacity = '1';
}

/**
 * Close welcome overlay
 */
function closeWelcome() {
    const overlay = document.getElementById('welcomeOverlay');
    overlay.style.opacity = '0';
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 300);
}

/**
 * Show details panel for a person
 * @param {string} nodeId - Node ID
 */
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

/**
 * Close details panel
 */
function closeDetailsPanel() {
    document.getElementById('details-panel').classList.remove('open');
}

/**
 * Initialize UI event listeners
 */
function initializeUI() {
    // Initialize welcome card
    document.addEventListener('DOMContentLoaded', function() {
        const overlay = document.getElementById('welcomeOverlay');
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        
        // Show welcome card on initial load
        showWelcome();
    });

    // Touch event handlers for mobile
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
}

// Export the module
export {
    isDarkMode,
    fuse,
    toggleDarkMode,
    toggleSidebar,
    clearAll,
    setupSearch,
    showWelcome,
    closeWelcome,
    showDetailsPanel,
    closeDetailsPanel,
    initializeUI
}; 