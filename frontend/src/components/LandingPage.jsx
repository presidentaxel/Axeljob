import './LandingPage.css';

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
  { title: 'Suivi de candidatures', desc: 'Statuts, entretiens, refus — tout centralisé au même endroit.' },
  { title: 'Export PDF ultra-propre', desc: 'CV et lettre de motivation prêts à envoyer.' },
];

const BENEFITS = [
  { title: 'Score ATS optimisé', desc: 'Chaque CV est analysé et adapté pour maximiser son passage dans les filtres automatiques des recruteurs (ATS).' },
  { title: 'Gain de temps massif', desc: "Plus besoin de réécrire manuellement chaque candidature. L'IA adapte en quelques secondes." },
  { title: 'Suivi centralisé', desc: 'Toutes tes candidatures au même endroit : statuts, entretiens, relances et exports.' },
];

export default function LandingPage({ onCtaClick }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-container">
          <div className="landing-header-inner">
            <img src="/favicon.svg" alt="CV Bot" className="landing-logo" />
            <span className="landing-brand">CV Bot</span>
            <nav className="landing-nav">
              <a href="#comment">Comment ça marche</a>
              <a href="#features">Fonctionnalités</a>
              <button type="button" className="btn btn-primary landing-cta-nav" onClick={onCtaClick}>
                Essayer gratuitement
              </button>
            </nav>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero-inner">
            <div className="landing-hero-content">
              <h1 className="landing-hero-title">
                Ne rate plus aucune opportunité. Ton CV sur-mesure pour chaque annonce, en 1 clic.
              </h1>
              <p className="landing-hero-subtitle">
                {"L'IA analyse l'offre d'emploi et adapte instantanément ton CV pour passer les filtres (ATS) et taper dans l'œil des recruteurs."}
              </p>
              <button type="button" className="btn btn-primary landing-cta-hero" onClick={onCtaClick}>
                Essayer gratuitement
              </button>
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
                      CV adapté (score ATS 87/100). Titre, résumé et expériences optimisés.
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
        <h2 className="landing-section-title">Pourquoi CV Bot ?</h2>
        <div className="landing-features-grid">
          {BENEFITS.map((b) => (
            <div key={b.title} className="landing-feature-card">
              <h3 className="landing-feature-title">{b.title}</h3>
              <p className="landing-feature-desc">{b.desc}</p>
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

      <footer className="landing-footer">
        <p>© CV Bot — Ton CV sur-mesure pour chaque annonce.</p>
      </footer>
    </div>
  );
}
