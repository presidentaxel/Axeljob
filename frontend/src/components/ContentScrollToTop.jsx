import { scrollToTopSmooth } from '../lib/scrollToTopSmooth';
import './ContentScrollToTop.css';

export default function ContentScrollToTop() {
  return (
    <button
      type="button"
      className="content-scroll-top"
      aria-label="Retour en haut de la page"
      onClick={() => scrollToTopSmooth()}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
