/**
 * Mapping règle ATS → messages coach (AXE-36).
 *
 * Les `label` API restent la source courte ; ce module fournit le texte
 * pédagogique stable (tests) + le type d'action « Corriger » possible.
 */

/** @typedef {'reading-order' | 'contact-up' | null} AtsCoachFixKind */

/**
 * @typedef {object} AtsCoachAdvice
 * @property {string} title
 * @property {string} explanation
 * @property {AtsCoachFixKind} fixKind
 * @property {boolean} designTradeoff - en mode design, conseil atténué
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
    fixKind: null,
    designTradeoff: false,
  },
  malus_free_canvas_text_blocks: {
    title: 'Texte en positions libres',
    explanation:
      'Beaucoup de blocs texte en absolu : les ATS peuvent les lire dans un ordre inattendu.',
    fixKind: 'reading-order',
    designTradeoff: true,
  },
  malus_two_columns: {
    title: 'Layout sur 2 colonnes',
    explanation:
      'Les colonnes perturbent souvent la lecture linéaire des ATS. Préfère une colonne pour une version ATS-safe.',
    fixKind: null,
    designTradeoff: true,
  },
  malus_three_or_more_columns: {
    title: 'Trop de colonnes',
    explanation:
      'Plus de deux colonnes dégrade fortement la lecture machine. Simplifie la structure.',
    fixKind: null,
    designTradeoff: true,
  },
  malus_sidebar_present: {
    title: 'Sidebar présente',
    explanation:
      'Une sidebar crée un ordre de lecture ambigu (gauche/droite). Utile en design, risqué pour les ATS.',
    fixKind: null,
    designTradeoff: true,
  },
  malus_table_layout: {
    title: 'Mise en page par tableau',
    explanation:
      'Les tableaux sont souvent lus ligne par ligne et mélangent les colonnes pour les ATS.',
    fixKind: null,
    designTradeoff: false,
  },
  malus_photo_present: {
    title: 'Photo sur le CV',
    explanation:
      'Une photo n’améliore pas le score ATS et peut être ignorée. Choix design acceptable.',
    fixKind: null,
    designTradeoff: true,
  },
  malus_exotic_font: {
    title: 'Police atypique',
    explanation:
      'Certaines polices se transforment mal chez les ATS. Préfère Arial, Calibri, Helvetica…',
    fixKind: null,
    designTradeoff: true,
  },
  malus_body_font_size_out_of_range: {
    title: 'Taille de corps hors plage',
    explanation:
      'Une taille trop petite ou trop grande nuit à l’extraction. Vise ~10–12 pt.',
    fixKind: null,
    designTradeoff: false,
  },
  malus_inconsistent_dates: {
    title: 'Dates incohérentes',
    explanation:
      'Harmonise le format des dates (ex. MM/YYYY) pour faciliter le parsing.',
    fixKind: null,
    designTradeoff: false,
  },
  bonus_mono_column: {
    title: 'Layout mono-colonne',
    explanation: 'Bonne pratique : une seule colonne facilite la lecture ATS.',
    fixKind: null,
    designTradeoff: false,
  },
  bonus_standard_section_titles: {
    title: 'Titres de sections standards',
    explanation: 'Les titres classiques aident les parsers à reconnaître les sections.',
    fixKind: null,
    designTradeoff: false,
  },
  bonus_contact_top_of_page: {
    title: 'Contact en haut de page',
    explanation: 'Le contact est bien placé pour la lecture machine.',
    fixKind: null,
    designTradeoff: false,
  },
  bonus_dates_format_consistent: {
    title: 'Dates cohérentes',
    explanation: 'Le format des dates est homogène — bon signal pour les ATS.',
    fixKind: null,
    designTradeoff: false,
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
