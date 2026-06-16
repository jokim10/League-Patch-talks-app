// Global state
let releaseNotes = [];
let selectedUpdate = null;
let currentFilter = 'all';
let searchQuery = '';
let cacheTimestamp = 0;
let timeAgoInterval = null;
let patchName = 'Patch Notes';

// DOM Elements
const notesTimeline = document.getElementById('notes-timeline');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const retryBtn = document.getElementById('retry-btn');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const filterPills = document.getElementById('filter-pills');
const feedStatus = document.getElementById('feed-status');

// Composer DOM Elements
const composerEmpty = document.getElementById('composer-empty');
const composerActive = document.getElementById('composer-active');
const originBadge = document.getElementById('origin-badge');
const originDate = document.getElementById('origin-date');
const tweetTextarea = document.getElementById('tweet-textarea');
const charCounter = document.getElementById('char-counter');
const autoShortenBtn = document.getElementById('auto-shorten-btn');
const tweetSubmitBtn = document.getElementById('tweet-submit-btn');
const composerClear = document.getElementById('composer-clear');

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchReleaseNotes();
    setupEventListeners();
});

// Event Listeners Setup
function setupEventListeners() {
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Retry button on error
    retryBtn.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderTimeline();
    });

    // Filter pills event delegation
    filterPills.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('.filter-pill').forEach(pill => {
                pill.classList.remove('active');
            });
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            renderTimeline();
        }
    });

    // Textarea character counter
    tweetTextarea.addEventListener('input', () => {
        updateCharCount();
    });

    // Auto-Fit / Shorten Button
    autoShortenBtn.addEventListener('click', () => {
        autoFitTweet();
    });

    // Post to X Button
    tweetSubmitBtn.addEventListener('click', () => {
        publishTweet();
    });

    // Clear Selection Button
    composerClear.addEventListener('click', () => {
        clearSelection();
    });

    // Export CSV button
    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            exportToCSV();
        });
    }

    // Theme toggle button
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            toggleTheme();
        });
    }
}

