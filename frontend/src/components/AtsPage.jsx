import { Link } from 'react-router-dom';
import './ContentPages.css';

function IconFunnel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v2.5l-6 7v6l-4 2v-8l-6-7V4z" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function VisualAtsFlow() {
  return (
    <svg viewBox="0 0 280 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="20" width="70" height="44" rx="8" fill="var(--accent)" fillOpacity="0.15" stroke="var(--accent)" strokeWidth="2" />
      <text x="55" y="47" textAnchor="middle" fill="var(--accent)" fontSize="11" fontWeight="600">CV envoyé</text>
      <path d="M90 42 L120 42 L120 80 L150 80" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" fill="none" />
      <rect x="130" y="58" width="80" height="44" rx="8" fill="var(--accent)" fillOpacity="0.2" stroke="var(--accent)" strokeWidth="2" />
      <text x="170" y="85" textAnchor="middle" fill="var(--accent)" fontSize="11" fontWeight="600">ATS trie</text>
      <path d="M210 80 L240 80 L240 118 L260 118" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" fill="none" />
      <rect x="200" y="104" width="70" height="44" rx="8" fill="var(--success)" fillOpacity="0.2" stroke="var(--success)" strokeWidth="2" />
      <text x="235" y="131" textAnchor="middle" fill="var(--success)" fontSize="10" fontWeight="600">Entretien</text>
    </svg>
  );
}

export default function AtsPage({ onBack }) {
  return (
    <div className="content-page">
      <header className="content-header">
        <div className="content-header-inner">
          <Link to="/" className="content-back" onClick={(e) => { e.preventDefault(); onBack?.(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <section className="content-hero">
        <div className="content-hero-inner">
          <h1>Qu&apos;est-ce qu&apos;un ATS ?</h1>
          <p className="content-lead">
            <strong>ATS</strong> = Applicant Tracking System. C&apos;est le logiciel qui trie les candidatures avant qu&apos;un recruteur ne les lise. Comprendre comment il fonctionne, c&apos;est mettre toutes les chances de ton côté.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner">
          <div className="content-section-icon">
            <IconFunnel />
          </div>
          <div className="content-section-body">
            <h2>À quoi ça sert ?</h2>
            <p>
              Quand tu postules (site carrière, LinkedIn, Indeed…), ton CV atterrit le plus souvent dans un ATS. Le système scanne ton CV, en extrait les infos (expériences, compétences, formation) et les compare aux critères du poste. Les candidats dont le profil colle le mieux aux mots-clés de l&apos;annonce remontent en tête et ont plus de chances d&apos;être contactés.
            </p>
            <div className="content-visual">
              <VisualAtsFlow />
            </div>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner">
          <div className="content-section-icon">
            <IconAlert />
          </div>
          <div className="content-section-body">
            <h2>Pourquoi c&apos;est important pour toi ?</h2>
            <p>
              Si ton CV n&apos;est pas adapté au format et au vocabulaire attendus par l&apos;ATS, il peut être mal lu ou rejeté alors même que tu corresponds au poste. Tableaux compliqués, titres en image, formulations qui ne reprennent pas les mots de l&apos;offre = score en baisse. À l&apos;inverse, un CV structuré, lisible et aligné sur les mots-clés de l&apos;annonce passe mieux le filtre et augmente tes chances d&apos;être vu par un humain.
            </p>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner">
          <div className="content-section-icon">
            <IconSparkles />
          </div>
          <div className="content-section-body">
            <h2>Comment AxeL Job t&apos;aide ?</h2>
            <p>
              AxeL Job utilise l&apos;IA pour adapter ton CV à chaque offre : reformulation du résumé, mise en avant des expériences pertinentes, intégration des mots-clés de l&apos;annonce de façon naturelle. Objectif : optimiser ton passage dans les ATS tout en gardant un CV honnête et lisible par les recruteurs.
            </p>
          </div>
        </div>
      </section>

      <section className="content-cta">
        <div className="content-cta-inner">
          <h2>Passe les filtres ATS à chaque candidature</h2>
          <p>Adapte ton CV en un clic à chaque offre. Essai gratuit, sans carte bancaire.</p>
          <Link to="/login" className="btn">Essayer AxeL Job gratuitement</Link>
        </div>
      </section>

      <footer className="content-footer">
        <nav className="content-footer-nav">
          <Link to="/modeles-cv">Modèles de CV</Link>
          <Link to="/guide-cv">Guide CV</Link>
          <Link to="/erreurs-cv">Erreurs à éviter</Link>
          <Link to="/cv-par-metier">CV par métier</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/cgu">CGU</Link>
        </nav>
      </footer>
    </div>
  );
}
