/**
 * AXE-339 — sync identité / contact depuis freeform canvas (heuristique, pas d'IA).
 * Haute confiance → appliquer sur le CV ; moyenne → hint discret (pas de wizard).
 */

import { syncCvDualKeys } from './cvDualKey.js';

export const IDENTITY_APPLY_CONFIDENCE = 0.75;
export const IDENTITY_HINT_CONFIDENCE = 0.55;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
const SECTIONISH_RE =
  /^(?:exp[ée]riences?|formations?|comp[ée]tences?|skills?|langues?|certifications?|projets?|profil|profile|r[ée]sum[ée]|summary|contact|coordonn[ée]es)\s*[:.]?\s*$/i;

function nonempty(value) {
  return String(value ?? '').trim();
}

/** HTML / rich text → texte plat une ligne. */
export function plainTextFromContent(content) {
  return String(content ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (!parts.every((p) => /^[\p{L}'’\-]+$/u.test(p))) return null;

  const prenom = parts[0];
  const nom = parts.slice(1).join(' ');
  let confidence = 0.5;
  if (parts.length === 2) confidence += 0.15;
  if (parts.length === 3) confidence += 0.08;
  const capitalized = parts.filter((p) => /^[\p{Lu}]/u.test(p)).length;
  if (capitalized >= 2) confidence += 0.12;
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
 *   kind?: 'identity' | 'contact',
 *   confidence: number,
 *   patch?: object,
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
  if (!identity) return { action: 'none', confidence: 0 };

  const confidence = boostConfidenceWithLayout(identity.confidence, block, page);
  if (!identityPatchDiffers(cv, identity.prenom, identity.nom)) {
    return { action: 'none', kind: 'identity', confidence };
  }

  const patch = { prenom: identity.prenom, nom: identity.nom };
  if (confidence >= IDENTITY_APPLY_CONFIDENCE) {
    return { action: 'apply', kind: 'identity', confidence, patch };
  }
  if (confidence >= IDENTITY_HINT_CONFIDENCE) {
    return {
      action: 'hint',
      kind: 'identity',
      confidence,
      patch,
      message: `« ${identity.prenom} ${identity.nom} » ressemble à un nom — l’utiliser pour le profil ?`,
    };
  }
  return { action: 'none', kind: 'identity', confidence };
}
