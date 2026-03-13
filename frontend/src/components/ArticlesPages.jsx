import { Link } from 'react-router-dom';
import './ContentPages.css';

const IconDocument = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
  </svg>
);

const IconChecklist = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

const IconXCircle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" />
  </svg>
);

const IconBriefcase = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

const ICONS = { document: IconDocument, checklist: IconChecklist, alert: IconXCircle, briefcase: IconBriefcase };

function ArticleLayout({ title, lead, sections, onBack }) {
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
          <h1>{title}</h1>
          <p className="content-lead">{lead}</p>
        </div>
      </section>

      {sections.map((sec, i) => {
        const Icon = ICONS[sec.icon] || IconDocument;
        return (
          <section key={i} className="content-section">
            <div className="content-section-inner">
              <div className="content-section-icon">
                <Icon />
              </div>
              <div className="content-section-body">
                <h2>{sec.heading}</h2>
                {sec.body}
              </div>
            </div>
          </section>
        );
      })}

      <section className="content-cta">
        <div className="content-cta-inner">
          <h2>Un CV adapté à chaque offre, en un clic</h2>
          <p>Essaie AxeL Job gratuitement. 3 adaptations offertes, sans carte bancaire.</p>
          <Link to="/login" className="btn">Essayer gratuitement</Link>
        </div>
      </section>

      <footer className="content-footer">
        <nav className="content-footer-nav">
          <Link to="/ats">CV et ATS</Link>
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

const ARTICLES = {
  'modeles-cv': {
    title: 'Modèles de CV gratuits',
    lead: "Choisir le bon modèle fait la différence : clarté, lisibilité et compatibilité avec les logiciels de recrutement (ATS). Voici ce qu'il faut savoir.",
    sections: [
      {
        icon: 'document',
        heading: 'Pourquoi le format compte',
        body: (
          <p>Un CV bien structuré permet au recruteur (et à l&apos;ATS) d&apos;identifier rapidement tes expériences, compétences et formations. Les modèles trop créatifs (colonnes, graphiques, images) peuvent être mal interprétés. Un modèle sobre, avec des titres clairs et une mise en page linéaire, passe mieux partout.</p>
        ),
      },
      {
        icon: 'checklist',
        heading: "Les modèles adaptés à l'ATS",
        body: (
          <>
            <p>Les meilleurs modèles pour passer les filtres :</p>
            <ul>
              <li><strong>Une seule colonne</strong> ou deux colonnes simples (pas de tableaux complexes)</li>
              <li><strong>Des titres en texte</strong> (pas en image) : Expérience, Formation, Compétences, Langues</li>
              <li><strong>Des listes à puces</strong> pour les missions et réalisations</li>
              <li><strong>Des polices standards</strong> (Arial, Helvetica, Open Sans) et une taille lisible (10–12 pt)</li>
            </ul>
            <p>AxeL Job te propose des templates pensés pour l&apos;ATS. Tu renseignes ton profil une fois, puis l&apos;IA adapte le contenu à chaque offre tout en gardant un rendu propre et professionnel.</p>
          </>
        ),
      },
    ],
  },
  'guide-cv': {
    title: 'Comment faire un bon CV',
    lead: "Un bon CV met en valeur ton parcours de façon claire et ciblée. Voici les principes essentiels pour capter l'attention des recruteurs et des logiciels de tri.",
    sections: [
      { icon: 'document', heading: 'Structure et ordre des sections', body: <p>Coordonnées et titre professionnel ou accroche courte, puis expérience professionnelle (la plus récente en premier), formation, compétences techniques et transversales, et éventuellement langues, certifications ou centres d&apos;intérêt si pertinent pour le poste.</p> },
      { icon: 'checklist', heading: 'Rédiger des expériences qui parlent', body: <p>Pour chaque poste : entreprise, poste, dates et 2 à 4 points qui décrivent tes missions et réalisations. Privilégie les verbes d&apos;action et des chiffres ou résultats concrets (budget géré, équipe encadrée, etc.). Évite les formules vagues sans préciser ton rôle.</p> },
      { icon: 'document', heading: "Adapter le CV à l'offre", body: <p>Un même CV ne convient pas à toutes les annonces. Reprendre les mots-clés de l&apos;offre dans ton résumé et tes expériences améliore ton score ATS et montre au recruteur que tu correspond au poste. AxeL Job fait cette adaptation automatiquement à partir du texte de l&apos;annonce.</p> },
      { icon: 'checklist', heading: 'Longueur et mise en forme', body: <p>En France, un CV d&apos;une à deux pages suffit. Une page pour les juniors ou moins de 5 ans d&apos;expérience, deux pages au-delà si nécessaire. Reste sobre et vérifie l&apos;orthographe avant envoi.</p> },
    ],
  },
  'erreurs-cv': {
    title: 'Erreurs fréquentes dans un CV',
    lead: "Certaines erreurs reviennent souvent et peuvent faire recaler un CV, par un ATS ou par un recruteur. Les éviter augmente tes chances d'être convoqué en entretien.",
    sections: [
      {
        icon: 'alert',
        heading: 'Format et lisibilité',
        body: (
          <ul>
            <li><strong>Tableaux ou mises en page complexes</strong> : beaucoup d&apos;ATS les lisent mal. Privilégie une structure simple.</li>
            <li><strong>Titres ou texte en image</strong> : le contenu des images n&apos;est pas lu par les logiciels. Tout doit être en texte sélectionnable.</li>
            <li><strong>Polices fantaisistes ou trop petites</strong> : reste sur du classique (10–12 pt).</li>
          </ul>
        ),
      },
      {
        icon: 'alert',
        heading: 'Contenu',
        body: (
          <ul>
            <li><strong>CV générique</strong> : envoyer le même CV partout sans reprendre les mots de l&apos;offre fait baisser ton score ATS.</li>
            <li><strong>Mentions vagues</strong> : « diverses missions », « participation à… » sans détail. Précise ton rôle et des résultats concrets.</li>
            <li><strong>Fautes d&apos;orthographe</strong> : une relecture est indispensable.</li>
            <li><strong>Infos inutiles ou risquées</strong> : photo non pro, date de naissance ou situation familiale si non demandées.</li>
          </ul>
        ),
      },
      { icon: 'checklist', heading: "Comment AxeL Job t'aide", body: <p>L&apos;outil génère des CV adaptés à chaque offre, avec une structure claire et des formulations alignées sur l&apos;annonce. Tu gardes le contrôle du contenu tout en limitant les erreurs de format et de ciblage.</p> },
    ],
  },
  'cv-par-metier': {
    title: 'CV par secteur : tech, marketing, finance…',
    lead: "Selon le métier et le secteur, les attentes des recruteurs et des ATS ne sont pas les mêmes. Voici des pistes pour adapter ton CV selon ton domaine.",
    sections: [
      { icon: 'briefcase', heading: 'Tech et développement', body: <p>Les recruteurs cherchent <strong>technos, langages et outils</strong> (Python, React, AWS, SQL…). Liste-les clairement dans une section « Compétences techniques » et mentionne-les dans tes expériences. Les projets (perso, open source, stages) ont leur place. Un CV une page suffit souvent pour les profils techniques.</p> },
      { icon: 'briefcase', heading: 'Marketing et communication', body: <p>Mets en avant les <strong>campagnes, canaux (SEO, réseaux sociaux, email), outils (Google Analytics, CRM) et résultats</strong> (trafic, conversions). Un peu de créativité dans la forme peut passer, mais le contenu doit rester lisible et structuré pour les ATS.</p> },
      { icon: 'briefcase', heading: 'Finance, contrôle, audit', body: <p>Valorise la <strong>rigueur, les chiffres et les normes</strong> (IFRS, contrôle interne…). Précise les montants gérés, les périmètres, les outils (SAP, Excel avancé). Les diplômes et certifications (CFA, DSCG…) sont souvent des critères de tri dans les ATS.</p> },
      { icon: 'briefcase', heading: 'Commercial et business development', body: <p>Les recruteurs regardent les <strong>objectifs, chiffres d&apos;affaires, portefeuille clients et type de vente</strong> (B2B, B2C). Quantifie tes résultats (CA, taux de conversion, nombre de clients).</p> },
      { icon: 'checklist', heading: 'Adapter quel que soit le secteur', body: <p>Dans tous les cas, reprendre les <strong>mots-clés de l&apos;annonce</strong> améliore ton passage dans les ATS. AxeL Job t&apos;aide à adapter ton CV à chaque offre, quel que soit ton secteur.</p> },
    ],
  },
};

export default function ArticlesPages({ slug, onBack }) {
  const article = ARTICLES[slug];
  if (!article) return null;

  return (
    <ArticleLayout
      title={article.title}
      lead={article.lead}
      sections={article.sections}
      onBack={onBack}
    />
  );
}
