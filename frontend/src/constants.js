export const STORAGE_EXPORT_DIR = 'cv_bot_last_export_dir';

/** Modèle de nom de fichier pour l’export PDF du CV adapté (vide = défaut « CV - Prénom Nom - Poste »). */
export const STORAGE_PDF_EXPORT_FILENAME_PATTERN = 'cv_bot_pdf_export_filename_pattern';

/** Libellé du dossier d’ouverture mémorisé pour l’export PDF (affichage Profil). */
export const STORAGE_PDF_EXPORT_START_DIR_LABEL = 'cv_bot_pdf_export_start_dir_label';

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
  offre: 'Offre !',
  refus: 'Refusé',
};

/** Colonnes board = tous les statuts de STATUT_LABELS (ordre funnel). */
export const KANBAN_COLUMNS = [
  { id: 'a_postuler', label: 'À postuler' },
  { id: 'candidature_envoyee', label: 'Candidature envoyée' },
  { id: 'reponse_recue', label: 'Réponse reçue' },
  { id: 'interview', label: 'Entretien' },
  { id: 'offre', label: 'Offre !' },
  { id: 'refus', label: 'Refusé' },
];

export function getExportFolderName(entreprise, poste) {
  const sanitize = (s) => (s || '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const ent = sanitize(entreprise);
  const pos = sanitize(poste) || 'Sans intitulé';
  return ent ? ent + ' - ' + pos : pos;
}
