/* =============================================================
   Tasks — frontend module
   Loaded after app.js so lucide, marked, showToast are available
   ============================================================= */

'use strict';

// ── State ────────────────────────────────────────────────────
/** @type {Array<Object>} */
let allTasks = [];
let taskFilter = 'open';      // 'open' | 'done' | 'all'
let editingTaskId = null;     // null = creating new
let easyMDE = null;           // EasyMDE instance

// ── DOM refs ─────────────────────────────────────────────────
const tabTasksBtn      = document.getElementById('tab-tasks');
const tasksView        = document.getElementById('tasks-view');
const tasksOpenCount   = document.getElementById('tasks-open-count');

const newTaskBtn       = document.getElementById('new-task-btn');
const extractTasksBtn  = document.getElementById('extract-tasks-btn');

const taskModal        = document.getElementById('task-modal');
const taskModalTitle   = document.getElementById('task-modal-title');
const taskModalClose   = document.getElementById('task-modal-close');
const taskModalCancel  = document.getElementById('task-modal-cancel');
const taskModalSave    = document.getElementById('task-modal-save');
const taskModalDelete  = document.getElementById('task-modal-delete');
const taskModalEnrich  = document.getElementById('task-modal-enrich');

const titleInput       = document.getElementById('task-title-input');
const categorySelect   = document.getElementById('task-category-select');
const dueDateInput     = document.getElementById('task-due-date-input');
const estimateInput    = document.getElementById('task-estimate-input');
const notesTextarea    = document.getElementById('task-notes-input');
const tagCheckboxes    = document.querySelectorAll('.task-tag-toggle input[type="checkbox"]');

// ── Helpers ───────────────────────────────────────────────────
function formatEstimate(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function tagsArray(tagsStr) {
  return tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
}

function tagClass(tag) {
  if (tag === 'work')           return 'task-tag-work';
  if (tag === 'personal')       return 'task-tag-personal';
  if (tag === 'low-energy-task') return 'task-tag-low-energy';
  return '';
}

function tagLabel(tag) {
  if (tag === 'low-energy-task') return 'low-energy';
  return tag;
}

// ── Render ────────────────────────────────────────────────────
function renderTaskCard(task) {
  const tags = tagsArray(task.tags);
  const isDone = task.status === 'done';
  const estimate = formatEstimate(task.estimate_minutes);
  const dueStr = task.due_date
    ? `<span class="task-estimate"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${task.due_date}</span>`
    : '';

  const tagHtml = tags.map(t =>
    `<span class="task-tag ${tagClass(t)}">${tagLabel(t)}</span>`
  ).join('');

  const estimateHtml = estimate
    ? `<span class="task-estimate"><svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${estimate}</span>`
    : '';

  const card = document.createElement('div');
  card.className = `task-card${isDone ? ' task-done' : ''}`;
  card.dataset.id = task.id;
  card.dataset.category = task.category;

  card.innerHTML = `
    <div class="task-card-actions">
      <button class="task-card-action-btn task-reschedule-btn" title="Move to…" data-id="${task.id}">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      </button>
      <button class="task-card-action-btn task-edit-btn" title="Edit" data-id="${task.id}">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
    </div>
    <div class="flex items-start gap-2">
      <button class="task-done-btn${isDone ? ' checked' : ''}" data-id="${task.id}" title="${isDone ? 'Mark open' : 'Mark done'}" style="margin-top:2px;flex-shrink:0;">
        ${isDone ? '<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      </button>
      <p class="task-card-title">${escapeHtml(task.title)}</p>
    </div>
    <div class="task-card-meta">
      ${tagHtml}
      ${estimateHtml}
      ${dueStr}
    </div>
  `;

  // Done toggle
  card.querySelector('.task-done-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTaskDone(task);
  });

  // Edit
  card.querySelector('.task-edit-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(task);
  });

  // Reschedule (move category picker)
  card.querySelector('.task-reschedule-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showRescheduleMenu(e.currentTarget, task);
  });

  // Click card body = edit
  card.addEventListener('click', () => openEditModal(task));

  return card;
}

