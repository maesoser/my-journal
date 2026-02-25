const chatContainer = document.getElementById('chat-container');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const finalizeBtn = document.getElementById('finalize-btn');
const tabJournal = document.getElementById('tab-journal');
const tabArchive = document.getElementById('tab-archive');
const journalView = document.getElementById('journal-view');
const archiveView = document.getElementById('archive-view');
const archiveList = document.getElementById('archive-list');
const archiveContent = document.getElementById('archive-content');
const sessionIdEl = document.getElementById('session-id');

let messages = [];

let toastContainer = document.getElementById('toast-container');
if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 200);
    }, duration);
}

const today = new Date().toISOString().split('T')[0];
sessionIdEl.textContent = 'Session: ' + today;

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message w-full flex ' + (isUser ? 'justify-end' : 'justify-start');
    
    const label = isUser ? 'You' : 'Journal AI';
    const labelClass = isUser ? 'text-right' : 'text-left';
    
    const bubbleClass = isUser 
    ? 'bg-black text-white border border-black' 
    : 'bg-[#F9FAFB] text-[#212934] border border-[#D1D5DB]';
    
    messageDiv.innerHTML = `
    <div class="flex flex-col gap-1 max-w-[85%] ${isUser ? 'items-end' : 'items-start'}">
        <span class="text-xs font-semibold text-gray-900 uppercase ${labelClass}">${label}</span>
        <div class="${bubbleClass} p-3 rounded-[4px] text-[14px] leading-relaxed shadow-sm">
        ${escapeHtml(content)}
        </div>
    </div>
    `;
    
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'message w-full flex justify-start';
    typingDiv.innerHTML = `
    <div class="flex flex-col gap-1 max-w-[85%] items-start">
        <span class="text-xs font-semibold text-gray-900 uppercase">Journal AI</span>
        <div class="bg-[#F9FAFB] border border-[#D1D5DB] p-4 rounded-[4px] inline-flex gap-1.5 items-center h-[46px]">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        </div>
    </div>
    `;
    chatContainer.appendChild(typingDiv);
    scrollToBottom();
}

function hideTypingIndicator() {
    const typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) {
    typingDiv.remove();
    }
}

async function sendMessage(content) {
    if (!content.trim()) return;

    addMessage(content, true);
    messages.push({ role: 'user', content });
    
    userInput.value = '';
    userInput.style.height = 'auto';
    userInput.disabled = true;
    sendBtn.disabled = true;
    
    showTypingIndicator();

    try {
    const response = await fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
    });

    const data = await response.json();
    
    hideTypingIndicator();

    if (data.error) {
        addMessage('Error: ' + data.error, false);
    } else {
        addMessage(data.reply, false);
        messages.push({ role: 'assistant', content: data.reply });
    }
    } catch (error) {
    hideTypingIndicator();
    addMessage('Connection error. Please try again.', false);
    } finally {
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
    }
}

async function finalizeDay() {
    //if (!confirm('This will synthesize today\'s journal and save it to the archive. Continue?')) {
    //return;
    //}

    finalizeBtn.disabled = true;
    finalizeBtn.textContent = 'Processing...';

    try {
    const response = await fetch('/finalize', { method: 'POST' });
    const data = await response.json();

    if (data.error) {
        showToast('Error: ' + data.error, 'error');
    } else {
        showToast('Journal saved for ' + data.date, 'success');
        messages = [];
        chatContainer.innerHTML = `
        <div class="message w-full">
            <div class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-gray-900 uppercase">System</span>
            <div class="bg-[#F9FAFB] border border-[#D1D5DB] p-3 rounded-[4px] text-[#212934] text-[14px] leading-relaxed max-w-[85%]">
                Journal finalized! Start a new entry whenever you're ready.
            </div>
            </div>
        </div>
        `;
    }
    } catch (error) {
    showToast('Connection error. Please try again.', 'error');
    } finally {
    finalizeBtn.disabled = false;
    finalizeBtn.textContent = 'Save';
    }
}

async function loadArchive() {
    try {
    const response = await fetch('/archive');
    const data = await response.json();

    if (data.archives && data.archives.length > 0) {
        archiveList.innerHTML = data.archives
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(a => `
            <div class="archive-item p-4" data-date="${a.date}">
            <div class="text-sm font-medium">${a.date}</div>
            <div class="text-xs text-gray-500">${(a.size / 1024).toFixed(1)} KB</div>
            </div>
        `).join('');

        document.querySelectorAll('.archive-item').forEach(item => {
        item.addEventListener('click', () => loadArchiveEntry(item.dataset.date));
        });
    } else {
        archiveList.innerHTML = '<div class="p-4 text-sm text-gray-500">No entries yet</div>';
    }
    } catch (error) {
    archiveList.innerHTML = '<div class="p-4 text-sm text-red-500">Error loading archive</div>';
    }
}

