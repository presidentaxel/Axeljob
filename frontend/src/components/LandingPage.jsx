import { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from '../constants';
import './LandingPage.css';

/** Liens articles / guides (menu mobile + cohérence avec le footer) */
const ARTICLE_NAV_LINKS = [
  { to: '/ats', label: "Qu'est-ce que l'ATS ?" },
  { to: '/faq', label: 'FAQ' },
  { to: '/modeles-cv', label: 'Modèles de CV' },
  { to: '/guide-cv', label: 'Guide CV' },
  { to: '/erreurs-cv', label: 'Erreurs à éviter' },
  { to: '/cv-par-metier', label: 'CV par métier' },
  { to: '/cv-adapte-chaque-offre', label: 'CV adapté à chaque offre' },
];

const STEPS = [
  {
    title: 'Importe ton profil',
    desc: 'LinkedIn, import de CV ou saisie manuelle : ton profil en quelques clics.',
    icon: 'profile',
  },
  {
    title: "Colle l'annonce visée",
    desc: "Copie le texte de l'offre d'emploi dans l'outil.",
    icon: 'paste',
  },
  {
    title: "Laisse l'IA faire la magie",
    desc: 'Adaptation instantanée et suivi de tes candidatures.',
    icon: 'sparkles',
  },
];

const FEATURES = [
  { title: 'Générateur de CV IA', desc: 'Adaptation aux mots-clés de chaque annonce (ATS-friendly).' },
  { title: 'Suivi de candidatures', desc: 'Statuts, entretiens, refus - tout centralisé au même endroit.' },
  { title: 'Export PDF ultra-propre', desc: 'CV et lettre de motivation prêts à envoyer.' },
];

const BENEFITS = [
  { title: 'Score ATS optimisé', desc: 'Chaque CV est analysé et adapté pour maximiser son passage dans les filtres automatiques des recruteurs (voir Qu’est-ce que l’ATS ?).', linkToAts: true },
  { title: 'Gain de temps massif', desc: "Plus besoin de réécrire manuellement chaque candidature. L'IA adapte en quelques secondes." },
  { title: 'Suivi centralisé', desc: 'Toutes tes candidatures au même endroit : statuts, entretiens, relances et exports.' },
];

const FREE_FEATURES = [
  '3 adaptations de CV',
  'Import PDF  / LinkedIn',
  'Suivi de candidatures',
  'Export PDF',
];

const PRO_FEATURES = [
  'Adaptations illimitées',
  'Import PDF  / LinkedIn',
  'Suivi de candidatures illimité',
  'Export PDF & dossier complet',
  'Lettre de motivation IA',
  'Support prioritaire',
];

function BurgerIcon({ open }) {
  return (
    <svg className="landing-burger-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden>
      {open ? (
        <>
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </>
      ) : (
        <>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </>
      )}
    </svg>
  );
}

export default function LandingPage({ onCtaClick, onProClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerId = useId();
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setMenuOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-header-inner">
            <img src="/favicon.svg" alt="AxeL Job" className="landing-logo" />
            <span className="landing-brand">AxeL Job</span>
            <nav className="landing-nav" aria-label="Navigation principale">
              <a href="#comment">Comment ça marche</a>
              <a href="#tarifs">Tarifs</a>
              <a href="#features">Fonctionnalités</a>
              <Link to="/ats">Qu&apos;est-ce que l&apos;ATS ?</Link>
              <Link to="/faq">FAQ</Link>
              <Link to="/modeles-cv">Modèles CV</Link>
              <Link to="/guide-cv">Guide CV</Link>
              <button type="button" className="btn btn-primary landing-cta-nav" onClick={onCtaClick}>
                Essayer gratuitement
              </button>
            </nav>
            <div className="landing-header-mobile-actions">
              <button
                type="button"
                className="landing-burger"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-controls={drawerId}
                aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              >
                <BurgerIcon open={menuOpen} />
              </button>
              <button type="button" className="landing-mobile-cta btn btn-primary" onClick={onCtaClick}>
                Commencer
              </button>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="landing-nav-drawer-root" role="presentation">
          <button type="button" className="landing-nav-drawer-backdrop" aria-label="Fermer le menu" onClick={closeMenu} />
          <div
            id={drawerId}
            className="landing-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu et articles"
          >
            <div className="landing-nav-drawer-head">
              <span className="landing-nav-drawer-title">Menu</span>
              <button type="button" className="landing-nav-drawer-close" onClick={closeMenu} aria-label="Fermer">
                <BurgerIcon open />
              </button>
            </div>
            <nav className="landing-nav-drawer-body" aria-label="Navigation mobile">
              <p className="landing-nav-drawer-section-label">Sur cette page</p>
              <ul className="landing-nav-drawer-list">
                <li>
                  <a href="#comment" onClick={closeMenu}>Comment ça marche</a>
                </li>
                <li>
                  <a href="#tarifs" onClick={closeMenu}>Tarifs</a>
                </li>
                <li>
                  <a href="#features" onClick={closeMenu}>Fonctionnalités</a>
                </li>
              </ul>
              <p className="landing-nav-drawer-section-label">Articles &amp; guides</p>
              <ul className="landing-nav-drawer-list">
                {ARTICLE_NAV_LINKS.map(({ to, label }) => (
                  <li key={to}>
                    <Link to={to} onClick={closeMenu}>{label}</Link>
                  </li>
                ))}
              </ul>
              <p className="landing-nav-drawer-section-label">Légal</p>
              <ul className="landing-nav-drawer-list landing-nav-drawer-list--compact">
                <li><Link to="/mentions-legales" onClick={closeMenu}>Mentions légales</Link></li>
                <li><Link to="/confidentialite" onClick={closeMenu}>Confidentialité</Link></li>
                <li><Link to="/cgu" onClick={closeMenu}>CGU</Link></li>
              </ul>
              <div className="landing-nav-drawer-cta">
                <button type="button" className="btn btn-primary" onClick={() => { closeMenu(); onCtaClick(); }}>
                  Essayer gratuitement
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}

      <main id="main-content">
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero-inner">
            <div className="landing-hero-content">
              <h1 className="landing-hero-title">
                Passe les filtres automatiques. Décroche des entretiens en 1 clic.
              </h1>
              <p className="landing-hero-subtitle">
                {"L'IA analyse l'offre d'emploi et adapte instantanément ton CV pour passer les filtres (ATS) et taper dans l'œil des recruteurs."}
              </p>
              <div className="landing-hero-ctas">
                <button type="button" className="btn btn-primary landing-cta-hero" onClick={onCtaClick}>
                  Essayer gratuitement
                </button>
                <span className="landing-hero-hint">3 adaptations offertes</span>
              </div>
            </div>
            <div className="landing-hero-visual">
              <div className="landing-hero-mockup">
                <div className="mockup-toolbar">
                  <span className="mockup-dot" /><span className="mockup-dot" /><span className="mockup-dot" />
                  <span className="mockup-title">Adapter un CV</span>
                </div>
                <div className="mockup-body">
                  <div className="mockup-chat">
                    <div className="mockup-msg mockup-msg--user">Adapte mon CV pour ce poste de Chef de projet digital</div>
                    <div className="mockup-msg mockup-msg--ai">
                      <span className="mockup-ai-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg></span>
                      CV adapté (score ATS 92/100). Titre, résumé et expériences optimisés.
                    </div>
                  </div>
                  <div className="mockup-preview">
                    <div className="mockup-cv-header" />
                    <div className="mockup-cv-line mockup-cv-line--highlight" />
                    <div className="mockup-cv-line" />
                    <div className="mockup-cv-line mockup-cv-line--short" />
                    <div className="mockup-cv-line mockup-cv-line--highlight" />
                    <div className="mockup-cv-line" />
                    <div className="mockup-cv-line mockup-cv-line--short" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="comment" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section-title">Comment ça marche</h2>
          <div className="landing-steps">
            {STEPS.map((step, i) => (
              <div key={step.icon} className="landing-step">
                <div className="landing-step-icon">
                  {step.icon === 'profile' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  )}
                  {step.icon === 'paste' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
                    </svg>
                  )}
                  {step.icon === 'sparkles' && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                    </svg>
                  )}
                </div>
                <span className="landing-step-num">Étape {i + 1}</span>
                <h3 className="landing-step-title">{step.title}</h3>
                <p className="landing-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="tarifs" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section-title">Tarifs</h2>
          <p className="landing-section-subtitle">Commence gratuitement. Passe Pro quand tu en as besoin.</p>
          <div className="landing-pricing">
            <div className="pricing-card">
              <div className="pricing-card-header">
                <h3 className="pricing-plan-name">Gratuit</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">0€</span>
                  <span className="pricing-period">pour toujours</span>
                </div>
              </div>
              <ul className="pricing-features">
                {FREE_FEATURES.map((f) => (
                  <li key={f}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-secondary pricing-cta" onClick={onCtaClick}>
                Commencer gratuitement
              </button>
            </div>

            <div className="pricing-card pricing-card--pro">
              <div className="pricing-badge">Populaire</div>
              <div className="pricing-card-header">
                <h3 className="pricing-plan-name">Pro</h3>
                <div className="pricing-price">
                  <span className="pricing-amount">10€</span>
                  <span className="pricing-period">/ mois</span>
                </div>
              </div>
              <ul className="pricing-features">
                {PRO_FEATURES.map((f) => (
                  <li key={f}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary pricing-cta" onClick={onProClick || onCtaClick}>
                Passer Pro
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section-title">Fonctionnalités</h2>
          <div className="landing-features-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <h3 className="landing-feature-title">{f.title}</h3>
                <p className="landing-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section-title">Pourquoi AxeL Job ?</h2>
          <div className="landing-features-grid">
            {BENEFITS.map((b) => (
              <div key={b.title} className="landing-feature-card">
                <h3 className="landing-feature-title">{b.title}</h3>
                <p className="landing-feature-desc">{b.desc}</p>
                {b.linkToAts && (
                  <Link to="/ats" className="landing-ats-link">Qu&apos;est-ce que l&apos;ATS ?</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta-bottom">
        <div className="landing-container">
          <h2>Prêt à décrocher le job de tes rêves ?</h2>
          <p>Crée ton compte gratuit et teste 3 adaptations de CV.</p>
          <button type="button" className="btn btn-primary landing-cta-hero" onClick={onCtaClick}>
            Essayer gratuitement
          </button>
        </div>
      </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-inner">
            <p>
              © {new Date().getFullYear()} AxeL Job - Ton CV sur-mesure pour chaque annonce. Une réalisation{' '}
              <a href="https://axelproject.fr" rel="noopener noreferrer">Axel Project</a>.
            </p>
            <nav className="landing-footer-links" aria-label="Guides, FAQ et pages légales">
              <a href={`mailto:${CONTACT_EMAIL}?subject=Support%20AxeL%20Job`}>Support</a>
              <Link to="/ats">CV et ATS</Link>
              <Link to="/faq">FAQ</Link>
              <Link to="/modeles-cv">Modèles de CV</Link>
              <Link to="/guide-cv">Guide CV</Link>
              <Link to="/erreurs-cv">Erreurs à éviter</Link>
              <Link to="/cv-par-metier">CV par métier</Link>
              <Link to="/cv-adapte-chaque-offre">CV adapté à chaque offre</Link>
              <span className="landing-footer-sep">|</span>
              <Link to="/mentions-legales">Mentions légales</Link>
              <Link to="/confidentialite">Confidentialité</Link>
              <Link to="/cgu">CGU</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
