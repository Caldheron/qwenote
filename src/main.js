import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-400-italic.css';
import '@fontsource/eb-garamond/latin-500.css';
import '@fontsource/eb-garamond/latin-600.css';
import './phaneia.css';
import './qwenote.css';
import { registerSW } from 'virtual:pwa-register';

import { openDb, makeDb } from './db.js';
import { makeStore } from './store.js';
import { CATEGORIES, CATS_VERSION, sealFor } from './cats.js';
import { buildJson, buildMarkdownZip, download, jsonName, zipName } from './export.js';
import { esc, ago, daysLeftInTrash, snippet, norm, DAY, EXPORT_DAYS, TRASH_DAYS, debounce } from './util.js';
import { syncNow, syncStatus } from './sync.js';

const $ = (id) => document.getElementById(id);
const main = $('main');
const APP_VERSION = '1.2.0';

let db, store;
const ui = { open: null, q: '' };
try { ui.open = sessionStorage.getItem('qn-open'); } catch { /* ignoré */ }
const setOpen = (c) => { ui.open = c; try { c ? sessionStorage.setItem('qn-open', c) : sessionStorage.removeItem('qn-open'); } catch { /* ignoré */ } };

/* ---------- petits outils d'interface ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}
const titleHtml = (n) => (n.title.trim() ? esc(n.title) : '<i>Sans titre</i>');
function noteCard(n, extra) {
  return `<div class="quest-scroll" role="button" tabindex="0" data-id="${n.id}" style="--seal-color: var(${sealFor(n.category)})">
    <div class="quest-title">${titleHtml(n)}</div><div class="quest-tag">${extra}</div></div>`;
}
function activateOnKey(e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); } }

let navs = 0; let goingBack = false;
function goBack() { if (navs > 0) { goingBack = true; navs--; history.back(); } else location.hash = '#/'; }

/* ---------- modale ---------- */
const modal = $('modal');
const closeModal = () => modal.classList.remove('active');
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

/* ---------- état de synchro et rappel d'export ---------- */
async function syncLine() {
  const st = await syncStatus({ db, store });
  return `<div class="qn-sync"><span class="qn-dot ${st.state}"></span>${esc(st.text)}</div>`;
}

// Synchronisation : à l'ouverture, au retour sur l'appli, après un enregistrement (avec délai) et via le bouton.
let syncing = false;
async function runSync({ quiet = true } = {}) {
  if (syncing) return null;
  syncing = true;
  try {
    const r = await syncNow({ db, store });
    if (!r.ok) { if (!quiet) toast(r.message); return r; }
    if (r.conflicts.length) {
      const prev = await db.getMeta('conflicts', []);
      await db.setMeta('conflicts', prev.concat(r.conflicts.map((c) => ({ id: c.id, title: String(c.title || ''), kept: c.kept, at: Date.now() }))));
      toast(`Conflit sur ${r.conflicts.length} note${r.conflicts.length > 1 ? 's' : ''} : voir l’accueil`);
    } else if (!quiet) toast(`Synchronisé ✔ ${r.sent} envoyée(s), ${r.received} reçue(s)`);
    if (r.received || r.conflicts.length) refreshView();
    return r;
  } finally { syncing = false; }
}
const autoSync = debounce(() => runSync({ quiet: true }), 4000);
function refreshView() { const name = parseHash().seg[0] || 'home'; if (['home', 'trash', 'settings'].includes(name)) route(); }

async function conflictCard() {
  const list = await db.getMeta('conflicts', []);
  if (!list.length) return '';
  const lines = list.slice(-3).map((c) => `Conflit sur « ${esc(c.title) || 'Sans titre'} » : la version la plus récente a été gardée (${c.kept === 'telephone' ? 'celle du téléphone' : 'celle de Céleste'}), l’autre est dans la corbeille.`).join('<br>');
  return `<div class="qn-reminder"><span>${lines}${list.length > 3 ? `<br>… et ${list.length - 3} autre(s).` : ''}</span><button class="btn-forged ember" data-ack type="button">Compris</button></div>`;
}
async function exportInfo() {
  const last = await db.getMeta('lastExport', null);
  const first = await db.getMeta('firstRun', Date.now());
  const base = last ?? first;
  const next = base + EXPORT_DAYS * DAY;
  return { last, due: Date.now() >= next, daysToNext: Math.max(0, Math.ceil((next - Date.now()) / DAY)) };
}