function renderBoard() {
  const categories = ['must-do', 'maybe', 'backlog'];

  categories.forEach(cat => {
    const list = document.querySelector(`.task-card-list[data-category="${cat}"]`);
    const counter = list.closest('.task-column').querySelector('.task-col-count');
    if (!list) return;

    const filtered = allTasks.filter(t => {
      if (t.category !== cat) return false;
      if (taskFilter === 'open') return t.status === 'open';
      if (taskFilter === 'done') return t.status === 'done';
      return t.status !== 'removed';
    });

    counter.textContent = filtered.length;
    list.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'task-empty-state';
      empty.innerHTML = `
        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <span>No tasks here</span>
      `;
      list.appendChild(empty);
    } else {
      filtered.forEach(t => list.appendChild(renderTaskCard(t)));
    }
  });

  // Update tab badge
  const openCount = allTasks.filter(t => t.status === 'open').length;
  if (openCount > 0) {
    tasksOpenCount.textContent = openCount;
    tasksOpenCount.classList.remove('hidden');
  } else {
    tasksOpenCount.classList.add('hidden');
  }

  lucide.createIcons();
}

// ── API ───────────────────────────────────────────────────────
async function loadTasks() {
  try {
    const res = await fetch('/tasks?status=all');
    const data = await res.json();
    allTasks = data.tasks || [];
    renderBoard();
  } catch (err) {
    showToast('Failed to load tasks', 'error');
  }
}

async function createTask(payload) {
  const res = await fetch('/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Create failed');
  return (await res.json()).task;
}

async function updateTask(id, payload) {
  const res = await fetch(`/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
  return (await res.json()).task;
}

async function deleteTask(id) {
  const res = await fetch(`/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

async function enrichTask(id) {
  const res = await fetch(`/tasks/${id}/enrich`, { method: 'POST' });
  if (!res.ok) throw new Error('Enrich failed');
  return (await res.json()).task;
}

// ── Toggle done ───────────────────────────────────────────────
async function toggleTaskDone(task) {
  const newStatus = task.status === 'done' ? 'open' : 'done';
  try {
    const updated = await updateTask(task.id, { status: newStatus });
    const idx = allTasks.findIndex(t => t.id === task.id);
    if (idx !== -1) allTasks[idx] = updated;
    renderBoard();
  } catch (err) {
    showToast('Failed to update task', 'error');
  }
}

// ── Reschedule context menu ───────────────────────────────────
function showRescheduleMenu(anchor, task) {
  // Remove existing menu if any
  document.querySelectorAll('.task-ctx-menu').forEach(m => m.remove());

  const categories = ['must-do', 'maybe', 'backlog'].filter(c => c !== task.category);
  const menu = document.createElement('div');
  menu.className = 'task-ctx-menu';
  menu.style.cssText = `
    position: fixed;
    z-index: 600;
    background: var(--cf-bg-200);
    border: 1px solid var(--cf-border);
    border-radius: 8px;
    box-shadow: var(--shadow-lg);
    min-width: 160px;
    overflow: hidden;
    font-family: var(--font-sans);
    font-size: 13px;
  `;

  const labels = { 'must-do': 'Must-Do', 'maybe': 'Maybe', 'backlog': 'Backlog' };

  // "Done" option
  const statusItem = document.createElement('button');
  statusItem.style.cssText = 'width:100%;padding:8px 12px;text-align:left;background:none;border:none;cursor:pointer;color:var(--cf-text);display:flex;align-items:center;gap:8px;';
  statusItem.innerHTML = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Mark ${task.status === 'done' ? 'open' : 'done'}`;
  statusItem.addEventListener('mouseenter', () => statusItem.style.background = 'var(--cf-bg-300)');
  statusItem.addEventListener('mouseleave', () => statusItem.style.background = 'none');
  statusItem.addEventListener('click', () => { menu.remove(); toggleTaskDone(task); });
  menu.appendChild(statusItem);

  // Move-to options
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;padding:8px 12px;text-align:left;background:none;border:none;cursor:pointer;color:var(--cf-text);display:flex;align-items:center;gap:8px;';
    btn.innerHTML = `<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg> Move to ${labels[cat]}`;
    btn.addEventListener('mouseenter', () => btn.style.background = 'var(--cf-bg-300)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'none');
    btn.addEventListener('click', async () => {
      menu.remove();
      try {
        const updated = await updateTask(task.id, { category: cat });
        const idx = allTasks.findIndex(t => t.id === task.id);
        if (idx !== -1) allTasks[idx] = updated;
        renderBoard();
      } catch (err) {
        showToast('Failed to move task', 'error');
      }
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);

  // Position near anchor
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - 180)}px`;

  // Close on outside click
  setTimeout(() => {
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); }
    };
    document.addEventListener('click', closeMenu);
  }, 0);
}

// ── Modal ─────────────────────────────────────────────────────
function initEasyMDE() {
  if (easyMDE) return; // already initialized
  easyMDE = new EasyMDE({
    element: notesTextarea,
    placeholder: 'Add notes, context, links…',
    spellChecker: false,
    status: false,
    toolbar: ['bold', 'italic', 'strikethrough', '|', 'unordered-list', 'ordered-list', '|', 'link', '|', 'preview'],
    minHeight: '120px',
    maxHeight: '220px',
  });
}

