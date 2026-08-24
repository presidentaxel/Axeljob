/**
 * Notice langue après adaptation (AXE-357).
 * Vide si même langue CV/offre et CV non mixte — le flux d'adaptation reste silencieux.
 */

export function languageLabelFr(code) {
  return code === 'en' ? 'anglais' : 'français';
}

/**
 * @param {object | null | undefined} cvLanguage  { code: 'fr'|'en', mixed?: boolean }
 * @param {object | null | undefined} offerLanguage { code: 'fr'|'en', confidence?: number }
 * @returns {string}
 */
export function adaptLanguageNotice(cvLanguage, offerLanguage) {
  if (!cvLanguage || typeof cvLanguage !== 'object') return '';
  const cvCode = cvLanguage.code === 'en' ? 'en' : 'fr';
  const cvLabel = languageLabelFr(cvCode);
  if (cvLanguage.mixed) {
    return (
      `Ton CV mélange français et anglais : j'ai conservé le ${cvLabel} ` +
      `(langue dominante) pour l'adaptation. Relis le texte si une partie devait rester dans l'autre langue.`
    );
  }
  const offerCode = offerLanguage && typeof offerLanguage === 'object' ? offerLanguage.code : '';
  const offerConfidence = Number(offerLanguage?.confidence) || 0;
  if ((offerCode === 'fr' || offerCode === 'en') && offerCode !== cvCode && offerConfidence > 0) {
    const offerLabel = languageLabelFr(offerCode);
    return (
      `L'annonce est en ${offerLabel} : j'ai adapté le CV sans le traduire ` +
      `(il reste en ${cvLabel}).`
    );
  }
  return '';
}

export function withAdaptLanguageNotice(summary, cvLanguage, offerLanguage) {
  const notice = adaptLanguageNotice(cvLanguage, offerLanguage);
  const base = (summary || '').trim();
  if (!notice) return base;
  if (!base) return notice;
  return `${base} ${notice}`;
}
