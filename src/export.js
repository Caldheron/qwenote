import { CATEGORIES, CATS_VERSION } from './cats.js';
import { makeZip } from './zip.js';
import { safeName, dateStamp } from './util.js';

// Sauvegarde complète : notes vivantes ET notes en corbeille (pour pouvoir tout restaurer).
export function buildJson(notes, now = Date.now()) {
  return JSON.stringify({ app: 'qwenote', format: 1, catsVersion: CATS_VERSION, exportedAt: now, notes }, null, 2);
}

const iso = (t) => new Date(t).toISOString();

// Un fichier .md par note, rangé dans un dossier par catégorie. Les notes en corbeille sont exclues.
export function buildMarkdownFiles(notes) {
  const used = new Set(); const files = [];
  notes.filter((n) => !n.deletedAt).forEach((n) => {
    const folder = safeName(CATEGORIES.includes(n.category) ? n.category : 'Divers');
    const base = safeName(n.title);
    let name = `${folder}/${base}.md`; let k = 2;
    while (used.has(name.toLowerCase())) name = `${folder}/${base} (${k++}).md`;
    used.add(name.toLowerCase());
    const head = `---\nid: ${n.id}\ntitre: ${JSON.stringify(n.title)}\ncatégorie: ${n.category}\ncréée: ${iso(n.created)}\nmodifiée: ${iso(n.modified)}\n---\n\n`;
    files.push({ name, data: head + n.content + (n.content.endsWith('\n') ? '' : '\n') });
  });
  return files;
}

export const buildMarkdownZip = (notes) => makeZip(buildMarkdownFiles(notes));

export function download(filename, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const jsonName = () => `codex-sauvegarde-${dateStamp()}.json`;
export const zipName = () => `codex-markdown-${dateStamp()}.zip`;