function getSelectedTags() {
  return Array.from(tagCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value)
    .join(',');
}

function setSelectedTags(tagsStr) {
  const tags = tagsArray(tagsStr);
  tagCheckboxes.forEach(cb => { cb.checked = tags.includes(cb.value); });
  // Visually refresh the parent label
  tagCheckboxes.forEach(cb => {
    const lbl = cb.closest('.task-tag-toggle');
    if (lbl) {
      if (cb.checked) {
        lbl.style.background = 'var(--cf-orange-light)';
        lbl.style.borderColor = 'var(--cf-orange)';
        lbl.style.color = 'var(--cf-orange)';
      } else {
        lbl.style.background = '';
        lbl.style.borderColor = '';
        lbl.style.color = '';
      }
    }
  });
}

function openNewModal(defaultCategory = 'maybe') {
  editingTaskId = null;
  taskModalTitle.textContent = 'New Task';
  taskModalDelete.classList.add('hidden');
  taskModalEnrich.classList.add('hidden');

  titleInput.value = '';
  categorySelect.value = defaultCategory;
  dueDateInput.value = '';
  estimateInput.value = '';
  setSelectedTags('');

  initEasyMDE();
  easyMDE.value('');

  taskModal.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 50);
}

function openEditModal(task) {
  editingTaskId = task.id;
  taskModalTitle.textContent = 'Edit Task';
  taskModalDelete.classList.remove('hidden');
  taskModalEnrich.classList.remove('hidden');

  titleInput.value = task.title;
  categorySelect.value = task.category;
  dueDateInput.value = task.due_date || '';
  estimateInput.value = task.estimate_minutes || '';
  setSelectedTags(task.tags || '');

  initEasyMDE();
  easyMDE.value(task.notes || '');

  taskModal.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 50);
}

function closeModal() {
  taskModal.classList.add('hidden');
  editingTaskId = null;
}

async function saveModal() {
  const title = titleInput.value.trim();
  if (!title) {
    titleInput.focus();
    titleInput.style.borderColor = 'var(--cf-error)';
    setTimeout(() => titleInput.style.borderColor = '', 1500);
    return;
  }

  const payload = {
    title,
    category: categorySelect.value,
    notes: easyMDE ? easyMDE.value() : notesTextarea.value,
    tags: getSelectedTags(),
    due_date: dueDateInput.value || null,
    estimate_minutes: estimateInput.value ? parseInt(estimateInput.value, 10) : null,
  };

  taskModalSave.disabled = true;
  taskModalSave.textContent = 'Saving…';

  try {
    if (editingTaskId) {
      const updated = await updateTask(editingTaskId, payload);
      const idx = allTasks.findIndex(t => t.id === editingTaskId);
      if (idx !== -1) allTasks[idx] = updated; else allTasks.unshift(updated);
      showToast('Task updated', 'success');
    } else {
      const created = await createTask(payload);
      allTasks.unshift(created);
      showToast('Task created', 'success');
    }
    closeModal();
    renderBoard();
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  } finally {
    taskModalSave.disabled = false;
    taskModalSave.textContent = 'Save Task';
  }
}

async function deleteCurrentTask() {
  if (!editingTaskId) return;
  if (!confirm('Delete this task permanently?')) return;

  try {
    await deleteTask(editingTaskId);
    allTasks = allTasks.filter(t => t.id !== editingTaskId);
    closeModal();
    renderBoard();
    showToast('Task deleted', 'info');
  } catch (err) {
    showToast('Delete failed', 'error');
  }
}

async function enrichCurrentTask() {
  if (!editingTaskId) return;
  taskModalEnrich.disabled = true;
  taskModalEnrich.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Enriching…';
  lucide.createIcons();

  try {
    const enriched = await enrichTask(editingTaskId);
    // Update form with AI values
    estimateInput.value = enriched.estimate_minutes || '';
    setSelectedTags(enriched.tags || '');

    // Update in-memory task
    const idx = allTasks.findIndex(t => t.id === editingTaskId);
    if (idx !== -1) allTasks[idx] = enriched;

    showToast('AI enrichment applied', 'success');
    renderBoard();
  } catch (err) {
    showToast('Enrichment failed', 'error');
  } finally {
    taskModalEnrich.disabled = false;
    taskModalEnrich.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> AI Enrich';
    lucide.createIcons();
  }
}

