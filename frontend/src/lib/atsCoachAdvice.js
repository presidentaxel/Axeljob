/**
 * Mapping règle ATS → messages coach (AXE-36 / AXE-333).
 *
 * Les `label` API restent la source courte ; ce module fournit le texte
 * pédagogique stable (tests) + le type d'action « Corriger » possible.
 */

/**
 * @typedef {'reading-order' | 'contact-up' | 'add-missing-sections' | 'hide-photo' | 'fix-font' | 'fix-body-font-size' | 'single-column' | 'spill-overflow' | null} AtsCoachFixKind
 */

/**
 * @typedef {object} AtsCoachAdvice
 * @property {string} title
 * @property {string} explanation
 * @property {AtsCoachFixKind} fixKind
 * @property {boolean} designTradeoff - en mode design, conseil atténué
 * @property {string} [notApplicableReason] - si fixKind null : pourquoi pas de Corriger
 */

/** @type {Record<string, AtsCoachAdvice>} */
export const ATS_COACH_ADVICE = {
  malus_contact_low_on_page: {
    title: 'Le contact est trop bas',
    explanation:
      'Remonte le bloc contact dans le haut de la page pour qu’il soit lu par les parsers ATS.',
    fixKind: 'contact-up',
    designTradeoff: false,
  },
  malus_free_canvas_reading_order: {
    title: 'L’ordre de lecture machine ne suit pas le visuel',
    explanation:
      'Les ATS lisent souvent de haut en bas. Réordonne identité → contact → résumé → expériences.',
    fixKind: 'reading-order',
    designTradeoff: false,
  },
  malus_identity_not_first: {
    title: 'L’identité n’est pas en tête de lecture',
    explanation:
      'Place le nom / titre en haut à gauche pour que les ATS le capturent en premier.',
    fixKind: 'reading-order',
    designTradeoff: false,
  },
  malus_experiences_before_resume: {
    title: 'Expériences avant le résumé',
    explanation:
      'Les expériences sont placées avant le résumé. Une synthèse avant le détail aide souvent le parsing.',
    fixKind: 'reading-order',
    designTradeoff: false,
  },
  malus_free_canvas_missing_profile_sections: {
    title: 'Contenu du profil absent du canvas',
    explanation:
      'Des infos du profil ne sont pas affichées. Ajoute les blocs manquants depuis la sidebar.',
    fixKind: 'add-missing-sections',
    designTradeoff: false,
  },
  malus_page_overflow_clipped: {
    title: 'Contenu coupé en bas de page',
    explanation:
      'Un bloc dépasse la zone A4 imprimable. Déplace-le sur la page suivante ou réduis sa hauteur.',
    fixKind: 'spill-overflow',
    designTradeoff: false,
  },
  malus_free_canvas_no_semantic_blocks: {
    title: 'Aucun bloc sémantique sur le canvas',
    explanation:
      'Ajoute au moins identité / contact pour qu’un ATS reconnaisse la structure. ' +
      'Si le profil est vide, un starter identity+contact est posé ; complète ensuite le contenu.',
    fixKind: 'add-missing-sections',
    designTradeoff: false,
  },
  malus_free_canvas_text_blocks: {
    title: 'Texte en positions libres',
    explanation:
      'Cette pénalité n’est plus appliquée (AXE-336) : le canvas libre est autorisé. ' +
      'Seuls l’ordre de lecture, les sections manquantes ou un verify-PDF faible restent scorés.',
    fixKind: null,
    designTradeoff: true,
    notApplicableReason: 'Non applicable — pénalité retirée (AXE-336).',
  },
  malus_two_columns: {
    title: 'Layout sur 2 colonnes',
    explanation:
      'Les colonnes perturbent souvent la lecture linéaire des ATS. Préfère une colonne pour une version ATS-safe.',
    fixKind: 'single-column',
    designTradeoff: true,
  },
  malus_three_or_more_columns: {
    title: 'Trop de colonnes',
    explanation:
      'Plus de deux colonnes dégrade fortement la lecture machine. Simplifie la structure.',
    fixKind: 'single-column',
    designTradeoff: true,
  },
  malus_sidebar_present: {
    title: 'Sidebar présente',
    explanation:
      'Une sidebar crée un ordre de lecture ambigu (gauche/droite). Utile en design, risqué pour les ATS.',
    fixKind: 'single-column',
    designTradeoff: true,
  },
  malus_table_layout: {
    title: 'Mise en page par tableau',
    explanation:
      'Les tableaux sont souvent lus ligne par ligne et mélangent les colonnes pour les ATS.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Non applicable auto — change de modèle ou de structure HTML.',
  },
  malus_photo_present: {
    title: 'Photo sur le CV',
    explanation:
      'Une photo n’améliore pas le score ATS et peut être ignorée. Choix design acceptable.',
    fixKind: 'hide-photo',
    designTradeoff: true,
  },
  malus_exotic_font: {
    title: 'Police atypique',
    explanation:
      'Certaines polices se transforment mal chez les ATS. Préfère Arial, Calibri, Helvetica…',
    fixKind: 'fix-font',
    designTradeoff: true,
  },
  malus_body_font_size_out_of_range: {
    title: 'Taille de corps hors plage',
    explanation:
      'Une taille trop petite ou trop grande nuit à l’extraction. Vise ~10–12 pt.',
    fixKind: 'fix-body-font-size',
    designTradeoff: false,
  },
  malus_inconsistent_dates: {
    title: 'Dates incohérentes',
    explanation:
      'Harmonise le format des dates (ex. MM/YYYY) pour faciliter le parsing.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À corriger dans le contenu (dates des expériences / formations).',
  },
  malus_missing_identity: {
    title: 'Identité absente',
    explanation: 'Ajoute prénom et nom pour que les ATS te reconnaissent.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À remplir dans le contenu du profil (identité).',
  },
  malus_missing_contact: {
    title: 'Contact absent',
    explanation: 'Ajoute un email ou un téléphone exploitable.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À remplir dans le contenu du profil (contact).',
  },
  malus_missing_experiences: {
    title: 'Aucune expérience renseignée',
    explanation: 'Renseigne au moins une expérience avec poste ou entreprise.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À remplir dans le contenu du profil (expériences).',
  },
  malus_missing_formations: {
    title: 'Aucune formation renseignée',
    explanation: 'Ajoute au moins une formation.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À remplir dans le contenu du profil (formations).',
  },
  malus_missing_skills: {
    title: 'Compétences absentes',
    explanation: 'Ajoute des compétences techniques ou logiciels.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'À remplir dans le contenu du profil (compétences).',
  },
  bonus_mono_column: {
    title: 'Layout mono-colonne',
    explanation: 'Bonne pratique : une seule colonne facilite la lecture ATS.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Bonus — rien à corriger.',
  },
  bonus_standard_section_titles: {
    title: 'Titres de sections standards',
    explanation: 'Les titres classiques aident les parsers à reconnaître les sections.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Bonus — rien à corriger.',
  },
  bonus_contact_top_of_page: {
    title: 'Contact en haut de page',
    explanation: 'Le contact est bien placé pour la lecture machine.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Bonus — rien à corriger.',
  },
  bonus_dates_format_consistent: {
    title: 'Dates cohérentes',
    explanation: 'Le format des dates est homogène — bon signal pour les ATS.',
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Bonus — rien à corriger.',
  },
};

