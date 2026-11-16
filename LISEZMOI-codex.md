# Codex v1.2.0 (ex-Qwenote)

Ce dossier ne contient que les **fichiers modifiés** : copie-les par-dessus ton dépôt (mêmes chemins), puis `npm test`, `npm run build` et publie comme d'habitude.
Fichiers inchangés (non fournis) : `src/db.js`, `src/util.js`, `src/zip.js`, `src/phaneia.css`, `test/core.test.js`, `package.json`, `public/`.

## Nouveautés de la v1.2.0
- **Icône Codex** en haut à gauche, à la place de la lettre « C » (le médaillon de ton fichier d'icônes, version circulaire).
- **Synchro régulière** : en plus de l'ouverture, du retour sur l'appli, des enregistrements et du bouton, Codex se synchronise **toutes les minutes** quand l'appli est visible. C'est ce qui fait arriver sur le téléphone les notes créées ou modifiées sur le PC (sens PC → téléphone).

## À propos du sens PC → téléphone
Jusqu'ici, ce sens ne pouvait rien transmettre : **Céleste ne pouvait ni créer ni modifier de note** (les notes y étaient en lecture seule). Avec Céleste v1.7.0, l'éditeur de notes du PC écrit dans la base ; Codex les récupère à la synchro suivante. Le test de bout en bout (`test/e2e-celeste.mjs`) joue le scénario complet : création, modification, retour du téléphone, corbeille, restauration.

## Rappels
- Le nom de la base IndexedDB reste `qwenote` (la renommer ferait « disparaître » tes notes du téléphone). Les sauvegardes JSON gardent `app: "qwenote"` (l'import accepte aussi `"codex"`).
- Les **icônes PNG de l'installation PWA** (`public/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`) ne sont pas modifiées : remplace-les par les tiennes.
- `npm test` : 19 tests. `test/e2e-celeste.mjs` : deux téléphones simulés contre un vrai Céleste (`CELESTE_URL=http://127.0.0.1:7860 CELESTE_KEY=<clé de data/sync_key.txt> node test/e2e-celeste.mjs`).
