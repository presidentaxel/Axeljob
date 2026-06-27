/**
 * Préférences et données locales gérées depuis Paramètres.
 */

import {
  CANVAS_EDIT_HINT_DISMISSED_KEY,
  SEMANTIC_EDIT_NOTE_DISMISSED_KEY,
} from './canvasEditorUtils.js';

const DRAFTS_KEY = 'cv_canvas_layout_drafts_v1';
const DRAFT_PREFS_KEY = 'cv_canvas_layout_draft_prefs_v1';
const DRAFT_CONTEXT_KEY = 'cv_canvas_layout_active_context_v1';
const PROPOSALS_KEY = 'cv_layout_proposals_v1';
const IMAGES_KEY = 'cv_canvas_user_images_v1';
const IMAGES_REMOVED_KEY = 'cv_canvas_user_images_removed_v1';

export function resetGuidedTours(userId) {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cv_bot_tour_done')) toRemove.push(key);
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
    if (userId) {
      localStorage.removeItem(`cv_bot_tour_done_main_phase1_${userId}`);
      localStorage.removeItem(`cv_bot_tour_done_main_phase2_${userId}`);
    }
    return true;
  } catch {
    return false;
  }
}

export function resetEditorHints() {
  try {
    localStorage.removeItem(CANVAS_EDIT_HINT_DISMISSED_KEY);
    localStorage.removeItem(SEMANTIC_EDIT_NOTE_DISMISSED_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearCanvasLayoutDrafts() {
  try {
    localStorage.removeItem(DRAFTS_KEY);
    localStorage.removeItem(DRAFT_PREFS_KEY);
    localStorage.removeItem(DRAFT_CONTEXT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearLayoutProposals() {
  try {
    localStorage.removeItem(PROPOSALS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearUserCanvasImageLibrary() {
  try {
    localStorage.removeItem(IMAGES_KEY);
    localStorage.removeItem(IMAGES_REMOVED_KEY);
    return true;
  } catch {
    return false;
  }
}

export function getLocalDataSummary() {
  let draftCount = 0;
  let proposalCount = 0;
  let imageCount = 0;
  try {
    const drafts = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '{}');
    draftCount = Object.keys(drafts || {}).length;
  } catch { /* ignore */ }
  try {
    const proposals = JSON.parse(localStorage.getItem(PROPOSALS_KEY) || '[]');
    proposalCount = Array.isArray(proposals) ? proposals.length : 0;
  } catch { /* ignore */ }
  try {
    const images = JSON.parse(localStorage.getItem(IMAGES_KEY) || '[]');
    imageCount = Array.isArray(images) ? images.length : 0;
  } catch { /* ignore */ }
  return { draftCount, proposalCount, imageCount };
}
