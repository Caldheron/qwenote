import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { openDb, makeDb } from '../src/db.js';
import { makeStore } from '../src/store.js';
import { crc32, makeZip } from '../src/zip.js';
import { buildJson, buildMarkdownFiles } from '../src/export.js';
import { CATEGORIES } from '../src/cats.js';
import { norm, snippet, ago, daysLeftInTrash, DAY } from '../src/util.js';
import { writeFileSync } from 'node:fs';

let n = 0;
const fresh = async () => {
  // une base vierge par test : nouvelle fabrique IndexedDB (évite tout blocage entre tests)
  const factory = new IDBFactory();
  const db = makeDb(await openDb(factory)); const store = makeStore(db); await store.init(); return { db, store, factory };
};

test('14 catégories figées et distinctes', () => {
  assert.equal(CATEGORIES.length, 14);
  assert.equal(new Set(CATEGORIES).size, 14);
  assert.throws(() => { 'use strict'; CATEGORIES.push('X'); });
});

test('crc32 : valeur de référence', () => assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926));

test('création, tri par date de modification (récent d’abord) et comptage', async () => {
  const { store } = await fresh();
  const a = await store.create({ title: 'A', content: 'x', category: 'Code' });
  await new Promise((r) => setTimeout(r, 5));
  const b = await store.create({ title: 'B', content: 'y', category: 'Code' });
  assert.deepEqual(store.inCategory('Code').map((x) => x.title), ['B', 'A']);
  await new Promise((r) => setTimeout(r, 5));
  await store.update(a.id, { content: 'x2' });
  assert.deepEqual(store.inCategory('Code').map((x) => x.title), ['A', 'B']);
  assert.equal(store.counts().Code, 2);
  assert.equal(store.counts().Science, 0);
});

test('update sans changement ne modifie pas la date ; catégorie invalide ignorée', async () => {
  const { store } = await fresh();
  const a = await store.create({ title: 'A', content: 'x', category: 'Code' });
  await new Promise((r) => setTimeout(r, 5));
  const same = await store.update(a.id, { title: 'A', content: 'x' });
  assert.equal(same.modified, a.modified);
  const bad = await store.update(a.id, { category: 'Inventée' });
  assert.equal(bad.category, 'Code'); assert.equal(bad.modified, a.modified);
  const moved = await store.update(a.id, { category: 'Science' });
  assert.equal(moved.category, 'Science'); assert.ok(moved.modified > a.modified);
});

test('recherche : accents, casse, titre + texte, hors corbeille', async () => {
  const { store } = await fresh();
  await store.create({ title: 'Écriture du désert', content: 'La TEMPÊTE arrive', category: 'Écriture' });
  const t = await store.create({ title: 'Autre', content: 'tempête', category: 'Divers' });
  assert.equal(store.search('tempete').length, 2);
  assert.equal(store.search('ECRITURE').length, 1);
  await store.trash(t.id);
  assert.equal(store.search('tempete').length, 1);
  assert.equal(store.search('   ').length, 0);
});

test('corbeille : restauration et purge à 30 jours (indépendante de l’export)', async () => {
  const { store, db } = await fresh();
  const a = await store.create({ title: 'A', content: '1' });
  const b = await store.create({ title: 'B', content: '2' });
  await store.trash(a.id); await store.trash(b.id);
  await store.restore(a.id);
  assert.equal(store.live().length, 1);
  assert.equal(await store.purgeExpired(Date.now() + 29 * DAY), 0);
  assert.equal(store.trashed().length, 1);
  assert.equal(await store.purgeExpired(Date.now() + 31 * DAY), 1);
  assert.equal(store.trashed().length, 0);
  assert.equal((await db.allNotes()).length, 1); // la suppression est bien persistée
  assert.equal(daysLeftInTrash(Date.now() - 10 * DAY), 20);
});

test('persistance : une nouvelle instance relit les notes', async () => {
  const { store, factory } = await fresh();
  const a = await store.create({ title: 'Durable', content: 'texte', category: 'Musique' });
  const store2 = makeStore(makeDb(await openDb(factory))); await store2.init();
  assert.equal(store2.get(a.id).title, 'Durable');
});

test('export JSON puis import : aller-retour, fusion sans perte', async () => {
  const { store } = await fresh();
  const a = await store.create({ title: 'A', content: 'un', category: 'Code' });
  const b = await store.create({ title: 'B', content: 'deux', category: 'Divers' });
  await store.trash(b.id);
  const json = buildJson(store.all());
  const data = JSON.parse(json);
  assert.equal(data.app, 'qwenote'); assert.equal(data.notes.length, 2);
  const { store: s2 } = await fresh();
  const r = await s2.importData(data);
  assert.deepEqual([r.added, r.updated, r.kept], [2, 0, 0]);
  assert.equal(s2.trashed().length, 1);
  // réimport identique : rien ne change
  const r2 = await s2.importData(data); assert.deepEqual([r2.added, r2.updated, r2.kept], [0, 0, 2]);
  // une version plus récente remplace, une plus ancienne est ignorée
  data.notes[0].modified += 1000; data.notes[0].content = 'plus récent';
  const r3 = await s2.importData(data); assert.equal(r3.updated, 1);
  assert.equal(s2.get(data.notes[0].id).content, 'plus récent');
});

test('import : fichier invalide refusé, catégorie inconnue → Divers', async () => {
  const { store } = await fresh();
  await assert.rejects(store.importData({ app: 'autre', notes: [] }));
  await assert.rejects(store.importData(null));
  const r = await store.importData({ app: 'qwenote', notes: [{ id: 'x1', title: 'T', content: 'c', category: 'Nimporte' }, { id: 5 }] });
  assert.equal(r.added, 1); assert.equal(r.skipped, 1);
  assert.equal(store.get('x1').category, 'Divers');
});

test('export Markdown : dossiers par catégorie, noms uniques, corbeille exclue', () => {
  const t = Date.now();
  const mk = (id, title, category, deletedAt = null) => ({ id, title, content: '# ' + title, category, created: t, modified: t, deletedAt, actionIds: [] });
  const files = buildMarkdownFiles([mk('1', 'Idée', 'Écriture'), mk('2', 'Idée', 'Écriture'), mk('3', 'a/b:c', 'Code'), mk('4', 'Perdue', 'Code', t), mk('5', '', 'Divers')]);
  assert.deepEqual(files.map((f) => f.name), ['Écriture/Idée.md', 'Écriture/Idée (2).md', 'Code/a b c.md', 'Divers/Sans titre.md']);
  assert.match(files[0].data, /^---\nid: 1\ntitre: "Idée"\ncatégorie: Écriture/);
});

test('ZIP : structure valide (relu par python)', async () => {
  const zip = makeZip([{ name: 'Écriture/Idée.md', data: '# Idée\nÉté\n' }, { name: 'Code/x.md', data: 'ok' }]);
  writeFileSync('/tmp/qn-test.zip', zip);
  assert.equal(zip[0], 0x50); assert.equal(zip[1], 0x4b);
});

test('utilitaires : norm, ago, snippet', () => {
  assert.equal(norm('Éléphant Œuf'), 'elephant œuf');
  assert.equal(ago(Date.now() - 3 * DAY), 'il y a 3 j');
  assert.equal(ago(Date.now() - 1.5 * DAY), 'hier');
  assert.equal(ago(Date.now() - 5000), 'à l’instant');
  assert.match(snippet('Un long texte avec le mot cherché au milieu de la phrase', 'cherche'), /cherché/);
});