/**
 * @param {{ id?: string, label?: string, advice?: string }} rule
 * @returns {AtsCoachAdvice}
 */
export function getAtsCoachAdvice(rule) {
  const id = typeof rule?.id === 'string' ? rule.id : '';
  const mapped = ATS_COACH_ADVICE[id];
  if (mapped) {
    return {
      ...mapped,
      explanation: (typeof rule?.advice === 'string' && rule.advice.trim())
        ? rule.advice.trim()
        : mapped.explanation,
    };
  }
  const label = typeof rule?.label === 'string' && rule.label.trim()
    ? rule.label.trim()
    : id || 'Conseil ATS';
  const advice = typeof rule?.advice === 'string' && rule.advice.trim()
    ? rule.advice.trim()
    : label;
  return {
    title: label,
    explanation: advice,
    fixKind: null,
    designTradeoff: false,
    notApplicableReason: 'Pas de correction auto pour cette règle.',
  };
}

/**
 * Résumé badge selon le score et le nombre de risques (malus).
 * @param {number} score
 * @param {Array<{ delta?: number }>} rules
 */
export function summarizeAtsCoachStatus(score, rules = []) {
  const risks = rules.filter((r) => Number(r.delta) < 0).length;
  if (!Number.isFinite(score)) return 'Score ATS indisponible';
  if (risks === 0) return `Excellent pour ATS (${score}/100)`;
  if (score >= 90) {
    return risks === 1
      ? `Bon pour ATS, 1 risque mineur`
      : `Bon pour ATS, ${risks} risques mineurs`;
  }
  if (score >= 70) return `Correct pour ATS (${score}/100) — ${risks} point(s) d’attention`;
  return `À améliorer pour les ATS (${score}/100)`;
}

/**
 * Filtre les règles selon le mode coach.
 * @param {Array<object>} rules
 * @param {'ats-safe' | 'design'} mode
 */
export function filterRulesForCoachMode(rules, mode) {
  const list = Array.isArray(rules) ? rules : [];
  if (mode !== 'design') return list;
  // Mode design : masquer les pure bonuses, garder malus + tradeoffs.
  return list.filter((rule) => Number(rule?.delta) < 0);
}

/**
 * @param {string} ruleId
 * @returns {boolean}
 */
export function isAtsCoachRuleFixable(ruleId) {
  const advice = ATS_COACH_ADVICE[ruleId];
  return Boolean(advice?.fixKind);
}
