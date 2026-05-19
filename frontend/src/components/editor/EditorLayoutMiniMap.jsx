import { useCallback, useState } from 'react';
import { HiArrowLongLeft, HiArrowLongRight, HiArrowPath } from 'react-icons/hi2';

import {
  CANONICAL_ZONE_KEYS,
  SIDEBAR_RATIO_MAX,
  SIDEBAR_RATIO_MIN,
  isDefaultLayoutV2,
  moveSectionToZone,
  resetLayoutV2,
  sanitizeLayoutV2,
  setSidebarRatioV2,
  setSidebarSide,
  setZoneEnabled,
} from '../../lib/cvLayoutModelV2.js';

/**
 * Onglet « Mise en page » -- mini-carte visuelle du CV.
 *
 * UX cible :
 *   - L user voit une representation reduite des zones de son CV
 *     (header / colonne principale / sidebar).
 *   - Il peut DESACTIVER une zone (sauf main, invariant). Les sections
 *     qui s y trouvaient sont migrees vers main automatiquement.
 *   - Il peut GLISSER les sections entre zones via drag-and-drop natif.
 *   - Il peut choisir le COTE de la sidebar (gauche / droite).
 *   - Il peut ajuster le RATIO largeur de la sidebar (20..50 %).
 *
 * Le composant est purement controle (state remonte vers `CvEditorBeta`
 * via `onLayoutChange`). Aucune mutation interne du layout.
 *
 * Le rendu effectif des zones sur le canvas (sidebar on/off, position
 * gauche/droite, sections deplacees inter-zones) est P2.4c -- ce
 * composant produit deja l intention complete via le modele v2.
 */

const ZONE_LABELS = {
  header: 'En-tête',
  main: 'Colonne principale',
  sidebar: 'Sidebar',
};

/** Libelle court par section (sans depopendre du modele v1). */
const SECTION_LABELS = {
  identity: 'Identité (photo, nom, contact)',
  resume: 'Résumé',
  experiences: 'Expérience pro',
  formations: 'Formation',
  projets: 'Projets',
  competences: 'Compétences',
  certifications: 'Certifications',
};

function sectionLabel(key) {
  return SECTION_LABELS[key] || key;
}

