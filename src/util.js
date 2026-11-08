export const DAY = 86400000;
export const TRASH_DAYS = 30;       // durée de conservation en corbeille
export const EXPORT_DAYS = 30;      // intervalle du rappel d'export (indépendant de la corbeille)

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// minuscules + sans accents, pour la recherche
export const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function ago(ts, now = Date.now()) {
  const d = now - ts;
  if (d < 60000) return 'à l’instant';
  if (d < 3600000) return `il y a ${Math.floor(d / 60000)} min`;
  if (d < DAY) return `il y a ${Math.floor(d / 3600000)} h`;
  const days = Math.floor(d / DAY);
  if (days === 1) return 'hier';
  if (days < 60) return `il y a ${days} j`;
  return new Date(ts).toLocaleDateString('fr-FR');
}

export const daysLeftInTrash = (deletedAt, now = Date.now()) =>
  Math.max(0, Math.ceil(TRASH_DAYS - (now - deletedAt) / DAY));

export const dateStamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const safeName = (s, fallback = 'Sans titre') => {
  const t = String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t || fallback;
};

// extrait de texte autour de la première occurrence de la requête (déjà normalisée)
export function snippet(content, q, len = 90) {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!q) return flat.slice(0, len);
  // norm() peut changer la longueur : on cherche dans la version normalisée caractère par caractère
  const n = norm(flat);
  const i = n.indexOf(q);
  if (i < 0 || n.length !== flat.length) return flat.slice(0, len);
  const start = Math.max(0, i - 25);
  return (start > 0 ? '…' : '') + flat.slice(start, start + len) + (start + len < flat.length ? '…' : '');
}

export const debounce = (fn, ms) => {
  let t;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.cancel = () => clearTimeout(t);
  return f;
};
