import {
  HiBars3BottomLeft,
  HiDocumentText,
  HiMinus,
  HiPhone,
  HiSquare2Stack,
} from 'react-icons/hi2';
import { INSERT_TOOLBAR_ITEMS } from '../../lib/freeCanvasBlockPresets.js';
import '../../styles/EditorInsertToolbar.css';

const ICON_BY_TYPE = {
  text: HiDocumentText,
  title: HiBars3BottomLeft,
  'shape:line': HiMinus,
  'shape:rect': HiSquare2Stack,
  icon: HiPhone,
};

/**
 * Barre d insertion de blocs (P3.5) — visible en mode canvas libre.
 */
export default function EditorInsertToolbar({ onInsert, disabled = false }) {
  return (
    <div className="editor-insert-toolbar" role="toolbar" aria-label="Insérer un bloc">
      <span className="editor-insert-toolbar-label">Insérer</span>
      <div className="editor-insert-toolbar-actions">
        {INSERT_TOOLBAR_ITEMS.map((item) => {
          const Icon = ICON_BY_TYPE[item.type];
          return (
            <button
              key={item.type}
              type="button"
              className="editor-insert-toolbar-btn"
              disabled={disabled}
              title={item.description}
              onClick={() => {
                if (!disabled && typeof onInsert === 'function') onInsert(item.type);
              }}
            >
              {Icon ? <Icon size={16} aria-hidden /> : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