let currentArchiveDate = null;

async function loadArchiveEntry(date) {
    currentArchiveDate = date;
    
    document.querySelectorAll('.archive-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.date === date);
    });

    archiveContent.innerHTML = '<div class="text-gray-500">Loading...</div>';
    
    // Show action buttons and update date label
    const archiveActions = document.getElementById('archive-actions');
    const archiveDateLabel = document.getElementById('archive-date-label');
    archiveActions.classList.remove('hidden');
    archiveDateLabel.textContent = date;

    try {
    const response = await fetch('/archive/entry?date=' + date);
    const data = await response.json();

    if (data.error) {
        archiveContent.innerHTML = '<div class="text-red-500">' + data.error + '</div>';
    } else {
        archiveContent.innerHTML = marked.parse(data.content);
    }
    } catch (error) {
    archiveContent.innerHTML = '<div class="text-red-500">Error loading entry</div>';
    }
}

function switchTab(tab) {
    if (tab === 'journal') {
    tabJournal.className = 'tab-active px-6 py-3 text-sm font-semibold';
    tabArchive.className = 'tab-inactive px-6 py-3 text-sm font-semibold';
    journalView.classList.remove('hidden');
    archiveView.classList.add('hidden');
    } else {
    tabJournal.className = 'tab-inactive px-6 py-3 text-sm font-semibold';
    tabArchive.className = 'tab-active px-6 py-3 text-sm font-semibold';
    journalView.classList.add('hidden');
    archiveView.classList.remove('hidden');
    loadArchive();
    }
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(userInput.value);
});

// Auto-resize textarea and handle Enter/Shift+Enter
userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + 'px';
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (userInput.value.trim()) {
            sendMessage(userInput.value);
        }
    }
});

finalizeBtn.addEventListener('click', finalizeDay);
tabJournal.addEventListener('click', () => switchTab('journal'));
tabArchive.addEventListener('click', () => switchTab('archive'));

const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const archiveSidebar = document.getElementById('archive-sidebar');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');

let searchTimeout = null;
let isSearchMode = false;

toggleSidebarBtn.addEventListener('click', () => {
    archiveSidebar.classList.toggle('collapsed');
});

// Search functionality
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    // Show/hide clear button
    clearSearchBtn.classList.toggle('hidden', query.length === 0);
    
    // Debounce search
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (query.length === 0) {
        // Clear search, show normal archive list
        isSearchMode = false;
        loadArchive();
        return;
    }
    
    if (query.length < 2) {
        // Too short, wait for more input
        return;
    }
    
    searchTimeout = setTimeout(() => searchJournals(query), 300);
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    isSearchMode = false;
    loadArchive();
    searchInput.focus();
});

async function searchJournals(query) {
    isSearchMode = true;
    archiveList.innerHTML = '<div class="p-4 text-sm text-gray-500">Searching...</div>';
    
    try {
        const response = await fetch('/search?q=' + encodeURIComponent(query));
        const data = await response.json();
        
        if (data.error) {
            archiveList.innerHTML = `<div class="p-4 text-sm text-red-500">${data.error}</div>`;
            return;
        }
        
        if (data.results && data.results.length > 0) {
            archiveList.innerHTML = data.results.map(r => `
                <div class="archive-item search-result p-4" data-date="${r.date}">
                    <div class="text-sm font-medium">${r.date}</div>
                    <div class="text-xs text-gray-600 mt-1 search-snippet">${r.snippet}</div>
                </div>
            `).join('');
            
            document.querySelectorAll('.archive-item').forEach(item => {
                item.addEventListener('click', () => loadArchiveEntry(item.dataset.date));
            });
        } else {
            archiveList.innerHTML = '<div class="p-4 text-sm text-gray-500">No results found</div>';
        }
    } catch (error) {
        archiveList.innerHTML = '<div class="p-4 text-sm text-red-500">Search failed</div>';
    }
}

// Download button handler
const downloadBtn = document.getElementById('download-btn');
downloadBtn.addEventListener('click', () => {
    if (currentArchiveDate) {
        window.location.href = '/archive/download?date=' + currentArchiveDate;
    }
});

// Upload button handler
const uploadInput = document.getElementById('upload-input');
uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentArchiveDate) return;
    
    const content = await file.text();
    
    try {
        const response = await fetch('/archive/upload?date=' + currentArchiveDate, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: content,
        });
        const data = await response.json();
        
        if (data.error) {
            showToast('Error: ' + data.error, 'error');
        } else {
            showToast('Journal uploaded successfully', 'success');
            loadArchiveEntry(currentArchiveDate);
            loadArchive();
        }
    } catch (error) {
        showToast('Upload failed', 'error');
    }
    
    // Reset input so same file can be uploaded again
    uploadInput.value = '';
});

