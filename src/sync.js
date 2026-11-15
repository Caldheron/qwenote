// Synchronisation avec Céleste (via Tailscale, en HTTPS). Céleste garde la copie de référence des notes.
// Protocole : un seul appel POST {adresse}/sync/v1/notes, clé secrète en « Authorization: Bearer ».
//   envoi   : { app, format, client, since, notes }   (notes modifiées ou mises en corbeille depuis la dernière synchro)
//   réponse : { app: 'celeste', format, rev, notes, conflicts }
// Suivi : pour chaque note, `syncedMap` retient l'instant de sa dernière version synchronisée ; seules les notes dont la version
// a changé depuis sont envoyées (aucune dépendance à l'horloge, pas de renvoi de notes tout juste reçues).
// Conflit (note modifiée des deux côtés depuis la dernière synchro) : la plus récente gagne, l'autre part en corbeille chez Céleste
// (elle redescend ici comme note en corbeille) et le conflit est signalé à l'utilisateur.
import { noteTime } from './store.js';

export const SYNC_FORMAT = 1;
export const CLIENT = 'codex';

export async function syncStatus({ db, store }) {
  const url = await db.getMeta('syncUrl', ''); const key = await db.getMeta('syncKey', '');
  if (!url || !key) {
    const text = !url && !key ? 'Synchro non configurée · tes notes restent sur ce téléphone'
      : !url ? 'Adresse de Céleste manquante' : 'Clé de synchro manquante';
    return { state: 'off', text, ready: false };
  }
  const err = await db.getMeta('syncErr', null);
  if (err) return { state: 'off', text: `Non connecté à Céleste · ${err}`, ready: true };
  const last = await db.getMeta('lastSyncAt', 0);
  if (!last) return { state: 'wait', text: 'En attente de la première synchro avec Céleste', ready: true, last: 0 };
  const map = (await db.getMeta('syncedMap', {})) || {};
  const pending = store.all().filter((n) => map[n.id] !== noteTime(n)).length;
  if (pending) return { state: 'wait', text: `${pending} changement${pending > 1 ? 's' : ''} en attente de synchro avec Céleste`, ready: true, last, pending };
  return { state: 'sync', text: 'Synchronisé avec Céleste', ready: true, last, pending: 0 };
}

const fail = async (db, reason) => { await db.setMeta('syncErr', reason); return { ok: false, state: 'off', message: `Synchro impossible : ${reason}` }; };

export async function syncNow({ db, store, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 15000 }) {
  const url = await db.getMeta('syncUrl', ''); const key = await db.getMeta('syncKey', '');
  if (!url || !key) return { ok: false, state: 'off', message: !url ? 'Adresse de Céleste manquante' : 'Clé de synchro manquante' };
  const since = await db.getMeta('syncRev', 0);
  const map = (await db.getMeta('syncedMap', {})) || {};
  const t0 = now();
  const outgoing = store.all().filter((n) => map[n.id] !== noteTime(n));
  const sentTimes = outgoing.map((n) => [n.id, noteTime(n)]);
  let res;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    res = await fetchImpl(url.replace(/\/+$/, '') + '/sync/v1/notes', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ app: 'qwenote', format: SYNC_FORMAT, client: CLIENT, since, notes: outgoing }),
    });
  } catch { return fail(db, 'Céleste injoignable (PC éteint ou Tailscale coupé ?)'); } finally { clearTimeout(timer); }
  if (res.status === 401 || res.status === 403) return fail(db, 'clé refusée');
  if (!res.ok) return fail(db, 'erreur ' + res.status);
  let data;
  try { data = await res.json(); } catch { return fail(db, 'réponse illisible'); }
  if (!data || data.app !== 'celeste' || !Array.isArray(data.notes) || !Number.isFinite(data.rev)) return fail(db, 'réponse inattendue');
  const r = await store.applyRemote(data.notes, t0);
  const next = { ...map };
  sentTimes.forEach(([id, t]) => { next[id] = t; });
  r.synced.forEach(([id, t]) => { next[id] = t; });
  await db.setMeta('syncedMap', next);
  await db.setMeta('syncRev', data.rev); await db.setMeta('lastSyncAt', t0); await db.setMeta('syncErr', null);
  return { ok: true, state: 'sync', sent: outgoing.length, received: r.applied, kept: r.kept, conflicts: Array.isArray(data.conflicts) ? data.conflicts : [] };
}
