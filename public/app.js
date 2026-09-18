// Tab switching, the install prompt, and the service worker. That is all.
// No framework, no build step, no bundle to keep in sync.

// ── Tabs ───────────────────────────────────────────────────────────
const tabs = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');

function show(name) {
  screens.forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  tabs.forEach((t) => {
    const on = t.dataset.screen === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  // Each tab starts at the top, the way a native tab bar behaves.
  window.scrollTo(0, 0);
}
tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.screen)));

// ── Title ──────────────────────────────────────────────────────────
// Name the app after its subdomain until the agent gives it a real one, so a
// fresh build never says "Your app" on a page the user is already sharing.
const sub = location.hostname.split('.')[0];
if (sub && sub !== 'localhost' && !/^\d+$/.test(sub)) {
  const pretty = sub.replace(/-[a-z0-9]{4}$/i, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (pretty) {
    document.getElementById('app-name').textContent = pretty;
    document.title = pretty;
  }
}

// ── Install ────────────────────────────────────────────────────────
// Two different worlds. Chrome fires beforeinstallprompt and gives us a real
// button. iOS Safari has no such event and never will, so the only honest move
// there is to tell the user where the Share button is. Both are hidden once the
// app is already installed, since display-mode:standalone means we ARE the
// installed app and offering to install it again is nonsense.
const card = document.getElementById('install-card');
const btn = document.getElementById('install-btn');
const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  if (!installed && card && btn) { card.hidden = false; btn.hidden = false; }
});

if (btn) {
  btn.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    if (card) card.hidden = true;
  });
}

// iOS has no install prompt, so there is nothing for this card to do there.
// The platform shows the iPhone its own "Add to home screen" hint above the
// page, so one surface owns that instruction; leave it to the platform.

// ── Daily Log data ─────────────────────────────────────────────────
document.querySelectorAll('[data-goto]').forEach((el) => {
  el.addEventListener('click', () => show(el.dataset.goto));
});

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function fetchLogs() {
  const res = await fetch('/api/logs');
  return res.ok ? res.json() : [];
}

async function renderHome() {
  const homeDate = document.getElementById('home-date');
  const homeSummary = document.getElementById('home-summary');
  if (!homeDate) return;
  homeDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const logs = await fetchLogs();
  const today = new Date().toDateString();
  const todayCount = logs.filter((l) => new Date(l.createdAt).toDateString() === today).length;
  homeSummary.textContent = todayCount
    ? `${todayCount} ${todayCount === 1 ? 'entry' : 'entries'} logged today.`
    : 'No entries logged today yet.';
}

async function renderHistory() {
  const list = document.getElementById('history-list');
  if (!list) return;
  const logs = await fetchLogs();
  if (!logs.length) {
    list.innerHTML = '<li><span>No entries yet</span></li>';
    return;
  }
  list.innerHTML = logs.map((l) => `
    <li>
      <span>${escapeHtml(l.title)}${l.notes ? `<div class="meta">${escapeHtml(l.notes)}</div>` : ''}</span>
      <span class="meta">${fmtDate(l.createdAt)}</span>
    </li>
  `).join('');
}

async function renderSummary() {
  const total = document.getElementById('stat-total');
  if (!total) return;
  const logs = await fetchLogs();
  const now = new Date();
  const today = now.toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  document.getElementById('stat-total').textContent = logs.length;
  document.getElementById('stat-today').textContent = logs.filter((l) => new Date(l.createdAt).toDateString() === today).length;
  document.getElementById('stat-week').textContent = logs.filter((l) => new Date(l.createdAt) >= weekAgo).length;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const logForm = document.getElementById('log-form');
if (logForm) {
  logForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('log-title').value.trim();
    const notes = document.getElementById('log-notes').value.trim();
    if (!title) return;
    const res = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, notes }),
    });
    if (res.ok) {
      logForm.reset();
      show('history');
      renderHistory();
      renderHome();
      renderSummary();
    }
  });
}

// Refresh data whenever a data-driven tab is shown.
tabs.forEach((t) => t.addEventListener('click', () => {
  const name = t.dataset.screen;
  if (name === 'home') renderHome();
  if (name === 'history') renderHistory();
  if (name === 'summary') renderSummary();
}));

renderHome();

// ── Service worker ─────────────────────────────────────────────────
// See sw.js: network always wins, the cache is an offline fallback only.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
