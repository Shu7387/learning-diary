/**
 * categories.js — Category CRUD management
 * Handles the Categories page and the category modal.
 */

const Categories = (() => {

  /* ── Render Categories Page ──────────────────────────────── */

  async function renderPage() {
    const container = document.getElementById('categoriesContent');
    container.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><span>Loading…</span></div>';

    let cats, noteCounts;
    try {
      cats  = await DB.Categories.getAll();
      const notes = await DB.Notes.getAll();
      noteCounts  = {};
      notes.forEach(n => {
        noteCounts[n.categoryId] = (noteCounts[n.categoryId] || 0) + 1;
      });
    } catch (err) {
      container.innerHTML = `<div class="error-banner">Failed to load categories: ${UI.escapeHtml(err.message)}</div>`;
      return;
    }

    if (cats.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🗂️</div>
          <div class="empty-state-title">No categories yet</div>
          <div class="empty-state-body">Categories help you organise your learning by topic.</div>
          <button class="btn btn-primary" onclick="Categories.openAddModal()">+ Add Your First Category</button>
        </div>`;
      return;
    }

    const list = document.createElement('div');
    list.className = 'category-list';

    cats.forEach(cat => {
      const count = noteCounts[cat.id] || 0;
      const item  = document.createElement('div');
      item.className   = 'category-item';
      item.dataset.id  = cat.id;
      item.innerHTML   = `
        <span class="category-item-name">${UI.escapeHtml(cat.name)}</span>
        <span class="category-item-meta">${count} ${count === 1 ? 'note' : 'notes'}</span>
        <div class="category-item-actions">
          <button class="btn btn-secondary" data-action="edit" data-id="${cat.id}" aria-label="Edit ${UI.escapeHtml(cat.name)}">Edit</button>
          <button class="btn btn-danger"    data-action="delete" data-id="${cat.id}" aria-label="Delete ${UI.escapeHtml(cat.name)}">Delete</button>
        </div>`;
      list.appendChild(item);
    });

    container.innerHTML = '';
    container.appendChild(list);
  }

  /* ── Category Modal ──────────────────────────────────────── */

  function openAddModal() {
    _resetForm();
    document.getElementById('modalCategoryTitle').textContent = 'Add Category';
    document.getElementById('btnSaveCategory').textContent    = 'Save Category';
    UI.openModal('modalCategory');
  }

  function openEditModal(cat) {
    _resetForm();
    document.getElementById('modalCategoryTitle').textContent = 'Edit Category';
    document.getElementById('btnSaveCategory').textContent    = 'Update Category';
    document.getElementById('categoryId').value   = cat.id;
    document.getElementById('categoryName').value = cat.name;
    UI.openModal('modalCategory');
  }

  function _resetForm() {
    document.getElementById('categoryId').value       = '';
    document.getElementById('categoryName').value     = '';
    document.getElementById('categoryNameError').textContent = '';
    document.getElementById('categoryName').classList.remove('error');
  }

  /* ── Validation ──────────────────────────────────────────── */

  async function _validate(name, editId = null) {
    const nameInput = document.getElementById('categoryName');
    const nameError = document.getElementById('categoryNameError');

    nameInput.classList.remove('error');
    nameError.textContent = '';

    let valid = true;

    if (!name.trim()) {
      nameInput.classList.add('error');
      nameError.textContent = 'Category name is required.';
      nameInput.focus();
      valid = false;
    } else if (name.trim().length > 80) {
      nameInput.classList.add('error');
      nameError.textContent = 'Name cannot exceed 80 characters.';
      valid = false;
    } else {
      const duplicate = await DB.Categories.nameExists(name, editId);
      if (duplicate) {
        nameInput.classList.add('error');
        nameError.textContent = 'A category with this name already exists.';
        nameInput.focus();
        valid = false;
      }
    }

    return valid;
  }

  /* ── Save (Create / Update) ──────────────────────────────── */

  async function save() {
    const id   = document.getElementById('categoryId').value.trim();
    const name = document.getElementById('categoryName').value;

    const isValid = await _validate(name, id || null);
    if (!isValid) return;

    const btn = document.getElementById('btnSaveCategory');
    btn.disabled = true;

    try {
      if (id) {
        await DB.Categories.update(id, name);
        UI.toast('Category updated.', 'success');
      } else {
        await DB.Categories.create(name);
        UI.toast('Category created.', 'success');
      }

      UI.closeModal('modalCategory');
      await renderPage();

      // Refresh category dropdowns across the app
      await _refreshDropdowns();

    } catch (err) {
      UI.toast(`Error: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Delete ──────────────────────────────────────────────── */

  async function deleteCategory(id) {
    // Check if any notes use this category
    const count = await DB.Notes.countByCategoryId(id);
    if (count > 0) {
      await UI.confirm({
        title:    'Cannot Delete',
        message:  `This category is used by ${count} ${count === 1 ? 'note' : 'notes'}.`,
        sub:      'Remove or reassign those notes before deleting this category.',
        okLabel:  'OK',
        okClass:  'btn-secondary',
      });
      return;
    }

    const cat = await DB.Categories.getById(id);
    if (!cat) return;

    const confirmed = await UI.confirm({
      title:   'Delete Category',
      message: `Delete "${cat.name}"?`,
      sub:     'This action cannot be undone.',
      okLabel: 'Delete',
    });

    if (!confirmed) return;

    try {
      await DB.Categories.delete(id);
      UI.toast('Category deleted.', 'success');
      await renderPage();
      await _refreshDropdowns();
    } catch (err) {
      UI.toast(`Error: ${err.message}`, 'error');
    }
  }

  /* ── Refresh dropdowns ───────────────────────────────────── */

  async function _refreshDropdowns() {
    const cats = await DB.Categories.getAll();

    // Note form dropdown
    const noteSelect = document.getElementById('noteCategory');
    if (noteSelect) {
      const currentVal = noteSelect.value;
      noteSelect.innerHTML = '<option value="">Select a category…</option>';
      cats.forEach(c => {
        const opt  = document.createElement('option');
        opt.value  = c.id;
        opt.textContent = c.name;
        noteSelect.appendChild(opt);
      });
      noteSelect.value = currentVal;
    }

    // Dashboard filter dropdown
    const filterSelect = document.getElementById('filterCategory');
    if (filterSelect) {
      const currentFilter = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Categories</option>';
      cats.forEach(c => {
        const opt  = document.createElement('option');
        opt.value  = c.id;
        opt.textContent = c.name;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = currentFilter;
    }
  }

  /** Populate the note form category dropdown (no "All" option) */
  async function populateNoteFormDropdown(selectedId = '') {
    const cats   = await DB.Categories.getAll();
    const select = document.getElementById('noteCategory');
    if (!select) return;

    select.innerHTML = '<option value="">Select a category…</option>';

    if (cats.length === 0) {
      select.innerHTML = '<option value="" disabled>No categories — create one first</option>';
      return;
    }

    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /** Populate the dashboard category filter */
  async function populateFilterDropdown(selectedId = '') {
    const cats   = await DB.Categories.getAll();
    const select = document.getElementById('filterCategory');
    if (!select) return;

    select.innerHTML = '<option value="">All Categories</option>';
    cats.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === selectedId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /** Build a id→name lookup map */
  async function buildLookup() {
    const cats = await DB.Categories.getAll();
    const map  = {};
    cats.forEach(c => { map[c.id] = c.name; });
    return map;
  }

  /* ── Event wiring ────────────────────────────────────────── */

  function initEvents() {
    // Save button in modal
    document.getElementById('btnSaveCategory').addEventListener('click', save);

    // Enter key in name input
    document.getElementById('categoryName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
    });

    // Add button on categories page
    document.getElementById('btnAddCategoryPage').addEventListener('click', openAddModal);

    // Add button from diary toolbar
    document.getElementById('btnAddCategory').addEventListener('click', openAddModal);

    // Delegate edit/delete on categories list
    document.getElementById('categoriesContent').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id     = btn.dataset.id;

      if (action === 'edit') {
        const cat = await DB.Categories.getById(id);
        if (cat) openEditModal(cat);
      } else if (action === 'delete') {
        await deleteCategory(id);
      }
    });
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    renderPage,
    openAddModal,
    openEditModal,
    deleteCategory,
    populateNoteFormDropdown,
    populateFilterDropdown,
    buildLookup,
    initEvents,
  };

})();
