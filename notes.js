/**
 * notes.js — Note CRUD operations and modals
 */

const Notes = (() => {

  let _currentViewNoteId = null;  // ID of note currently shown in view modal
  let _savedRange = null;

  function _editor() {
    return document.getElementById('noteContentEditor');
  }

  function _setEditorContent(content) {
    const editor = _editor();
    if (!editor) return;
    const value = String(content || '');
    editor.innerHTML = /<\/?[a-z][\s\S]*>/i.test(value)
      ? UI.sanitizeRichText(value)
      : UI.escapeHtml(value).replace(/\r?\n/g, '<br>');
    document.getElementById('noteContent').value = UI.sanitizeRichText(editor.innerHTML);
  }

  function _getRichContent() {
    const editor = _editor();
    const html = UI.sanitizeRichText(editor ? editor.innerHTML : '');
    document.getElementById('noteContent').value = html;
    return html;
  }

  function _getPlainContent() {
    return UI.richTextToPlain(_getRichContent());
  }

  function _saveSelection() {
    const editor = _editor();
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return;
    _savedRange = selection.getRangeAt(0).cloneRange();
  }

  function _restoreSelection() {
    if (!_savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(_savedRange);
  }

  function _applyEditorCommand(command, value = null) {
    const editor = _editor();
    editor.focus();
    _restoreSelection();
    document.execCommand(command, false, value);
    _saveSelection();
    _getRichContent();
  }

  /* ── Open Add Note Modal ─────────────────────────────────── */

  async function openAddModal() {
    _resetForm();
    document.getElementById('modalNoteTitle').textContent  = 'Add Note';
    document.getElementById('btnSaveNote').textContent     = 'Save Note';
    document.getElementById('noteDate').value = UI.todayISO();
    ImageManager.reset();

    // Check for categories
    const cats = await DB.Categories.getAll();
    if (cats.length === 0) {
      const goCreate = await UI.confirm({
        title:   'No Categories Yet',
        message: 'You need at least one category before adding a note.',
        sub:     'Would you like to create a category now?',
        okLabel: 'Create Category',
        okClass: 'btn-primary',
      });
      if (goCreate) {
        UI.navigateTo('categories');
        Categories.openAddModal();
      }
      return;
    }

    await Categories.populateNoteFormDropdown();
    UI.openModal('modalNote');
  }

  async function openEditWithContent(noteId, content) {
    await openEditModal(noteId);
    _setEditorContent(content);
    const editor = _editor();
    if (editor) {
      editor.focus();
    }
  }

  /* ── Open Edit Note Modal ────────────────────────────────── */

  async function openEditModal(noteId) {
    const note = await DB.Notes.getById(noteId);
    if (!note) { UI.toast('Note not found.', 'error'); return; }

    _resetForm();
    document.getElementById('modalNoteTitle').textContent = 'Edit Note';
    document.getElementById('btnSaveNote').textContent    = 'Update Note';
    document.getElementById('noteId').value              = note.id;
    document.getElementById('noteDate').value            = note.date;
    _setEditorContent(note.content);

    await Categories.populateNoteFormDropdown(note.categoryId);

    ImageManager.reset();
    if (note.imageIds && note.imageIds.length > 0) {
      await ImageManager.loadExisting(note.imageIds);
    }

    UI.closeModal('modalViewNote');
    UI.openModal('modalNote');
  }

  /* ── Form reset ──────────────────────────────────────────── */

  function _resetForm() {
    document.getElementById('noteId').value      = '';
    document.getElementById('noteDate').value    = '';
    document.getElementById('noteCategory').value = '';
    _setEditorContent('');

    // Clear errors
    ['noteDate', 'noteCategory', 'noteContent'].forEach(field => {
      const input = document.getElementById(field);
      const error = document.getElementById(`${field}Error`);
      if (input) input.classList.remove('error');
      if (error) error.textContent = '';
    });
  }

  /* ── Validation ──────────────────────────────────────────── */

  function _validate() {
    let valid = true;

    const date     = document.getElementById('noteDate').value;
    const category = document.getElementById('noteCategory').value;
    const content  = _getPlainContent();

    const dateInput     = document.getElementById('noteDate');
    const categoryInput = document.getElementById('noteCategory');
    const contentInput  = document.getElementById('noteContent');

    // Reset
    [dateInput, categoryInput, contentInput].forEach(el => el.classList.remove('error'));
    ['noteDateError', 'noteCategoryError', 'noteContentError'].forEach(id => {
      document.getElementById(id).textContent = '';
    });

    if (!date) {
      dateInput.classList.add('error');
      document.getElementById('noteDateError').textContent = 'Date is required.';
      if (valid) dateInput.focus();
      valid = false;
    }

    if (!category) {
      categoryInput.classList.add('error');
      document.getElementById('noteCategoryError').textContent = 'Category is required.';
      if (valid) categoryInput.focus();
      valid = false;
    }

    if (!content) {
      contentInput.classList.add('error');
      document.getElementById('noteContentError').textContent = 'Please write what you learned.';
      if (valid) contentInput.focus();
      valid = false;
    }

    return valid;
  }

  /* ── Save (Create or Update) ─────────────────────────────── */

  async function save() {
    if (!_validate()) return;

    const btn = document.getElementById('btnSaveNote');
    btn.disabled = true;

    const id         = document.getElementById('noteId').value.trim();
    const date       = document.getElementById('noteDate').value;
    const categoryId = document.getElementById('noteCategory').value;
    const content    = _getRichContent();

    try {
      if (id) {
        // Update existing note
        const imageIds = await ImageManager.savePending(id);

        await DB.Notes.update(id, { date, categoryId, content, imageIds });
        UI.toast('Note updated.', 'success');
      } else {
        // Create new note — we need the ID first for image storage
        // Create note with empty imageIds, then update after images are saved
        const note     = await DB.Notes.create({ date, categoryId, content, imageIds: [] });
        const imageIds = await ImageManager.savePending(note.id);

        if (imageIds.length > 0) {
          await DB.Notes.update(note.id, { date, categoryId, content, imageIds });
        }

        UI.toast('Note saved.', 'success');
      }

      UI.closeModal('modalNote');
      ImageManager.reset();
      await Dashboard.refresh();

    } catch (err) {
      UI.toast(`Error saving note: ${err.message}`, 'error');
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  }

  /* ── View Note Modal ─────────────────────────────────────── */

  async function openViewModal(noteId) {
    const note = await DB.Notes.getById(noteId);
    if (!note) { UI.toast('Note not found.', 'error'); return; }

    _currentViewNoteId = noteId;
    GeminiAI.resetPanel();

    const catLookup = await Categories.buildLookup();
    const catName   = catLookup[note.categoryId] || 'Unknown';

    document.getElementById('viewNoteCategory').textContent = catName;
    document.getElementById('viewNoteDate').textContent     = UI.formatDateLong(note.date);
    document.getElementById('viewNoteContent').innerHTML = UI.sanitizeRichText(note.content);

    // Images
    const imgContainer = document.getElementById('viewNoteImages');
    imgContainer.innerHTML = '';
    await ImageManager.renderViewThumbs(note.imageIds, imgContainer);

    UI.openModal('modalViewNote');
  }

  /* ── Delete Note ─────────────────────────────────────────── */

  async function deleteNote(noteId) {
    const confirmed = await UI.confirm({
      title:   'Delete Note',
      message: 'Delete this learning note?',
      sub:     'This action cannot be undone.',
      okLabel: 'Delete',
    });

    if (!confirmed) return;

    try {
      const note = await DB.Notes.getById(noteId);
      if (!note) return;

      // Delete associated images
      if (note.imageIds && note.imageIds.length > 0) {
        await DB.Images.deleteMany(note.imageIds);
      }

      await DB.Notes.delete(noteId);
      UI.toast('Note deleted.', 'success');
      UI.closeModal('modalViewNote');
      _currentViewNoteId = null;
      await Dashboard.refresh();

    } catch (err) {
      UI.toast(`Error deleting note: ${err.message}`, 'error');
    }
  }

  /* ── Event wiring ────────────────────────────────────────── */

  function initEvents() {
    // Add Note button (diary toolbar)
    document.getElementById('btnAddNote').addEventListener('click', openAddModal);

    // Save note button
    document.getElementById('btnSaveNote').addEventListener('click', save);

    // Ctrl+Enter in textarea saves note
    document.getElementById('noteContentEditor').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });

    document.querySelectorAll('.editor-tool').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (button.dataset.command === 'code') {
          _applyEditorCommand('formatBlock', 'pre');
        } else {
          _applyEditorCommand(button.dataset.command);
        }
      });
    });

    document.getElementById('noteContentEditor').addEventListener('keyup', _saveSelection);
    document.getElementById('noteContentEditor').addEventListener('mouseup', _saveSelection);
    document.querySelectorAll('.color-swatch').forEach(button => {
      button.addEventListener('mousedown', event => {
        event.preventDefault();
        _applyEditorCommand('foreColor', button.dataset.color);
      });
    });

    document.getElementById('noteTextColor').addEventListener('input', event => {
      _applyEditorCommand('foreColor', event.target.value);
    });

    document.getElementById('noteFontSize').addEventListener('change', event => {
      _applyEditorCommand('fontSize', event.target.value);
    });

    // Edit from view modal
    document.getElementById('btnEditFromView').addEventListener('click', () => {
      if (_currentViewNoteId) openEditModal(_currentViewNoteId);
    });

    // Delete from view modal
    document.getElementById('btnDeleteFromView').addEventListener('click', () => {
      if (_currentViewNoteId) deleteNote(_currentViewNoteId);
    });
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    openAddModal,
    openEditModal,
    openEditWithContent,
    openViewModal,
    deleteNote,
    getCurrentViewNoteId: () => _currentViewNoteId,
    initEvents,
  };

})();
