/**
 * ui.js — UI utilities
 * Handles: modals, toasts, confirm dialogs, theme, formatting helpers
 */

const UI = (() => {

  /* ── Toast Notifications ─────────────────────────────────── */

  function toast(message, type = 'info', duration = 3200) {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;

    container.appendChild(el);

    const remove = () => {
      el.classList.add('toast-exit');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    };

    const timer = setTimeout(remove, duration);
    el.addEventListener('click', () => { clearTimeout(timer); remove(); });
  }

  /* ── Modal Management ────────────────────────────────────── */

  const _closeCallbacks = new Map();

  function openModal(id, onClose) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.hidden = false;
    overlay.removeAttribute('hidden');

    // Focus first focusable element
    requestAnimationFrame(() => {
      const focusable = overlay.querySelector(
        'input:not([hidden]):not([type="file"]), textarea, select, button:not(.modal-close)'
      );
      if (focusable) focusable.focus();
    });

    if (onClose) _closeCallbacks.set(id, onClose);
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.hidden = true;

    // Dispatch a custom event so other modules (e.g. images.js) can clean up
    overlay.dispatchEvent(new CustomEvent('hidden', { bubbles: false }));

    const cb = _closeCallbacks.get(id);
    if (cb) { cb(); _closeCallbacks.delete(id); }
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay:not([hidden])').forEach(el => {
      closeModal(el.id);
    });
  }

  // Wire close buttons (data-close="modalId") and overlay click-outside
  function initModals() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });

    // Escape key closes topmost modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const open = [...document.querySelectorAll('.modal-overlay:not([hidden])')];
      if (open.length) {
        closeModal(open[open.length - 1].id);
      }
      // Also close lightbox
      const lb = document.getElementById('lightbox');
      if (lb && !lb.hidden) Lightbox.close();
    });
  }

  /* ── Confirm Dialog ──────────────────────────────────────── */

  function confirm({ title = 'Confirm', message, sub = '', okLabel = 'Delete', okClass = 'btn-danger' }) {
    return new Promise((resolve) => {
      document.getElementById('confirmTitle').textContent   = title;
      document.getElementById('confirmMessage').textContent = message;
      document.getElementById('confirmSub').textContent     = sub;

      const okBtn     = document.getElementById('btnConfirmOk');
      const cancelBtn = document.getElementById('btnConfirmCancel');

      // Update button label & style
      okBtn.textContent = okLabel;
      okBtn.className   = `btn ${okClass}`;

      const finish = (result) => {
        closeModal('modalConfirm');
        // Remove listeners
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        resolve(result);
      };

      const onOk     = () => finish(true);
      const onCancel = () => finish(false);

      okBtn.addEventListener('click',     onOk,     { once: true });
      cancelBtn.addEventListener('click', onCancel, { once: true });

      openModal('modalConfirm');
    });
  }

  /* ── Theme ───────────────────────────────────────────────── */

  const THEME_KEY = 'ld_theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    // Update settings page toggles
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeVal === theme);
    });
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);

    // Header toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // Settings page toggles
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themeVal));
    });
  }

  /* ── Page Navigation ─────────────────────────────────────── */

  function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => {
      const isTarget = p.id === `page-${pageId}`;
      p.hidden = !isTarget;
      if (isTarget) p.removeAttribute('hidden');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageId);
      btn.setAttribute('aria-current', btn.dataset.page === pageId ? 'page' : 'false');
    });
  }

  function initNavigation(onNavigate) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigateTo(btn.dataset.page);
        if (onNavigate) onNavigate(btn.dataset.page);
      });
    });
  }

  /* ── Date Formatting ─────────────────────────────────────── */

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec'];

  const MONTH_LONG  = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  /** '2026-09-20' → '20 Sep 2026' */
  function formatDateLong(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]} ${y}`;
  }

  /** '2026-09-20' → '20 Sep' */
  function formatDateShort(isoDate) {
    if (!isoDate) return '';
    const [, m, d] = isoDate.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MONTH_SHORT[m - 1]}`;
  }

  /** Returns 'YYYY-MM-DD' for local today — avoids UTC timezone trap */
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** 'YYYY-MM-DD' → { year, month (0-indexed) } */
  function parseISODate(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
  }

  /* ── HTML helpers ────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sanitizeRichText(html) {
    const source = document.createElement('div');
    source.innerHTML = String(html || '');
    const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'BR', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'PRE', 'CODE', 'FONT']);
    const clean = (node) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
          return;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowed.has(child.tagName)) {
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
        [...child.attributes].forEach(attr => {
          if (attr.name !== 'style' && attr.name !== 'color') child.removeAttribute(attr.name);
        });
        if (child.hasAttribute('style')) {
          const color = child.style.color;
          const size = child.style.fontSize;
          child.removeAttribute('style');
          if (color && CSS.supports('color', color)) child.style.color = color;
          if (size && /^(?:\d+(?:\.\d+)?)(?:px|em|rem|%)$/.test(size)) child.style.fontSize = size;
        }
        if (child.hasAttribute('color') && !/^#[0-9a-f]{3,8}$/i.test(child.getAttribute('color'))) {
          child.removeAttribute('color');
        }
        clean(child);
      });
    };
    clean(source);
    return source.innerHTML;
  }

  function richTextToPlain(html) {
    const box = document.createElement('div');
    box.innerHTML = sanitizeRichText(html);
    return (box.innerText || box.textContent || '').replace(/\u00a0/g, ' ').trim();
  }

  /** Truncate to N chars with ellipsis */
  function truncate(str, maxLen = 140) {
    if (!str || str.length <= maxLen) return str;
    return str.slice(0, maxLen).trimEnd() + '…';
  }

  /* ── Persistent storage request ──────────────────────────── */

  async function checkStoragePersist() {
    const statusEl = document.getElementById('storageStatus');
    const btn      = document.getElementById('btnRequestPersist');

    if (!navigator.storage || !navigator.storage.persisted) {
      statusEl.textContent = 'Persistent storage not supported in this browser.';
      btn.hidden = true;
      return;
    }

    const persisted = await navigator.storage.persisted();
    if (persisted) {
      statusEl.textContent = 'Storage is persistent — data is protected from auto-eviction.';
      btn.hidden = true;
    } else {
      statusEl.textContent = 'Storage is not yet persistent. Data may be cleared by the browser under storage pressure.';
      btn.hidden = false;
    }
  }

  function initPersistBtn() {
    document.getElementById('btnRequestPersist').addEventListener('click', async () => {
      const granted = await navigator.storage.persist();
      if (granted) {
        UI.toast('Persistent storage granted.', 'success');
        checkStoragePersist();
      } else {
        UI.toast('Browser did not grant persistent storage.', 'warning');
      }
    });
  }

  /* ── Last Backup label ───────────────────────────────────── */

  const BACKUP_KEY = 'ld_last_backup';

  function updateLastBackupLabel() {
    const el = document.getElementById('lastBackupTime');
    if (!el) return;
    const ts = localStorage.getItem(BACKUP_KEY);
    if (!ts) {
      el.textContent = 'No backup recorded.';
      return;
    }
    const d    = new Date(ts);
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    const label = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
    el.textContent = `Last backup: ${label} (${d.toLocaleDateString()})`;
  }

  function recordBackup() {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
    updateLastBackupLabel();
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    toast,
    openModal,
    closeModal,
    closeAllModals,
    initModals,
    confirm,
    applyTheme,
    initTheme,
    navigateTo,
    initNavigation,
    formatDateLong,
    formatDateShort,
    todayISO,
    parseISODate,
    escapeHtml,
    sanitizeRichText,
    richTextToPlain,
    truncate,
    MONTH_SHORT,
    MONTH_LONG,
    checkStoragePersist,
    initPersistBtn,
    recordBackup,
    updateLastBackupLabel,
  };

})();