export default function EditorLayoutMiniMap({ layout, onLayoutChange }) {
  /**
   * Etat local du drag :
   *  - `section` : cle de section en cours de drag
   *  - `fromZone` : zone d origine
   *  - `overZone` : zone survolee (peut etre la meme)
   *  - `overIndex` : index a l interieur de la zone survolee
   *    (null = drop sur le conteneur de la zone -> append).
   */
  const [drag, setDrag] = useState(null);

  const safe = sanitizeLayoutV2(layout);
  const update = useCallback((nextLayout) => {
    if (typeof onLayoutChange === 'function') onLayoutChange(nextLayout);
  }, [onLayoutChange]);

  /** -------- Toggle zones -------- */
  const handleToggleZone = useCallback((zoneKey, enabled) => {
    update(setZoneEnabled(safe, zoneKey, enabled));
  }, [safe, update]);

  /** -------- Sidebar side + ratio -------- */
  const handleSidebarSide = useCallback((side) => {
    update(setSidebarSide(safe, side));
  }, [safe, update]);

  const handleSidebarRatio = useCallback((event) => {
    const raw = Number(event?.target?.value);
    update(setSidebarRatioV2(safe, raw));
  }, [safe, update]);

  /** -------- Reset -------- */
  const handleReset = useCallback(() => {
    update(resetLayoutV2());
  }, [update]);

  /** -------- Drag & drop -------- */
  const handleSectionDragStart = useCallback((sectionKey, fromZone, event) => {
    setDrag({ section: sectionKey, fromZone, overZone: fromZone, overIndex: null });
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', `cv-section:${sectionKey}`); } catch (_) { /* ignore */ }
    }
  }, []);

  const handleSectionDragOver = useCallback((targetZone, targetIndex, event) => {
    if (!drag) return;
    event.preventDefault();
    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDrag((prev) => (prev && (prev.overZone !== targetZone || prev.overIndex !== targetIndex)
      ? { ...prev, overZone: targetZone, overIndex: targetIndex }
      : prev));
  }, [drag]);

  const handleZoneDragOver = useCallback((zoneKey, event) => {
    if (!drag) return;
    event.preventDefault();
    if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDrag((prev) => (prev && (prev.overZone !== zoneKey || prev.overIndex !== null)
      ? { ...prev, overZone: zoneKey, overIndex: null }
      : prev));
  }, [drag]);

  const handleDrop = useCallback((event) => {
    event.preventDefault();
    if (!drag) return;
    const { section, fromZone, overZone, overIndex } = drag;
    setDrag(null);
    if (!section || !overZone) return;

    let target = overIndex;
    // Drop sur une section voisine : computeReorderTargetIndex-like.
    // Si on drag d index X vers index Y dans la meme zone, il faut
    // remapper l index cible apres le retrait (sinon on tombe d un cran
    // trop loin). On ne le fait que dans la meme zone.
    if (Number.isInteger(target) && fromZone === overZone) {
      const fromIndex = safe.zones[fromZone].sections.indexOf(section);
      if (fromIndex >= 0 && fromIndex < target) target = Math.max(0, target - 1);
    }
    update(moveSectionToZone(safe, section, overZone, Number.isInteger(target) ? target : undefined));
  }, [drag, safe, update]);

  const handleDragEnd = useCallback(() => setDrag(null), []);

  /** Helpers UI ----------------------------------------------------- */
  const isDefault = isDefaultLayoutV2(safe);

  const renderZone = (zoneKey) => {
    const zone = safe.zones[zoneKey];
    const enabled = zone.enabled;
    const isMain = zoneKey === 'main';
    const dragOverZone = drag && drag.overZone === zoneKey;
    const dropTargetEmpty = dragOverZone && drag.overIndex === null && zone.sections.length === 0;

    return (
      <div
        key={zoneKey}
        className={[
          'editor-minimap-zone',
          `editor-minimap-zone--${zoneKey}`,
          enabled ? '' : 'editor-minimap-zone--disabled',
          dragOverZone ? 'editor-minimap-zone--drag-over' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={(e) => enabled ? handleZoneDragOver(zoneKey, e) : null}
        onDrop={(e) => enabled ? handleDrop(e) : null}
      >
        <header className="editor-minimap-zone-header">
          <span className="editor-minimap-zone-title">{ZONE_LABELS[zoneKey]}</span>
          {!isMain && (
            <label className="editor-minimap-zone-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => handleToggleZone(zoneKey, e.target.checked)}
                aria-label={`Activer la zone ${ZONE_LABELS[zoneKey]}`}
              />
              <span aria-hidden="true">{enabled ? 'Activée' : 'Désactivée'}</span>
            </label>
          )}
        </header>

        {enabled ? (
          <ul className="editor-minimap-zone-sections" role="list">
            {zone.sections.length === 0 && (
              <li className={`editor-minimap-empty ${dropTargetEmpty ? 'editor-minimap-empty--drop' : ''}`}>
                {dropTargetEmpty ? 'Déposer ici' : 'Aucune section'}
              </li>
            )}
            {zone.sections.map((sectionKey, idx) => {
              const isDragging = drag?.section === sectionKey;
              const isOver = dragOverZone && drag.overIndex === idx && drag.section !== sectionKey;
              return (
                <li
                  key={sectionKey}
                  className={[
                    'editor-minimap-section',
                    isDragging ? 'editor-minimap-section--dragging' : '',
                    isOver ? 'editor-minimap-section--over' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={(e) => handleSectionDragStart(sectionKey, zoneKey, e)}
                  onDragOver={(e) => handleSectionDragOver(zoneKey, idx, e)}
                  onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                  onDragEnd={handleDragEnd}
                  title="Glisser pour déplacer dans une autre zone"
                >
                  <span className="editor-minimap-section-handle" aria-hidden="true">⋮⋮</span>
                  <span className="editor-minimap-section-label">{sectionLabel(sectionKey)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="editor-minimap-zone-disabled-hint">
            Les sections de cette zone ont été déplacées dans la colonne principale.
          </p>
        )}
      </div>
    );
  };

  /** Layout des deux colonnes (main + sidebar) cote a cote. L ordre
   *  d affichage suit `sidebarSide` : sidebar a gauche -> sidebar puis main. */
  const renderMainAndSidebar = () => {
    const mainEl = renderZone('main');
    const sidebarEl = safe.zones.sidebar.enabled ? renderZone('sidebar') : null;
    if (!sidebarEl) return mainEl;
    return safe.sidebarSide === 'left'
      ? <div className="editor-minimap-row">{sidebarEl}{mainEl}</div>
      : <div className="editor-minimap-row">{mainEl}{sidebarEl}</div>;
  };

  return (
    <div className="editor-minimap" aria-label="Mini-carte de la mise en page du CV">
      <p className="editor-minimap-help">
        Faites glisser les sections entre les zones pour réorganiser votre CV.
        Désactivez une zone pour la masquer ; ses sections rejoindront la colonne principale.
      </p>

      {renderZone('header')}
      {renderMainAndSidebar()}

      {safe.zones.sidebar.enabled && (
        <div className="editor-minimap-sidebar-controls">
          <fieldset className="editor-minimap-side-fieldset">
            <legend>Position de la sidebar</legend>
            <div className="editor-minimap-side-buttons">
              <button
                type="button"
                className={`editor-minimap-side-btn ${safe.sidebarSide === 'left' ? 'is-active' : ''}`}
                onClick={() => handleSidebarSide('left')}
                aria-pressed={safe.sidebarSide === 'left'}
              >
                <HiArrowLongLeft size={14} aria-hidden /> Gauche
              </button>
              <button
                type="button"
                className={`editor-minimap-side-btn ${safe.sidebarSide === 'right' ? 'is-active' : ''}`}
                onClick={() => handleSidebarSide('right')}
                aria-pressed={safe.sidebarSide === 'right'}
              >
                Droite <HiArrowLongRight size={14} aria-hidden />
              </button>
            </div>
          </fieldset>

          <label className="editor-minimap-ratio">
            <span>Largeur sidebar : {safe.sidebarRatio} %</span>
            <input
              type="range"
              min={SIDEBAR_RATIO_MIN}
              max={SIDEBAR_RATIO_MAX}
              step={1}
              value={safe.sidebarRatio}
              onChange={handleSidebarRatio}
              aria-label="Largeur de la sidebar en pourcentage"
            />
          </label>
        </div>
      )}

      <button
        type="button"
        className="editor-minimap-reset"
        onClick={handleReset}
        disabled={isDefault}
        title={isDefault ? 'Déjà à la disposition par défaut' : 'Réinitialiser la disposition par défaut'}
      >
        <HiArrowPath size={13} aria-hidden /> Réinitialiser la disposition
      </button>
    </div>
  );
}

/**
 * Les zones canoniques ne sont pas exposees au composant pere : on
 * ferme volontairement la liste pour eviter qu un appelant utilise un
 * `zoneKey` non gere par le rendu (ex. 'footer' un jour).
 *
 * Si besoin de tester un zoneKey ailleurs, importer `CANONICAL_ZONE_KEYS`
 * depuis `cvLayoutModelV2.js`.
 */
export { CANONICAL_ZONE_KEYS };
