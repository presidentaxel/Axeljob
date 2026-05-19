/** Structure par défaut du CV (alignée sur cv_base_vierge.json) */
export const defaultCv = () => ({
  prenom: '',
  nom: '',
  email: '',
  telephone: '',
  linkedin: '',
  ville: '',
  titre_professionnel: '',
  resume: '',
  photo_url: '',
  experiences: [
    { id: 'exp_1', poste: '', entreprise: '', secteur: '', date_debut: '', date_fin: '', lieu: '', contexte: '', bullet_points: ['', ''], mots_cles: [], clients: '' },
  ],
  formations: [
    { id: 'form_1', diplome: '', etablissement: '', date: '', mention: '' },
  ],
  certifications: [
    { id: 'cert_1', nom: '', organisme: '', date: '' },
  ],
  competences: {
    techniques: [''],
    logiciels: [''],
    langues: [{ langue: '', niveau: '' }],
    autres: [''],
  },
  projets: [
    { id: 'proj_1', nom: '', description: '', mots_cles: [] },
  ],
});

export const newExpId = () => `exp_${Date.now()}`;
export const newFormId = () => `form_${Date.now()}`;
export const newCertId = () => `cert_${Date.now()}`;
export const newProjId = () => `proj_${Date.now()}`;
