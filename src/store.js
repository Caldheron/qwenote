// Logique métier des notes. Qwenaëlle sera la source de vérité : ici, aucune gestion de conflit.
import { CATEGORIES, isCategory } from './cats.js';
import { uid, norm, DAY, TRASH_DAYS } from './util.js';

export function makeStore(db) {
  let notes = new Map();

  const api = {
    async init() {
      (await db.allNotes()).forEach((n) => notes.set(n.id, n));
      if (!(await db.getMeta('firstRun'))) await db.setMeta('firstRun', Date.now());
      return api.purgeExpired();
    },
    all: () => [...notes.values()],
    get: (id) => notes.get(id) || null,
    live: () => api.all().filter((n) => !n.deletedAt),
    trashed: () => api.all().filter((n) => n.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt),
    inCategory: (c) => api.live().filter((n) => n.category === c).sort((a, b) => b.modified - a.modified),
    counts() {
      const c = Object.fromEntries(CATEGORIES.map((k) => [k, 0]));
      api.live().forEach((n) => { c[n.category] = (c[n.category] || 0) + 1; });
      return c;
    },

    async create({ title = '', content = '', category = 'Divers' } = {}) {
      const now = Date.now();
      const n = { id: uid(), title, content, category: isCategory(category) ? category : 'Divers', created: now, modified: now, deletedAt: null, actionIds: [] };
      notes.set(n.id, n); await db.putNote(n); return n;
    },
    // Ne touche à `modified` que si quelque chose a réellement changé.
    async update(id, patch) {
      const n = notes.get(id); if (!n) return null;
      const next = { ...n };
      let changed = false;
      for (const k of ['title', 'content', 'category']) {
        if (patch[k] !== undefined && patch[k] !== n[k]) {
          if (k === 'category' && !isCategory(patch[k])) continue;
          next[k] = patch[k]; changed = true;
        }
      }
      if (!changed) return n;
      next.modified = Date.now();
      notes.set(id, next); await db.putNote(next); return next;
    },
    async trash(id) {
      const n = notes.get(id); if (!n) return;
      const next = { ...n, deletedAt: Date.now() };
      notes.set(id, next); await db.putNote(next);
    },
    async restore(id) {
      const n = notes.get(id); if (!n) return;
      const next = { ...n, deletedAt: null };
      notes.set(id, next); await db.putNote(next);
    },
    async removeNow(id) { notes.delete(id); await db.deleteNote(id); },
    async emptyTrash() { for (const n of api.trashed()) await api.removeNow(n.id); },
    // Suppression définitive après 30 jours de corbeille. Indépendante de l'export.
    async purgeExpired(now = Date.now()) {
      let k = 0;
      for (const n of api.trashed()) if (now - n.deletedAt >= TRASH_DAYS * DAY) { await api.removeNow(n.id); k++; }
      return k;
    },

    search(q) {
      const nq = norm(q.trim());
      if (!nq) return [];
      return api.live().filter((n) => norm(n.title + ' ' + n.content).includes(nq)).sort((a, b) => b.modified - a.modified);
    },

    // Import JSON : fusion par identifiant, la version la plus récente gagne. Rien n'est jamais supprimé.
    async importData(data) {
      if (!data || data.app !== 'qwenote' || !Array.isArray(data.notes)) throw new Error('Fichier non reconnu : ce n’est pas une sauvegarde Qwenote.');
      const res = { added: 0, updated: 0, kept: 0, skipped: 0 };
      const now = Date.now(); const batch = [];
      for (const r of data.notes) {
        if (!r || typeof r.id !== 'string' || typeof r.content !== 'string') { res.skipped++; continue; }
        const n = {
          id: r.id, title: String(r.title ?? ''), content: r.content,
          category: isCategory(r.category) ? r.category : 'Divers',
          created: Number.isFinite(r.created) ? r.created : now,
          modified: Number.isFinite(r.modified) ? r.modified : now,
          deletedAt: Number.isFinite(r.deletedAt) ? r.deletedAt : null,
          actionIds: Array.isArray(r.actionIds) ? r.actionIds : [],
        };
        const cur = notes.get(n.id);
        if (!cur) { res.added++; batch.push(n); }
        else if (n.modified > cur.modified) { res.updated++; batch.push(n); }
        else res.kept++;
      }
      await db.putMany(batch);
      batch.forEach((n) => notes.set(n.id, n));
      return res;
    },
  };
  return api;
}
