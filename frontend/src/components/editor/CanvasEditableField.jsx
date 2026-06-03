import { useEffect, useRef } from 'react';
import { fieldValueLooksLikeHtml } from '../../lib/canvasInlineEdit.js';

/**
 * Champ editable inline sur le canvas (P4.1).
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

  useEffect(() => {
    if (!editing || !ref.current) return;
    if (fieldValueLooksLikeHtml(text)) {
      ref.current.innerHTML = text;
    }
  }, [editing, text]);

  if (!editing) {
    if (!text) return <Tag className={className}> </Tag>;
    if (fieldValueLooksLikeHtml(text)) {
      return <Tag className={className} dangerouslySetInnerHTML={{ __html: text }} />;
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
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {fieldValueLooksLikeHtml(text) ? null : text}
    </Tag>
  );
}
