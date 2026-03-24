export const STORAGE_EXPORT_DIR = 'cv_bot_last_export_dir';

/** Timestamp (ms) : après confirmation, ne plus afficher le rappel « bloc ATS » à l’export avant cette date. */
export const STORAGE_EXPORT_ATS_BLOCK_SNOOZE = 'export_ats_block_prompt_snooze_until';

/** Une fois à « 1 », ne plus ouvrir le panneau « Personnaliser le CV » avant le premier rappel ATS à l’export. */
export const STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE = 'cv_bot_pre_export_template_options_done';

/** Email de contact public (légales, landing, support). */
export const CONTACT_EMAIL = 'contact@axelproject.fr';

export const STATUT_LABELS = {
  a_postuler: 'À postuler',
  candidature_envoyee: 'Candidature envoyée',
  reponse_recue: 'Réponse reçue',
  interview: 'Entretien',
  refus: 'Refusé',
  offre: 'Offre !',
};

export const KANBAN_COLUMNS = [
  { id: 'candidature_envoyee', label: 'Candidature envoyée' },
  { id: 'reponse_recue', label: 'Réponse reçue' },
  { id: 'interview', label: 'Entretien' },
  { id: 'refus', label: 'Refusé' },
  { id: 'offre', label: 'Offre !' },
];

export function getExportFolderName(entreprise, poste) {
  const sanitize = (s) => (s || '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const ent = sanitize(entreprise);
  const pos = sanitize(poste) || 'Sans intitulé';
  return ent ? ent + ' - ' + pos : pos;
}
