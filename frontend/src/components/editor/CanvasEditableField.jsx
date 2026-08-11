import { useEffect, useRef } from 'react';
import {
  fieldValueLooksLikeHtml,
  handleRichTextPaste,
  normalizeRichTextHtml,
  sanitizeRichTextHtml,
} from '../../lib/canvasInlineEdit.js';

/**
 * Champ editable inline sur le canvas (P4.1).
 * AXE-40 : HTML whitelisté + collage propre.
 */
export default function CanvasEditableField({
  path,
  tag = 'span',
  className = '',
  editing = false,
  children,
}) {
  const Tag = tag;
  const ref = useRef(null);
  const text = typeof children === 'string' ? children : String(children ?? '');
  const richText = sanitizeRichTextHtml(normalizeRichTextHtml(text));

  useEffect(() => {
    if (!editing || !ref.current) return;
    if (fieldValueLooksLikeHtml(richText)) {
      ref.current.innerHTML = richText;
    }
  }, [editing, richText]);

  if (!editing) {
    if (!text) return <Tag className={className}> </Tag>;
    if (fieldValueLooksLikeHtml(richText)) {
      return <Tag className={className} dangerouslySetInnerHTML={{ __html: richText }} />;
    }
    return <Tag className={className}>{text}</Tag>;
  }

  return (
    <Tag
      ref={ref}
      className={`canvas-editable-field ${className}`.trim()}
      contentEditable
      suppressContentEditableWarning
      data-cv-field={path}
      onPaste={handleRichTextPaste}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {fieldValueLooksLikeHtml(richText) ? null : text}
    </Tag>
  );
}
