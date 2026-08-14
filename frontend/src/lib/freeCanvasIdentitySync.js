/**
 * AXE-339 — sync identité / contact depuis freeform canvas (heuristique, pas d'IA).
 * Haute confiance → appliquer sur le CV ; moyenne → hint discret (pas de wizard).
 */

import { syncCvDualKeys } from './cvDualKey.js';
import { decodeStructuralText } from './structuralSemanticBind.js';

export const IDENTITY_APPLY_CONFIDENCE = 0.75;
export const IDENTITY_HINT_CONFIDENCE = 0.55;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const SECTIONISH_RE =
  /^(?:exp[ée]riences?|formations?|comp[ée]tences?|skills?|langues?|certifications?|projets?|profil|profile|r[ée]sum[ée]|summary|contact|coordonn[ée]es)\s*[:.]?\s*$/i;

function nonempty(value) {
  return String(value ?? '').trim();
}

/** HTML / rich text → texte plat une ligne (decode 1 passe, anti CodeQL). */
export function plainTextFromContent(content) {
  const stripped = String(content ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeStructuralText(stripped);
}

/**
 * Parse un candidat identité (ex. « Jean Dupont ») depuis du texte freeform.
 * @returns {{ kind: 'identity', prenom: string, nom: string, confidence: number } | null}
 */
export function parseIdentityCandidate(content) {
  const text = plainTextFromContent(content);
  if (!text || text.length > 64) return null;
  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || /\d/.test(text)) return null;
  if (SECTIONISH_RE.test(text)) return null;
  if (/[,;|/·•]/.test(text)) return null;

  const parts = text.split(' ').filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;
  if (!parts.every((p) => /^[\p{L}'’-]+$/u.test(p))) return null;

  const prenom = parts[0];
  const nom = parts.slice(1).join(' ');
  // Base volontairement sous IDENTITY_APPLY_CONFIDENCE :
  // l’auto-apply exige un boost layout (haut de page / titre / bold).
  let confidence = 0.5;
  if (parts.length === 2) confidence += 0.1;
  if (parts.length === 3) confidence += 0.06;
  const capitalized = parts.filter((p) => /^[\p{Lu}]/u.test(p)).length;
  if (capitalized >= 2) confidence += 0.08;
  else if (capitalized === 1) confidence += 0.04;

  return {
    kind: 'identity',
    prenom,
    nom,
    confidence: Math.min(1, confidence),
  };
}

/**
 * Parse email / téléphone dans un freeform.
 * @returns {{ kind: 'contact', patch: object, confidence: number } | null}
 */
export function parseContactCandidate(content) {
  const text = plainTextFromContent(content);
  if (!text) return null;
  const emailMatch = text.match(EMAIL_RE);
  const phoneMatch = text.match(PHONE_RE);
  if (!emailMatch && !phoneMatch) return null;

  const patch = {};
  let confidence = 0;
  if (emailMatch) {
    patch.email = emailMatch[0];
    confidence += 0.8;
  }
  if (phoneMatch) {
    patch.telephone = phoneMatch[0].replace(/\s+/g, ' ').trim();
    confidence += 0.3;
  }
  return {
    kind: 'contact',
    patch,
    confidence: Math.min(1, confidence),
  };
}

/**
 * Boost de confiance selon position / style (aligné structuralSemanticBind).
 * @param {number} base
 * @param {object|null|undefined} block
 * @param {object|null|undefined} page
 */
export function boostConfidenceWithLayout(base, block, page) {
  let conf = Number(base) || 0;
  if (!block || typeof block !== 'object') return Math.min(1, conf);
  const pageH = Number(page?.height_mm ?? page?.h) || 297;
  const y = Number(block.y) || 0;
  if (y < pageH * 0.32) conf += 0.15;
  const style = block.style && typeof block.style === 'object' ? block.style : {};
  if (style.bold || Number(style.font_size) >= 14) conf += 0.1;
  if (block.type === 'title') conf += 0.05;
  return Math.min(1, conf);
}

function identityPatchDiffers(cv, prenom, nom) {
  const curP = nonempty(cv?.prenom || cv?.first_name);
  const curN = nonempty(cv?.nom || cv?.last_name);
  return (
    curP.toLowerCase() !== prenom.toLowerCase() || curN.toLowerCase() !== nom.toLowerCase()
  );
}

function contactPatchDiffers(cv, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (nonempty(cv?.[key]).toLowerCase() !== nonempty(value).toLowerCase()) return true;
  }
  return false;
}

/**
 * Phrase ambiguë (1–6 mots) : on demande plutôt que d'assumer.
 * @returns {string|null}
 */
export function parseAmbiguousPhrase(content) {
  const text = plainTextFromContent(content);
  if (!text || text.length > 64) return null;
  if (EMAIL_RE.test(text) || PHONE_RE.test(text) || /\d/.test(text)) return null;
  if (SECTIONISH_RE.test(text)) return null;
  if (/[,;|/·•]/.test(text)) return null;
  const parts = text.split(' ').filter(Boolean);
  if (parts.length < 1 || parts.length > 6) return null;
  if (!parts.every((p) => /^[\p{L}'’-]+$/u.test(p))) return null;
  return text;
}

/**
 * Applique un patch identité/contact + dual-key.
 * @param {object} cv
 * @param {object} patch
 */
export function applyIdentitySyncPatch(cv, patch) {
  const base = cv && typeof cv === 'object' ? { ...cv } : {};
  const next = { ...base, ...(patch || {}) };
  return syncCvDualKeys(next);
}

/**
 * Décide quoi faire après édition d'un bloc text/title.
 * @returns {{
 *   action: 'apply' | 'hint' | 'none',
 *   kind?: 'identity' | 'contact' | 'ask',
 *   confidence: number,
 *   patch?: object,
 *   options?: Array<{ label: string, patch: object }>,
 *   message?: string,
 * }}
 */
export function suggestFreeformCvSync({ content, block, page, cv } = {}) {
  const contact = parseContactCandidate(content);
  if (contact) {
    const confidence = boostConfidenceWithLayout(contact.confidence, block, page);
    if (!contactPatchDiffers(cv, contact.patch)) {
      return { action: 'none', kind: 'contact', confidence };
    }
    if (confidence >= IDENTITY_APPLY_CONFIDENCE) {
      return {
        action: 'apply',
        kind: 'contact',
        confidence,
        patch: contact.patch,
      };
    }
    if (confidence >= IDENTITY_HINT_CONFIDENCE) {
      return {
        action: 'hint',
        kind: 'contact',
        confidence,
        patch: contact.patch,
        message: 'Coordonnées détectées — les utiliser pour le profil ?',
      };
    }
    return { action: 'none', kind: 'contact', confidence };
  }

  const identity = parseIdentityCandidate(content);
  if (identity) {
    const confidence = boostConfidenceWithLayout(identity.confidence, block, page);
    if (!identityPatchDiffers(cv, identity.prenom, identity.nom)) {
      return { action: 'none', kind: 'identity', confidence };
    }
    const patch = { prenom: identity.prenom, nom: identity.nom };
    const full = `${identity.prenom} ${identity.nom}`.trim();
    if (confidence >= IDENTITY_APPLY_CONFIDENCE) {
      return { action: 'apply', kind: 'identity', confidence, patch };
    }
    if (confidence >= IDENTITY_HINT_CONFIDENCE) {
      return {
        action: 'hint',
        kind: 'ask',
        confidence,
        patch,
        message: `« ${full} » — c’est quoi ?`,
        options: [
          { label: 'Nom complet', patch },
          { label: 'Titre pro', patch: { titre_professionnel: full } },
        ],
      };
    }
  }

  // Pas un nom clair → demander (prénom seul, titre, etc.)
  const phrase = parseAmbiguousPhrase(content);
  if (phrase) {
    const confidence = boostConfidenceWithLayout(0.58, block, page);
    if (confidence < IDENTITY_HINT_CONFIDENCE) {
      return { action: 'none', confidence };
    }
    const parts = phrase.split(' ').filter(Boolean);
    const options = [];
    if (parts.length === 1) {
      const word = parts[0];
      if (nonempty(cv?.prenom || cv?.first_name).toLowerCase() !== word.toLowerCase()) {
        options.push({ label: 'Prénom', patch: { prenom: word } });
      }
      if (nonempty(cv?.nom || cv?.last_name).toLowerCase() !== word.toLowerCase()) {
        options.push({ label: 'Nom', patch: { nom: word } });
      }
      if (nonempty(cv?.titre_professionnel).toLowerCase() !== word.toLowerCase()) {
        options.push({ label: 'Titre pro', patch: { titre_professionnel: word } });
      }
    } else {
      const namePatch = { prenom: parts[0], nom: parts.slice(1).join(' ') };
      if (identityPatchDiffers(cv, namePatch.prenom, namePatch.nom)) {
        options.push({ label: 'Nom complet', patch: namePatch });
      }
      if (nonempty(cv?.titre_professionnel).toLowerCase() !== phrase.toLowerCase()) {
        options.push({ label: 'Titre pro', patch: { titre_professionnel: phrase } });
      }
    }
    if (!options.length) return { action: 'none', confidence };
    return {
      action: 'hint',
      kind: 'ask',
      confidence,
      patch: options[0].patch,
      message: `« ${phrase} » — c’est quoi ?`,
      options,
    };
  }

  return { action: 'none', confidence: 0 };
}