/* ---------- vues ---------- */
async function homeView() {
  const counts = store.counts();
  const info = await exportInfo();
  let h = '';
  if (info.due) h += `<div class="qn-reminder"><span>Il est temps d’exporter tes notes (${info.last ? 'dernier export ' + ago(info.last) : 'aucun export pour l’instant'}).</span><button class="btn-forged ember" data-go="#/settings" type="button">Exporter</button></div>`;
  h += await conflictCard();
  h += await syncLine();
  h += `<input class="qn-input" id="q" placeholder="Rechercher dans les notes…" readonly aria-label="Rechercher" style="margin-bottom:14px">`;
  for (const c of CATEGORIES) {
    const open = ui.open === c;
    h += `<button class="qn-cat${open ? ' open' : ''}" data-cat="${esc(c)}" type="button" aria-expanded="${open}"><span>${esc(c)}</span><span class="cnt">${counts[c] || 0}</span><span class="car">${open ? '▴' : '▾'}</span></button>`;
    if (open) {
      const list = store.inCategory(c);
      h += `<div class="qn-list">${list.length ? list.map((n) => noteCard(n, 'modifiée ' + ago(n.modified))).join('') : '<div class="qn-mu">Aucune note.</div>'}</div>`;
    }
  }
  main.innerHTML = h;
  main.querySelectorAll('.qn-cat').forEach((b) => (b.onclick = () => { setOpen(ui.open === b.dataset.cat ? null : b.dataset.cat); homeView(); }));
  main.querySelectorAll('[data-id]').forEach((e) => (e.onclick = () => (location.hash = '#/note/' + e.dataset.id)));
  main.querySelectorAll('[data-go]').forEach((e) => (e.onclick = () => (location.hash = e.dataset.go)));
  main.querySelectorAll('[data-ack]').forEach((b) => (b.onclick = async () => { await db.setMeta('conflicts', []); homeView(); }));
  $('q').onclick = () => { ui.q = ''; location.hash = '#/search'; };
  main.onkeydown = activateOnKey;
}

async function searchView() {
  main.innerHTML = (await syncLine()) + `<input class="qn-input" id="q" type="search" placeholder="Rechercher dans les notes…" value="${esc(ui.q)}" aria-label="Rechercher"><div id="res" style="margin-top:14px"></div>`;
  const q = $('q'); q.focus();
  const run = () => {
    const nq = norm(ui.q.trim());
    const res = store.search(ui.q).slice(0, 100);
    $('res').innerHTML = !nq
      ? '<div class="qn-mu">Recherche dans les titres et le texte, toutes catégories confondues.</div>'
      : res.length
        ? res.map((n) => noteCard(n, `${esc(n.category)} · ${ago(n.modified)}<br>${esc(snippet(n.content, nq))}`)).join('')
        : '<div class="qn-mu">Aucun résultat.</div>';
    $('res').querySelectorAll('[data-id]').forEach((e) => (e.onclick = () => (location.hash = '#/note/' + e.dataset.id)));
  };
  q.oninput = () => { ui.q = q.value; run(); };
  main.onkeydown = activateOnKey;
  run();
}

