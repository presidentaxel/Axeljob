import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptCanvasLayoutForCv,
  analyzeCvProfile,
  applyThemeColorsToDecorativeBlocks,
  applyImportedRoundImageShapes,
  cleanupImportedImageOverlays,
  applyVisionSectionPlacement,
  buildFullCanvasImportLayout,
  buildLayoutFromVisionDetection,
  buildStructuralImportLayout,
  buildThemeFromVisionImport,
  estimateSemanticBlockHeight,
  inferThemeFromProfile,
  isStructuralLayout,
  mergePresetDecorations,
  recommendTemplateId,
  resolveImportPersistTemplateId,
  cvHasSeedableProfileContent,
} from '../../src/lib/canvasCvImportAdapter.js';
import { createCanvasLayoutForTemplate } from '../../src/lib/layoutTemplatePresets.js';
import { createStarterLayoutV3, sanitizeLayoutV3 } from '../../src/lib/cvLayoutModelV3.js';
import { reflowColumnBlocksOnPage } from '../../src/lib/layoutReflow.js';

const DENSE_CV = {
  prenom: 'Marie',
  nom: 'Martin',
  titre_professionnel: 'Directrice Marketing',
  email: 'marie@ex.com',
  resume: 'Profil senior avec 12 ans d experience en growth et brand.',
  experiences: [
    { poste: 'Head of Growth', entreprise: 'ScaleUp', bullet_points: ['A', 'B', 'C'] },
    { poste: 'CMO', entreprise: 'Agency', bullet_points: ['D'] },
    { poste: 'Lead', entreprise: 'Corp', bullet_points: ['E', 'F'] },
    { poste: 'Manager', entreprise: 'X', bullet_points: [] },
    { poste: 'Consultant', entreprise: 'Y', bullet_points: ['G'] },
  ],
  formations: [{ diplome: 'MBA', etablissement: 'HEC', date: '2015' }],
  competences: {
    techniques: ['SEO', 'SEA', 'Analytics'],
    logiciels: ['HubSpot', 'GA4'],
    langues: [{ langue: 'Anglais', niveau: 'C1' }],
    autres: [],
  },
  certifications: [{ nom: 'Google Ads', organisme: 'Google' }],
  projets: [],
};

test('analyzeCvProfile compte sections et densité', () => {
  const a = analyzeCvProfile(DENSE_CV);
  assert.equal(a.expCount, 5);
  assert.equal(a.formationCount, 1);
  assert.equal(a.skillCount, 5);
  assert.equal(a.isExecutiveProfile, true);
  assert.ok(a.density > 10);
});

test('recommendTemplateId : profil exécutif dense → executive ou classic', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const templates = [
    { id: 'minimal', name: 'Minimal' },
    { id: 'executive', name: 'Executive' },
    { id: 'classic', name: 'Classic' },
  ];
  const id = recommendTemplateId(analysis, templates, 'minimal');
  assert.equal(id, 'executive');
});

test('recommendTemplateId : template_match vision prioritaire', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const templates = [{ id: 'modern', name: 'Modern' }, { id: 'executive', name: 'Executive' }];
  const id = recommendTemplateId(analysis, templates, 'minimal', { template_match: 'modern' });
  assert.equal(id, 'modern');
});

test('estimateSemanticBlockHeight : expériences volumineuses', () => {
  const h = estimateSemanticBlockHeight({ type: 'experiences', h: 40 }, DENSE_CV);
  assert.ok(h > 50);
});

test('estimateSemanticBlockHeight : résumé court reste compact (Profil→Exp)', () => {
  const cv = { resume: "J'ai fait un stage de 20 mois en tant que Product Owner chez Michelin." };
  const h = estimateSemanticBlockHeight({ type: 'resume', h: 40, style: { zone: 'main' } }, cv);
  assert.ok(h < 22, `resume trop haut: ${h}mm`);
  assert.ok(h >= 11);
});

test('inferThemeFromProfile : hints accent prioritaire', () => {
  const analysis = analyzeCvProfile(DENSE_CV);
  const theme = inferThemeFromProfile(analysis, { accent_color: '#ff5500' });
  assert.equal(theme.color_accent, '#ff5500');
});

