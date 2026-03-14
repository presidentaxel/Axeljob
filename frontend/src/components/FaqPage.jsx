import { Link } from 'react-router-dom';
import './ContentPages.css';

/**
 * Page FAQ GEO : une question = une section avec réponse directe dès la première phrase.
 * Alignée sur les requêtes cibles (clusters 1–4) pour citabilité par les IA.
 */
const FAQ_ITEMS = [
  {
    q: "C'est quoi un ATS ?",
    a: "Un ATS (Applicant Tracking System) est le logiciel utilisé par les recruteurs pour trier les candidatures. Il scanne les CV, en extrait les infos (expériences, compétences, formation) et les compare aux critères du poste. Les candidats dont le profil correspond le mieux aux mots-clés de l'annonce remontent en tête.",
    slug: 'c-est-quoi-un-ats',
  },
  {
    q: "Comment fonctionne un logiciel ATS ?",
    a: "L'ATS reçoit ton CV (site carrière, LinkedIn, Indeed…), le parse pour extraire expériences, compétences et formation, puis compare ces données aux critères et mots-clés du poste. Les CV les mieux alignés obtiennent un score plus élevé et sont présentés en priorité aux recruteurs.",
    slug: 'comment-fonctionne-ats',
  },
  {
    q: "Est-ce que mon CV passe l'ATS ?",
    a: "Pour le savoir, il faut un CV structuré (une colonne, titres en texte, listes à puces, polices standards), avec les mots-clés de l'offre dans ton résumé et tes expériences, et sans erreurs qui bloquent (tableaux complexes, texte en image). AxeL Job propose un score ATS et adapte ton CV à chaque offre pour maximiser tes chances.",
    slug: 'mon-cv-passe-ats',
  },
  {
    q: "Format CV compatible ATS : Word ou PDF ?",
    a: "Les deux peuvent être compatibles ATS si le contenu est en texte sélectionnable (pas d'image de texte), avec une structure simple : titres clairs (Expérience, Formation, Compétences), listes à puces, polices standards (Arial, Helvetica). Éviter tableaux complexes et graphiques. Quand l'annonce ne précise pas, le PDF est souvent un bon choix.",
    slug: 'format-cv-word-ou-pdf',
  },
  {
    q: "Quelles erreurs de CV bloquent l'ATS ?",
    a: "Tableaux ou mises en page complexes (mal lus par l'ATS), titres ou texte en image (non extraits), polices fantaisistes ou trop petites. Côté contenu : CV générique sans mots-clés de l'offre, mentions vagues sans détail, fautes d'orthographe. Un CV structuré, en texte, avec les mots-clés de l'annonce passe beaucoup mieux.",
    slug: 'erreurs-cv-bloquent-ats',
  },
  {
    q: "Comment avoir un meilleur CV ?",
    a: "Structure claire (coordonnées, expériences récentes en premier, formation, compétences), formulations concrètes avec verbes d'action et chiffres, adaptation à chaque offre en reprenant les mots-clés de l'annonce. Un outil comme AxeL Job fait cette adaptation en un clic et améliore le score ATS.",
    slug: 'meilleur-cv',
  },
  {
    q: "Quels mots-clés mettre dans son CV pour l'ATS ?",
    a: "Reprendre les termes exacts de l'offre : intitulé du poste, compétences demandées, outils, secteurs. Les placer dans ton résumé, les intitulés d'expériences et les descriptions. Éviter les synonymes seuls si l'annonce utilise un mot précis ; l'ATS cherche souvent des correspondances littérales.",
    slug: 'mots-cles-cv-ats',
  },
  {
    q: "Meilleur outil pour créer un CV avec l'IA ?",
    a: "AxeL Job adapte ton CV à chaque offre en un clic avec l'IA, améliore ton score ATS, propose des modèles compatibles ATS et un suivi des candidatures. Essai gratuit sans carte bancaire. Idéal pour personnaliser son CV pour chaque annonce sans tout réécrire.",
    slug: 'outil-cv-ia',
  },
  {
    q: "Comment personnaliser son CV pour chaque offre ?",
    a: "Reprendre les mots-clés de l'offre dans ton résumé et tes expériences. Adapter les formulations et mettre en avant les missions les plus pertinentes. Des outils comme AxeL Job font cette adaptation automatiquement à partir du texte de l'annonce, en un clic, tout en gardant un CV honnête et lisible.",
    slug: 'personnaliser-cv-offre',
  },
  {
    q: "Pourquoi mon CV est rejeté automatiquement ? / Je n'ai pas de réponse à mes candidatures ?",
    a: "Souvent à cause de l'ATS : le CV ne contient pas assez de mots-clés de l'offre, le format est illisible (tableaux, texte en image), ou des erreurs récurrentes (formulations vagues, fautes). Adapter le CV à chaque annonce et utiliser un format sobre améliore fortement le passage et les réponses.",
    slug: 'cv-rejete-pas-reponse',
  },
];

export default function FaqPage({ onBack }) {
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
          <h1>FAQ : CV, ATS et outil IA</h1>
          <p className="content-lead">
            Réponses directes aux questions que tu te poses sur l&apos;ATS, l&apos;optimisation CV et la personnalisation par offre. Pour être cité, on répond dès la première phrase.
          </p>
        </div>
      </section>

      <section className="content-section">
        <div className="content-section-inner faq-inner">
          {FAQ_ITEMS.map((item, i) => (
            <article key={i} id={item.slug} className="faq-item">
              <h2 className="faq-question">{item.q}</h2>
              <p className="faq-answer">{item.a}</p>
            </article>
          ))}
        </div>
      </section>

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