/* ══════════════════════════════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════════════════════════════ */

const Lightbox = (() => {

  let _images  = [];   // [{ src, name }]
  let _current = 0;
  let _objectUrls = [];

  const overlay  = document.getElementById('lightbox');
  const img      = document.getElementById('lightboxImg');
  const caption  = document.getElementById('lightboxCaption');
  const prevBtn  = document.getElementById('lightboxPrev');
  const nextBtn  = document.getElementById('lightboxNext');
  const closeBtn = document.getElementById('lightboxClose');

  function _show(index) {
    _current = index;
    const item = _images[index];
    img.src           = item.src;
    img.alt           = item.name || 'Image preview';
    caption.textContent = _images.length > 1
      ? `${index + 1} / ${_images.length}${item.name ? ' — ' + item.name : ''}`
      : (item.name || '');
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === _images.length - 1;
  }

  function open(images, startIndex = 0) {
    if (!images || images.length === 0) return;
    _images = images;
    _show(startIndex);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    img.src = '';
    _revokeAll();
    _images = [];
  }

  function _revokeAll() {
    _objectUrls.forEach(url => URL.revokeObjectURL(url));
    _objectUrls = [];
  }

  /** Create object URLs from Blob records and open lightbox */
  async function openFromBlobs(imageRecords, startIndex = 0) {
    _revokeAll();
    const items = imageRecords.map(rec => {
      const url = URL.createObjectURL(rec.blob);
      _objectUrls.push(url);
      return { src: url, name: rec.name };
    });
    open(items, startIndex);
  }

  prevBtn.addEventListener('click', () => { if (_current > 0) _show(_current - 1); });
  nextBtn.addEventListener('click', () => { if (_current < _images.length - 1) _show(_current + 1); });
  closeBtn.addEventListener('click', close);

  // Click backdrop to close
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'ArrowLeft')  prevBtn.click();
    if (e.key === 'ArrowRight') nextBtn.click();
  });

  return { open, openFromBlobs, close };

})();
