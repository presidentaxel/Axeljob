import { Link } from 'react-router-dom';
import { ARTICLE_SOURCE_URLS as U } from '../content/articleSources.js';
import ContentScrollToTop from './ContentScrollToTop';
import './ContentPages.css';

function Out({ href, children }) {
  return (
    <a href={href} className="content-source" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

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
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function IconChecklist() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
            Retour à l&apos;accueil
          </Link>
        </div>
      </header>

      <section className="content-hero">
        <div className="content-hero-inner">
          <h1>Qu&apos;est-ce qu&apos;un ATS ?</h1>
          <p className="content-lead">
            Tu envoies ta candidature. Quelques minutes plus tard, tu reçois un refus automatique. Pas de retour, pas d&apos;explication. La faute à l&apos;ATS ? Pas forcément. Voici ce que les données disent vraiment.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner content-prose">
          <div className="content-section-icon">
            <IconFunnel />
          </div>
          <div className="content-section-body">
            <h2>L&apos;ATS, c&apos;est quoi ?</h2>
            <p>
              Un ATS (Applicant Tracking System, ou logiciel de gestion des candidatures) est un outil utilisé par les entreprises pour traiter les candidatures à grande échelle. Il centralise les CV reçus, les organise, permet de les filtrer par mots-clés ou critères, et gère les communications avec les candidats.
            </p>
            <p>
              Aujourd&apos;hui, plus de 98&nbsp;% des entreprises du Fortune 500 utilisent un ATS, et 75&nbsp;% des recruteurs s&apos;appuient sur ces outils pour gérer leurs candidatures (
              <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
              ).
            </p>
            <div className="content-visual">
              <VisualAtsFlow />
            </div>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner content-prose">
          <div className="content-section-icon">
            <IconAlert />
          </div>
          <div className="content-section-body">
            <h2>Ce que l&apos;ATS fait vraiment (et ce qu&apos;il ne fait pas)</h2>
            <p>
              La croyance populaire veut que les ATS rejettent automatiquement 75&nbsp;% des CV avant qu&apos;un humain ne les lise. C&apos;est faux. Selon{' '}
              <Out href={U.ENHANCV_ATS}>Enhancv</Out>
              , cette statistique remonte à une entreprise appelée Preptel, qui a fermé ses portes en 2013 sans jamais publier de méthodologie.
            </p>
            <p>
              La réalité, documentée par une étude{' '}
              <Out href={U.ENHANCV_ATS}>Enhancv</Out>
              {' '}menée sur 25 recruteurs en 2025&nbsp;: 100&nbsp;% utilisent des questions d&apos;élimination binaires (autorisation de travail, certifications, localisation), mais seulement 8&nbsp;% configurent un rejet automatique basé sur le contenu du CV. Les 92&nbsp;% restants rejettent manuellement ou uniquement via ces questions d&apos;élimination.
            </p>
            <p>
              En clair&nbsp;: l&apos;ATS classe et organise, les humains rejettent. Le vrai problème n&apos;est pas un algorithme mystérieux - c&apos;est le volume. Toujours selon{' '}
              <Out href={U.ENHANCV_ATS}>Enhancv</Out>
              , un poste junior reçoit entre 400 et 600 candidatures, et certains postes en remote dépassent 1&nbsp;000 la première semaine.
            </p>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner content-prose">
          <div className="content-section-icon">
            <IconChecklist />
          </div>
          <div className="content-section-body">
            <h2>Pourquoi certains CV passent mieux que d&apos;autres</h2>
            <p>Il y a deux vrais risques&nbsp;:</p>
            <ol>
              <li>
                <strong>Les questions d&apos;élimination.</strong> Si l&apos;offre exige 5 ans d&apos;expérience et que tu en as 2, tu es éliminé automatiquement - pas par un algorithme qui lit ton CV, mais parce que tu ne réponds pas au critère binaire posé.
              </li>
              <li>
                <strong>Le mauvais parsing.</strong> Selon une analyse{' '}
                <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
                {' '}de 1&nbsp;000 CV rejetés, un fichier DOCX simple a un taux d&apos;échec de parsing de seulement 4&nbsp;%, contre 18&nbsp;% pour un PDF. Les tableaux, zones de texte et mises en page multi-colonnes augmentent considérablement les risques d&apos;erreur de lecture.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner content-prose">
          <div className="content-section-icon">
            <IconSparkles />
          </div>
          <div className="content-section-body">
            <h2>Ce que ça change pour toi</h2>
            <p className="content-callout">
              L&apos;objectif n&apos;est pas de «&nbsp;tromper&nbsp;» l&apos;ATS. C&apos;est de lui rendre la tâche facile. Format simple, mots-clés alignés avec l&apos;offre, sections bien nommées («&nbsp;Expérience&nbsp;», «&nbsp;Formation&nbsp;», «&nbsp;Compétences&nbsp;»)&nbsp;: c&apos;est tout ce qu&apos;il faut.
            </p>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner content-prose">
          <div className="content-section-icon">
            <IconSparkles />
          </div>
          <div className="content-section-body">
            <h2>Comment AxeL Job t&apos;aide ?</h2>
            <p>
              AxeL Job utilise l&apos;IA pour adapter ton CV à chaque offre&nbsp;: reformulation du résumé, mise en avant des expériences pertinentes, intégration des mots-clés de l&apos;annonce de façon naturelle. Objectif&nbsp;: optimiser ton passage dans les ATS tout en gardant un CV honnête et lisible par les recruteurs.
            </p>
          </div>
        </div>
      </section>

      <section className="content-cta">
        <div className="content-cta-inner">
          <h2>Passe les filtres ATS à chaque candidature</h2>
          <p>Adapte ton CV en un clic à chaque offre. Essai gratuit, sans carte bancaire.</p>
          <Link to="/login" className="button button-primary">Essayer AxeL Job gratuitement</Link>
        </div>
      </section>

      <footer className="content-footer">
        <nav className="content-footer-nav">
          <Link to="/faq">FAQ</Link>
          <Link to="/modeles-cv">Modèles de CV</Link>
          <Link to="/guide-cv">Guide CV</Link>
          <Link to="/erreurs-cv">Erreurs à éviter</Link>
          <Link to="/cv-par-metier">CV par métier</Link>
          <Link to="/cv-adapte-chaque-offre">CV adapté à chaque offre</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
          <Link to="/confidentialite">Confidentialité</Link>
          <Link to="/cgu">CGU</Link>
        </nav>
      </footer>
      <ContentScrollToTop />
    </div>
  );
}