test('applyThemeColorsToDecorativeBlocks recolore sidebar', () => {
  const layout = createStarterLayoutV3();
  layout.theme = {
    color_sidebar: '#112233',
    color_accent: '#aabbcc',
    color_header: '#445566',
  };
  layout.pages[0].blocks.unshift({
    id: 'sb', type: 'shape:rect', x: 0, y: 0, w: 50, h: 297, z: 0, style: { color: '#000' },
  });
  const next = applyThemeColorsToDecorativeBlocks(layout);
  const sb = next.pages[0].blocks.find((b) => b.id === 'sb');
  assert.equal(sb.style.color, '#112233');
});

test('applyVisionSectionPlacement déplace compétences vers colonne principale', () => {
  const template = { id: 'modern', name: 'Modern' };
  const base = createCanvasLayoutForTemplate(template);
  const visionMeta = {
    layout_style: 'sidebar-left',
    sections_in_sidebar: ['photo', 'contact', 'languages'],
    sections_in_main: ['experiences', 'formations', 'skills', 'resume'],
  };
  const next = applyVisionSectionPlacement(base, visionMeta, {
    layoutStyle: 'sidebar-left',
    templateId: 'modern',
  });
  const skills = next.pages[0].blocks.filter((b) => b.type === 'skills');
  assert.ok(skills.length >= 1);
  for (const block of skills) {
    assert.ok((Number(block.x) || 0) > 40, 'skills devraient être en colonne principale');
  }
});

const STRUCTURAL_LAYOUT = {
  version: 3,
  format: 'A4',
  grid: 'free',
  unit: 'mm',
  source: 'pdf_structural',
  pages: [
    {
      id: 'page_1',
      blocks: [
        { type: 'shape:rect', x: 0, y: 0, w: 63, h: 297, z: 0, style: { color: '#1e3a5f' } },
        { type: 'text', content: 'Louis Vedovato', x: 14, y: 21, w: 80, h: 8, z: 3, style: { font_size: 20, color: '#000000', bold: true } },
        { type: 'text', content: 'Fondateur', x: 14, y: 35, w: 90, h: 5, z: 3, style: { font_size: 11, color: '#333333' } },
      ],
    },
  ],
  theme: { template_id: 'imported', color_body: '#1a1a1a' },
};

test('isStructuralLayout : détecte un layout backend avec blocs', () => {
  assert.equal(isStructuralLayout(STRUCTURAL_LAYOUT), true);
  assert.equal(isStructuralLayout({ pages: [{ blocks: [] }] }), false);
  assert.equal(isStructuralLayout(null), false);
});

test('buildStructuralImportLayout : copie fidèle, aucun preset', () => {
  const result = buildStructuralImportLayout(DENSE_CV, STRUCTURAL_LAYOUT, { templateId: 'minimal' });
  assert.equal(result.importSource, 'structural');
  assert.equal(result.blockCount, 3);
  const blocks = result.layout.pages[0].blocks;
  const rect = blocks.find((b) => b.type === 'shape:rect');
  assert.equal(rect.style.color, '#1e3a5f');
  const title = blocks.find((b) => b.type === 'text' && b.content.includes('Louis'));
  assert.equal(title.style.font_size, 20);
  assert.equal(title.style.bold, true);
});

