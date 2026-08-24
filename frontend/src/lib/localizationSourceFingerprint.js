/**
 * Empreinte du CV source : si elle change, l’aperçu traduit doit être recalculé.
 */

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function localizationSourcePayload(cv) {
  if (!cv || typeof cv !== 'object') return null;
  const competences = cv.competences && typeof cv.competences === 'object' ? cv.competences : {};
  return {
    prenom: cv.prenom || '',
    nom: cv.nom || '',
    email: cv.email || '',
    telephone: cv.telephone || '',
    ville: cv.ville || '',
    titre_professionnel: cv.titre_professionnel || '',
    resume: cv.resume || '',
    experiences: asList(cv.experiences).map((row) => (
      row && typeof row === 'object'
        ? {
            id: row.id || '',
            poste: row.poste || '',
            entreprise: row.entreprise || '',
            contexte: row.contexte || '',
            date_debut: row.date_debut || '',
            date_fin: row.date_fin || '',
            lieu: row.lieu || '',
            secteur: row.secteur || '',
            bullet_points: row.bullet_points || [],
          }
        : {}
    )),
    formations: asList(cv.formations).map((row) => (
      row && typeof row === 'object'
        ? {
            id: row.id || '',
            diplome: row.diplome || row.intitule || '',
            date: row.date || '',
            mention: row.mention || '',
            etablissement: row.etablissement || '',
          }
        : {}
    )),
    certifications: asList(cv.certifications).map((row) => (
      row && typeof row === 'object'
        ? {
            id: row.id || '',
            nom: row.nom || '',
            date: row.date || '',
          }
        : {}
    )),
    projets: asList(cv.projets).map((row) => (
      row && typeof row === 'object'
        ? {
            id: row.id || '',
            nom: row.nom || '',
            description: row.description || '',
          }
        : {}
    )),
    competences: {
      techniques: competences.techniques || [],
      logiciels: competences.logiciels || [],
      autres: competences.autres || [],
      langues: competences.langues || [],
    },
  };
}

export function localizationSourceFingerprint(cv) {
  const payload = localizationSourcePayload(cv);
  if (!payload) return '';
  return JSON.stringify(payload);
}
