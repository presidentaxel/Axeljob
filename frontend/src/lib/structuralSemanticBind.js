/**
 * AXE-329 — lie les blocs texte freeform d'un import structurel PDF
 * vers des types sémantiques éditables (identity, experiences, …).
 *
 * Heuristique pure (pas d'IA) : confiance basse → le bloc reste `text`.
 */

import { createCvSectionBlockPreset } from './canvasCvSectionPresets.js';

export const MIN_SEMANTIC_CONFIDENCE = 0.75;

/** Patterns titres : ligne entière ≈ libellé de section (évite faux positifs corps). */
const SECTION_HEADING_RULES = Object.freeze([
  {
    type: 'experiences',
    re: /^(?:[\s|/·•\-–—]*)(exp[ée]riences?(?:\s+professionnelles?)?|experience|work\s+history|employment)\s*$/i,
  },
  {
    type: 'formations',
    re: /^(?:[\s|/·•\-–—]*)(formations?|education|études|etudes|dipl[oô]mes?)\s*$/i,
  },
  {
    type: 'skills',
    re: /^(?:[\s|/·•\-–—]*)(comp[ée]tences?|skills?|technologies?|outils?)\s*$/i,
  },
  {
    type: 'languages',
    re: /^(?:[\s|/·•\-–—]*)(langues?|languages?)\s*$/i,
  },
  {
    type: 'certifications',
    re: /^(?:[\s|/·•\-–—]*)(certifications?|accreditations?)\s*$/i,
  },
  {
    type: 'projets',
    re: /^(?:[\s|/·•\-–—]*)(projets?|projects?|réalisations?|realisations?)\s*$/i,
  },
  {
    type: 'resume',
    re: /^(?:[\s|/·•\-–—]*)(profil|r[ée]sum[ée]|summary|about|à propos|a propos)\s*$/i,
  },
  {
    type: 'contact',
    re: /^(?:[\s|/·•\-–—]*)(contact|coordonn[ée]es)\s*$/i,
  },
]);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;

export function decodeStructuralText(content) {
  // Une seule passe : éviter le double-unescape CodeQL
  // (`&amp;lt;` ne doit pas devenir `<`).
  const decoded = String(content || '').replace(
    /&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    (entity) => {
      const lower = entity.toLowerCase();
      if (lower === '&nbsp;') return ' ';
      if (lower === '&amp;') return '&';
      if (lower === '&lt;') return '<';
      if (lower === '&gt;') return '>';
      if (lower === '&quot;') return '"';
      if (lower === '&#39;' || lower === '&apos;') return "'";
      const dec = /^&#(\d+);$/.exec(entity);
      if (dec) {
        const code = Number(dec[1]);
        if (code > 0 && code < 0x110000) return String.fromCharCode(code);
      }
      const hex = /^&#x([0-9a-f]+);$/i.exec(entity);
      if (hex) {
        const code = parseInt(hex[1], 16);
        if (code > 0 && code < 0x110000) return String.fromCharCode(code);
      }
      return entity;
    },
  );
  return decoded.replace(/\s+/g, ' ').trim();
}

function sameColumn(head, body) {
  // Corps majoritairement sous la bande du titre, sans démarrer à gauche (sidebar).
  const hx = Number(head.x) || 0;
  const hw = Number(head.w) || 0;
  const bx = Number(body.x) || 0;
  const bw = Number(body.w) || 0;
  if (bx < hx - 5) return false;
  if (bx > hx + hw + 5) return false;
  const left = Math.max(hx, bx);
  const right = Math.min(hx + hw, bx + bw);
  const overlap = Math.max(0, right - left);
  return overlap / Math.max(1, bw) >= 0.5;
}

function unionBox(blocks) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let z = 1;
  for (const b of blocks) {
    const x = Number(b.x) || 0;
    const y = Number(b.y) || 0;
    const w = Number(b.w) || 0;
    const h = Number(b.h) || 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    z = Math.max(z, Number(b.z) || 1);
  }
  return {
    x: minX,
    y: minY,
    w: Math.max(8, maxX - minX),
    h: Math.max(6, maxY - minY),
    z,
  };
}

/**
 * @returns {{ type: string, confidence: number, kind: string, sectionLabel?: string } | null}
 */
export function classifyStructuralTextBlock(block, cv = {}, { pageHeightMm = 297 } = {}) {
  if (!block || block.type !== 'text') return null;
  const text = decodeStructuralText(block.content);
  if (!text) return null;

  // Titres : ligne entière = libellé (pas un mot-clé dans une phrase corps).
  if (text.length <= 48) {
    for (const rule of SECTION_HEADING_RULES) {
      if (!rule.re.test(text)) continue;
      const bold = Boolean(block.style?.bold);
      const fontSize = Number(block.style?.font_size) || 0;
      let confidence = 0.55;
      if (bold) confidence += 0.2;
      if (fontSize >= 11) confidence += 0.15;
      if (text.length <= 32) confidence += 0.1;
      return {
        type: rule.type,
        confidence: Math.min(1, confidence),
        kind: 'heading',
        sectionLabel: text.toUpperCase(),
      };
    }
  }

  // Identité : nom/prénom CV + haut de page + emphase.
  const prenom = String(cv?.prenom || '').trim().toLowerCase();
  const nom = String(cv?.nom || '').trim().toLowerCase();
  if (prenom || nom) {
    const lower = text.toLowerCase();
    const hasPrenom = prenom && lower.includes(prenom);
    const hasNom = nom && lower.includes(nom);
    if (hasPrenom || hasNom) {
      const y = Number(block.y) || 0;
      const fontSize = Number(block.style?.font_size) || 0;
      const bold = Boolean(block.style?.bold);
      let confidence = 0.45;
      if (y < pageHeightMm * 0.32) confidence += 0.25;
      if (fontSize >= 14 || bold) confidence += 0.2;
      if (hasPrenom && hasNom) confidence += 0.15;
      if (confidence >= MIN_SEMANTIC_CONFIDENCE) {
        return { type: 'identity', confidence: Math.min(1, confidence), kind: 'identity' };
      }
    }
  }

  // Contact : email / téléphone.
  let contactConf = 0;
  if (EMAIL_RE.test(text)) contactConf += 0.55;
  if (PHONE_RE.test(text)) contactConf += 0.35;
  const cvEmail = String(cv?.email || '').trim().toLowerCase();
  if (cvEmail && text.toLowerCase().includes(cvEmail)) contactConf += 0.2;
  if (contactConf >= MIN_SEMANTIC_CONFIDENCE) {
    return { type: 'contact', confidence: Math.min(1, contactConf), kind: 'contact' };
  }

  return null;
}