test('buildStructuralImportLayout : mix in-place (identity/title, corps PDF conservé)', () => {
  const structural = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    source: 'pdf_structural',
    pages: [{
      id: 'page_1',
      blocks: [
        {
          type: 'text',
          content: 'Marie Martin',
          x: 20,
          y: 16,
          w: 90,
          h: 8,
          z: 3,
          style: { font_size: 18, bold: true },
        },
        {
          type: 'text',
          content: 'Expérience professionnelle',
          x: 20,
          y: 70,
          w: 100,
          h: 6,
          z: 3,
          style: { font_size: 12, bold: true },
        },
        {
          type: 'text',
          content: 'Head of Growth — ScaleUp',
          x: 20,
          y: 80,
          w: 110,
          h: 5,
          z: 3,
          style: {},
        },
      ],
    }],
    theme: { template_id: 'imported' },
  };
  const result = buildStructuralImportLayout(DENSE_CV, structural, { templateId: 'minimal' });
  assert.equal(result.importSource, 'structural');
  assert.equal(result.layout.freeform, true);
  const blocks = result.layout.pages[0].blocks;
  assert.ok(blocks.some((b) => b.type === 'identity' && Array.isArray(b.bind)));
  assert.ok(blocks.some((b) => b.type === 'title' && b.style?.semantic_section === 'experiences'));
  assert.ok(blocks.some((b) => b.type === 'text' && String(b.content || '').includes('Head of Growth')));
  assert.equal(blocks.some((b) => b.type === 'experiences'), false);
});

test('applyImportedRoundImageShapes : anneau vectoriel → image en cercle', () => {
  const layout = {
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'img', type: 'image', x: 20, y: 20, w: 30, h: 30, z: 2, style: { shape: 'rect' }, image_src: 'data:' },
        { id: 'ring', type: 'shape:circle', x: 19, y: 19, w: 32, h: 32, z: 1, style: { color: '#000' } },
      ],
    }],
  };
  const out = applyImportedRoundImageShapes(layout);
  const image = out.pages[0].blocks.find((b) => b.id === 'img');
  assert.equal(image.style.shape, 'circle');
  assert.equal(out.pages[0].blocks.some((b) => b.id === 'ring'), false);
});

test('cleanupImportedImageOverlays : supprime icône parasite sur photo', () => {
  const layout = {
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'img', type: 'image', x: 20, y: 20, w: 30, h: 30, z: 1, style: {}, image_src: 'data:' },
        { id: 'pin', type: 'icon', x: 22, y: 22, w: 26, h: 26, z: 2, style: { icon_name: 'HiMapPin' } },
      ],
    }],
  };
  const out = cleanupImportedImageOverlays(layout);
  assert.equal(out.pages[0].blocks.length, 1);
  assert.equal(out.pages[0].blocks[0].id, 'img');
  assert.equal(out.pages[0].blocks[0].style.shape, 'circle');
});

test('sanitizeLayoutV3 : préserve le flag freeform', () => {
  const out = sanitizeLayoutV3({ ...STRUCTURAL_LAYOUT, freeform: true });
  assert.equal(out.freeform, true);
});

test('sanitizeLayoutV3 : conserve les tailles exactes en freeform (pas de min 5×3)', () => {
  const tiny = {
    version: 3, format: 'A4', grid: 'free', unit: 'mm', freeform: true,
    pages: [{ id: 'p1', blocks: [{ type: 'shape:rect', x: 10, y: 10, w: 0.4, h: 60, z: 1, style: { color: '#000' } }] }],
  };
  const b = sanitizeLayoutV3(tiny).pages[0].blocks[0];
  assert.ok(b.w < 1, `attendu fin, reçu ${b.w}`);
  assert.equal(b.h, 60);
});

test('sanitizeLayoutV3 : applique le min 5×3 hors freeform', () => {
  const tiny = {
    version: 3, format: 'A4', grid: 'free', unit: 'mm',
    pages: [{ id: 'p1', blocks: [{ type: 'shape:rect', x: 10, y: 10, w: 0.4, h: 1, z: 1, style: {} }] }],
  };
  const b = sanitizeLayoutV3(tiny).pages[0].blocks[0];
  assert.equal(b.w, 5);
  assert.equal(b.h, 3);
});

test('sanitizeLayoutV3 : préserve les polices embarquées (@font-face)', () => {
  const fonts = [
    { family: 'PDFEmbed-Garet', weight: 700, style: 'normal', format: 'truetype', src: 'data:font/ttf;base64,AAA' },
    { family: 'PDFEmbed-Garet', weight: 400, style: 'normal', src: 'data:font/ttf;base64,BBB' },
    { family: '', src: 'data:...' },
  ];
  const out = sanitizeLayoutV3({ ...STRUCTURAL_LAYOUT, fonts });
  assert.equal(out.fonts.length, 2);
  assert.equal(out.fonts[0].family, 'PDFEmbed-Garet');
  assert.equal(out.fonts[0].weight, 700);
  assert.equal(out.fonts[1].format, 'truetype');
});

