import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDb, makeDb } from '../src/db.js';
import { makeStore } from '../src/store.js';
import { syncNow, syncStatus } from '../src/sync.js';

const fresh = async () => { const db = makeDb(await openDb(new IDBFactory())); const store = makeStore(db); await store.init(); return { db, store }; };
const cfg = async (db) => { await db.setMeta('syncUrl', 'https://pc.ts.net'); await db.setMeta('syncKey', 'secret'); };
const reply = (body, status = 200) => async (url, opts) => ({ ok: status < 400, status, json: async () => body, _req: { url, opts } });
const ok = (extra = {}) => ({ app: 'celeste', format: 1, rev: 5, notes: [], conflicts: [], ...extra });
const nt = (id, o = {}) => ({ id, title: 'T' + id, content: 'c', category: 'Code', created: 1000, modified: 2000, deletedAt: null, actionIds: [], ...o });

test('statut : non configuré (braise), puis en attente (doré), puis synchronisé (vert)', async () => {
  const { db, store } = await fresh();
  assert.equal((await syncStatus({ db, store })).state, 'off');
  await cfg(db);
  assert.equal((await syncStatus({ db, store })).state, 'wait');
  await store.create({ title: 'A', content: 'x' });
  const r = await syncNow({ db, store, fetchImpl: reply(ok()) });
  assert.equal(r.ok, true);
  assert.equal((await syncStatus({ db, store })).state, 'sync');
  await new Promise((s) => setTimeout(s, 5));
  await store.create({ title: 'B', content: 'y' });
  const st = await syncStatus({ db, store }); assert.equal(st.state, 'wait'); assert.equal(st.pending, 1);
});

test('première synchro : envoie tout avec la clé, applique les notes reçues et mémorise la révision', async () => {
  const { db, store } = await fresh(); await cfg(db);
  await store.create({ title: 'Local', content: 'l' });
  let req;
  const f = async (url, opts) => { req = { url, opts }; return { ok: true, status: 200, json: async () => ok({ rev: 9, notes: [nt('r1')] }) }; };
  const r = await syncNow({ db, store, fetchImpl: f });
  assert.equal(req.url, 'https://pc.ts.net/sync/v1/notes');
  assert.equal(req.opts.headers.Authorization, 'Bearer secret');
  const body = JSON.parse(req.opts.body);
  assert.equal(body.since, 0); assert.equal(body.client, 'codex'); assert.equal(body.notes.length, 1);
  assert.deepEqual([r.sent, r.received], [1, 1]);
  assert.equal(store.get('r1').title, 'Tr1');
  assert.equal(await db.getMeta('syncRev'), 9);
});

test('synchros suivantes : n’envoie que les notes dont la version a changé, jamais celles tout juste reçues', async () => {
  const { db, store } = await fresh(); await cfg(db);
  const a = await store.create({ title: 'A', content: 'a' });
  const bodies = [];
  const f = (extra) => async (u, o) => { bodies.push(JSON.parse(o.body)); return { ok: true, status: 200, json: async () => ok({ rev: bodies.length, ...extra }) }; };
  await syncNow({ db, store, fetchImpl: f({ notes: [nt('recue')] }) });
  assert.deepEqual(bodies[0].notes.map((n) => n.id), [a.id]);
  await syncNow({ db, store, fetchImpl: f() });                      // rien n'a changé : rien n'est envoyé (ni A, ni la note reçue)
  assert.equal(bodies[1].notes.length, 0); assert.equal(bodies[1].since, 1);
  await new Promise((s) => setTimeout(s, 5));
  const b = await store.create({ title: 'B', content: 'b' });
  await store.update(a.id, { content: 'a2' });
  await syncNow({ db, store, fetchImpl: f() });
  assert.deepEqual(bodies[2].notes.map((n) => n.id).sort(), [a.id, b.id].sort());
  await store.trash(b.id); await store.restore(b.id);                // une restauration est un vrai changement
  await syncNow({ db, store, fetchImpl: f() });
  assert.deepEqual(bodies[3].notes.map((n) => n.id), [b.id]);
});

test('une note modifiée ici pendant la synchro n’est pas écrasée par la version reçue', async () => {
  const { db, store } = await fresh(); await cfg(db);
  const a = await store.create({ title: 'A', content: 'v1' });
  const f = async () => {
    await new Promise((s) => setTimeout(s, 5));
    await store.update(a.id, { content: 'v2 tapée pendant la synchro' });
    return { ok: true, status: 200, json: async () => ok({ notes: [{ ...a, content: 'version du PC', modified: a.modified + 1 }] }) };
  };
  const r = await syncNow({ db, store, fetchImpl: f });
  assert.equal(r.received, 0);
  assert.equal(store.get(a.id).content, 'v2 tapée pendant la synchro');
});

test('conflits transmis, note du PC en corbeille appliquée comme telle', async () => {
  const { db, store } = await fresh(); await cfg(db);
  const body = ok({ rev: 3, conflicts: [{ id: 'n1', title: 'Idée', kept: 'celeste', copyId: 'c1' }], notes: [nt('n1', { title: 'Idée', content: 'PC' }), nt('c1', { title: 'Idée (conflit)', deletedAt: Date.now() })] });
  const r = await syncNow({ db, store, fetchImpl: reply(body) });
  assert.equal(r.conflicts[0].kept, 'celeste');
  assert.equal(store.get('c1').deletedAt > 0, true);
  assert.equal(store.trashed().length, 1);
});

test('erreurs : injoignable, clé refusée, erreur serveur, réponse inattendue → état braise, rien n’est perdu', async () => {
  const { db, store } = await fresh(); await cfg(db);
  await store.create({ title: 'A', content: 'a' });
  const cases = [[async () => { throw new TypeError('fetch'); }, /injoignable/], [reply({}, 401), /clé refusée/], [reply({}, 500), /erreur 500/], [reply({ x: 1 }), /inattendue/]];
  for (const [f, re] of cases) {
    const r = await syncNow({ db, store, fetchImpl: f });
    assert.equal(r.ok, false); assert.match(r.message, re);
    const st = await syncStatus({ db, store }); assert.equal(st.state, 'off');
  }
  assert.equal(store.live().length, 1);
  const good = await syncNow({ db, store, fetchImpl: reply(ok()) }); assert.equal(good.ok, true);
  assert.equal((await syncStatus({ db, store })).state, 'sync');
});

test('sans adresse ou sans clé : aucun appel réseau', async () => {
  const { db, store } = await fresh();
  let called = false; const f = async () => { called = true; };
  assert.equal((await syncNow({ db, store, fetchImpl: f })).ok, false);
  await db.setMeta('syncUrl', 'https://pc.ts.net');
  assert.equal((await syncNow({ db, store, fetchImpl: f })).ok, false);
  assert.equal(called, false);
});