function noteView(id, params) {
  let n = id ? store.get(id) : null;
  if (id && !n) { toast('Note introuvable'); location.hash = '#/'; return; }
  if (n && n.deletedAt) { location.hash = '#/trash'; return; }
  const st = { id: n ? n.id : null, category: n ? n.category : (CATEGORIES.includes(params.get('cat')) ? params.get('cat') : (ui.open || 'Divers')) };
  main.onkeydown = null;
  main.innerHTML = `<button class="back-btn" id="bk" type="button">← Retour</button>
    <input class="qn-input qn-title" id="ti" placeholder="Titre" value="${esc(n ? n.title : '')}" aria-label="Titre">
    <div class="qn-row"><span class="qn-chip" id="ct">${esc(st.category)}</span><span class="qn-mu" id="meta">${n ? 'modifiée ' + ago(n.modified) : 'nouvelle note'}</span><span class="grow"></span><button class="btn-forged" id="cc" type="button">Changer de catégorie</button></div>
    <textarea class="qn-editor" id="bo" placeholder="Écris ici (Markdown)…" aria-label="Texte de la note">${esc(n ? n.content : '')}</textarea>
    <div class="qn-mu" id="st" style="margin-top:8px">${n ? 'Enregistré automatiquement ✔' : 'Enregistrement automatique dès que tu écris'}</div>
    <div class="qn-row"><button class="btn-forged gold" id="sv" type="button">Enregistrer</button><button class="btn-forged wine" id="dl" type="button">Supprimer</button></div>`;

  // file d'attente : un seul enregistrement à la fois (évite les doublons à la création)
  let chain = Promise.resolve(); let timer = null; let discarded = false;
  const persist = () => (chain = chain.then(async () => {
    if (discarded) return;
    const title = $('ti') ? $('ti').value : ''; const content = $('bo') ? $('bo').value : '';
    if (!st.id) {
      if (!title.trim() && !content.trim()) return;
      const c = await store.create({ title, content, category: st.category });
      st.id = c.id; history.replaceState(null, '', '#/note/' + c.id);
    } else await store.update(st.id, { title, content, category: st.category });
    if ($('st')) $('st').textContent = 'Enregistré automatiquement ✔';
    autoSync();
  }).catch(() => { if ($('st')) $('st').textContent = 'Échec de l’enregistrement : réessaie ou exporte tes notes.'; }));
  const schedule = () => { $('st').textContent = 'Enregistrement…'; clearTimeout(timer); timer = setTimeout(persist, 600); };
  const flush = () => { clearTimeout(timer); return persist(); };
  $('ti').oninput = schedule; $('bo').oninput = schedule;
  $('bk').onclick = goBack;
  $('sv').onclick = async () => {
    if (!$('ti').value.trim() && $('bo').value.trim()) $('ti').value = 'Sans titre';
    await flush(); toast('Note enregistrée'); goBack();
  };
  $('dl').onclick = async () => {
    await flush(); discarded = true; // on enregistre d'abord : rien de tapé n'est perdu, tout reste 30 jours en corbeille
    if (st.id) { await store.trash(st.id); toast(`Déplacée dans la corbeille (${TRASH_DAYS} j)`); autoSync(); } else toast('Brouillon vide supprimé');
    goBack();
  };
  $('cc').onclick = () => {
    $('sheet').innerHTML = `<h3>CHANGER DE CATÉGORIE</h3>${CATEGORIES.map((c) => `<div class="theme-choice${c === st.category ? ' selected' : ''}" role="button" tabindex="0" data-c="${esc(c)}">${esc(c)}</div>`).join('')}<div class="modal-close" id="mc" role="button" tabindex="0">Fermer</div>`;
    modal.classList.add('active');
    $('sheet').querySelectorAll('[data-c]').forEach((e) => (e.onclick = () => {
      st.category = e.dataset.c; $('ct').textContent = st.category; closeModal(); schedule();
      toast('Catégorie : ' + st.category);
    }));
    $('sheet').onkeydown = activateOnKey; $('mc').onclick = closeModal;
  };
  if (!n) $('ti').focus();
  const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush);
  return async () => {
    document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush);
    closeModal(); await flush();
  };
}

async function trashView() {
  await store.purgeExpired();
  const list = store.trashed();
  main.innerHTML = `<div class="qn-h">Corbeille</div><div class="qn-mu" style="text-align:center;margin-bottom:12px">Les notes sont conservées ${TRASH_DAYS} jours, puis supprimées définitivement.</div>
    ${list.length ? list.map((n) => `<div class="qn-card trash"><div class="quest-title">${titleHtml(n)}</div><div class="quest-tag">${esc(n.category)} · suppression dans ${daysLeftInTrash(n.deletedAt)} j</div>
      <div class="qn-row"><button class="btn-forged gold" data-r="${n.id}" type="button">Restaurer</button><button class="btn-forged wine" data-x="${n.id}" type="button">Supprimer maintenant</button></div></div>`).join('') + `<div class="qn-row" style="justify-content:center"><button class="btn-forged" id="empty" type="button">Vider la corbeille</button></div>` : '<div class="qn-mu" style="text-align:center">Corbeille vide.</div>'}`;
  main.querySelectorAll('[data-r]').forEach((b) => (b.onclick = async () => { await store.restore(b.dataset.r); toast('Note restaurée'); autoSync(); trashView(); updateTabs(); }));
  main.querySelectorAll('[data-x]').forEach((b) => (b.onclick = async () => { if (confirm('Supprimer définitivement cette note ?')) { await store.removeNow(b.dataset.x); toast('Supprimée définitivement'); trashView(); updateTabs(); } }));
  const e = $('empty'); if (e) e.onclick = async () => { if (confirm('Vider toute la corbeille ? Cette action est définitive.')) { await store.emptyTrash(); toast('Corbeille vidée'); trashView(); updateTabs(); } };
  main.onkeydown = null;
}