test('reflowColumnBlocksOnPage : ne touche pas un layout freeform', () => {
  // Deux blocs texte côte à côte (même lane "main", même y) : un reflow
  // classique empilerait le second sous le premier. En freeform on garde tout.
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'text', content: 'Organisation : Louitos', x: 4, y: 50, w: 35, h: 4, z: 3, style: {} },
        { id: 'b', type: 'text', content: '2022 - Aujourd\'hui', x: 113, y: 50, w: 46, h: 4, z: 3, style: {} },
      ],
    }],
    theme: {},
  };
  const out = reflowColumnBlocksOnPage(layout, 0);
  assert.equal(out, layout); // identité : aucun repositionnement
  assert.equal(out.pages[0].blocks[1].y, 50);
});

test('reflowColumnBlocksOnPage : replica_cascade empile malgré freeform', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    replica_cascade: true,
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'experiences', bind: 'experiences', x: 8, y: 40, w: 180, h: 40, z: 1, style: { zone: 'main' } },
        { id: 'b', type: 'formations', bind: 'formations', x: 8, y: 50, w: 180, h: 20, z: 1, style: { zone: 'main' } },
      ],
    }],
    theme: {},
  };
  const out = reflowColumnBlocksOnPage(layout, 0);
  const formations = out.pages[0].blocks.find((b) => b.id === 'b');
  assert.ok(formations.y >= 80, `formations poussé sous expériences, got y=${formations.y}`);
});

test('elegant preserveReplicaGeometry : photo au-dessus du nom, pas de restack ATS', () => {
  const cv = {
    prenom: 'Louis',
    nom: 'Vedovato',
    titre_professionnel: 'Product Owner',
    telephone: '06',
    email: 'a@b.fr',
    resume: 'Stage Product Owner.',
    experiences: [
      {
        entreprise: 'LOUITOS',
        poste: 'Dirigeant',
        date_debut: '2022',
        date_fin: "Aujourd'hui",
        lieu: 'Cusset',
        bullet_points: ['Chef'],
        clients: 'clients',
      },
      {
        entreprise: 'AXEL',
        poste: 'Président',
        date_debut: '2024',
        date_fin: "Aujourd'hui",
        lieu: 'Cusset',
        bullet_points: ['Crea'],
        clients: 'monde',
      },
    ],
    formations: [{ etablissement: 'ESSEC', diplome: 'BBA', date: '2023-2027' }],
    competences: { techniques: ['Python'], logiciels: ['Notion'], langues: [{ langue: 'Français', niveau: 'Natif' }] },
    certifications: [{ nom: 'Cert', organisme: 'Org', date: '2026' }],
    projets: [{ nom: 'CRM', description: 'Desc' }],
    photo_url: 'https://example.com/p.jpg',
  };
  const base = createCanvasLayoutForTemplate({ id: 'elegant' });
  const { layout } = adaptCanvasLayoutForCv(cv, base, {
    preserveReplicaGeometry: true,
    templateId: 'elegant',
  });
  assert.equal(layout.freeform, true);
  assert.equal(layout.replica_cascade, true);
  const blocks = layout.pages[0].blocks;
  const photo = blocks.find((b) => b.type === 'photo');
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  const experiences = blocks.find((b) => b.type === 'experiences');
  const formations = blocks.find((b) => b.type === 'formations');
  assert.ok(photo && identity && contact);
  assert.ok(photo.y < identity.y, 'photo Stable au-dessus du nom');
  assert.ok(identity.y < contact.y, 'contact sous identity');
  assert.ok(experiences.y + experiences.h <= formations.y + 0.05, 'pas de chevauchement exp/formation');
});

