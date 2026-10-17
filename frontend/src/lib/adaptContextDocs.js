export const ADAPT_CONTEXT_MAX_FILES = 3;
export const ADAPT_CONTEXT_MAX_BYTES = 8 * 1024 * 1024;

export function adaptContextFileError(file, existingCount = 0) {
  const name = String(file?.name || '').toLowerCase();
  if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
    return 'Formats acceptés : PDF ou DOCX.';
  }
  if (Number(file?.size) > ADAPT_CONTEXT_MAX_BYTES) {
    return '8 Mo maximum par document.';
  }
  if (existingCount >= ADAPT_CONTEXT_MAX_FILES) {
    return '3 documents maximum.';
  }
  return '';
}
