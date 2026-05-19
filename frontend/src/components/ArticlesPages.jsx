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

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
);

const IconSparkles = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
);

const IconChart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const ICONS = {
  document: IconDocument,
  checklist: IconChecklist,
  alert: IconXCircle,
  briefcase: IconBriefcase,
  clock: IconClock,
  sparkles: IconSparkles,
  chart: IconChart,
};

function ArticleLayout({ title, lead, sections, onBack, prose }) {
  const proseClass = prose ? ' content-prose' : '';
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
          <h1>{title}</h1>
          <p className="content-lead">{lead}</p>
        </div>
      </section>

      {sections.map((sec, i) => {
        const Icon = ICONS[sec.icon] || IconDocument;
        return (
          <section key={i} className="content-section">
            <div className={`content-section-inner${proseClass}`}>
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
          <p>Essaie AxeL Job gratuitement. 100 % gratuit, sans carte bancaire.</p>
          <Link to="/login" className="btn">Essayer gratuitement</Link>
        </div>
      </section>

      <footer className="content-footer">
        <nav className="content-footer-nav">
          <Link to="/ats">CV et ATS</Link>
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

const ARTICLES = {
  'modeles-cv': {
    prose: true,
    title: 'Modèles de CV : comment choisir le bon',
    lead: "Il existe des milliers de modèles de CV gratuits en ligne. Certains sont beaux. Certains passent l'ATS. Peu font les deux. Voici comment choisir.",
    sections: [
      {
        icon: 'document',
        heading: 'Le piège du CV trop design',
        body: (
          <>
            <p>
              Un CV avec des colonnes, des icônes, des barres de progression ou des tableaux est attrayant visuellement. Mais l&apos;analyse{' '}
              <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
              {' '}de 1&nbsp;000 CV rejetés montre que les layouts multi-colonnes ont un taux de parsing ATS de 86&nbsp;% contre 93&nbsp;% pour les formats à colonne unique. Les tableaux, zones de texte et images rendent les informations illisibles pour la plupart des logiciels.
            </p>
            <p>Le paradoxe&nbsp;: le CV le plus beau sur écran est souvent le plus mal lu par un ATS.</p>
          </>
        ),
      },
      {
        icon: 'checklist',
        heading: 'Les 3 formats qui existent',
        body: (
          <>
            <p>
              <strong>Le chronologique inversé</strong> (le plus courant)&nbsp;: les expériences sont listées de la plus récente à la plus ancienne. C&apos;est le format le plus reconnu par les recruteurs, notamment pour les postes qui valorisent un historique professionnel clair. À utiliser par défaut si tu as un parcours cohérent.
            </p>
            <p>
              <strong>Le fonctionnel</strong>&nbsp;: organise le contenu par compétences plutôt que par chronologie. Utile pour les reconversions ou les périodes d&apos;inactivité. Problème&nbsp;: selon{' '}
              <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
              , les recruteurs rejettent plus souvent ce format car il liste les compétences sans inclure l&apos;historique de postes, ce qui soulève des questions sur la trajectoire professionnelle.
            </p>
            <p>
              <strong>Le combiné</strong>&nbsp;: mélange les deux. Adapté aux profils expérimentés avec des compétences transversales fortes.
            </p>
          </>
        ),
      },
      {
        icon: 'sparkles',
        heading: "Ce qu'un bon modèle doit permettre",
        body: (
          <>
            <ul>
              <li><strong>Une colonne unique</strong> (ou deux maximum, bien parsables)</li>
              <li><strong>Des titres de sections standards</strong>&nbsp;: Expérience, Formation, Compétences - pas «&nbsp;Mon parcours&nbsp;» ou «&nbsp;Ce que je sais faire&nbsp;»</li>
              <li>
                <strong>Une police lisible</strong>&nbsp;: selon{' '}
                <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
                , Arial est la police la plus populaire auprès des recruteurs. Tailles recommandées&nbsp;: 10-11pt pour le corps, 14-18pt pour ton nom.
              </li>
              <li>
                <strong>Pas d&apos;informations dans les en-têtes ou pieds de page</strong>&nbsp;:{' '}
                <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
                {' '}note que 25&nbsp;% des ATS ignorent complètement le contenu placé dans ces zones.
              </li>
            </ul>
            <p>AxeL Job te propose des templates pensés pour l&apos;ATS. Tu renseignes ton profil une fois, puis l&apos;IA adapte le contenu à chaque offre tout en gardant un rendu propre et professionnel.</p>
          </>
        ),
      },
      {
        icon: 'document',
        heading: 'Longueur : une ou deux pages ?',
        body: (
          <p>
            <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
            {' '}indique que 54&nbsp;% des recruteurs préfèrent deux pages, et que 70&nbsp;% sont plus enclins à considérer un CV de deux pages plutôt qu&apos;un d&apos;une page pour les profils avec de l&apos;expérience. En pratique&nbsp;: une page pour un profil junior, deux pages au-delà de 5 ans d&apos;expérience.
          </p>
        ),
      },
      {
        icon: 'checklist',
        heading: "La règle d'or",
        body: (
          <p className="content-callout">
            Un bon modèle de CV est celui qui disparaît&nbsp;: le recruteur ne voit pas le template, il voit tes expériences. La mise en page doit guider l&apos;œil, pas le distraire.
          </p>
        ),
      },
    ],
  },
  'guide-cv': {
    prose: true,
    title: 'Comment faire un bon CV',
    lead: "Ton CV a environ 7 secondes pour convaincre. Pas pour être lu en entier - pour survivre au premier scan. Voici ce que les recruteurs regardent vraiment.",
    sections: [
      {
        icon: 'clock',
        heading: 'La réalité des premières secondes',
        body: (
          <>
            <p>
              Une étude TheLadders par eye-tracking, fréquemment citée par les professionnels du recrutement, indique que la première évaluation d&apos;un CV ne dure que 7,4 secondes. Une enquête Zippia de 2023 ajoute qu&apos;1 recruteur sur 4 consacre moins de 30 secondes à un CV avant de décider s&apos;il mérite une lecture complète.
            </p>
            <p>
              Ce n&apos;est pas du temps pour lire. C&apos;est du temps pour scanner. Ton CV doit donc être structuré pour que, en quelques secondes, le recruteur identifie&nbsp;: ton titre, ton expérience la plus récente, tes compétences clés.
            </p>
          </>
        ),
      },
      {
        icon: 'document',
        heading: "Les éléments d'un bon CV",
        body: (
          <>
            <h3>1. Un titre clair et ancré dans le poste visé</h3>
            <p>
              Pas «&nbsp;Professionnel dynamique et motivé&nbsp;» - mais «&nbsp;Analyste marketing junior | SEO &amp; Data&nbsp;». Selon une analyse{' '}
              <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
              {' '}portant sur près d&apos;un million de candidatures, faire correspondre le titre de ton CV avec celui de l&apos;offre augmente de 3,5 fois tes chances d&apos;obtenir un entretien.
            </p>
            <h3>2. Un résumé de 3-4 lignes en haut</h3>
            <p>Pas obligatoire, mais très efficace. Il doit répondre à trois questions&nbsp;: qui tu es professionnellement, quel impact tu as eu, et pourquoi tu corresponds à ce poste précis.</p>
            <h3>3. Des expériences avec des chiffres</h3>
            <p>
              L&apos;étude{' '}
              <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
              {' '}montre que les ATS modernes détectent le contexte autour des compétences&nbsp;: un résultat chiffré rattaché à une compétence est mieux parsé qu&apos;une liste isolée. La formule&nbsp;: Verbe d&apos;action + contexte + résultat mesurable. Exemple&nbsp;: «&nbsp;Géré un portefeuille de 15 clients → +22&nbsp;% de satisfaction mesurée en NPS&nbsp;».
            </p>
            <h3>4. Des compétences alignées sur l&apos;offre</h3>
            <p>
              Reprends les mots exacts de l&apos;offre d&apos;emploi. Pas les synonymes - les mots exacts.{' '}
              <Out href={U.HBS_HIDDEN_WORKERS}>Harvard Business School</Out>
              {' '}documente que 88&nbsp;% des employeurs signalent perdre des candidats qualifiés simplement parce que les termes de leur CV ne correspondent pas aux mots-clés configurés dans l&apos;ATS.
            </p>
            <h3>5. Une structure aérée</h3>
            <p>
              Selon{' '}
              <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
              , 89&nbsp;% des recruteurs cherchent des aptitudes à résoudre des problèmes et 88&nbsp;% se concentrent sur les compétences techniques. Ces éléments doivent être visibles immédiatement, pas enfouis dans un bloc de texte dense.
            </p>
          </>
        ),
      },
      {
        icon: 'alert',
        heading: "Ce qu'il faut éviter",
        body: (
          <>
            <p>
              Les adjectifs vides. «&nbsp;Dynamique, rigoureux, autonome&nbsp;»&nbsp;: tout le monde les écrit, personne ne les lit. Remplace-les par des faits&nbsp;: un chiffre, un contexte, un résultat. Et soigne l&apos;orthographe&nbsp;: d&apos;après{' '}
              <Out href={U.MIT_SLOAN_AI_RESUME}>MIT Sloan</Out>
              , les candidats avec plus de 99&nbsp;% de mots correctement orthographiés sont embauchés 3 fois plus souvent que ceux en dessous de 90&nbsp;% de précision.
            </p>
            <p>
              AxeL Job adapte ton CV à chaque offre à partir du texte de l&apos;annonce - mots-clés, formulations, mise en avant des expériences pertinentes - pour t&apos;aider à appliquer ces règles sans tout réécrire à la main.
            </p>
          </>
        ),
      },
    ],
  },
  'erreurs-cv': {
    prose: true,
    title: 'Erreurs fréquentes dans un CV',
    lead: "Les 7 erreurs les plus courantes - et comment les corriger pour passer le filtre recruteur et ATS.",
    sections: [
      {
        icon: 'alert',
        heading: 'Les 7 erreurs à corriger',
        body: (
          <>
            <div className="content-error-block">
              <h3>Erreur n°1 : Les fautes d&apos;orthographe</h3>
              <p>
                C&apos;est la plus éliminatoire. Selon{' '}
                <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
                , 77&nbsp;% des recruteurs rejettent immédiatement un CV contenant des fautes ou une mauvaise grammaire. Ce n&apos;est pas de la sévérité&nbsp;: c&apos;est un signal sur ta capacité d&apos;attention dans ton travail. L&apos;étude{' '}
                <Out href={U.MIT_SLOAN_AI_RESUME}>MIT Sloan</Out>
                {' '}confirme le coût réel&nbsp;: les candidats avec moins de 90&nbsp;% de mots correctement orthographiés n&apos;ont que 3&nbsp;% de chances d&apos;être recrutés dans leur premier mois.
              </p>
              <div className="content-solution"><strong>Solution :</strong> relis à voix haute, utilise un correcteur, fais relire par quelqu&apos;un.</div>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°2 : Envoyer le même CV partout</h3>
              <p>
                Selon{' '}
                <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
                , 63&nbsp;% des recruteurs veulent explicitement recevoir un CV personnalisé pour chaque offre, et plus de 55&nbsp;% citent l&apos;absence de personnalisation comme l&apos;une des erreurs les plus fréquentes et les plus dommageables des candidats.
              </p>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°3 : Une adresse email non professionnelle</h3>
              <p>
                Selon{' '}
                <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
                , 35&nbsp;% des recruteurs rejettent un CV avec une adresse email non professionnelle. Utilise une adresse au format prenom.nom@domaine.com.
              </p>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°4 : Un format illisible par l&apos;ATS</h3>
              <p>
                Colonnes, tableaux, graphiques, barres de compétences en image&nbsp;: tout ce que tu ne peux pas copier-coller en texte brut, l&apos;ATS ne peut pas le lire non plus. L&apos;analyse{' '}
                <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
                {' '}montre que 23&nbsp;% des rejections sont liées à des erreurs de parsing - avant même que tes compétences soient évaluées. Et 25&nbsp;% des ATS ignorent les contenus placés en en-tête ou pied de page.
              </p>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°5 : Ne pas contextualiser ses compétences</h3>
              <p>
                Selon{' '}
                <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
                , les CV qui listent 20 compétences ou plus de façon isolée ont un taux de rejet de 67&nbsp;%, contre 34&nbsp;% pour ceux qui intègrent ces compétences dans des descriptions d&apos;expérience. Les ATS modernes analysent le contexte, pas seulement la présence d&apos;un mot. Exemple&nbsp;:  «&nbsp;Python, SQL, Tableau&nbsp;» →  «&nbsp;Développé un modèle Python analysant 50&nbsp;000 données clients, réduisant le temps de reporting de 40&nbsp;%&nbsp;».
              </p>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°6 : Un CV trop long ou trop court</h3>
              <p>
                <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
                {' '}documente que 54&nbsp;% des recruteurs préfèrent deux pages, et que 70&nbsp;% sont plus enclins à considérer un CV de deux pages plutôt qu&apos;une. À l&apos;inverse, un CV d&apos;une seule page pour un profil de 10 ans d&apos;expérience envoie un signal de sous-qualification.
              </p>
            </div>
            <div className="content-error-block">
              <h3>Erreur n°7 : Un résumé vague ou absent</h3>
              <p>
                «&nbsp;Professionnel passionné et polyvalent&nbsp;» ne dit rien de toi.{' '}
                <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
                {' '}classe les buzzwords vides parmi les signaux négatifs les plus courants&nbsp;: ils sont perçus comme un manque de direction et d&apos;effort. Un bon résumé répond à trois questions simples&nbsp;: qui tu es professionnellement, quel impact tu as eu, et en quoi tu corresponds à ce que l&apos;entreprise cherche.
              </p>
            </div>
          </>
        ),
      },
      {
        icon: 'checklist',
        heading: "Comment AxeL Job t'aide",
        body: (
          <p>
            L&apos;outil génère des CV adaptés à chaque offre, avec une structure claire et des formulations alignées sur l&apos;annonce. Tu gardes le contrôle du contenu tout en limitant les erreurs de format et de ciblage.
          </p>
        ),
      },
    ],
  },
  'cv-par-metier': {
    prose: true,
    title: 'CV par secteur : tech, marketing, finance',
    lead: "Un bon CV ne se rédige pas de la même façon selon le secteur. Ce ne sont pas seulement des mots différents - c'est une logique différente de ce que les recruteurs cherchent en premier.",
    sections: [
      {
        icon: 'briefcase',
        heading: 'Tech & développement',
        body: (
          <>
            <p>
              En tech, les recruteurs et ATS cherchent des compétences techniques précises et vérifiables. Pour un poste en informatique, les mots-clés typiques incluent des langages (Python, Java, SQL), des systèmes (Linux, AWS, Azure), et des pratiques (CI/CD, Agile, DevOps).
            </p>
            <p>
              La règle d&apos;or en tech&nbsp;: ne liste jamais un outil en isolation. L&apos;étude{' '}
              <Out href={U.EDLIGO_1000_CV}>EDLIGO</Out>
              {' '}montre que les ATS modernes analysent le contexte autour des mots-clés, pas uniquement leur présence. Au lieu de «&nbsp;Python, Java, SQL&nbsp;», écris&nbsp;: «&nbsp;Développé des applications d&apos;analyse de données en Python et SQL, réduisant le temps de reporting de 40&nbsp;%.&nbsp;»
            </p>
            <p><strong>Mots-clés à ne pas oublier selon le poste&nbsp;:</strong></p>
            <ul>
              <li><strong>Développeur</strong>&nbsp;: stack technique complète + niveau (junior/senior), méthodes Agile/Scrum</li>
              <li><strong>Data analyst</strong>&nbsp;: Python/R, SQL, Tableau/Power BI, machine learning, ETL</li>
              <li><strong>Product Manager</strong>&nbsp;: roadmap, OKR, KPI, user story, A/B testing, go-to-market</li>
            </ul>
          </>
        ),
      },
      {
        icon: 'briefcase',
        heading: 'Marketing',
        body: (
          <>
            <p>
              En marketing, le profil est dual&nbsp;: les CV doivent équilibrer maîtrise des plateformes techniques et capacités créatives.
            </p>
            <p>
              Les mots-clés pertinents&nbsp;: «&nbsp;customer acquisition cost (CAC)&nbsp;», «&nbsp;conversion rate optimization (CRO)&nbsp;», «&nbsp;marketing automation&nbsp;». Les outils comptent&nbsp;: HubSpot, Google Analytics, Salesforce, Semrush, Meta Ads.
            </p>
            <p><strong>Ce que les recruteurs regardent en premier&nbsp;:</strong></p>
            <ul>
              <li>Des résultats chiffrés sur des campagnes (ex.&nbsp;: «&nbsp;+35&nbsp;% de trafic organique en 6 mois&nbsp;»)</li>
              <li>La maîtrise des canaux (SEO, SEA, social, email, contenu)</li>
              <li>La capacité à lier les actions marketing aux revenus (ROAS, CPL, LTV)</li>
            </ul>
            <p>À éviter&nbsp;: les descriptions de poste sans résultats («&nbsp;j&apos;ai géré les réseaux sociaux&nbsp;»). Remplace par des faits.</p>
          </>
        ),
      },
      {
        icon: 'briefcase',
        heading: 'Finance & gestion',
        body: (
          <>
            <p>
              En finance, les CV doivent mettre l&apos;accent sur l&apos;impact quantifiable et la maîtrise des obligations réglementaires.
            </p>
            <p>
              Les recruteurs cherchent&nbsp;: «&nbsp;modélisation financière&nbsp;», «&nbsp;gestion du risque&nbsp;», «&nbsp;regulatory compliance&nbsp;», et des certifications comme CFA ou CPA. Les outils pertinents&nbsp;: SAP, QuickBooks, NetSuite, Excel avancé, Bloomberg.
            </p>
            <p>
              Formulation efficace&nbsp;: «&nbsp;Créé des modèles financiers ayant amélioré la précision des prévisions budgétaires de 25&nbsp;%.&nbsp;»
            </p>
          </>
        ),
      },
      {
        icon: 'checklist',
        heading: 'Le principe commun aux trois secteurs',
        body: (
          <>
            <p>
              Selon{' '}
              <Out href={U.RESUME_GENIUS_STATS}>Resume Genius</Out>
              , les termes génériques comme «&nbsp;orienté résultats&nbsp;» ou «&nbsp;analytique&nbsp;», sans preuve concrète associée, affaiblissent systématiquement un CV. Associe toujours un attribut à un résultat vérifiable.
            </p>
            <p>
              AxeL Job t&apos;aide à adapter ton CV à chaque offre, quel que soit ton secteur - en intégrant les mots-clés de l&apos;annonce dans un contenu honnête et structuré.
            </p>
          </>
        ),
      },
    ],
  },
  'cv-adapte-chaque-offre': {
    prose: true,
    title: 'CV adapté à chaque offre',
    lead: "Envoyer le même CV partout, c'est la stratégie la plus répandue. C'est aussi l'une des moins efficaces.",
    sections: [
      {
        icon: 'chart',
        heading: 'Ce que disent les données',
        body: (
          <>
            <p>
              Selon une analyse{' '}
              <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
              {' '}portant sur près d&apos;un million de candidatures, 83&nbsp;% des recruteurs déclarent être plus enclins à recruter un candidat qui a adapté son CV au poste. 63&nbsp;% veulent explicitement recevoir un CV personnalisé pour chaque offre. Et plus de 55&nbsp;% citent l&apos;absence de personnalisation comme l&apos;une des erreurs les plus fréquentes et les plus dommageables.
            </p>
            <p>
              L&apos;impact est mesurable à grande échelle. Selon des données issues de 3,2 millions d&apos;utilisateurs{' '}
              <Out href={U.TEAL_TAILOR}>Teal</Out>
              , adapter son CV à une offre rend 6 fois plus probable d&apos;obtenir un entretien.{' '}
              <Out href={U.HUNTR_TAILOR}>Huntr</Out>
              , après analyse de ses propres données, constate une multiplication par 2,21 du taux de conversion candidature → entretien pour les utilisateurs qui personnalisent leur CV.
            </p>
          </>
        ),
      },
      {
        icon: 'sparkles',
        heading: 'Pourquoi ça fonctionne',
        body: (
          <>
            <p>Il y a deux raisons&nbsp;:</p>
            <ol>
              <li>
                <strong>Les mots-clés.</strong>{' '}
                <Out href={U.HBS_HIDDEN_WORKERS}>Harvard Business School</Out>
                {' '}documente que 88&nbsp;% des employeurs estiment perdre des candidats qualifiés parce que ces derniers n&apos;utilisent pas les termes exacts configurés dans l&apos;ATS. Un CV générique rate ces correspondances, même si l&apos;expérience est pertinente.
              </li>
              <li>
                <strong>Le signal d&apos;intention.</strong> Un CV adapté montre que tu as lu l&apos;offre, compris le rôle, et pris le temps de faire le lien avec ton parcours. Dans un processus où le recruteur reçoit des centaines de candidatures similaires, cela se voit.
              </li>
            </ol>
          </>
        ),
      },
      {
        icon: 'checklist',
        heading: "Ce qu'adapter un CV veut vraiment dire",
        body: (
          <>
            <p>Adapter son CV ne signifie pas tout réécrire. Dans la pratique, c&apos;est&nbsp;:</p>
            <ul>
              <li>
                Changer le titre pour qu&apos;il corresponde exactement au titre du poste dans l&apos;offre (
                <Out href={U.JOBSCAN_TAILOR}>Jobscan</Out>
                {' '}
                : ×3,5 sur le taux d&apos;entretien)
              </li>
              <li>Réordonner les compétences pour mettre en avant celles explicitement mentionnées dans l&apos;offre</li>
              <li>Ajuster les bullet points d&apos;expérience pour utiliser le vocabulaire de l&apos;offre (ex.&nbsp;: si l&apos;offre dit «&nbsp;pilotage de projets&nbsp;», ton CV doit dire «&nbsp;pilotage de projets&nbsp;», pas «&nbsp;gestion de projets&nbsp;»)</li>
              <li>Adapter le résumé introductif pour l&apos;ancrer dans le contexte de l&apos;entreprise et du poste</li>
            </ul>
          </>
        ),
      },
      {
        icon: 'clock',
        heading: 'Le coût de la personnalisation',
        body: (
          <p>
            Le frein principal, c&apos;est le temps. Adapter un CV manuellement pour chaque offre prend en moyenne 45 à 60 minutes. Sur 20 candidatures, c&apos;est 15 à 20 heures. C&apos;est là que les outils d&apos;IA entrent en jeu&nbsp;: en analysant l&apos;offre et en adaptant automatiquement le CV, ils réduisent ce temps à quelques minutes - sans changer le fond, en optimisant la forme et les mots-clés.
          </p>
        ),
      },
      {
        icon: 'sparkles',
        heading: 'Comment ça marche avec AxeL Job ?',
        body: (
          <>
            <p>
              Tu renseignes ton profil une fois (expériences, formation, compétences). Pour chaque candidature, tu colles le texte de l&apos;annonce. L&apos;IA adapte ton CV&nbsp;: résumé reformulé avec les mots-clés de l&apos;offre, expériences réordonnées ou mises en avant, formulations alignées sur l&apos;annonce. Tu gardes le contrôle, tu peux modifier avant d&apos;exporter en PDF.
            </p>
            <p>
              Peu d&apos;outils proposent une <strong>adaptation automatique du contenu à chaque annonce</strong> - c&apos;est ce que fait AxeL Job. Tu n&apos;as pas à copier-coller les mots-clés toi-même&nbsp;; l&apos;IA les intègre de façon naturelle à partir du texte de l&apos;offre.
            </p>
          </>
        ),
      },
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
      prose={article.prose}
    />
  );
}
