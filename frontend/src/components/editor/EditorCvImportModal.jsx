import { useRef } from 'react';

import '../../styles/EditorCvImportModal.css';

export default function EditorCvImportModal({
  open,
  onClose,
  onImportFile,
  loading = false,
  error = '',
}) {
  const fileRef = useRef(null);

  if (!open) return null;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="editor-cv-import-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="editor-cv-import-title">
      <div className="editor-cv-import-modal" onClick={(e) => e.stopPropagation()}>
        <header className="editor-cv-import-head">
          <div>
            <span className="editor-cv-import-eyebrow">Import</span>
            <h2 id="editor-cv-import-title">Importer un CV</h2>
            <p>
              PDF ou Word : on reconstruit ton CV sur le canvas.
              Les PDF photo (sans texte) ne marchent pas — utilise un PDF texte ou un fichier Word.
            </p>
          </div>
          <button type="button" className="editor-cv-import-close" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="editor-cv-import-pane">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
            <span>PDF texte ou Word — pas de PDF photo</span>
          </button>
        </div>

        {error && <p className="editor-cv-import-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
