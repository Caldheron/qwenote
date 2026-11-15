# Codex v1.1.0 (ex-Qwenote) — synchro avec Céleste

Ce dossier ne contient que les **fichiers modifiés** : copie-les par-dessus ton dépôt (mêmes chemins), puis `npm test` et `npm run build`.
Fichiers inchangés (non fournis) : `src/db.js`, `src/util.js`, `src/zip.js`, `src/phaneia.css`, `test/core.test.js`, `package.json`, `public/`.

## Nouveautés
- **`src/sync.js`** (nouveau) : synchro avec Céleste. Notes envoyées = celles dont la version a changé depuis la dernière synchro (suivi note par note, sans dépendre des horloges) ; notes reçues appliquées sans jamais écraser une note que tu viens de modifier pendant la synchro.
- **Réglages** : adresse de Céleste, **clé de synchro** (affichée dans Céleste, médaillon Codex), boutons Enregistrer et Synchroniser. L'adresse doit être en `https://`.
- **Déclencheurs** : à l'ouverture, au retour sur l'appli, 4 s après un enregistrement, suppression ou restauration, et via le bouton.
- **Voyant** : vert = synchronisé ; doré = changements en attente ; braise = non configuré, Céleste injoignable ou clé refusée.
- **Conflit** (note modifiée des deux côtés) : la plus récente gagne, l'autre version arrive en corbeille « … (conflit) », et une carte sur l'accueil te prévient (bouton « Compris »).
- **Restaurer une note** met à jour sa date de modification (nécessaire pour que la synchro voie la restauration).
- **Renommage** : Qwenote → Codex, Qwenaëlle → Céleste dans les textes, le manifeste et les noms de sauvegarde (`codex-sauvegarde-…json`). Initiale « C » provisoire dans le médaillon, en attendant ton icône.

## À ne pas changer
- Le nom de la base IndexedDB reste `qwenote` (la renommer ferait « disparaître » tes notes du téléphone).
- Les sauvegardes JSON gardent `app: "qwenote"` ; l'import accepte aussi `"codex"`. Tes anciennes sauvegardes restent lisibles.
- Le dépôt peut garder le nom `qwenote` : l'adresse GitHub Pages ne change pas.
- Toutes tes PWA sur `caldheron.github.io` partagent le même espace de stockage : Clepsydre devra utiliser un autre nom de base.

## Tests
`npm test` : 19 tests (12 existants + 7 de synchro). `test/e2e-celeste.mjs` : deux téléphones simulés contre un vrai service Céleste
(`CELESTE_URL=http://127.0.0.1:7860 CELESTE_KEY=<clé de data/sync_key.txt> node test/e2e-celeste.mjs`).
