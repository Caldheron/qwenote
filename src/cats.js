// Les 14 catégories de Qwenote sont figées dans le code (décision du 08/11/2026).
// Pour en modifier la liste : changer ce fichier, incrémenter CATS_VERSION, publier une nouvelle version.
export const CATS_VERSION = 1;

export const CATEGORIES = Object.freeze([
  'Science', 'Écriture', 'Dessin', 'Code', 'Social', 'Business', 'Finance',
  'Soin du corps', 'Administratif', 'Travail', 'Vacances', 'Langues', 'Musique', 'Divers',
]);

const SEALS = ['--ember', '--verdigris', '--wine', '--steel', '--gold'];

export const isCategory = (c) => CATEGORIES.includes(c);
export const sealFor = (c) => SEALS[Math.max(0, CATEGORIES.indexOf(c)) % SEALS.length];