async function settingsView() {
  const url = await db.getMeta('syncUrl', ''); const key = await db.getMeta('syncKey', '');
  const sst = await syncStatus({ db, store });
  const info = await exportInfo();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const live = store.live().length; const tr = store.trashed().length;
  main.innerHTML = `<div class="qn-h">Synchronisation</div>
    <div class="qn-mu">Adresse de Céleste (Tailscale, en HTTPS) et clé de synchro, affichée dans Céleste (clic sur le médaillon Codex). Elles restent sur ce téléphone, jamais dans le code.</div>
    <input class="qn-input" id="url" type="url" inputmode="url" placeholder="https://mon-pc.mon-reseau.ts.net" value="${esc(url)}" aria-label="Adresse de Céleste" style="margin:8px 0">
    <input class="qn-input" id="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Clé de synchro" value="${esc(key)}" aria-label="Clé de synchro" style="margin:0 0 8px">
    <div class="qn-row" style="margin-top:0"><button class="btn-forged gold" id="saveurl" type="button">Enregistrer</button><button class="btn-forged ember" id="sync" type="button"${sst.ready ? '' : ' disabled'}>Synchroniser</button></div>
    <div class="qn-sync" style="margin-top:10px"><span class="qn-dot ${sst.state}"></span>${esc(sst.text)}</div>
    <div class="qn-mu" style="margin-top:4px">En cas de note modifiée des deux côtés, la plus récente gagne et l’autre est placée en corbeille ; tu en es informé sur l’accueil.</div>
    <div class="qn-h">Sauvegarde</div>
    <div class="qn-set"><span>Exporter tout (JSON)<small>Toutes les notes, corbeille comprise. Remet le rappel à zéro.</small></span><button class="btn-forged" id="exj" type="button">Exporter</button></div>
    <div class="qn-set"><span>Exporter en Markdown (ZIP)<small>Un fichier par note, un dossier par catégorie.</small></span><button class="btn-forged" id="exz" type="button">Exporter</button></div>
    <div class="qn-set"><span>Importer une sauvegarde<small>Fusion : la version la plus récente gagne, rien n’est supprimé.</small></span><button class="btn-forged" id="imp" type="button">Importer</button><input type="file" id="file" accept=".json,application/json" hidden></div>
    <div class="qn-card" style="margin-top:12px"><div class="quest-title">Rappel d’export tous les ${EXPORT_DAYS} jours</div><div class="quest-tag">${info.last ? 'Dernier export : ' + ago(info.last) : 'Aucun export pour l’instant'} · ${info.due ? 'rappel actif' : 'prochain rappel dans ' + info.daysToNext + ' j'}</div></div>
    <div class="qn-h">Stockage</div>
    <div class="qn-set"><span>${live} note${live > 1 ? 's' : ''}, ${tr} en corbeille<small>Stockage persistant : ${persisted ? 'activé' : 'non garanti (exporte régulièrement)'}</small></span></div>
    <div class="qn-set"><span>Codex ${APP_VERSION}<small>Catégories : version ${CATS_VERSION} (figées)</small></span></div>`;
  $('saveurl').onclick = async () => {
    const v = $('url').value.trim(); const k = $('key').value.trim();
    if (v) { try { const u = new URL(v); if (u.protocol !== 'https:') throw 0; } catch { toast('Adresse invalide : https:// requis'); return; } }
    await db.setMeta('syncUrl', v.replace(/\/+$/, '')); await db.setMeta('syncKey', k); await db.setMeta('syncErr', null);
    toast(v && k ? 'Réglages enregistrés' : 'Réglages enregistrés (incomplets)'); settingsView();
  };
  $('sync').onclick = async () => {
    $('sync').disabled = true; toast('Synchronisation…');
    await runSync({ quiet: false }); settingsView();
  };
  $('exj').onclick = async () => { download(jsonName(), buildJson(store.all()), 'application/json'); await db.setMeta('lastExport', Date.now()); toast('Sauvegarde exportée ✔'); settingsView(); };
  $('exz').onclick = () => { download(zipName(), buildMarkdownZip(store.all()), 'application/zip'); toast('ZIP Markdown exporté ✔'); };
  $('imp').onclick = () => $('file').click();
  $('file').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await store.importData(JSON.parse(await f.text()));
      toast(`${r.added} ajoutée(s), ${r.updated} mise(s) à jour, ${r.kept} inchangée(s)`); settingsView(); updateTabs();
    } catch (err) { toast(err instanceof SyntaxError ? 'Fichier illisible' : err.message); }
    e.target.value = '';
  };
  main.onkeydown = null;
}

