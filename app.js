/**
 * app.js — Application bootstrap
 * Initialises all modules in the correct dependency order.
 * Load order in index.html: db → ui → images → categories → notes → dashboard → backup → app
 */

(async () => {

  /* ── 1. Theme (instant — before any render) ─────────────── */
  UI.initTheme();

  /* ── 2. Open IndexedDB ──────────────────────────────────── */
  try {
    await DB.open();
  } catch (err) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:32px;font-family:system-ui,sans-serif">
        <div style="max-width:420px;text-align:center">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h1 style="font-size:1.25rem;margin-bottom:8px">Database error</h1>
          <p style="color:#888;font-size:0.9rem">${UI.escapeHtml(err.message)}</p>
          <p style="color:#888;font-size:0.85rem;margin-top:12px">
            Try opening the app in a normal (non-private) browser window,
            or check that site storage is not blocked.
          </p>
        </div>
      </div>`;
    return;
  }

  /* ── 3. Wire global UI ──────────────────────────────────── */
  UI.initModals();
  UI.initNavigation(_onNavigate);

  /* ── 4. Wire image upload zone ──────────────────────────── */
  ImageManager.initUploadZone();

  /* ── 5. Wire category events ────────────────────────────── */
  Categories.initEvents();

  /* ── 6. Wire note events ────────────────────────────────── */
  Notes.initEvents();

  /* ── 7. Wire dashboard filters ──────────────────────────── */
  Dashboard.initFilters();

  /* ── 8. Wire backup events ──────────────────────────────── */
  Backup.initEvents();

  /* ── 9. Wire settings page ──────────────────────────────── */
  UI.initPersistBtn();
  UI.updateLastBackupLabel();
  if (typeof UI.initBackupReminder === 'function') UI.initBackupReminder();
  GeminiAI.init();

  /* ── 10. Set default filters and load diary ─────────────── */
  Dashboard.setDefaultFilters();
  await Categories.populateFilterDropdown();
  await Dashboard.refresh();
  if (typeof UI.updateBackupReminder === 'function') await UI.updateBackupReminder();

  /* ── 11. Request persistent storage (silent) ────────────── */
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => { /* silently ignore */ });
  }

})();

/* ── Page navigation callback ───────────────────────────── */

async function _onNavigate(page) {
  if (page === 'categories') {
    await Categories.renderPage();
  }

  if (page === 'settings') {
    UI.checkStoragePersist();
    UI.updateLastBackupLabel();
  }

  if (page === 'diary') {
    await Dashboard.refresh();
  }
}