// Edit mode functionality
const editBtn = document.getElementById('edit-btn');
const saveEditBtn = document.getElementById('save-edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const viewModeActions = document.getElementById('view-mode-actions');
const editModeActions = document.getElementById('edit-mode-actions');

let isEditMode = false;
let hasUnsavedChanges = false;
let originalContent = '';
let currentRawContent = '';

// Store raw content when loading an entry
const originalLoadArchiveEntry = loadArchiveEntry;
loadArchiveEntry = async function(date) {
    // Exit edit mode if switching entries
    if (isEditMode && hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
    }
    exitEditMode();
    
    currentArchiveDate = date;
    
    document.querySelectorAll('.archive-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.date === date);
    });

    archiveContent.innerHTML = '<div class="text-gray-500">Loading...</div>';
    
    const archiveActions = document.getElementById('archive-actions');
    const archiveDateLabel = document.getElementById('archive-date-label');
    archiveActions.classList.remove('hidden');
    archiveDateLabel.textContent = date;

    try {
        const response = await fetch('/archive/entry?date=' + date);
        const data = await response.json();

        if (data.error) {
            archiveContent.innerHTML = '<div class="text-red-500">' + data.error + '</div>';
            currentRawContent = '';
        } else {
            currentRawContent = data.content;
            archiveContent.innerHTML = marked.parse(data.content);
        }
    } catch (error) {
        archiveContent.innerHTML = '<div class="text-red-500">Error loading entry</div>';
        currentRawContent = '';
    }
};

function enterEditMode() {
    if (!currentArchiveDate || !currentRawContent) return;
    
    isEditMode = true;
    hasUnsavedChanges = false;
    originalContent = currentRawContent;
    
    // Switch action buttons
    viewModeActions.classList.add('hidden');
    editModeActions.classList.remove('hidden');
    
    // Replace content with textarea
    archiveContent.innerHTML = `<textarea id="edit-textarea" class="edit-textarea">${escapeHtml(currentRawContent)}</textarea>`;
    
    const textarea = document.getElementById('edit-textarea');
    textarea.focus();
    
    // Track changes
    textarea.addEventListener('input', () => {
        hasUnsavedChanges = textarea.value !== originalContent;
    });
}

function exitEditMode() {
    isEditMode = false;
    hasUnsavedChanges = false;
    originalContent = '';
    
    // Switch action buttons
    viewModeActions.classList.remove('hidden');
    editModeActions.classList.add('hidden');
}

async function saveEdit() {
    const textarea = document.getElementById('edit-textarea');
    if (!textarea || !currentArchiveDate) return;
    
    const content = textarea.value;
    
    if (!content.trim()) {
        showToast('Content cannot be empty', 'error');
        return;
    }
    
    saveEditBtn.disabled = true;
    cancelEditBtn.disabled = true;
    
    try {
        const response = await fetch('/archive/upload?date=' + currentArchiveDate, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: content,
        });
        const data = await response.json();
        
        if (data.error) {
            showToast('Error: ' + data.error, 'error');
        } else {
            showToast('Changes saved', 'success');
            currentRawContent = content;
            hasUnsavedChanges = false;
            exitEditMode();
            archiveContent.innerHTML = marked.parse(content);
            loadArchive(); // Refresh list (size may have changed)
        }
    } catch (error) {
        showToast('Save failed', 'error');
    } finally {
        saveEditBtn.disabled = false;
        cancelEditBtn.disabled = false;
    }
}

function cancelEdit() {
    if (hasUnsavedChanges) {
        if (!confirm('Discard unsaved changes?')) {
            return;
        }
    }
    
    exitEditMode();
    archiveContent.innerHTML = marked.parse(currentRawContent);
}

editBtn.addEventListener('click', enterEditMode);
saveEditBtn.addEventListener('click', saveEdit);
cancelEditBtn.addEventListener('click', cancelEdit);

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// Handle tab switching with unsaved changes
const originalSwitchTab = switchTab;
switchTab = function(tab) {
    if (isEditMode && hasUnsavedChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
        exitEditMode();
    }
    originalSwitchTab(tab);
};

lucide.createIcons();

async function loadMessages() {
    try {
        const response = await fetch('/messages');
        const data = await response.json();
        
        if (data.messages && data.messages.length > 0) {
            chatContainer.innerHTML = '';
            
            data.messages.forEach(msg => {
                addMessage(msg.content, msg.role === 'user');
                messages.push({ role: msg.role, content: msg.content });
            });
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

loadMessages();
userInput.focus();

// Register service worker for PWA support
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
            console.log('SW registered:', registration.scope);
        })
        .catch((error) => {
            console.error('SW registration failed:', error);
        });
}