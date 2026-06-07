import { useRef, useState } from 'react';

import '../../styles/EditorCvImportModal.css';

export default function EditorCvImportModal({
  open,
  onClose,
  onImportFile,
  onImportText,
  loading = false,
  error = '',
}) {
  const [tab, setTab] = useState('file');
  const [text, setText] = useState('');
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleTextSubmit = () => {
    const trimmed = text.trim();
    if (trimmed) onImportText(trimmed);
  };

  return (
    <div className="editor-cv-import-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="editor-cv-import-title">
      <div className="editor-cv-import-modal" onClick={(e) => e.stopPropagation()}>
        <header className="editor-cv-import-head">
          <div>
            <span className="editor-cv-import-eyebrow">Import intelligent</span>
            <h2 id="editor-cv-import-title">Importer un CV</h2>
            <p>
              PDF : on recopie directement la mise en page (texte, couleurs, formes,
              photo) en blocs éditables. Aucune perte de design quand le PDF est natif.
            </p>
          </div>
          <button type="button" className="editor-cv-import-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="editor-cv-import-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'file'}
            className={tab === 'file' ? 'is-active' : ''}
            onClick={() => setTab('file')}
          >
            Fichier PDF / Word
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'text'}
            className={tab === 'text' ? 'is-active' : ''}
            onClick={() => setTab('text')}
          >
            Coller le texte
          </button>
        </div>

        {tab === 'file' ? (
          <div className="editor-cv-import-pane">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="editor-cv-import-file-input"
              onChange={handleFileChange}
              disabled={loading}
            />
            <button
              type="button"
              className="editor-cv-import-dropzone"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <strong>Choisir un fichier</strong>
              <span>PDF, DOC ou DOCX — extraction + adaptation canvas en quelques secondes</span>
            </button>
          </div>
        ) : (
          <div className="editor-cv-import-pane">
            <textarea
              className="editor-cv-import-textarea"
              rows={10}
              placeholder="Colle ici le contenu brut de ton CV (LinkedIn export, Word, etc.)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="editor-cv-import-submit"
              onClick={handleTextSubmit}
              disabled={loading || !text.trim()}
            >
              Analyser et générer le canvas
            </button>
          </div>
        )}

        {error && <p className="editor-cv-import-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
