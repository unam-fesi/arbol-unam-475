// IndexedDB-backed offline queue for measurements
// Las mediciones se encolan si no hay red; al volver online se sincronizan.

(function () {
  const DB_NAME = 'arbol-unam-offline';
  const DB_VERSION = 1;
  const STORE = 'pending_measurements';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'localId', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function enqueue(record) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const r = tx.objectStore(STORE).add({ ...record, queuedAt: Date.now() });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function listQueue() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  async function removeFromQueue(localId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const r = tx.objectStore(STORE).delete(localId);
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
    });
  }

  async function syncPending() {
    if (typeof sb === 'undefined' || !navigator.onLine) return { skipped: true };
    const items = await listQueue();
    if (items.length === 0) return { synced: 0 };
    let synced = 0, failed = 0;
    for (const item of items) {
      try {
        const { error } = await sb.from('tree_measurements').insert([item.payload]);
        if (error) { failed++; continue; }
        // If first measurement included planting location, also push to catalog
        if (item.plantingUpdate) {
          await sb.from('trees_catalog').update(item.plantingUpdate).eq('id', item.payload.tree_id);
        }
        await removeFromQueue(item.localId);
        synced++;
      } catch (e) { failed++; }
    }
    return { synced, failed, remaining: items.length - synced };
  }

  // Auto-sync when back online
  window.addEventListener('online', () => {
    syncPending().then((r) => {
      if (r?.synced && typeof showToast === 'function') {
        showToast(`Sincronizadas ${r.synced} mediciones pendientes`, 'success');
      }
    });
  });

  // Public API
  window.OfflineQueue = { enqueue, listQueue, removeFromQueue, syncPending };
})();