test('classic preserveReplicaGeometry : contenu main reste page 1 (lanes séparées)', () => {
  const cv = {
    prenom: 'Louis',
    nom: 'Vedovato',
    titre_professionnel: 'Product Owner',
    telephone: '06',
    email: 'a@b.fr',
    resume: 'Résumé professionnel court pour le header Classic.',
    experiences: [
      {
        entreprise: 'A',
        poste: 'B',
        date_debut: '2022',
        date_fin: "Aujourd'hui",
        lieu: 'Paris',
        bullet_points: ['Un', 'Deux'],
      },
    ],
    formations: [{ etablissement: 'ESSEC', diplome: 'BBA', date: '2023' }],
    projets: [{ nom: 'CRM', description: 'Desc' }],
    competences: { techniques: ['Python'], logiciels: ['Notion'] },
    photo_url: 'https://example.com/p.jpg',
  };
  const { layout } = adaptCanvasLayoutForCv(cv, createCanvasLayoutForTemplate({ id: 'classic' }), {
    preserveReplicaGeometry: true,
    templateId: 'classic',
  });
  assert.equal(layout.pages.length, 1, 'pas de pagination parasite sidebar/main');
  const page0 = layout.pages[0].blocks;
  assert.ok(page0.some((b) => b.type === 'experiences'), 'expériences sur page 1');
  assert.ok(page0.some((b) => b.type === 'shape:rect'), 'fonds couleurs sur page 1');
  const contact = page0.find((b) => b.type === 'contact');
  const experiences = page0.find((b) => b.type === 'experiences');
  assert.ok(
    experiences.y >= contact.y + contact.h - 0.05,
    'main sous le header (pas de chevauchement contact)',
  );
});

test('bold header : lock_geometry garde photo | identity | résumé | contact', () => {
  const cv = {
    prenom: 'Louis',
    nom: 'Vedovato',
    titre_professionnel: 'Product Owner - Michelin',
    telephone: '06',
    email: 'a@b.fr',
    linkedin: 'louis.vedovato',
    resume: 'Product owner chez Michelin pour mon alternance de 20 mois',
    experiences: [{ entreprise: 'A', poste: 'B', bullet_points: ['x'] }],
    formations: [{ etablissement: 'E', diplome: 'D', date: '2023' }],
    competences: { techniques: ['Python'] },
    photo_url: 'https://example.com/p.jpg',
  };
  const { layout } = adaptCanvasLayoutForCv(cv, createCanvasLayoutForTemplate({ id: 'bold' }), {
    preserveReplicaGeometry: true,
    templateId: 'bold',
  });
  const page0 = layout.pages[0].blocks;
  const photo = page0.find((b) => b.type === 'photo');
  const identity = page0.find((b) => b.type === 'identity');
  const resume = page0.find((b) => b.type === 'resume');
  const contact = page0.find((b) => b.type === 'contact');
  assert.ok(photo && identity && resume && contact);
  assert.ok(
    Math.abs(identity.y - photo.y) < 0.05,
    'identity même y que la photo',
  );
  assert.ok(
    Math.abs(identity.h - photo.h) < 0.05,
    'identity même hauteur que la photo (centrage vertical)',
  );
  assert.ok(resume.y >= photo.y + photo.h - 0.05, 'résumé sous la rangée photo');
  assert.ok(contact.y >= resume.y + resume.h - 0.05, 'contact sous résumé');
  assert.equal(resume.style?.show_section_title, false);
  assert.equal(identity.style?.lock_geometry, true);
});

