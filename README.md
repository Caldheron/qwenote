# Qwenote v1.0.0

Notes Markdown hors ligne, miroir des notes de Qwenaëlle. PWA autonome, style Phanéïa (`src/phaneia.css` = ton `style.css`, inchangé).

## Ce que fait la V1
- 14 catégories **figées** (`src/cats.js`). Pour les modifier : éditer ce fichier, incrémenter `CATS_VERSION`, publier une nouvelle version.
- Notes en Markdown (édition seule, pas d'aperçu), texte uniquement. Tri par date de modification, plus récent en premier.
- Recherche (titres + texte, sans accents ni casse), enregistrement automatique + bouton « Enregistrer », bouton « + Nouvelle note ». Une note jamais saisie n'est pas créée.
- Corbeille de 30 jours (restaurer, supprimer maintenant, vider). Purge automatique à l'ouverture de l'appli, **indépendante de l'export**.
- Export JSON complet (corbeille comprise), export ZIP Markdown (un dossier par catégorie), import JSON par fusion (la version la plus récente gagne, rien n'est supprimé).
- Rappel d'export tous les 30 jours (bandeau sur l'accueil). Il se remet à zéro avec l'export **JSON** (le ZIP est une copie de lecture).
- Données dans IndexedDB, stockage persistant demandé. Fonctionne hors ligne (service worker). Bandeau « Nouvelle version disponible ».
- Réglages : champ « adresse de Qwenaëlle » (HTTPS obligatoire, stocké sur le téléphone, jamais dans le code).

## Pas encore là (volontairement)
- **Synchronisation avec Qwenaëlle** : le bouton « Synchroniser » est inactif. Elle se traite dans la session Qwenaëlle (Qwenaëlle fait foi, aucune gestion de conflit dans Qwenote, notes remplacées → corbeille 30 jours).
- Le champ `actionIds` (liens Qwenagenda) existe dans les données mais n'a pas d'interface.

## Commandes
```
npm install
npm run dev      # développement
npm test         # 12 tests de la logique (stockage, corbeille, recherche, export/import, ZIP)
npm run build    # produit dist/
npm run preview  # sert dist/ pour essayer l'installation PWA
```

## Déploiement GitHub Pages
1. Crée le dépôt, pousse le contenu de ce dossier sur la branche `main`.
2. Dans le dépôt : Settings → Pages → Source : **GitHub Actions**.
3. Chaque push sur `main` lance les tests, le build et le déploiement (`.github/workflows/deploy.yml`).
4. Ouvre l'adresse sur le téléphone, puis « Ajouter à l'écran d'accueil » (sur iPhone : Safari → Partager). L'appli installée protège mieux les données.

Le chemin est relatif (`base: './'`) : aucune configuration selon le nom du dépôt. Aucune donnée personnelle n'est dans le code.

## Organisation
`src/cats.js` catégories · `src/db.js` IndexedDB · `src/store.js` notes, corbeille, recherche, import · `src/export.js` + `src/zip.js` sauvegardes · `src/main.js` écrans et routeur · `src/qwenote.css` ajustements par-dessus Phanéïa.