// ── Extract from journal ──────────────────────────────────────
async function extractTasksFromJournal() {
  // Get current session messages from the in-memory array in app.js (exposed via window)
  const msgs = (typeof messages !== 'undefined' ? messages : []);
  if (msgs.length === 0) {
    showToast('No journal messages to extract from', 'info');
    return;
  }

  extractTasksBtn.disabled = true;
  extractTasksBtn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4"></i> Extracting…';
  lucide.createIcons();

  try {
    const res = await fetch('/tasks/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs }),
    });
    const data = await res.json();
    const newTasks = data.tasks || [];

    if (newTasks.length === 0) {
      showToast('No new tasks found in today\'s journal', 'info');
    } else {
      // Prepend to allTasks (avoiding duplicates by id)
      const existingIds = new Set(allTasks.map(t => t.id));
      newTasks.forEach(t => { if (!existingIds.has(t.id)) allTasks.unshift(t); });
      renderBoard();
      showToast(`${newTasks.length} task${newTasks.length > 1 ? 's' : ''} extracted`, 'success');
    }
  } catch (err) {
    showToast('Extraction failed', 'error');
  } finally {
    extractTasksBtn.disabled = false;
    extractTasksBtn.innerHTML = '<i data-lucide="sparkles" class="w-4 h-4"></i> <span class="hidden sm:inline">Extract from journal</span>';
    lucide.createIcons();
  }
}

// ── Tab switching (integrating with app.js) ───────────────────
function switchToTasksTab() {
  // Hide other views
  document.getElementById('journal-view').classList.add('hidden');
  document.getElementById('archive-view').classList.add('hidden');
  tasksView.classList.remove('hidden');

  document.getElementById('tab-journal').className = 'tab-inactive px-6 py-3 text-sm font-medium transition-colors';
  document.getElementById('tab-archive').className = 'tab-inactive px-6 py-3 text-sm font-medium transition-colors flex items-center gap-1.5';
  tabTasksBtn.className = 'tab-active px-6 py-3 text-sm font-medium transition-colors flex items-center gap-1.5';

  loadTasks();
}

// Patch app.js switchTab to handle the tasks tab
const _origSwitchTab = typeof switchTab !== 'undefined' ? switchTab : null;
// eslint-disable-next-line no-global-assign
switchTab = function(tab) {
  if (tab === 'tasks') {
    switchToTasksTab();
    return;
  }
  // Hide tasks view when switching away
  tasksView.classList.add('hidden');
  tabTasksBtn.className = 'tab-inactive px-6 py-3 text-sm font-medium transition-colors flex items-center gap-1.5';
  if (_origSwitchTab) _origSwitchTab(tab);
};

// ── Filter buttons ────────────────────────────────────────────
document.querySelectorAll('.task-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    taskFilter = btn.dataset.filter;
    document.querySelectorAll('.task-filter-btn').forEach(b => {
      b.classList.remove('task-filter-active');
      b.style.background = 'var(--cf-bg-300)';
      b.style.color = 'var(--cf-text-muted)';
      b.style.borderColor = 'var(--cf-border)';
    });
    btn.classList.add('task-filter-active');
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
    renderBoard();
  });
});

// ── Column "+" buttons ────────────────────────────────────────
document.querySelectorAll('.col-add-btn').forEach(btn => {
  btn.addEventListener('click', () => openNewModal(btn.dataset.category));
});

// ── Tab click ─────────────────────────────────────────────────
tabTasksBtn.addEventListener('click', () => switchTab('tasks'));

// ── Modal events ─────────────────────────────────────────────
newTaskBtn.addEventListener('click', () => openNewModal());
taskModalClose.addEventListener('click', closeModal);
taskModalCancel.addEventListener('click', closeModal);
taskModalSave.addEventListener('click', saveModal);
taskModalDelete.addEventListener('click', deleteCurrentTask);
taskModalEnrich.addEventListener('click', enrichCurrentTask);
extractTasksBtn.addEventListener('click', extractTasksFromJournal);

// Close modal on overlay click
taskModal.addEventListener('click', (e) => {
  if (e.target === taskModal) closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !taskModal.classList.contains('hidden')) closeModal();
});

// Title Enter key submits
titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveModal(); }
});

// Tag checkbox visual update
tagCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    const lbl = cb.closest('.task-tag-toggle');
    if (!lbl) return;
    if (cb.checked) {
      lbl.style.background = 'var(--cf-orange-light)';
      lbl.style.borderColor = 'var(--cf-orange)';
      lbl.style.color = 'var(--cf-orange)';
    } else {
      lbl.style.background = '';
      lbl.style.borderColor = '';
      lbl.style.color = '';
    }
  });
});
