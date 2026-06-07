/**
 * Propositions de layout nommées (P4.3) - localStorage en attendant user_layouts API.
 */

const STORAGE_KEY = 'cv_layout_proposals_v1';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listLayoutProposals() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function saveLayoutProposal(name, layout) {
  const trimmed = (name || '').trim() || 'mon modèle';
  if (!layout) return null;
  const id = `prop_${Date.now()}`;
  const entry = {
    id,
    name: trimmed,
    layout,
    updatedAt: Date.now(),
  };
  const all = readAll();
  all.unshift(entry);
  writeAll(all.slice(0, 20));
  return entry;
}

export function deleteLayoutProposal(id) {
  writeAll(readAll().filter((p) => p.id !== id));
}
