/**
 * Champ editable inline sur le canvas (P4.1).
 */
export default function CanvasEditableField({
  path,
  tag: Tag = 'span',
  className = '',
  editing = false,
  children,
}) {
  if (!editing) {
    return <Tag className={className}>{children}</Tag>;
  }
  return (
    <Tag
      className={`canvas-editable-field ${className}`.trim()}
      contentEditable
      suppressContentEditableWarning
      data-cv-field={path}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Tag>
  );
}
