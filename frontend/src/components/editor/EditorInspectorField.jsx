import { useEffect, useId, useState } from 'react';

import { sanitizeTemplateOptionValue } from '../../lib/templateOptionsSchema.js';

/**
 * Champ generique pour le drawer inspecteur.
 *
 * Branche sur `field.type` :
 *   - 'color'   -> color picker natif + input hex synchronise
 *   - 'select'  -> select natif (choices declares par le template)
 *   - 'boolean' -> toggle accessible (checkbox stylisee)
 *
 * Toute valeur saisie par l utilisateur passe par
 * `sanitizeTemplateOptionValue` avant d etre remontee : si la valeur est
 * invalide (color non hex, select hors choices), on conserve l ancienne
 * valeur et on ne notifie pas le parent.
 *
 * Pas de side effects globaux : aucun acces a localStorage / fetch ici,
 * uniquement de l etat React local. Cela permet de tester le composant
 * isolement (et de le reutiliser pour d autres panneaux ulterieurement).
 */
export default function EditorInspectorField({ field, value, onChange }) {
  if (!field || typeof field !== 'object') return null;

  const label = field.label || field.key;

  if (field.type === 'color') {
    return <ColorField field={field} label={label} value={value} onChange={onChange} />;
  }
  if (field.type === 'select') {
    return <SelectField field={field} label={label} value={value} onChange={onChange} />;
  }
  if (field.type === 'boolean') {
    return <BooleanField field={field} label={label} value={value} onChange={onChange} />;
  }
  return null;
}

/**
 * Renvoie une valeur consideree comme "raisonnable" pour l input controle.
 * Si la valeur courante est invalide (vide, malformee), on retombe sur le
 * defaut declare par le template plutot que d afficher un champ vide.
 */
function pickDisplayValue(field, value) {
  if (value === undefined || value === null) return field.default;
  return value;
}

function ColorField({ field, label, value, onChange }) {
  const reactId = useId();
  const displayed = pickDisplayValue(field, value);
  const initialHex = typeof displayed === 'string' && displayed.startsWith('#') ? displayed : '#000000';

  // On garde un texte local pour permettre la saisie progressive ("#1" puis
  // "#12"...). On ne notifie le parent que lorsque la chaine est un hex valide.
  const [hexText, setHexText] = useState(initialHex);

  useEffect(() => {
    setHexText(initialHex);
  }, [initialHex]);

  const handleColorPickerChange = (event) => {
    const next = sanitizeTemplateOptionValue(field, event.target.value);
    if (next !== undefined) {
      setHexText(next);
      onChange(next);
    }
  };

  const handleHexInputChange = (event) => {
    const text = event.target.value;
    setHexText(text);
    const next = sanitizeTemplateOptionValue(field, text);
    if (next !== undefined) {
      onChange(next);
    }
  };

  return (
    <label className="editor-inspector-field editor-inspector-field--color" htmlFor={`${reactId}-color`}>
      <span className="editor-inspector-field-label">{label}</span>
      <span className="editor-inspector-field-control">
        <input
          id={`${reactId}-color`}
          type="color"
          value={initialHex}
          onChange={handleColorPickerChange}
          aria-label={`${label} (selecteur de couleur)`}
          className="editor-inspector-color-picker"
        />
        <input
          id={`${reactId}-hex`}
          type="text"
          value={hexText}
          onChange={handleHexInputChange}
          spellCheck={false}
          maxLength={9}
          aria-label={`${label} (valeur hexadecimale)`}
          className="editor-inspector-color-hex"
        />
      </span>
    </label>
  );
}

function SelectField({ field, label, value, onChange }) {
  const reactId = useId();
  const displayed = pickDisplayValue(field, value);
  const choices = Array.isArray(field.choices) ? field.choices : [];

  const handleChange = (event) => {
    const next = sanitizeTemplateOptionValue(field, event.target.value);
    if (next !== undefined) onChange(next);
  };

  return (
    <label className="editor-inspector-field editor-inspector-field--select" htmlFor={reactId}>
      <span className="editor-inspector-field-label">{label}</span>
      <select
        id={reactId}
        value={displayed}
        onChange={handleChange}
        className="editor-inspector-select"
      >
        {choices.map((choice) => (
          <option key={choice} value={choice}>{choice}</option>
        ))}
      </select>
    </label>
  );
}

function BooleanField({ field, label, value, onChange }) {
  const reactId = useId();
  const checked = Boolean(pickDisplayValue(field, value));

  const handleChange = (event) => {
    const next = sanitizeTemplateOptionValue(field, event.target.checked);
    if (next !== undefined) onChange(next);
  };

  return (
    <label className="editor-inspector-field editor-inspector-field--boolean" htmlFor={reactId}>
      <span className="editor-inspector-field-label">{label}</span>
      <span className="editor-inspector-field-control">
        <input
          id={reactId}
          type="checkbox"
          checked={checked}
          onChange={handleChange}
          className="editor-inspector-checkbox"
        />
        <span className="editor-inspector-toggle" aria-hidden="true" />
      </span>
    </label>
  );
}