/* ---------- routeur ---------- */
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { seg: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
}
function updateTabs() {
  const { seg } = parseHash(); const name = seg[0] || 'home';
  const full = ['home', 'search', 'trash', 'settings'].includes(name);
  const t = store.trashed().length;
  $('tabs').style.display = full ? 'flex' : 'none';
  $('add').style.display = (name === 'home' || name === 'search') ? '' : 'none';
  const cur = name === 'search' ? 'home' : name;
  $('tabs').innerHTML = [['home', 'Notes', '#/'], ['trash', 'Corbeille', '#/trash'], ['settings', 'Réglages', '#/settings']]
    .map(([k, l, h]) => `<button class="tab${cur === k ? ' active' : ''}" data-h="${h}" type="button">${l}${k === 'trash' && t ? `<span class="badge">${t}</span>` : ''}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => (location.hash = b.dataset.h)));
}

let teardown = null; let renderId = 0;
async function route() {
  const my = ++renderId;
  if (teardown) { const t = teardown; teardown = null; await t(); }
  if (my !== renderId) return;
  const { seg, params } = parseHash(); const name = seg[0] || 'home';
  updateTabs(); main.scrollTop = 0;
  if (name === 'home') await homeView();
  else if (name === 'search') await searchView();
  else if (name === 'trash') await trashView();
  else if (name === 'settings') await settingsView();
  else if (name === 'note') teardown = noteView(seg[1], params) || null;
  else if (name === 'new') { history.replaceState(null, '', '#/note/new'); teardown = noteView(null, params) || null; }
  else location.hash = '#/';
}
window.addEventListener('hashchange', () => { if (goingBack) goingBack = false; else navs++; route(); });

$('add').onclick = () => { const q = ui.open ? '?cat=' + encodeURIComponent(ui.open) : ''; location.hash = '#/new' + q; };

/* ---------- démarrage ---------- */
async function start() {
  db = makeDb(await openDb()); store = makeStore(db);
  await store.init();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  // purge quotidienne des notes restées 30 jours en corbeille (indépendante de l'export)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') store.purgeExpired().then(updateTabs); });
  // « #/note/new » (rechargement d'un brouillon vide) : retour à l'accueil
  if (location.hash === '#/note/new') history.replaceState(null, '', '#/');
  await route();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runSync({ quiet: true }); });
  runSync({ quiet: true });
  setInterval(() => { if (document.visibilityState === 'visible') runSync({ quiet: true }); }, 60000);   // récupère les changements faits sur le PC
}

const updateSW = registerSW({
  onNeedRefresh() { $('update').hidden = false; $('update-btn').onclick = () => updateSW(true); },
  onOfflineReady() { toast('Prêt pour le hors ligne ✔'); },
});

start().catch((e) => { main.innerHTML = `<div class="qn-card"><div class="quest-title">Stockage indisponible</div><div class="qn-mu">Codex ne peut pas ouvrir sa base locale (mode privé ou stockage bloqué ?). ${esc(e && e.message || '')}</div></div>`; });
