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
    re: /^(?:[\s|/·•\-–—]*)((?:work|professional)\s+experiences?|exp[ée]riences?(?:\s+professionnelles?)?|work\s+history|employment)\s*[:.]?\s*$/i,
  },
  {
    type: 'formations',
    re: /^(?:[\s|/·•\-–—]*)(formations?|education|études|etudes|dipl[oô]mes?)\s*[:.]?\s*$/i,
  },
  {
    type: 'skills',
    re: /^(?:[\s|/·•\-–—]*)(comp[ée]tences?|skills?|technologies?|outils?)\s*[:.]?\s*$/i,
  },
  {
    type: 'languages',
    re: /^(?:[\s|/·•\-–—]*)(langues?|languages?)\s*[:.]?\s*$/i,
  },
  {
    type: 'certifications',
    re: /^(?:[\s|/·•\-–—]*)(certifications?|accreditations?)\s*[:.]?\s*$/i,
  },
  {
    type: 'projets',
    re: /^(?:[\s|/·•\-–—]*)(projets?|projects?|réalisations?|realisations?)\s*[:.]?\s*$/i,
  },
  {
    type: 'resume',
    re: /^(?:[\s|/·•\-–—]*)(profil|r[ée]sum[ée]|summary|about|à propos|a propos)\s*[:.]?\s*$/i,
  },
  {
    type: 'contact',
    re: /^(?:[\s|/·•\-–—]*)(contact|coordonn[ée]es)\s*[:.]?\s*$/i,
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
  // Les titres PDF ont souvent un `w` = largeur glyphes (ex. « Formation » ~35mm)
  // alors que le corps est plus large : on aligne sur le bord gauche, pas sur `w`.
  const hx = Number(head.x) || 0;
  const bx = Number(body.x) || 0;
  // Sidebar : démarre nettement à gauche du titre.
  if (bx < hx - 8) return false;
  // Même colonne : bords gauches proches, ou corps légèrement indenté sous le titre.
  return Math.abs(bx - hx) <= 14 || (bx >= hx - 2 && bx <= hx + 28);
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

  // Identité : nom/prénom CV (+ dual-key EN) + haut de page + emphase.
  const prenom = String(cv?.prenom || cv?.first_name || '').trim().toLowerCase();
  const nom = String(cv?.nom || cv?.last_name || '').trim().toLowerCase();
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

const HEADING_ONLY_TITLE_TYPES = new Set([
  'experiences',
  'formations',
  'skills',
  'languages',
  'certifications',
  'projets',
  'resume',
]);

function headingAsLockedTitle(baseBlock, classification) {
  const label = classification.sectionLabel
    || decodeStructuralText(baseBlock.content);
  return {
    id: baseBlock.id,
    type: 'title',
    x: Number(baseBlock.x) || 0,
    y: Number(baseBlock.y) || 0,
    w: Math.max(8, Number(baseBlock.w) || 0),
    h: Math.max(6, Number(baseBlock.h) || 0),
    z: Number(baseBlock.z) || 1,
    content: label,
    style: {
      ...(baseBlock.style && typeof baseBlock.style === 'object' ? baseBlock.style : {}),
      role: 'heading',
      bold: true,
      lock_height: true,
    },
  };
}

function toSemanticBlock(baseBlock, classification, regionBlocks) {
  const region = regionBlocks.length ? regionBlocks : [baseBlock];
  // Titre PDF seul (corps dans une autre colonne) : ne pas poser un widget
  // sémantique qui s’auto-agrandit et recouvre la copie PDF.
  if (
    classification.kind === 'heading'
    && region.length <= 1
    && HEADING_ONLY_TITLE_TYPES.has(classification.type)
  ) {
    return headingAsLockedTitle(baseBlock, classification);
  }
  const preset = createCvSectionBlockPreset(classification.type);
  if (!preset) return null;
  const box = unionBox(region);
  const style = {
    ...(preset.style || {}),
    ...(baseBlock.style && typeof baseBlock.style === 'object' ? {
      color: baseBlock.style.color,
      font_family: baseBlock.style.font_family,
      align: baseBlock.style.align || preset.style?.align,
    } : {}),
  };
  // Sections : figer la bbox freeform. Identity / contact gardent l’auto-height
  // pour révéler titre / lignes après nettoyage des leftover PDF.
  if (HEADING_ONLY_TITLE_TYPES.has(classification.type)) {
    style.lock_height = true;
  }
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
 * Si ``annotations`` (API AXE-332) est fourni, elles priment sur l'heuristique locale.
 * @returns {{ layout: object, boundCount: number, skippedLowConfidence: number }}
 */
export function bindStructuralTextToSemanticBlocks(layout, cv = {}, {
  minConfidence = MIN_SEMANTIC_CONFIDENCE,
  annotations = null,
} = {}) {
  if (!layout || !Array.isArray(layout.pages)) {
    return { layout, boundCount: 0, skippedLowConfidence: 0 };
  }

  const annotationById = new Map();
  const rawAnnotations = Array.isArray(annotations)
    ? annotations
    : (Array.isArray(layout.semantic_annotations) ? layout.semantic_annotations : []);
  for (const ann of rawAnnotations) {
    if (!ann?.block_id || !ann?.type) continue;
    if (Number(ann.confidence) < minConfidence) continue;
    annotationById.set(String(ann.block_id), ann);
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
      const fromApi = annotationById.get(String(block.id));
      if (fromApi) {
        classifications.set(block.id, {
          type: fromApi.type === 'skills' ? 'skills' : fromApi.type,
          confidence: Number(fromApi.confidence) || 1,
          kind: fromApi.kind || (fromApi.type === 'identity' || fromApi.type === 'contact'
            ? fromApi.type
            : 'heading'),
          sectionLabel: fromApi.section_label || fromApi.sectionLabel,
        });
        continue;
      }
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

    // 3) Titre professionnel PDF resté en `text` à côté de l’identité sémantique
    // (le preset identity rebind aussi titre_professionnel → ghosting).
    const identityBoxes = semanticNew.filter((b) => b.type === 'identity');
    if (identityBoxes.length) {
      const titre = decodeStructuralText(cv?.titre_professionnel).toLowerCase();
      const name = decodeStructuralText(
        `${cv?.prenom || cv?.first_name || ''} ${cv?.nom || cv?.last_name || ''}`,
      ).toLowerCase();
      for (const block of textBlocks) {
        if (consumed.has(block.id)) continue;
        const text = decodeStructuralText(block.content).toLowerCase();
        if (!text || text.length < 4) continue;
        const by = Number(block.y) || 0;
        const near = identityBoxes.some((idb) => {
          const iy = Number(idb.y) || 0;
          const ih = Number(idb.h) || 0;
          return by < iy + ih + 16 && by > iy - 10;
        });
        if (!near) continue;
        const compact = (value) => String(value || '')
          .replace(/[\s|/·•\-–—_.,;:!?«»"'()]+/g, ' ')
          .trim();
        const textC = compact(text);
        // `compact("----") === ""` et `haystack.includes("")` est toujours vrai.
        if (!textC || textC.length < 4) continue;
        const titreC = compact(titre);
        const nameC = compact(name);
        const titreHit = Boolean(
          titreC
          && (
            titreC === textC
            || titreC.includes(textC)
            || (textC.includes(titreC) && textC.length <= titreC.length + 12)
          ),
        );
        const nameHit = Boolean(
          nameC
          && nameC.length >= 5
          && (
            nameC === textC
            || nameC.includes(textC)
            || (textC.includes(nameC) && textC.length <= nameC.length + 12)
          ),
        );
        if (titreHit || nameHit) consumed.add(block.id);
      }
    }

    const kept = blocks.filter((b) => !consumed.has(b.id));
    return {
      ...page,
      blocks: [...kept, ...semanticNew],
    };
  });

  const nextLayout = { ...layout, pages, freeform: true };
  // annotations consommées — inutile de les repasser au canvas
  if ('semantic_annotations' in nextLayout) {
    delete nextLayout.semantic_annotations;
  }

  return {
    layout: nextLayout,
    boundCount,
    skippedLowConfidence,
  };
}
