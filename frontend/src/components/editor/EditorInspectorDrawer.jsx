import { useCallback, useMemo, useState } from 'react';

import {
  applyTemplateOptionsDefaults,
  groupTemplateOptions,
  resetTemplateOptionsToDefaults,
} from '../../lib/templateOptionsSchema.js';

import EditorContentPanel from './EditorContentPanel.jsx';
import EditorInspectorField from './EditorInspectorField.jsx';
import EditorLayoutMiniMap from './EditorLayoutMiniMap.jsx';

const TABS = [
  { id: 'style', label: 'Style' },
  { id: 'layout', label: 'Mise en page' },
  { id: 'content', label: 'Contenu' },
];

/**
 * Drawer lateral d edition fine des options du template (couleurs, polices,
 * affichage). Affiche en panneau side-by-side (le canvas se reduit) plutot
 * qu en overlay pour permettre la previsualisation en temps reel.
 *
 * Lit le schema des options dans `template.options` (declare dans
 * `templates/<id>/meta.json`) et notifie le parent via
 * `onTemplateOptionsChange` a chaque modification valide.
 *
 * Hors React, toute la logique de schema/sanitisation vit dans
 * `lib/templateOptionsSchema.js` (teste unitairement). Ici, on ne fait
 * que coller les valeurs ensemble et rendre les controls.
 *
 * Pourquoi un drawer side-by-side plutot qu un modal ?
 *   - le user voit l effet du changement en temps reel sur le CV
 *   - aucun appel reseau n est declenche par les changements d options
 *     (ils transitent uniquement via templateOptions -> CvEditablePreview)
 *   - le score ATS sera recalcule a la prochaine sauvegarde (cf. P1.x)
 */
export default function EditorInspectorDrawer({
  open,
  template,
  templateOptions,
  onTemplateOptionsChange,
  onClose,
  cv,
  onCvChange,
  layout,
  onLayoutChange,
}) {
  const [activeTab, setActiveTab] = useState('style');

  /** Valeurs effectivement passees aux champs (defauts + custom user). */
  const effectiveOptions = useMemo(
    () => applyTemplateOptionsDefaults(template, templateOptions),
    [template, templateOptions],
  );

  const groups = useMemo(() => groupTemplateOptions(template), [template]);

  const handleFieldChange = useCallback((field, nextValue) => {
    if (typeof onTemplateOptionsChange !== 'function') return;
    onTemplateOptionsChange({ ...effectiveOptions, [field.key]: nextValue });
  }, [effectiveOptions, onTemplateOptionsChange]);

  const handleReset = useCallback(() => {
    if (typeof onTemplateOptionsChange !== 'function') return;
    onTemplateOptionsChange(resetTemplateOptionsToDefaults(template));
  }, [template, onTemplateOptionsChange]);

  if (!open) return null;

  const templateLabel = template?.name || 'Template';
  const hasGroups = groups.length > 0;

  return (
    <aside
      className="editor-inspector-drawer"
      role="complementary"
      aria-label="Inspecteur de style du CV"
    >
      <header className="editor-inspector-drawer-header">
        <div className="editor-inspector-drawer-title">
          <span className="editor-inspector-drawer-kicker">Inspecteur</span>
          <strong>{templateLabel}</strong>
        </div>
        <button
          type="button"
          className="editor-inspector-drawer-close"
          onClick={onClose}
          aria-label="Fermer l’inspecteur"
        >
          ×
        </button>
      </header>

      <nav className="editor-inspector-tabs" role="tablist" aria-label="Sections de l’inspecteur">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`inspector-tab-${tab.id}`}
            className={
              activeTab === tab.id
                ? 'editor-inspector-tab editor-inspector-tab--active'
                : 'editor-inspector-tab'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        className="editor-inspector-drawer-body"
        id={`inspector-tab-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'style' && (
          <>
            {!hasGroups && (
              <p className="editor-inspector-drawer-empty">
                Ce template n’expose pas d’options de personnalisation.
              </p>
            )}
            {groups.map((group) => (
              <section
                key={group.id}
                className="editor-inspector-group"
                aria-labelledby={`inspector-group-${group.id}`}
              >
                <h3
                  id={`inspector-group-${group.id}`}
                  className="editor-inspector-group-title"
                >
                  {group.label}
                </h3>
                <div className="editor-inspector-group-fields">
                  {group.fields.map((field) => (
                    <EditorInspectorField
                      key={field.key}
                      field={field}
                      value={effectiveOptions[field.key]}
                      onChange={(next) => handleFieldChange(field, next)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
        {activeTab === 'layout' && (
          <EditorLayoutMiniMap layout={layout} onLayoutChange={onLayoutChange} />
        )}
        {activeTab === 'content' && (
          <EditorContentPanel cv={cv} onCvChange={onCvChange} />
        )}
      </div>

      {activeTab === 'style' && (
        <footer className="editor-inspector-drawer-footer">
          <button
            type="button"
            className="editor-inspector-reset"
            onClick={handleReset}
            disabled={!hasGroups}
          >
            Réinitialiser aux valeurs par défaut
          </button>
        </footer>
      )}
    </aside>
  );
}