// Fetch notes from Flask API
async function fetchReleaseNotes(force = false) {
    showLoading();
    setRefreshingState(true);
    
    try {
        const url = `/api/notes${force ? '?force=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success' || result.status === 'warning') {
            releaseNotes = result.data;
            patchName = result.patch_name || 'Patch Notes';
            cacheTimestamp = result.timestamp;
            
            if (result.status === 'warning') {
                console.warn(result.message);
            }
            
            renderFilterPills();
            updateStatusIndicator(result.source);
            startStatusTimer();
            renderTimeline();
        } else {
            throw new Error(result.message || 'Unknown error occurred');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showError(error.message);
    } finally {
        setRefreshingState(false);
    }
}

// Render Filter Pills dynamically
function renderFilterPills() {
    const categories = new Set();
    releaseNotes.forEach(entry => {
        entry.updates.forEach(update => {
            if (update.type) {
                categories.add(update.type);
            }
        });
    });

    const labelMap = {
        "Champions": "Champions",
        "Systems": "Systems",
        "ARAM: Mayhem": "ARAM",
        "Arena": "Arena",
        "Bugfixes & QoL Changes": "Bugfixes",
        "Upcoming Skins & Chromas": "Skins",
        "Patch Highlights": "Highlights",
        "Normal Draft Queue Availability": "Draft Queue",
        "Apex Duo Restrictions": "Apex Duos",
        "Honor in Social Panel": "Honor"
    };

    filterPills.innerHTML = '<button class="filter-pill active" data-filter="all">All Updates</button>';
    
    categories.forEach(cat => {
        const displayLabel = labelMap[cat] || cat;
        const filterVal = cat.toLowerCase();
        
        const pill = document.createElement('button');
        pill.className = 'filter-pill';
        if (currentFilter === filterVal) {
            pill.classList.add('active');
            filterPills.querySelector('[data-filter="all"]').classList.remove('active');
        }
        pill.dataset.filter = filterVal;
        pill.textContent = displayLabel;
        filterPills.appendChild(pill);
    });
}

// Render the timeline to the UI
function renderTimeline() {
    notesTimeline.innerHTML = '';
    let visibleEntriesCount = 0;
    
    releaseNotes.forEach(entry => {
        const filteredUpdates = entry.updates.filter(update => {
            const matchesFilter = currentFilter === 'all' || 
                update.type.toLowerCase() === currentFilter;
                
            const matchesSearch = searchQuery === '' || 
                update.title.toLowerCase().includes(searchQuery) ||
                update.type.toLowerCase().includes(searchQuery) ||
                update.content_text.toLowerCase().includes(searchQuery);
                
            return matchesFilter && matchesSearch;
        });

        if (filteredUpdates.length > 0) {
            visibleEntriesCount++;
            
            const dateGroup = document.createElement('div');
            dateGroup.className = 'date-group';
            
            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-header';
            dateHeader.textContent = entry.date;
            dateGroup.appendChild(dateHeader);
            
            const cardsContainer = document.createElement('div');
            cardsContainer.className = 'update-card-container';
            
            filteredUpdates.forEach(update => {
                const card = createUpdateCard(update, entry);
                cardsContainer.appendChild(card);
            });
            
            dateGroup.appendChild(cardsContainer);
            notesTimeline.appendChild(dateGroup);
        }
    });

    hideLoading();
    
    if (visibleEntriesCount === 0) {
        emptyState.classList.remove('hidden');
        notesTimeline.classList.add('hidden');
    } else {
        emptyState.classList.add('hidden');
        notesTimeline.classList.remove('hidden');
    }
}

// Create Card Element
function createUpdateCard(update, entry) {
    const card = document.createElement('div');
    card.className = `update-card ${selectedUpdate && selectedUpdate.id === update.id ? 'active' : ''}`;
    card.dataset.id = update.id;

    const badgeClass = update.type.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
        
    // Status badge (Buffed, Nerfed, Changed)
    let statusBadge = '';
    if (update.status) {
        statusBadge = `<span class="status-badge ${update.status}">${update.emoji} ${update.status.toUpperCase()}</span>`;
    }
    
    card.innerHTML = `
        <div class="card-header">
            <div class="badge-group">
                <span class="type-badge ${badgeClass}">${update.type}</span>
                ${statusBadge}
            </div>
            <div class="card-actions">
                <button class="copy-card-btn" title="Copy changes to clipboard">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 12px; height: 12px; margin-right: 0.2rem;">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                </button>
                <button class="select-btn">
                    <svg viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>${selectedUpdate && selectedUpdate.id === update.id ? 'Selected' : 'Select'}</span>
                </button>
            </div>
        </div>
        <div class="card-body">
            ${update.content_html}
        </div>
    `;

    // Copy to clipboard handler
    const copyBtn = card.querySelector('.copy-card-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent selection trigger
            
            const textToCopy = `${update.emoji || '📢'} LoL ${patchName} - ${update.title} (${update.type}):\n${update.content_text}\n\nRead more: ${update.link}`;
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                copyBtn.classList.add('copied');
                const spanText = copyBtn.querySelector('span');
                if (spanText) spanText.textContent = 'Copied!';
                
                setTimeout(() => {
                    copyBtn.classList.remove('copied');
                    if (spanText) spanText.textContent = 'Copy';
                }, 1500);
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
    }

    card.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' || e.target.closest('a')) {
            return;
        }
        selectUpdate(update, entry);
    });

    return card;
}

// Select update logic
function selectUpdate(update, entry) {
    selectedUpdate = {
        id: update.id,
        type: update.type,
        title: update.title,
        date: entry.date,
        link: update.link,
        content_text: update.content_text,
        status: update.status,
        emoji: update.emoji,
        highlights: update.highlights
    };

    document.querySelectorAll('.update-card').forEach(card => {
        if (card.dataset.id === update.id) {
            card.classList.add('active');
            card.querySelector('.select-btn span').textContent = 'Selected';
        } else {
            card.classList.remove('active');
            const selectText = card.querySelector('.select-btn span');
            if (selectText) selectText.textContent = 'Select';
        }
    });

    composerEmpty.classList.add('hidden');
    composerActive.classList.remove('hidden');

    originBadge.textContent = update.type;
    const badgeClass = update.type.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    originBadge.className = 'origin-badge type-badge ' + badgeClass;
    originDate.textContent = entry.date;

    // Default compose tweet: Full details
    const draftText = `📢 LoL ${patchName} - ${update.title} (${update.type}):\n${update.content_text}\n\nRead more: ${update.link}`;
    tweetTextarea.value = draftText;
    
    updateCharCount();
}

// Clear selected update
function clearSelection() {
    selectedUpdate = null;
    document.querySelectorAll('.update-card').forEach(card => {
        card.classList.remove('active');
        const selectText = card.querySelector('.select-btn span');
        if (selectText) selectText.textContent = 'Select';
    });

    composerActive.classList.add('hidden');
    composerEmpty.classList.remove('hidden');
    tweetTextarea.value = '';
}

// Character counter tracking
function updateCharCount() {
    const len = tweetTextarea.value.length;
    charCounter.textContent = `${len} / 280`;

    charCounter.className = 'char-counter';
    autoShortenBtn.classList.remove('pulse-accent');
    
    if (len > 280) {
        charCounter.classList.add('danger');
        tweetSubmitBtn.disabled = true;
        autoShortenBtn.classList.add('pulse-accent');
    } else if (len > 250) {
        charCounter.classList.add('warning');
        tweetSubmitBtn.disabled = false;
    } else {
        tweetSubmitBtn.disabled = false;
    }
}

// Auto-Fit Truncation & Summarization logic
function autoFitTweet() {
    if (!selectedUpdate) return;

    const type = selectedUpdate.type;
    const title = selectedUpdate.title;
    const link = selectedUpdate.link;
    const emoji = selectedUpdate.emoji || '📢';
    const status = selectedUpdate.status || 'change';
    const highlights = selectedUpdate.highlights;

    // Format: "🟢 LoL Patch 26.12 - Aatrox BUFF:\n[Highlights]\n\nRead more: [Link]"
    const statusText = status.toUpperCase();
    const header = `${emoji} LoL ${patchName} - ${title} ${statusText}:\n`;
    const footer = `\n\nRead more: ${link}`;

    let finalDesc = "";
    
    if (highlights && highlights.trim()) {
        const highlightLines = highlights.split('\n');
        let currentHighlightsText = "";
        
        for (let i = 0; i < highlightLines.length; i++) {
            const candidate = currentHighlightsText + (currentHighlightsText ? "\n" : "") + highlightLines[i];
            const testTweet = header + candidate + footer;
            if (testTweet.length <= 280) {
                currentHighlightsText = candidate;
            } else {
                if (i === 0) {
                    const maxFirstLineLen = 280 - header.length - footer.length - 3;
                    if (maxFirstLineLen > 5) {
                        currentHighlightsText = highlightLines[i].substring(0, maxFirstLineLen) + "...";
                    }
                }
                break;
            }
        }
        finalDesc = currentHighlightsText;
    } else {
        const fullText = selectedUpdate.content_text;
        const maxDescLen = 280 - header.length - footer.length;
        if (fullText.length > maxDescLen) {
            finalDesc = fullText.substring(0, maxDescLen - 3).trim() + "...";
        } else {
            finalDesc = fullText;
        }
    }

    const tweetText = header + finalDesc + footer;
    tweetTextarea.value = tweetText;
    updateCharCount();
}

// Publish/Compose Tweet
function publishTweet() {
    const text = tweetTextarea.value.trim();
    if (text.length === 0) return;
    
    const intentUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intentUrl, '_blank');
}

// State Helper Functions
function showLoading() {
    loadingState.classList.remove('hidden');
    notesTimeline.classList.add('hidden');
    errorState.classList.add('hidden');
    emptyState.classList.add('hidden');
}

// (Remaining helpers are unchanged but rewritten for clean overwrite)
function hideLoading() {
    loadingState.classList.add('hidden');
    notesTimeline.classList.remove('hidden');
}

function showError(message) {
    loadingState.classList.add('hidden');
    notesTimeline.classList.add('hidden');
    emptyState.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorMessage.textContent = message;
}

function setRefreshingState(isRefreshing) {
    if (isRefreshing) {
        refreshBtn.disabled = true;
        refreshBtn.classList.add('spinning');
        refreshBtn.querySelector('span').textContent = 'Refreshing...';
    } else {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('spinning');
        refreshBtn.querySelector('span').textContent = 'Refresh';
    }
}

function updateStatusIndicator(source) {
    const dot = feedStatus.querySelector('.status-dot');
    const label = feedStatus.querySelector('.status-label');
    
    dot.className = 'status-dot';
    
    if (source === 'live') {
        dot.classList.add('green');
        label.textContent = 'Live Feed (Updated)';
    } else {
        dot.classList.add('orange');
        updateTimeAgoLabel();
    }
}

function updateTimeAgoLabel() {
    const label = feedStatus.querySelector('.status-label');
    const diff = Math.floor(Date.now() / 1000 - cacheTimestamp);
    
    if (diff < 60) {
        label.textContent = 'Cached (Just updated)';
    } else if (diff < 3600) {
        const mins = Math.floor(diff / 60);
        label.textContent = `Cached (${mins}m ago)`;
    } else {
        const hours = Math.floor(diff / 3600);
        label.textContent = `Cached (${hours}h ago)`;
    }
}

function startStatusTimer() {
    if (timeAgoInterval) {
        clearInterval(timeAgoInterval);
    }
    
    timeAgoInterval = setInterval(() => {
        updateTimeAgoLabel();
    }, 30000);
}

// Theme Initialization
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    const sunIcon = document.querySelector('.theme-icon.sun');
    const moonIcon = document.querySelector('.theme-icon.moon');
    
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        if (sunIcon && moonIcon) {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    } else {
        document.body.classList.remove('light-mode');
        if (sunIcon && moonIcon) {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    }
}

// Toggle Theme
function toggleTheme() {
    const sunIcon = document.querySelector('.theme-icon.sun');
    const moonIcon = document.querySelector('.theme-icon.moon');
    
    document.body.classList.toggle('light-mode');
    
    if (document.body.classList.contains('light-mode')) {
        localStorage.setItem('theme', 'light');
        if (sunIcon && moonIcon) {
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }
    } else {
        localStorage.setItem('theme', 'dark');
        if (sunIcon && moonIcon) {
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }
    }
}

// Export current filtered dataset to CSV
function exportToCSV() {
    if (releaseNotes.length === 0) return;

    const dataToExport = [];
    releaseNotes.forEach(entry => {
        entry.updates.forEach(update => {
            const matchesFilter = currentFilter === 'all' || 
                update.type.toLowerCase() === currentFilter;
                
            const matchesSearch = searchQuery === '' || 
                update.title.toLowerCase().includes(searchQuery) ||
                update.type.toLowerCase().includes(searchQuery) ||
                update.content_text.toLowerCase().includes(searchQuery);
                
            if (matchesFilter && matchesSearch) {
                dataToExport.push({
                    section: update.type,
                    title: update.title,
                    changes: update.content_text,
                    link: update.link
                });
            }
        });
    });

    if (dataToExport.length === 0) {
        alert("No updates to export matching current filter.");
        return;
    }

    // Build CSV content escaping quotes and handling commas
    const csvRows = ["Section,Title,Changes,Link"];
    dataToExport.forEach(row => {
        const sectionEsc = `"${row.section.replace(/"/g, '""')}"`;
        const titleEsc = `"${row.title.replace(/"/g, '""')}"`;
        const changesEsc = `"${row.changes.replace(/"/g, '""')}"`;
        const linkEsc = `"${row.link.replace(/"/g, '""')}"`;
        csvRows.push(`${sectionEsc},${titleEsc},${changesEsc},${linkEsc}`);
    });

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    const safePatchName = patchName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    link.setAttribute("href", url);
    link.setAttribute("download", `lol_${safePatchName}_notes.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