function toSemanticBlock(baseBlock, classification, regionBlocks) {
  const preset = createCvSectionBlockPreset(classification.type);
  if (!preset) return null;
  const box = unionBox(regionBlocks.length ? regionBlocks : [baseBlock]);
  const style = {
    ...(preset.style || {}),
    ...(baseBlock.style && typeof baseBlock.style === 'object' ? {
      color: baseBlock.style.color,
      font_family: baseBlock.style.font_family,
      align: baseBlock.style.align || preset.style?.align,
    } : {}),
  };
  if (classification.sectionLabel) {
    style.section_label = classification.sectionLabel;
  }
  // Hauteur = bbox freeform uniquement (pas preset.h) pour ne pas chevaucher
  // les sections suivantes en layout freeform sans reflow.
  const out = {
    id: baseBlock.id,
    type: preset.type,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    z: box.z,
    style,
  };
  if (preset.bind !== undefined) {
    out.bind = Array.isArray(preset.bind) ? [...preset.bind] : preset.bind;
  }
  return out;
}

/**
 * Applique le binding sémantique sur un layout structurel freeform.
 * @returns {{ layout: object, boundCount: number, skippedLowConfidence: number }}
 */
export function bindStructuralTextToSemanticBlocks(layout, cv = {}, {
  minConfidence = MIN_SEMANTIC_CONFIDENCE,
} = {}) {
  if (!layout || !Array.isArray(layout.pages)) {
    return { layout, boundCount: 0, skippedLowConfidence: 0 };
  }

  let boundCount = 0;
  let skippedLowConfidence = 0;

  const pages = layout.pages.map((page) => {
    const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
    const textBlocks = blocks
      .filter((b) => b?.type === 'text')
      .slice()
      .sort((a, b) => (Number(a.y) - Number(b.y)) || (Number(a.x) - Number(b.x)));

    const classifications = new Map();
    for (const block of textBlocks) {
      const hit = classifyStructuralTextBlock(block, cv);
      if (!hit) continue;
      if (hit.confidence < minConfidence) {
        skippedLowConfidence += 1;
        continue;
      }
      classifications.set(block.id, hit);
    }

    const consumed = new Set();
    const semanticNew = [];

    // 1) Titres → région jusqu'au prochain titre (même colonne).
    for (let i = 0; i < textBlocks.length; i += 1) {
      const head = textBlocks[i];
      if (consumed.has(head.id)) continue;
      const cls = classifications.get(head.id);
      if (!cls || cls.kind !== 'heading') continue;

      const region = [head];
      consumed.add(head.id);
      for (let j = i + 1; j < textBlocks.length; j += 1) {
        const next = textBlocks[j];
        if (consumed.has(next.id)) continue;
        // Autre colonne : ignorer (ne pas stopper la région).
        if (!sameColumn(head, next)) continue;
        const nextCls = classifications.get(next.id);
        // Prochain titre *dans la même colonne* → fin de région.
        if (nextCls?.kind === 'heading') break;
        // Trop loin verticalement → autre zone.
        const gap = (Number(next.y) || 0) - ((Number(region[region.length - 1].y) || 0)
          + (Number(region[region.length - 1].h) || 0));
        if (gap > 28) break;
        region.push(next);
        consumed.add(next.id);
      }

      const semantic = toSemanticBlock(head, cls, region);
      if (semantic) {
        semanticNew.push(semantic);
        boundCount += 1;
      } else {
        region.forEach((b) => consumed.delete(b.id));
      }
    }

    // 2) Identité / contact (blocs isolés, non déjà absorbés).
    for (const block of textBlocks) {
      if (consumed.has(block.id)) continue;
      const cls = classifications.get(block.id);
      if (!cls || (cls.kind !== 'identity' && cls.kind !== 'contact')) continue;
      const semantic = toSemanticBlock(block, cls, [block]);
      if (!semantic) continue;
      consumed.add(block.id);
      semanticNew.push(semantic);
      boundCount += 1;
    }

    const kept = blocks.filter((b) => !consumed.has(b.id));
    return {
      ...page,
      blocks: [...kept, ...semanticNew],
    };
  });

  return {
    layout: { ...layout, pages, freeform: true },
    boundCount,
    skippedLowConfidence,
  };
}
