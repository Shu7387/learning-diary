/**
 * db.js — IndexedDB abstraction layer
 * Database: LearningDiaryDB
 * Stores: categories, notes, images
 */

const DB = (() => {

  const DB_NAME    = 'LearningDiaryDB';
  const DB_VERSION = 1;

  let _db = null;

  /* ── Open / initialise ─────────────────────────────────────── */

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // categories store
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('name', 'name', { unique: false });
          catStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // notes store
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('date',       'date',       { unique: false });
          noteStore.createIndex('categoryId', 'categoryId', { unique: false });
          noteStore.createIndex('createdAt',  'createdAt',  { unique: false });
        }

        // images store
        if (!db.objectStoreNames.contains('images')) {
          const imgStore = db.createObjectStore('images', { keyPath: 'id' });
          imgStore.createIndex('noteId', 'noteId', { unique: false });
        }
      };

      req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror    = (e) => reject(new Error(`DB open failed: ${e.target.error}`));
      req.onblocked  = ()  => reject(new Error('DB blocked by another tab'));
    });
  }

  /* ── Generic helpers ───────────────────────────────────────── */

  function transaction(stores, mode = 'readonly') {
    return _db.transaction(stores, mode);
  }

  function promisifyRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = (e) => reject(e.target.error);
    });
  }

  function getAllFromStore(storeName) {
    const tx    = transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return promisifyRequest(store.getAll());
  }

  function getByIdFromStore(storeName, id) {
    const tx    = transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    return promisifyRequest(store.get(id));
  }

  function putToStore(storeName, record) {
    const tx    = transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return promisifyRequest(store.put(record));
  }

  function deleteFromStore(storeName, id) {
    const tx    = transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return promisifyRequest(store.delete(id));
  }

  function clearStore(storeName) {
    const tx    = transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    return promisifyRequest(store.clear());
  }

  /* ── ID generators ─────────────────────────────────────────── */

  function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /* ═══════════════════════════════════════════════════════════
     CATEGORIES
  ═══════════════════════════════════════════════════════════ */

  const Categories = {

    getAll() {
      return getAllFromStore('categories').then(cats =>
        cats.sort((a, b) => a.name.localeCompare(b.name))
      );
    },

    getById(id) {
      return getByIdFromStore('categories', id);
    },

    async create(name) {
      const now = new Date().toISOString();
      const record = {
        id:        generateId('cat'),
        name:      name.trim(),
        createdAt: now,
        updatedAt: now,
      };
      await putToStore('categories', record);
      return record;
    },

    async update(id, name) {
      const existing = await getByIdFromStore('categories', id);
      if (!existing) throw new Error('Category not found');
      const updated = { ...existing, name: name.trim(), updatedAt: new Date().toISOString() };
      await putToStore('categories', updated);
      return updated;
    },

    async delete(id) {
      await deleteFromStore('categories', id);
    },

    async nameExists(name, excludeId = null) {
      const all = await getAllFromStore('categories');
      const normalised = name.trim().toLowerCase();
      return all.some(c =>
        c.name.toLowerCase() === normalised && c.id !== excludeId
      );
    },

  };

  /* ═══════════════════════════════════════════════════════════
     NOTES
  ═══════════════════════════════════════════════════════════ */

  const Notes = {

    getAll() {
      return getAllFromStore('notes');
    },

    getById(id) {
      return getByIdFromStore('notes', id);
    },

    async create({ date, categoryId, content, imageIds = [] }) {
      const now = new Date().toISOString();
      const record = {
        id:         generateId('note'),
        date,        // 'YYYY-MM-DD'
        categoryId,
        content:    content.trim(),
        imageIds,
        createdAt:  now,
        updatedAt:  now,
      };
      await putToStore('notes', record);
      return record;
    },

    async update(id, { date, categoryId, content, imageIds }) {
      const existing = await getByIdFromStore('notes', id);
      if (!existing) throw new Error('Note not found');
      const updated = {
        ...existing,
        date,
        categoryId,
        content:   content.trim(),
        imageIds:  imageIds ?? existing.imageIds,
        updatedAt: new Date().toISOString(),
      };
      await putToStore('notes', updated);
      return updated;
    },

    async delete(id) {
      await deleteFromStore('notes', id);
    },

    async countByCategoryId(categoryId) {
      const all = await getAllFromStore('notes');
      return all.filter(n => n.categoryId === categoryId).length;
    },

  };

  /* ═══════════════════════════════════════════════════════════
     IMAGES
  ═══════════════════════════════════════════════════════════ */

  const Images = {

    getById(id) {
      return getByIdFromStore('images', id);
    },

    async getByIds(ids) {
      if (!ids || ids.length === 0) return [];
      const results = await Promise.all(ids.map(id => getByIdFromStore('images', id)));
      return results.filter(Boolean);
    },

    async getByNoteId(noteId) {
      const all = await getAllFromStore('images');
      return all.filter(img => img.noteId === noteId);
    },

    async save({ noteId, name, type, blob }) {
      const record = {
        id:     generateId('img'),
        noteId,
        name,
        type,
        blob,
      };
      await putToStore('images', record);
      return record;
    },

    async delete(id) {
      await deleteFromStore('images', id);
    },

    async deleteMany(ids) {
      if (!ids || ids.length === 0) return;
      await Promise.all(ids.map(id => deleteFromStore('images', id)));
    },

    getAll() {
      return getAllFromStore('images');
    },

  };

  /* ═══════════════════════════════════════════════════════════
     BULK OPERATIONS (Backup / Restore)
  ═══════════════════════════════════════════════════════════ */

  const Bulk = {

    /** Export all data as plain JS objects */
    async exportAll() {
      const [categories, notes, images] = await Promise.all([
        getAllFromStore('categories'),
        getAllFromStore('notes'),
        getAllFromStore('images'),
      ]);
      return { categories, notes, images };
    },

    /** Replace all data atomically.
     *  Validates payload then clears and re-imports in one logical operation. */
    async importAll({ categories, notes, images }) {
      // Clear all stores
      await Promise.all([
        clearStore('categories'),
        clearStore('notes'),
        clearStore('images'),
      ]);

      // Re-import
      const tx = _db.transaction(['categories', 'notes', 'images'], 'readwrite');

      const catStore  = tx.objectStore('categories');
      const noteStore = tx.objectStore('notes');
      const imgStore  = tx.objectStore('images');

      for (const cat  of categories) catStore.put(cat);
      for (const note of notes)      noteStore.put(note);
      for (const img  of images)     imgStore.put(img);

      return new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror    = (e) => reject(e.target.error);
        tx.onabort    = (e) => reject(e.target.error);
      });
    },

  };

  /* ── Public API ─────────────────────────────────────────────── */

  return { open, Categories, Notes, Images, Bulk };

})();
