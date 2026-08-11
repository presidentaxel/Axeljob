import { TEMPLATE_PREVIEW_META } from '../../lib/templatePreviewMeta.js';
import '../../styles/TemplateMiniPreview.css';

/** Vignette fidèle à la structure du template (sidebar, header, etc.). */
export default function TemplateMiniPreview({ templateId }) {
  const t = TEMPLATE_PREVIEW_META[templateId] || TEMPLATE_PREVIEW_META.classic;

  if (t.layout === 'left-sidebar') {
    return (
      <div className="tpl-mini">
        <div className="tpl-mini__cols tpl-mini__cols--full">
          <div className="tpl-mini__side" style={{ background: t.sidebar }} />
          <div className="tpl-mini__main">
            <div className="tpl-mini__ln tpl-mini__ln--accent" style={{ background: t.accent }} />
            <div className="tpl-mini__ln" />
            <div className="tpl-mini__ln tpl-mini__ln--short" />
          </div>
        </div>
      </div>
    );
  }

  if (t.layout === 'right-sidebar') {
    return (
      <div className="tpl-mini">
        <div className="tpl-mini__hdr" style={{ background: t.bg }} />
        <div className="tpl-mini__cols">
          <div className="tpl-mini__main">
            <div className="tpl-mini__ln tpl-mini__ln--accent" style={{ background: t.accent }} />
            <div className="tpl-mini__ln" />
            <div className="tpl-mini__ln tpl-mini__ln--short" />
          </div>
          <div className="tpl-mini__side" style={{ background: t.sidebar }} />
        </div>
      </div>
    );
  }

  if (t.layout === 'single-centered') {
    return (
      <div className="tpl-mini tpl-mini--centered">
        <div className="tpl-mini__main">
          <div className="tpl-mini__ln tpl-mini__ln--accent tpl-mini__ln--center" style={{ background: t.accent }} />
          <div className="tpl-mini__ln tpl-mini__ln--center" />
          <div className="tpl-mini__ln tpl-mini__ln--center tpl-mini__ln--short" />
        </div>
      </div>
    );
  }

  return (
    <div className="tpl-mini tpl-mini--single">
      <div className="tpl-mini__rule" style={{ background: t.accent }} />
      <div className="tpl-mini__main">
        <div className="tpl-mini__ln tpl-mini__ln--accent" style={{ background: t.accent }} />
        <div className="tpl-mini__ln" />
        <div className="tpl-mini__ln tpl-mini__ln--short" />
      </div>
    </div>
  );
}
