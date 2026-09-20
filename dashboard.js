/**
 * dashboard.js — Diary dashboard
 * Handles: filtering, searching, sorting, pagination, table/card rendering
 */

const Dashboard = (() => {

  const PAGE_SIZE    = 10;
  const PREVIEW_LEN  = 140;

  /* State */
  let _allNotes    = [];
  let _catLookup   = {};
  let _currentPage = 1;
  let _searchTimer = null;
  let _weekStart   = _startOfWeek(new Date());
  let _weeklyReviewEnabled = false;

  function _startOfWeek(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    const day = result.getDay();
    result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
    return result;
  }

  function _toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function _weekEnd() {
    const end = new Date(_weekStart);
    end.setDate(end.getDate() + 6);
    return end;
  }

  function _isCurrentWeek() {
    return _toISO(_weekStart) === _toISO(_startOfWeek(new Date()));
  }

  function _formatWeekLabel() {
    const end = _weekEnd();
    const startLabel = UI.formatDateShort(_toISO(_weekStart));
    const endLabel = UI.formatDateLong(_toISO(end));
    return `${_isCurrentWeek() ? 'This week · ' : ''}${startLabel} – ${endLabel}`;
  }

  function _renderWeekControls() {
    const label = document.getElementById('weekReviewLabel');
    const next = document.getElementById('btnNextWeek');
    const bar = document.getElementById('weekReviewBar');
    if (label) label.textContent = _formatWeekLabel();
    if (next) next.disabled = _isCurrentWeek();
    if (bar) bar.hidden = !_weeklyReviewEnabled;
  }

  function _changeWeek(offset) {
    const next = new Date(_weekStart);
    next.setDate(next.getDate() + offset * 7);
    if (offset > 0 && next > _startOfWeek(new Date())) return;
    _weekStart = next;
    _currentPage = 1;
    _renderWeekControls();
    _render();
  }

  /* ── Load & refresh ──────────────────────────────────────── */

  async function refresh() {
    try {
      [_allNotes, _catLookup] = await Promise.all([
        DB.Notes.getAll(),
        Categories.buildLookup(),
      ]);
      _populateYearFilter();
      _render();
      UI.updateBackupReminder();
    } catch (err) {
      document.getElementById('diaryContent').innerHTML =
        `<div class="error-banner">Failed to load notes: ${UI.escapeHtml(err.message)}</div>`;
    }
  }

  /* ── Year filter population ──────────────────────────────── */

  function _populateYearFilter() {
    const select = document.getElementById('filterYear');
    const current = select.value;

    const years = [...new Set(_allNotes.map(n => n.date.slice(0, 4)))].sort().reverse();

    select.innerHTML = '<option value="">All Years</option>';
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value       = y;
      opt.textContent = y;
      if (y === current) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /* ── Filter pipeline ─────────────────────────────────────── */

  function _filterNotes() {
    const month    = document.getElementById('filterMonth').value;     // '' or '0'-'11'
    const year     = document.getElementById('filterYear').value;      // '' or 'YYYY'
    const catId    = document.getElementById('filterCategory').value;  // '' or cat id
    const query    = document.getElementById('searchInput').value.trim().toLowerCase();

    let notes = [..._allNotes];

    if (_weeklyReviewEnabled) {
      // Weekly review filter: Monday through Sunday.
      const weekStart = _toISO(_weekStart);
      const weekEnd = _toISO(_weekEnd());
      notes = notes.filter(n => n.date >= weekStart && n.date <= weekEnd);
    }

    // 1. Month/year filter
    if (year || month !== '') {
      notes = notes.filter(n => {
        const { year: ny, month: nm } = UI.parseISODate(n.date);
        const yearOk  = !year   || ny === Number(year);
        const monthOk = month === '' || nm === Number(month);
        return yearOk && monthOk;
      });
    }

    // 2. Category filter
    if (catId) {
      notes = notes.filter(n => n.categoryId === catId);
    }

    // 3. Search
    if (query) {
      notes = notes.filter(n => {
        const catName = (_catLookup[n.categoryId] || '').toLowerCase();
        return UI.richTextToPlain(n.content).toLowerCase().includes(query) || catName.includes(query);
      });
    }

    // 4. Sort: newest date first, then most recently created within same date
    notes.sort((a, b) => {
      if (b.date !== a.date) return b.date.localeCompare(a.date);
      return b.createdAt.localeCompare(a.createdAt);
    });

    return notes;
  }

  /* ── Summary stats ───────────────────────────────────────── */

  function _renderSummary(filteredNotes) {
    const container = document.getElementById('diarySummary');

    if (filteredNotes.length === 0) {
      container.innerHTML = '';
      return;
    }

    const uniqueDates = new Set(filteredNotes.map(n => n.date)).size;
    const uniqueCats  = new Set(filteredNotes.map(n => n.categoryId)).size;

    container.innerHTML = `
      <div class="summary-stat">
        <span class="summary-stat-value">${uniqueDates}</span>
        <span class="summary-stat-label">Learning ${uniqueDates === 1 ? 'Day' : 'Days'}</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-value">${filteredNotes.length}</span>
        <span class="summary-stat-label">${filteredNotes.length === 1 ? 'Note' : 'Notes'}</span>
      </div>
      <div class="summary-stat">
        <span class="summary-stat-value">${uniqueCats}</span>
        <span class="summary-stat-label">${uniqueCats === 1 ? 'Category' : 'Categories'}</span>
      </div>`;
  }

  /* ── Main render ─────────────────────────────────────────── */

  function _render() {
    const filtered = _filterNotes();

    _renderSummary(filtered);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

    // Clamp current page
    if (_currentPage > totalPages) _currentPage = totalPages;

    const start  = (_currentPage - 1) * PAGE_SIZE;
    const paged  = filtered.slice(start, start + PAGE_SIZE);

    const container = document.getElementById('diaryContent');

    if (filtered.length === 0) {
      const hasFilters = document.getElementById('filterMonth').value ||
                         document.getElementById('filterYear').value  ||
                         document.getElementById('filterCategory').value ||
                         document.getElementById('searchInput').value.trim() ||
                         (_weeklyReviewEnabled && !_isCurrentWeek());

      container.innerHTML = hasFilters
        ? `<div class="empty-state">
             <div class="empty-state-icon">🔍</div>
             <div class="empty-state-title">No notes found</div>
             <div class="empty-state-body">Try adjusting the filters or search text.</div>
           </div>`
        : `<div class="empty-state">
             <div class="empty-state-icon">📖</div>
             <div class="empty-state-title">No learning notes yet</div>
             <div class="empty-state-body">Start recording what you learn today.</div>
             <button class="btn btn-primary" id="btnFirstNote">+ Add Your First Note</button>
           </div>`;

      const firstNoteBtn = document.getElementById('btnFirstNote');
      if (firstNoteBtn) {
        firstNoteBtn.addEventListener('click', () => Notes.openAddModal());
      }

      document.getElementById('paginationWrap').innerHTML = '';
      return;
    }

    // Detect mobile breakpoint
    const isMobile = window.innerWidth <= 700;
    if (isMobile) {
      _renderCards(container, paged);
    } else {
      _renderTable(container, paged);
    }

    _renderPagination(filtered.length, totalPages);
  }

  /* ── Table render (desktop) ──────────────────────────────── */

  function _renderTable(container, notes) {
    const wrap  = document.createElement('div');
    wrap.className = 'notes-table-wrap';

    const table = document.createElement('table');
    table.className = 'notes-table';
    table.setAttribute('role', 'table');

    table.innerHTML = `
      <thead>
        <tr>
          <th scope="col">Date</th>
          <th scope="col">Category</th>
          <th scope="col">What I Learned</th>
          <th scope="col">View</th>
        </tr>
      </thead>`;

    const tbody = document.createElement('tbody');

    let lastDate = null;
    notes.forEach(note => {
      const tr        = document.createElement('tr');
      const isRepeat  = note.date === lastDate;
      const catName   = _catLookup[note.categoryId] || '—';
      const preview   = UI.truncate(UI.richTextToPlain(note.content), PREVIEW_LEN);
      const hasImages = note.imageIds && note.imageIds.length > 0;

      tr.innerHTML = `
        <td class="col-date ${isRepeat ? 'date-repeat' : ''}" aria-label="${isRepeat ? 'same date' : UI.formatDateLong(note.date)}">
          ${UI.escapeHtml(UI.formatDateShort(note.date))}
        </td>
        <td class="col-category">
          <span class="category-badge" title="${UI.escapeHtml(catName)}">${UI.escapeHtml(catName)}</span>
        </td>
        <td class="col-content" role="button" tabindex="0" aria-label="View note" data-note-id="${note.id}">
          <div class="note-preview-text">${UI.escapeHtml(preview)}</div>
          ${hasImages ? `<div class="note-image-indicator">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            ${note.imageIds.length} ${note.imageIds.length === 1 ? 'image' : 'images'}
          </div>` : ''}
        </td>
        <td class="col-actions">
          <button class="action-link" data-note-id="${note.id}" aria-label="View note from ${UI.formatDateShort(note.date)}">View</button>
        </td>`;

      lastDate = note.date;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.innerHTML = '';
    container.appendChild(wrap);

    // Delegate click events
    container.addEventListener('click', _handleNoteClick);
    container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target.closest('[data-note-id]');
        if (target) { e.preventDefault(); _openView(target.dataset.noteId); }
      }
    });
  }

  /* ── Card render (mobile) ────────────────────────────────── */

  function _renderCards(container, notes) {
    const list = document.createElement('div');
    list.className = 'notes-card-list';

    notes.forEach(note => {
      const catName   = _catLookup[note.categoryId] || '—';
      const preview   = UI.truncate(UI.richTextToPlain(note.content), PREVIEW_LEN);
      const hasImages = note.imageIds && note.imageIds.length > 0;

      const card = document.createElement('div');
      card.className = 'note-card';
      card.innerHTML = `
        <div class="note-card-header">
          <span class="note-card-date">${UI.escapeHtml(UI.formatDateLong(note.date))}</span>
          <span class="category-badge">${UI.escapeHtml(catName)}</span>
        </div>
        <div class="note-card-content" role="button" tabindex="0" data-note-id="${note.id}">${UI.escapeHtml(preview)}</div>
        <div class="note-card-footer">
          ${hasImages ? `<span class="note-image-indicator">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            ${note.imageIds.length}
          </span>` : ''}
          <button class="btn btn-secondary" style="margin-left:auto;padding:6px 12px;font-size:0.8125rem" data-note-id="${note.id}">View</button>
        </div>`;

      list.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(list);
    container.addEventListener('click', _handleNoteClick);
  }

  function _handleNoteClick(e) {
    const target = e.target.closest('[data-note-id]');
    if (target) _openView(target.dataset.noteId);
  }

  function _openView(noteId) {
    Notes.openViewModal(noteId);
  }

  /* ── Pagination ──────────────────────────────────────────── */

  function _renderPagination(total, totalPages) {
    const wrap = document.getElementById('paginationWrap');

    if (total === 0 || totalPages <= 1) {
      const start = Math.min((_currentPage - 1) * PAGE_SIZE + 1, total);
      const end   = Math.min(_currentPage * PAGE_SIZE, total);
      wrap.innerHTML = total > 0
        ? `<span class="pagination-info">Showing ${start}–${end} of ${total}</span>`
        : '';
      return;
    }

    const start = (_currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(_currentPage * PAGE_SIZE, total);

    // Build page numbers (show max 7 with ellipsis)
    const pages = _buildPageNumbers(_currentPage, totalPages);

    const pageButtons = pages.map(p => {
      if (p === '…') return `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
      return `<button class="page-btn ${p === _currentPage ? 'active' : ''}" data-page="${p}" aria-label="Page ${p}" ${p === _currentPage ? 'aria-current="page"' : ''}>${p}</button>`;
    }).join('');

    wrap.innerHTML = `
      <span class="pagination-info">Showing ${start}–${end} of ${total}</span>
      <div class="pagination-pages">
        <button class="page-btn" data-page="${_currentPage - 1}" ${_currentPage <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        ${pageButtons}
        <button class="page-btn" data-page="${_currentPage + 1}" ${_currentPage >= totalPages ? 'disabled' : ''} aria-label="Next page">›</button>
      </div>`;

    wrap.querySelectorAll('.page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.page);
        if (p >= 1 && p <= totalPages) {
          _currentPage = p;
          _render();
          // Scroll diary content into view
          document.getElementById('diaryContent').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function _buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [];
    if (current <= 4) {
      pages.push(1, 2, 3, 4, 5, '…', total);
    } else if (current >= total - 3) {
      pages.push(1, '…', total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, '…', current - 1, current, current + 1, '…', total);
    }
    return pages;
  }

  /* ── Filter/search event wiring ──────────────────────────── */

  function initFilters() {
    document.getElementById('toggleWeeklyReview').addEventListener('change', event => {
      _weeklyReviewEnabled = event.target.checked;
      _currentPage = 1;
      if (_weeklyReviewEnabled) {
        document.getElementById('filterMonth').value = '';
        document.getElementById('filterYear').value = '';
      } else {
        const now = new Date();
        document.getElementById('filterMonth').value = String(now.getMonth());
        document.getElementById('filterYear').value = String(now.getFullYear());
      }
      _renderWeekControls();
      _render();
    });

    document.getElementById('btnPreviousWeek').addEventListener('click', () => _changeWeek(-1));
    document.getElementById('btnNextWeek').addEventListener('click', () => _changeWeek(1));
    document.getElementById('btnCurrentWeek').addEventListener('click', () => {
      _weekStart = _startOfWeek(new Date());
      _currentPage = 1;
      _renderWeekControls();
      _render();
    });

    // Month/year/category filters — immediate re-render
    ['filterMonth', 'filterYear', 'filterCategory'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        _currentPage = 1;
        _render();
      });
    });

    // Search input — debounced
    document.getElementById('searchInput').addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        _currentPage = 1;
        _render();
      }, 280);
    });

    // Re-render on resize (table ↔ cards)
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => _render(), 200);
    });
  }

  /* ── Default filters ─────────────────────────────────────── */

  function setDefaultFilters() {
    _weekStart = _startOfWeek(new Date());
    const now = new Date();
    document.getElementById('filterMonth').value = String(now.getMonth());
    document.getElementById('filterYear').value  = String(now.getFullYear());
    _renderWeekControls();
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    refresh,
    initFilters,
    setDefaultFilters,
  };

})();