test('classic sidebar : cascade resserre les blocs (pas de trous après shrink)', () => {
  const cv = {
    prenom: 'L',
    nom: 'V',
    titre_professionnel: 'PO',
    telephone: '06',
    email: 'a@b.fr',
    resume: 'Résumé.',
    experiences: [{ entreprise: 'A', poste: 'B', bullet_points: ['x'] }],
    formations: [{ etablissement: 'E', diplome: 'D', date: '2023' }],
    projets: [{ nom: 'P', description: 'D' }],
    competences: {
      techniques: ['Python', 'Lire'],
      logiciels: ['Excel', 'Claude'],
      autres: ['Permis B'],
      langues: [
        { langue: 'Français', niveau: 'Natif' },
        { langue: 'Japonais', niveau: 'C2' },
      ],
    },
    certifications: [{ nom: 'Cert', organisme: 'AXEL', date: '2026' }],
    photo_url: 'https://example.com/p.jpg',
  };
  const { layout } = adaptCanvasLayoutForCv(cv, createCanvasLayoutForTemplate({ id: 'classic' }), {
    preserveReplicaGeometry: true,
    templateId: 'classic',
  });
  const side = layout.pages[0].blocks
    .filter((b) => b.style?.zone === 'sidebar-light')
    .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));
  assert.ok(side.length >= 4, `sidebar trop courte: ${side.length}`);
  for (let i = 1; i < side.length; i += 1) {
    const prev = side[i - 1];
    const gap = side[i].y - (prev.y + prev.h);
    assert.ok(
      gap >= -0.05 && gap < 1.5,
      `gap sidebar ${prev.type}→${side[i].type}: ${gap.toFixed(1)}mm`,
    );
  }
});

test('minimal : contact sous identity sans overlap (hauteur nom+titre)', () => {
  const blocks = createCanvasLayoutForTemplate({ id: 'minimal' }).pages[0].blocks;
  const identity = blocks.find((b) => b.type === 'identity');
  const contact = blocks.find((b) => b.type === 'contact');
  assert.ok(contact.y >= identity.y + identity.h + 1, `gap trop serré: id.h=${identity.h} contact.y=${contact.y}`);
});

test('adaptCanvasLayoutForCv : freeform sans replica_cascade ne cascade pas', () => {
  const freeformNoCascade = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    freeform: true,
    pages: [{
      id: 'p1',
      blocks: [
        {
          id: 'exp', type: 'experiences', bind: 'experiences',
          x: 10, y: 40, w: 90, h: 20, z: 3, style: { zone: 'main' },
        },
        {
          id: 'side', type: 'formations', bind: 'formations',
          x: 110, y: 40, w: 80, h: 30, z: 3, style: { zone: 'sidebar' },
        },
      ],
    }],
    theme: {},
  };
  const cv = {
    experiences: [{ entreprise: 'A', poste: 'B', bullet_points: ['x', 'y', 'z'] }],
    formations: [{ etablissement: 'ESSEC', diplome: 'BBA', date: '2023' }],
  };
  const { layout } = adaptCanvasLayoutForCv(cv, freeformNoCascade, { forImport: true });
  assert.notEqual(layout.replica_cascade, true);
  const side = layout.pages[0].blocks.find((b) => b.id === 'side');
  assert.ok(side, 'bloc sidebar conservé');
  assert.equal(side.y, 40, 'colonne latérale non déplacée par cascade réplique');
});

test('reflowColumnBlocksOnPage : empile bien hors freeform (régression du flag)', () => {
  const layout = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'a', type: 'experiences', bind: 'experiences', x: 4, y: 50, w: 120, h: 30, z: 3, style: {} },
        { id: 'b', type: 'formations', bind: 'formations', x: 4, y: 50, w: 120, h: 20, z: 3, style: {} },
      ],
    }],
    theme: {},
  };
  const out = reflowColumnBlocksOnPage(layout, 0);
  const b = out.pages[0].blocks.find((blk) => blk.id === 'b');
  assert.ok(b.y > 50); // empilé sous le premier
});

test('buildFullCanvasImportLayout : layout structurel prioritaire sur vision', () => {
  const templates = [{ id: 'modern', name: 'Modern' }, { id: 'executive', name: 'Executive' }];
  const result = buildFullCanvasImportLayout(DENSE_CV, templates, {
    visionLayout: STRUCTURAL_LAYOUT,
    visionMeta: { source: 'gemini_vision', template_match: 'executive', confidence: 0.9 },
  });
  assert.equal(result.importSource, 'structural');
  assert.equal(result.blockCount, 3);
});

test('buildThemeFromVisionImport : couleurs PDF, pas preset executive', () => {
  const theme = buildThemeFromVisionImport(
    { dominant_colors: { accent: '#003366', sidebar: '#eef2f7', header: '#003366' } },
    {},
    { id: 'executive', options: [{ key: 'accent_color', default: '#b8860b' }] },
  );
  assert.equal(theme.color_accent, '#003366');
  assert.equal(theme.color_sidebar, '#eef2f7');
  assert.notEqual(theme.color_accent, '#b8860b');
});

