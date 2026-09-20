/**
 * images.js — Image upload, compression, preview management
 * Compresses images to max 1600px on longest side before storing.
 */

const ImageManager = (() => {

  const MAX_DIMENSION = 1600;
  const JPEG_QUALITY  = 0.88;

  // In-memory store for images being composed in the note form.
  // Each entry: { id, file, blob, objectUrl, name, type, isExisting }
  let _pending   = [];
  let _toDelete  = [];   // IDs of existing images marked for removal
  let _objectUrls = [];

  /* ── Compression ─────────────────────────────────────────── */

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const image = new Image();

        image.onload = () => {
          let { width, height } = image;

          // Scale down if needed
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            width  = Math.round(width  * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width  = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0, width, height);

          // Use original type for PNG to preserve transparency, JPEG for photos
          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const quality    = outputType === 'image/jpeg' ? JPEG_QUALITY : undefined;

          canvas.toBlob(
            (blob) => {
              if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
              resolve({ blob, type: outputType });
            },
            outputType,
            quality
          );
        };

        image.onerror = () => reject(new Error('Image load failed'));
        image.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  /* ── Preview Grid ────────────────────────────────────────── */

  function _renderPreviewGrid() {
    const grid = document.getElementById('imagePreviewGrid');
    if (!grid) return;

    // Revoke old preview URLs that are no longer needed
    // (keep ones still in _pending)
    const currentUrls = new Set(_pending.map(p => p.objectUrl));
    _objectUrls = _objectUrls.filter(url => {
      if (!currentUrls.has(url)) { URL.revokeObjectURL(url); return false; }
      return true;
    });

    grid.innerHTML = '';

    _pending.forEach((item, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'preview-thumb-wrap';

      const img = document.createElement('img');
      img.className = 'preview-thumb';
      img.src       = item.objectUrl;
      img.alt       = item.name;
      img.title     = item.name;
      img.addEventListener('click', () => Lightbox.open(
        _pending.map(p => ({ src: p.objectUrl, name: p.name })),
        index
      ));

      const removeBtn = document.createElement('button');
      removeBtn.className   = 'preview-remove';
      removeBtn.type        = 'button';
      removeBtn.innerHTML   = '×';
      removeBtn.title       = 'Remove image';
      removeBtn.setAttribute('aria-label', `Remove ${item.name}`);
      removeBtn.addEventListener('click', () => _removeItem(item.id));

      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      grid.appendChild(wrap);
    });
  }

  function _removeItem(id) {
    const item = _pending.find(p => p.id === id);
    if (!item) return;

    if (item.isExisting) {
      // Mark for deletion only when note is saved
      _toDelete.push(id);
    } else {
      // Not yet saved — just revoke the object URL
      URL.revokeObjectURL(item.objectUrl);
      _objectUrls = _objectUrls.filter(u => u !== item.objectUrl);
    }

    _pending = _pending.filter(p => p.id !== id);
    _renderPreviewGrid();
  }

  /* ── File input handler ──────────────────────────────────── */

  async function handleFileInput(files) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const toProcess = fileArray.filter(f => {
      if (!f.type.startsWith('image/')) {
        UI.toast(`"${f.name}" is not a supported image.`, 'warning');
        return false;
      }
      return true;
    });

    for (const file of toProcess) {
      try {
        const { blob, type } = await compressImage(file);
        const objectUrl      = URL.createObjectURL(blob);
        const tempId         = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

        _objectUrls.push(objectUrl);
        _pending.push({
          id:         tempId,
          blob,
          objectUrl,
          name:       file.name,
          type,
          isExisting: false,
        });
      } catch (err) {
        UI.toast(`Could not process "${file.name}".`, 'error');
        console.error(err);
      }
    }

    _renderPreviewGrid();
  }

  /* ── Load existing images into form ──────────────────────── */

  async function loadExisting(imageIds) {
    if (!imageIds || imageIds.length === 0) return;

    const records = await DB.Images.getByIds(imageIds);

    records.forEach(rec => {
      const objectUrl = URL.createObjectURL(rec.blob);
      _objectUrls.push(objectUrl);
      _pending.push({
        id:         rec.id,
        blob:       rec.blob,
        objectUrl,
        name:       rec.name,
        type:       rec.type,
        isExisting: true,
      });
    });

    _renderPreviewGrid();
  }

  /* ── Save pending images and return IDs ──────────────────── */

  async function savePending(noteId) {
    const savedIds = [];

    for (const item of _pending) {
      if (item.isExisting) {
        // Already in DB — just keep its ID
        savedIds.push(item.id);
      } else {
        // New image — save to DB
        const record = await DB.Images.save({
          noteId,
          name: item.name,
          type: item.type,
          blob: item.blob,
        });
        savedIds.push(record.id);
      }
    }

    // Delete images that were removed during edit
    if (_toDelete.length > 0) {
      await DB.Images.deleteMany(_toDelete);
    }

    return savedIds;
  }

  /* ── Lifecycle ───────────────────────────────────────────── */

  function reset() {
    // Revoke all object URLs
    _pending.forEach(item => {
      if (!item.isExisting) URL.revokeObjectURL(item.objectUrl);
    });
    _objectUrls = [];
    _pending    = [];
    _toDelete   = [];
    _renderPreviewGrid();
  }

  function initUploadZone() {
    const fileInput = document.getElementById('imageFileInput');
    const addBtn    = document.getElementById('imageAddBtn');
    const zone      = document.getElementById('imageUploadZone');

    if (!fileInput || !addBtn || !zone) return;

    addBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFileInput(fileInput.files);
      fileInput.value = ''; // reset so same file can be re-selected
    });

    // Drag and drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFileInput(e.dataTransfer.files);
    });
  }

  /* ── Render thumbnails in view modal ────────────────────── */

  async function renderViewThumbs(imageIds, containerEl) {
    containerEl.innerHTML = '';
    if (!imageIds || imageIds.length === 0) return;

    const records = await DB.Images.getByIds(imageIds);
    if (records.length === 0) return;

    const objectUrls = records.map(rec => URL.createObjectURL(rec.blob));

    records.forEach((rec, i) => {
      const img = document.createElement('img');
      img.className = 'view-note-thumb';
      img.src       = objectUrls[i];
      img.alt       = rec.name;
      img.title     = rec.name;
      img.loading   = 'lazy';
      img.tabIndex   = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `Open ${rec.name} in full size`);

      const openImage = () => {
        Lightbox.open(
          records.map((r, j) => ({ src: objectUrls[j], name: r.name })),
          i
        );
      };

      img.addEventListener('click', openImage);
      img.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openImage();
        }
      });

      containerEl.appendChild(img);
    });

    // Revoke when modal closes
    const cleanup = () => {
      objectUrls.forEach(url => URL.revokeObjectURL(url));
      document.getElementById('modalViewNote')
        .removeEventListener('hidden', cleanup);
    };
    document.getElementById('modalViewNote')
      .addEventListener('hidden', cleanup, { once: true });
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    initUploadZone,
    handleFileInput,
    loadExisting,
    savePending,
    reset,
    renderViewThumbs,
    getPendingCount: () => _pending.length,
  };

})();
