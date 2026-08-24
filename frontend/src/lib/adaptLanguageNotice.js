/**
 * Notice + choix langue après / avant adaptation (AXE-357).
 */

export function languageLabelFr(code) {
  return code === 'en' ? 'anglais' : 'français';
}

export function shouldPromptLanguageChoice(cvLanguage, offerLanguage) {
  if (!cvLanguage || typeof cvLanguage !== 'object') return false;
  if (!offerLanguage || typeof offerLanguage !== 'object') return false;
  const cvCode = cvLanguage.code === 'en' ? 'en' : cvLanguage.code === 'fr' ? 'fr' : '';
  const offerCode = offerLanguage.code === 'en' ? 'en' : offerLanguage.code === 'fr' ? 'fr' : '';
  if (!cvCode || !offerCode || cvCode === offerCode) return false;
  const cvConf = Number(cvLanguage.confidence) || 0;
  const offerConf = Number(offerLanguage.confidence) || 0;
  return cvConf > 0 && offerConf > 0;
}

export function adaptLanguageChoiceCopy(cvLanguage, offerLanguage) {
  if (!shouldPromptLanguageChoice(cvLanguage, offerLanguage)) return null;
  const cvCode = cvLanguage.code === 'en' ? 'en' : 'fr';
  const offerCode = offerLanguage.code === 'en' ? 'en' : 'fr';
  const cvLabel = languageLabelFr(cvCode);
  const offerLabel = languageLabelFr(offerCode);
  const mixedLead = cvLanguage.mixed
    ? `On a remarqué que ton CV mélange plusieurs langues (dominant : ${cvLabel}) alors que l'annonce est en ${offerLabel}. `
    : `On a remarqué que ton CV est en ${cvLabel} alors que l'annonce est en ${offerLabel}. `;
  return {
    eyebrow: 'Langues',
    title: 'Langues différentes',
    message:
      `${mixedLead}Tu veux continuer dans la langue du CV, ou tout traduire vers celle de l'annonce ? ` +
      `Après ton choix, l'aperçu à droite se met à jour dans cette langue (même mise en page, mêmes polices). ` +
      `Relis-le, puis appuie sur Valider et lancer. La traduction reprend tes faits, sans rien inventer.`,
    keepLabel: `Garder le ${cvLabel} (CV)`,
    offerLabel: `Traduire vers le ${offerLabel} (annonce)`,
  };
}

/**
 * @param {object | null | undefined} cvLanguage
 * @param {object | null | undefined} offerLanguage
 * @param {'cv' | 'offer' | string | null | undefined} outputPolicy
 */
export function adaptLanguageNotice(cvLanguage, offerLanguage, outputPolicy = 'cv') {
  if (!cvLanguage || typeof cvLanguage !== 'object') return '';
  const cvCode = cvLanguage.code === 'en' ? 'en' : 'fr';
  const cvLabel = languageLabelFr(cvCode);
  const policy = outputPolicy === 'offer' ? 'offer' : 'cv';
  const offerCode = offerLanguage && typeof offerLanguage === 'object' ? offerLanguage.code : '';
  const offerConfidence = Number(offerLanguage?.confidence) || 0;
  const offerOk = (offerCode === 'fr' || offerCode === 'en') && offerConfidence > 0;
  const offerLabel = offerOk ? languageLabelFr(offerCode) : '';

  if (policy === 'offer' && offerOk && offerCode !== cvCode) {
    return (
      `J'ai traduit et adapté le CV en ${offerLabel} (langue de l'annonce), ` +
      `sans inventer de faits.`
    );
  }
  if (cvLanguage.mixed && policy !== 'offer') {
    return (
      `Ton CV mélange français et anglais : j'ai conservé le ${cvLabel} ` +
      `(langue dominante) pour l'adaptation. Relis le texte si une partie devait rester dans l'autre langue.`
    );
  }
  if (offerOk && offerCode !== cvCode) {
    return (
      `L'annonce est en ${offerLabel} : j'ai adapté le CV sans le traduire ` +
      `(il reste en ${cvLabel}).`
    );
  }
  return '';
}

export function withAdaptLanguageNotice(summary, cvLanguage, offerLanguage, outputPolicy = 'cv') {
  const notice = adaptLanguageNotice(cvLanguage, offerLanguage, outputPolicy);
  const base = (summary || '').trim();
  if (!notice) return base;
  if (!base) return notice;
  return `${base} ${notice}`;
}

/**
 * Statut visible sur la todo, avant « Valider et lancer ».
 * @param {object | null | undefined} cvLanguage
 * @param {object | null | undefined} offerLanguage
 * @param {'cv' | 'offer' | string | null | undefined} outputPolicy
 * @param {'idle' | 'loading' | 'ready' | 'error' | string} status
 */
export function adaptLanguagePreviewCopy(cvLanguage, offerLanguage, outputPolicy, status = 'ready') {
  if (!shouldPromptLanguageChoice(cvLanguage, offerLanguage)) return null;
  const cvCode = cvLanguage.code === 'en' ? 'en' : 'fr';
  const offerCode = offerLanguage.code === 'en' ? 'en' : 'fr';
  const cvLabel = languageLabelFr(cvCode);
  const offerLabel = languageLabelFr(offerCode);
  const policy = outputPolicy === 'offer' ? 'offer' : 'cv';
  const langLabel = policy === 'offer' ? offerLabel : cvLabel;
  const changeLabel = 'Changer';
  const retryLabel = 'Réessayer l’aperçu';

  if (!outputPolicy) {
    return {
      title: 'Choisis la langue de l’aperçu',
      body: 'Tu verras le CV dans la langue retenue à droite, avant de valider l’adaptation.',
      changeLabel: 'Choisir',
    };
  }
  if (status === 'loading') {
    return {
      title: `Traduction de l’aperçu en ${langLabel}…`,
      body: 'On prépare le CV dans la langue choisie, sans changer la mise en page ni les polices.',
      changeLabel,
    };
  }
  if (status === 'error') {
    return {
      title: `Aperçu pas encore en ${langLabel}`,
      body: 'La mise à jour de l’aperçu a échoué. Réessaie, ou change de langue.',
      changeLabel,
      retryLabel,
    };
  }
  if (policy === 'offer') {
    return {
      title: `Aperçu en ${langLabel} (langue de l’annonce)`,
      body:
        `Relis le CV à droite : titres, dates et texte doivent être en ${langLabel}. ` +
        `La mise en page et les polices restent les mêmes. Ensuite, valide pour lancer l’adaptation.`,
      changeLabel,
    };
  }
  return {
    title: `Aperçu en ${langLabel} (langue du CV)`,
    body:
      `On n’a pas traduit : le CV reste en ${langLabel}. Relis-le à droite, puis valide pour lancer l’adaptation.`,
    changeLabel,
  };
}