test('buildLayoutFromVisionDetection : preset calibré + couleurs vision', () => {
  const templates = [
    { id: 'modern', name: 'Modern' },
    { id: 'executive', name: 'Executive' },
  ];
  const visionMeta = {
    source: 'gemini_vision',
    template_match: 'modern',
    confidence: 0.88,
    layout_style: 'sidebar-left',
    dominant_colors: { accent: '#e11d48', sidebar: '#1e3a5f', header: '#1e3a5f' },
    sections_found: ['experiences', 'formations', 'skills'],
  };
  const result = buildLayoutFromVisionDetection(DENSE_CV, visionMeta, templates, {});
  assert.equal(result.importSource, 'vision-guided');
  assert.equal(result.recommendedTemplateId, 'modern');
  assert.ok(result.blockCount >= 8);
  assert.equal(result.layout.theme.color_accent, '#e11d48');
  assert.equal(result.layout.theme.color_sidebar, '#1e3a5f');
  const hasSidebar = result.layout.pages[0].blocks.some(
    (b) => b.type === 'shape:rect' && (Number(b.w) || 0) > 30,
  );
  assert.ok(hasSidebar);
});

test('buildFullCanvasImportLayout : vision detection → vision-guided', () => {
  const templates = [{ id: 'classic', name: 'Classic' }, { id: 'creative', name: 'Creative' }];
  const result = buildFullCanvasImportLayout(DENSE_CV, templates, {
    visionMeta: {
      source: 'gemini_vision',
      template_match: 'creative',
      confidence: 0.75,
      dominant_colors: { accent: '#6366f1', sidebar: '#6366f1' },
    },
  });
  assert.equal(result.importSource, 'vision-guided');
  assert.equal(result.recommendedTemplateId, 'creative');
});

test('buildFullCanvasImportLayout : canvas preset sans vision', () => {
  const templates = [
    { id: 'classic', name: 'Classic' },
    { id: 'executive', name: 'Executive' },
  ];
  const { layout, blockCount, recommendedTemplateId } = buildFullCanvasImportLayout(
    DENSE_CV,
    templates,
    { layoutHints: { layout_style: 'sidebar-right' } },
  );
  assert.equal(recommendedTemplateId, 'executive');
  assert.ok(blockCount >= 4);
  assert.ok(layout.pages[0].blocks.length >= 4);
});

test('adaptCanvasLayoutForCv supprime blocs vides et redimensionne', () => {
  const layout = createStarterLayoutV3();
  const sparseCv = {
    prenom: 'A',
    nom: 'B',
    experiences: [{ poste: 'Dev', entreprise: 'Co', bullet_points: ['x'] }],
    formations: [],
    certifications: [],
    projets: [],
    competences: { techniques: [], logiciels: [], langues: [], autres: [] },
  };
  const before = layout.pages[0].blocks.length;
  const { layout: next, removedBlockCount, resizedBlockCount } = adaptCanvasLayoutForCv(
    sparseCv,
    layout,
    { templatesList: [{ id: 'classic' }], templateId: 'classic' },
  );
  assert.ok(removedBlockCount >= 1);
  assert.ok(resizedBlockCount >= 1);
  assert.ok(next.pages[0].blocks.length <= before);
});

test('mergePresetDecorations ajoute bandeaux preset si absents', () => {
  const vision = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: { color_accent: '#3182ce' },
    pages: [{
      id: 'p1',
      blocks: [
        { id: 'b1', type: 'identity', bind: ['prenom', 'nom'], x: 60, y: 20, w: 100, h: 20, z: 2, style: {} },
      ],
    }],
  };
  const templates = [{ id: 'modern', name: 'Modern' }];
  const { layout: preset } = buildFullCanvasImportLayout(DENSE_CV, templates, {
    layoutHints: { layout_style: 'sidebar-left' },
  });
  const merged = mergePresetDecorations(vision, preset);
  const rects = merged.pages[0].blocks.filter((b) => b.type === 'shape:rect');
  assert.ok(rects.length >= 1);
});

