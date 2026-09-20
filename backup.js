/**
 * backup.js — Export and import backup
 *
 * Format: JSON file containing { version, exportedAt, categories, notes, images }
 * Images are stored as base64 data URLs inside the JSON so the backup is
 * a single self-contained file that works without a ZIP library.
 *
 * The trade-off (larger file for photos) is clearly documented in the spec
 * as an acceptable V1 approach.
 */

const Backup = (() => {

  const BACKUP_VERSION = 1;

  /* ── EXPORT ──────────────────────────────────────────────── */

  async function exportBackup() {
    const btn = document.getElementById('btnExport');
    btn.disabled = true;
    btn.textContent = 'Exporting…';

    try {
      const { categories, notes, images } = await DB.Bulk.exportAll();

      // Convert image Blobs → base64 data URLs so they survive JSON serialisation
      const serialisedImages = await Promise.all(
        images.map(img => _blobToDataUrl(img.blob).then(dataUrl => ({
          id:     img.id,
          noteId: img.noteId,
          name:   img.name,
          type:   img.type,
          data:   dataUrl,   // base64 data URL
        })))
      );

      const payload = {
        version:    BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        appName:    'LearningDiary',
        categories,
        notes,
        images: serialisedImages,
      };

      const json     = JSON.stringify(payload, null, 2);
      const blob     = new Blob([json], { type: 'application/json' });
      const url      = URL.createObjectURL(blob);
      const filename = _buildFilename();

      _triggerDownload(url, filename);
      URL.revokeObjectURL(url);

      UI.recordBackup();
      UI.toast(`Backup exported: ${filename}`, 'success', 4000);

    } catch (err) {
      UI.toast(`Export failed: ${err.message}`, 'error');
      console.error('Export error:', err);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Export Backup';
    }
  }

  function _buildFilename() {
    const now = new Date();
    const y   = now.getFullYear();
    const m   = String(now.getMonth() + 1).padStart(2, '0');
    const d   = String(now.getDate()).padStart(2, '0');
    const h   = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `learning-diary-backup-${y}${m}${d}-${h}${min}.json`;
  }

  function _triggerDownload(url, filename) {
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader  = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Blob to DataURL failed'));
      reader.readAsDataURL(blob);
    });
  }

  /* ── IMPORT — file selection ─────────────────────────────── */

  function triggerImportFileSelect() {
    document.getElementById('importFileInput').click();
  }

  async function handleImportFileSelected(file) {
    if (!file) return;

    // Validate extension
    if (!file.name.endsWith('.json')) {
      UI.toast('Please select a .json backup file.', 'error');
      return;
    }

    let payload;
    try {
      const text = await file.text();
      payload    = JSON.parse(text);
    } catch {
      UI.toast('Could not read the backup file. It may be corrupted.', 'error');
      return;
    }

    // Validate structure
    const validationError = _validatePayload(payload);
    if (validationError) {
      UI.toast(`Invalid backup: ${validationError}`, 'error');
      return;
    }

    // Show preview modal
    _showImportPreview(payload);
  }

  /* ── IMPORT — validation ─────────────────────────────────── */

  function _validatePayload(payload) {
    if (!payload || typeof payload !== 'object')
      return 'File is not a valid backup object.';

    if (payload.appName !== 'LearningDiary')
      return 'This file was not created by Learning Diary.';

    if (payload.version !== BACKUP_VERSION)
      return `Unsupported backup version: ${payload.version}.`;

    if (!Array.isArray(payload.categories))
      return 'Backup is missing categories data.';

    if (!Array.isArray(payload.notes))
      return 'Backup is missing notes data.';

    if (!Array.isArray(payload.images))
      return 'Backup is missing images data.';

    // Check category IDs referenced by notes exist in backup
    const catIds = new Set(payload.categories.map(c => c.id));
    for (const note of payload.notes) {
      if (!catIds.has(note.categoryId)) {
        return `Note "${note.id}" references unknown category "${note.categoryId}".`;
      }
    }

    // Check image IDs referenced by notes exist in backup
    const imgIds = new Set(payload.images.map(i => i.id));
    for (const note of payload.notes) {
      for (const imgId of (note.imageIds || [])) {
        if (!imgIds.has(imgId)) {
          return `Note "${note.id}" references unknown image "${imgId}".`;
        }
      }
    }

    return null; // valid
  }

  /* ── IMPORT — preview modal ──────────────────────────────── */

  let _pendingPayload = null;

  function _showImportPreview(payload) {
    _pendingPayload = payload;

    const exportDate = payload.exportedAt
      ? new Date(payload.exportedAt).toLocaleString()
      : 'Unknown';

    document.getElementById('importSummary').innerHTML = `
      <div class="import-summary-item">
        <span>Exported</span>
        <span>${UI.escapeHtml(exportDate)}</span>
      </div>
      <div class="import-summary-item">
        <span>Notes</span>
        <span class="import-summary-count">${payload.notes.length}</span>
      </div>
      <div class="import-summary-item">
        <span>Categories</span>
        <span class="import-summary-count">${payload.categories.length}</span>
      </div>
      <div class="import-summary-item">
        <span>Images</span>
        <span class="import-summary-count">${payload.images.length}</span>
      </div>`;

    UI.openModal('modalImport');
  }

  /* ── IMPORT — execute ────────────────────────────────────── */

  async function executeImport() {
    if (!_pendingPayload) return;

    const btn = document.getElementById('btnConfirmImport');
    btn.disabled    = true;
    btn.textContent = 'Importing…';

    try {
      // Convert base64 data URLs back to Blobs
      const images = await Promise.all(
        _pendingPayload.images.map(async img => {
          const blob = await _dataUrlToBlob(img.data, img.type || 'image/jpeg');
          return {
            id:     img.id,
            noteId: img.noteId,
            name:   img.name,
            type:   img.type,
            blob,
          };
        })
      );

      await DB.Bulk.importAll({
        categories: _pendingPayload.categories,
        notes:      _pendingPayload.notes,
        images,
      });

      UI.closeModal('modalImport');
      _pendingPayload = null;

      UI.toast('Import complete. Your data has been restored.', 'success', 4000);

      // Refresh the whole app
      await Dashboard.refresh();
      await Categories.populateFilterDropdown();

    } catch (err) {
      UI.toast(`Import failed: ${err.message}`, 'error');
      console.error('Import error:', err);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Import and Replace';
    }
  }

  function _dataUrlToBlob(dataUrl, fallbackType) {
    return new Promise((resolve, reject) => {
      try {
        const [header, base64] = dataUrl.split(',');
        const mimeMatch        = header.match(/:(.*?);/);
        const mime             = mimeMatch ? mimeMatch[1] : fallbackType;
        const binary           = atob(base64);
        const array            = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i);
        }

        resolve(new Blob([array], { type: mime }));
      } catch (err) {
        reject(new Error(`Failed to decode image: ${err.message}`));
      }
    });
  }

  /* ── Event wiring ────────────────────────────────────────── */

  function initEvents() {
    // Export button (settings page)
    document.getElementById('btnExport').addEventListener('click', exportBackup);

    // Import button (settings page)
    document.getElementById('btnImport').addEventListener('click', triggerImportFileSelect);

    // File input change
    const fileInput = document.getElementById('importFileInput');
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) {
        handleImportFileSelected(fileInput.files[0]);
        fileInput.value = ''; // reset so same file can be re-selected
      }
    });

    // Export before import (inside import modal)
    document.getElementById('btnExportBeforeImport').addEventListener('click', async () => {
      await exportBackup();
    });

    // Confirm import button (inside import modal)
    document.getElementById('btnConfirmImport').addEventListener('click', executeImport);
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    exportBackup,
    triggerImportFileSelect,
    handleImportFileSelected,
    executeImport,
    initEvents,
  };

})();
