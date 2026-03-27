'use strict';

/* =============================================================
   Writing Streak + Heatmap
   Loaded after app.js — uses the global `messages` array to
   determine whether today already has activity.
   ============================================================= */

// ── DOM refs ─────────────────────────────────────────────────
const streakBadge  = document.getElementById('streak-badge');
const streakCount  = document.getElementById('streak-count');
const heatmapGrid  = document.getElementById('heatmap-grid');
const heatmapStats = document.getElementById('heatmap-stats');

// ── Tooltip singleton ─────────────────────────────────────────
const tooltip = document.createElement('div');
tooltip.className = 'heatmap-tooltip';
document.body.appendChild(tooltip);

function showTooltip(e, text) {
  tooltip.textContent = text;
  tooltip.classList.add('visible');
  positionTooltip(e);
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

function positionTooltip(e) {
  const pad = 10;
  let x = e.clientX + pad;
  let y = e.clientY - 32;
  // Keep inside viewport
  if (x + 160 > window.innerWidth) x = e.clientX - 160 - pad;
  if (y < 0) y = e.clientY + pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

document.addEventListener('mousemove', (e) => {
  if (tooltip.classList.contains('visible')) positionTooltip(e);
});

// ── Helpers ───────────────────────────────────────────────────
function formatDateLabel(dateStr) {
  // dateStr is YYYY-MM-DD
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Render ────────────────────────────────────────────────────
function renderStreak(currentStreak, longestStreak) {
  if (currentStreak <= 0) {
    streakBadge.classList.add('hidden');
    return;
  }

  streakCount.textContent = currentStreak;
  streakBadge.title = `Current streak: ${currentStreak} day${currentStreak !== 1 ? 's' : ''} · Best: ${longestStreak} day${longestStreak !== 1 ? 's' : ''}`;
  streakBadge.classList.remove('hidden');

  // Pulse animation when breaking personal record
  if (currentStreak >= longestStreak && currentStreak > 1) {
    streakBadge.classList.add('streak-record');
  } else {
    streakBadge.classList.remove('streak-record');
  }

  // Evolve the flame emoji based on streak length
  const flame = streakBadge.querySelector('.streak-flame');
  if (flame) {
    if (currentStreak >= 30) flame.textContent = '🔥🔥';
    else if (currentStreak >= 7) flame.textContent = '🔥';
    else flame.textContent = '✍️';
  }
}

function renderHeatmap(heatmap, totalDays) {
  if (!heatmapGrid) return;

  // heatmap is 365 days oldest→newest
  // We render as a week-column grid (grid-auto-flow: column, 7 rows)
  // Pad the start so the first cell falls on the right weekday
  heatmapGrid.innerHTML = '';

  const today = new Date().toISOString().split('T')[0];

  // Find what weekday (0=Sun…6=Sat) the oldest day is
  // We want Mon=0 … Sun=6 visually
  const firstDate = heatmap[0]?.date;
  if (!firstDate) return;

  const firstDayOfWeek = (new Date(firstDate + 'T12:00:00').getDay() + 6) % 7; // Mon=0
  // Add empty padding cells at the start
  for (let i = 0; i < firstDayOfWeek; i++) {
    const pad = document.createElement('span');
    pad.className = 'heatmap-cell';
    pad.style.background = 'transparent';
    pad.style.border = 'none';
    heatmapGrid.appendChild(pad);
  }

  heatmap.forEach(({ date, hasEntry }) => {
    const cell = document.createElement('span');
    cell.className = 'heatmap-cell' + (hasEntry ? ' heatmap-written' : '');
    if (date === today) cell.classList.add('heatmap-today');

    const label = formatDateLabel(date);
    const status = hasEntry ? '✓ wrote' : '–';
    cell.addEventListener('mouseenter', (e) => showTooltip(e, `${label}  ${status}`));
    cell.addEventListener('mouseleave', hideTooltip);

    // Clicking a written day navigates to that archive entry
    if (hasEntry) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        // Switch to archive tab and load entry
        if (typeof switchTab === 'function') switchTab('archive');
        if (typeof loadArchiveEntry === 'function') {
          // Small delay so the tab switch DOM update settles
          setTimeout(() => loadArchiveEntry(date), 50);
        }
      });
    }

    heatmapGrid.appendChild(cell);
  });

  // Update stats line
  if (heatmapStats) {
    const written = heatmap.filter(d => d.hasEntry).length;
    heatmapStats.textContent = `${totalDays} total · ${written} this year`;
  }
}

// ── Load ──────────────────────────────────────────────────────
async function loadStats() {
  // Tell the API whether today counts even without a finalized entry
  // We check the global `messages` array that app.js populates
  const todayActive = (typeof messages !== 'undefined' && messages.length > 0) ? '1' : '0';

  try {
    const res = await fetch('/stats?today_has_entry=' + todayActive);
    if (!res.ok) return;
    const data = await res.json();

    renderStreak(data.currentStreak, data.longestStreak);
    renderHeatmap(data.heatmap, data.totalDays);
  } catch (_) {
    // Non-critical — silently skip
  }
}

// ── Hooks ─────────────────────────────────────────────────────

// Refresh stats when the archive tab is opened (heatmap is visible there)
const _origSwitchTabStreak = typeof switchTab !== 'undefined' ? switchTab : null;
// eslint-disable-next-line no-global-assign
switchTab = function(tab) {
  if (_origSwitchTabStreak) _origSwitchTabStreak(tab);
  if (tab === 'archive') loadStats();
};

// Refresh streak badge immediately after a message is sent
// by hooking into the chat form submit event
const chatFormEl = document.getElementById('chat-form');
if (chatFormEl) {
  chatFormEl.addEventListener('submit', () => {
    // After the message is processed, reload stats (tiny delay for the
    // messages array to be updated by app.js)
    setTimeout(loadStats, 1500);
  });
}

// Initial load on page ready
loadStats();