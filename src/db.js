// Stockage local : IndexedDB (notes + réglages). Aucune donnée ne quitte l'appareil.
const DB_NAME = 'qwenote';
const DB_VERSION = 1;

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export function openDb(factory = globalThis.indexedDB) {
  return new Promise((res, rej) => {
    const r = factory.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function makeDb(db) {
  const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
  const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return {
    allNotes: () => wrap(tx('notes').getAll()),
    putNote: (n) => wrap(tx('notes', 'readwrite').put(n)),
    deleteNote: (id) => wrap(tx('notes', 'readwrite').delete(id)),
    async putMany(notes) {
      const t = db.transaction('notes', 'readwrite');
      const s = t.objectStore('notes');
      notes.forEach((n) => s.put(n));
      await done(t);
    },
    async getMeta(key, dflt = null) { const r = await wrap(tx('meta').get(key)); return r ? r.value : dflt; },
    setMeta: (key, value) => wrap(tx('meta', 'readwrite').put({ key, value })),
  };
}