test('AXE-344: forImport refuse un canvas décoratif-only (filet seul)', () => {
  const emptyishCv = {
    prenom: 'Camille',
    nom: 'Dupont',
    email: 'camille@ex.com',
    experiences: [],
    formations: [],
    certifications: [],
    projets: [],
    competences: { techniques: [], logiciels: [], langues: [], autres: [] },
  };
  const decorativeOnly = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: {},
    pages: [{
      id: 'p1',
      blocks: [
        {
          id: 'deco',
          type: 'shape:rect',
          x: 0,
          y: 0,
          w: 8,
          h: 297,
          z: 1,
          style: { color: '#003c33' },
        },
      ],
    }],
  };
  const { layout, contentBlockCount } = adaptCanvasLayoutForCv(emptyishCv, decorativeOnly, {
    forImport: true,
    templatesList: [{ id: 'minimal' }],
    templateId: 'minimal',
  });
  assert.ok(contentBlockCount >= 1);
  const types = (layout.pages[0].blocks || []).map((b) => b.type);
  assert.ok(types.includes('identity') || types.includes('contact'));
  assert.ok(!types.every((t) => t === 'shape:rect' || t === 'shape:line'));
});

test('AXE-344: buildFullCanvasImportLayout peuplé même CV sparse', () => {
  const templates = [{ id: 'minimal', name: 'Minimal' }];
  const sparse = {
    prenom: 'Léa',
    nom: 'Martin',
    email: 'lea@ex.com',
    experiences: [],
    formations: [],
    certifications: [],
    projets: [],
    competences: { techniques: [], logiciels: [], langues: [], autres: [] },
  };
  const result = buildFullCanvasImportLayout(sparse, templates);
  assert.ok(result.contentBlockCount >= 1);
  assert.ok(
    result.layout.pages[0].blocks.some((b) => b.type !== 'shape:rect' && b.type !== 'shape:line'),
  );
});

test('AXE-344: analyzeCvProfile lit dual-keys first_name/last_name', () => {
  const a = analyzeCvProfile({
    first_name: 'Sam',
    last_name: 'Lee',
    email: 'sam@ex.com',
  });
  assert.equal(a.hasIdentity, true);
  assert.equal(a.hasContact, true);
});

test('AXE-344: resolveImportPersistTemplateId refuse « imported »', () => {
  assert.equal(resolveImportPersistTemplateId('imported', 'minimal'), 'minimal');
  assert.equal(resolveImportPersistTemplateId('', 'classic'), 'classic');
  assert.equal(resolveImportPersistTemplateId('modern', 'minimal'), 'modern');
});

test('AXE-344: cvHasSeedableProfileContent détecte profil onboarding', () => {
  assert.equal(cvHasSeedableProfileContent({}), false);
  assert.equal(cvHasSeedableProfileContent({ prenom: 'Léa', nom: 'Martin' }), true);
  assert.equal(cvHasSeedableProfileContent({
    experiences: [{ poste: 'Dev', entreprise: 'Co', bullet_points: [] }],
  }), true);
  assert.equal(cvHasSeedableProfileContent({
    experiences: [{ poste: '', entreprise: '', bullet_points: [''] }],
  }), false);
});

test('AXE-344: structural import ne persiste pas template_id imported', () => {
  const structural = {
    version: 3,
    format: 'A4',
    grid: 'free',
    unit: 'mm',
    theme: { template_id: 'imported' },
    pages: [{
      id: 'p1',
      blocks: [
        { id: 't1', type: 'text', content: 'Hello', x: 10, y: 10, w: 80, h: 12, z: 1, style: {} },
      ],
    }],
  };
  const result = buildStructuralImportLayout(DENSE_CV, structural, { templateId: 'imported' });
  assert.notEqual(result.recommendedTemplateId, 'imported');
  assert.equal(result.layout.theme?.template_id, result.recommendedTemplateId);
  assert.ok(result.contentBlockCount >= 1);
});
