// Test de bout en bout : deux « téléphones » Codex contre un vrai service Céleste.
// Usage : CELESTE_URL=http://127.0.0.1:7860 CELESTE_KEY=<clé> node test/e2e-celeste.mjs
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDb, makeDb } from '../src/db.js';
import { makeStore } from '../src/store.js';
import { syncNow, syncStatus } from '../src/sync.js';

const URL_ = process.env.CELESTE_URL; const KEY = process.env.CELESTE_KEY;
const phone = async () => { const db = makeDb(await openDb(new IDBFactory())); const store = makeStore(db); await store.init(); await db.setMeta('syncUrl', URL_); await db.setMeta('syncKey', KEY); return { db, store }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const A = await phone(); const B = await phone();
const n1 = await A.store.create({ title: 'Idée', content: 'première version', category: 'Écriture' });
await A.store.create({ title: 'Courses', content: 'pain', category: 'Divers' });
let r = await syncNow(A); assert.equal(r.ok, true); assert.equal(r.sent, 2);
r = await syncNow(B); assert.equal(r.received, 2); assert.equal(B.store.live().length, 2);
assert.equal((await syncStatus(B)).state, 'sync');

// conflit 1 : B modifie plus tard que A, mais synchronise après → la version de B (plus récente) gagne
await wait(5); await A.store.update(n1.id, { content: 'version A' });
await wait(5); await B.store.update(n1.id, { content: 'version B (plus récente)' });
r = await syncNow(A); assert.equal(r.conflicts.length, 0);
r = await syncNow(B); assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].kept, 'telephone');
assert.equal(B.store.get(n1.id).content, 'version B (plus récente)');
assert.equal(B.store.trashed().length, 1); assert.match(B.store.trashed()[0].title, /\(conflit\)/); assert.equal(B.store.trashed()[0].content, 'version A');
r = await syncNow(A);
assert.equal(A.store.get(n1.id).content, 'version B (plus récente)');
assert.equal(A.store.trashed().length, 1);

// conflit 2 : B modifie d'abord, A modifie ensuite et synchronise en premier → A (plus récente) est déjà chez Céleste, B perd
await wait(5); await B.store.update(n1.id, { content: 'B ancienne' });
await wait(5); await A.store.update(n1.id, { content: 'A plus récente' });
await syncNow(A); r = await syncNow(B);
assert.equal(r.conflicts[0].kept, 'celeste');
assert.equal(B.store.get(n1.id).content, 'A plus récente');
assert.ok(B.store.trashed().some((n) => n.content === 'B ancienne'));

// corbeille synchronisée
await A.store.trash(n1.id); await syncNow(A); await syncNow(B);
assert.equal(B.store.live().length, 1);

// convergence finale
await syncNow(A); await syncNow(B);
const key = (s) => s.all().map((n) => `${n.id}|${n.title}|${n.content}|${n.deletedAt ? 1 : 0}`).sort().join('\n');
assert.equal(key(A.store), key(B.store));
assert.equal((await syncStatus(A)).state, 'sync');

// sens PC → téléphone : notes créées, modifiées puis mises à la corbeille depuis Céleste (éditeur central)
const api = (m, u, b) => fetch(process.env.CELESTE_URL + u, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const pcNote = (await api('POST', '/api/notes', { title: 'Écrite sur le PC', content: 'première ligne', category: 'Écriture' })).note;
await syncNow(A); assert.equal(A.store.get(pcNote.id).content, 'première ligne'); assert.equal(A.store.get(pcNote.id).category, 'Écriture');
const up = await api('PUT', '/api/notes/' + pcNote.id, { content: 'première ligne\nseconde ligne', rev: pcNote.rev });
assert.equal(up.ok, true); await syncNow(A); assert.equal(A.store.get(pcNote.id).content, 'première ligne\nseconde ligne');
await wait(5); await A.store.update(pcNote.id, { content: 'modifiée sur le téléphone' }); await syncNow(A);   // le téléphone répond
assert.equal((await api('GET', '/api/notes/' + pcNote.id)).content, 'modifiée sur le téléphone');
await api('POST', '/api/notes/' + pcNote.id + '/corbeille'); await syncNow(A); assert.ok(A.store.get(pcNote.id).deletedAt);
await api('POST', '/api/notes/' + pcNote.id + '/restaurer'); await syncNow(A); assert.equal(A.store.get(pcNote.id).deletedAt, null);
// la liste des notes de Céleste contient bien celle-ci (la recherche des outils s'appuie sur la même base)
assert.ok((await api('GET', '/api/notes')).notes.some((n) => n.title === 'Écrite sur le PC'));

// mauvaise clé : braise, rien n'est perdu
await A.db.setMeta('syncKey', 'mauvaise');
r = await syncNow(A); assert.equal(r.ok, false); assert.equal((await syncStatus(A)).state, 'off'); assert.equal(A.store.live().length, 2);
console.log('E2E ok : synchro, deux conflits, corbeille, convergence, sens PC → téléphone (création, modification, corbeille, restauration), clé refusée');
