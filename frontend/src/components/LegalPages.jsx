import { Link } from 'react-router-dom';
import { CONTACT_EMAIL } from '../constants';
import ContentScrollToTop from './ContentScrollToTop';
import './LegalPages.css';

const SITE_NAME = 'AxeL Job';
const SITE_URL = 'https://job.axelproject.fr';
const COMPANY_NAME = 'Axel Project';
const HOSTING = 'DigitalOcean, LLC - 101 Avenue of the Americas, New York, NY 10013, États-Unis';

function MentionsLegales() {
  return (
    <>
      <h1>Mentions légales</h1>

      <h2>Éditeur du site</h2>
      <p>
        Le site <strong>{SITE_URL}</strong> est édité par <strong>{COMPANY_NAME}</strong>.
      </p>
      <p>Contact : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>

      <h2>Hébergement</h2>
      <p>{HOSTING}</p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L'ensemble des contenus (textes, images, logos, logiciels) présents sur le site {SITE_NAME} sont protégés
        par le droit de la propriété intellectuelle. Toute reproduction, même partielle, est interdite
        sans autorisation préalable.
      </p>

      <h2>Responsabilité</h2>
      <p>
        {COMPANY_NAME} s'efforce de fournir des informations exactes et à jour. Toutefois, aucune garantie
        n'est donnée quant à l'exactitude ou l'exhaustivité des informations diffusées.
        L'utilisation du service se fait sous la responsabilité de l'utilisateur.
      </p>

      <h2>Cookies</h2>
      <p>
        Le site utilise des cookies strictement nécessaires au fonctionnement du service
        (authentification, préférences, sécurité). D’autres traceurs (mesure d’audience via Google Tag
        Manager / Google Analytics, éventuellement publicité) ne sont déposés qu’avec votre consentement,
        géré depuis la bannière « Cookies » ou le lien « Paramètres cookies ».
      </p>
    </>
  );
}

function PolitiqueConfidentialite() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p><em>Dernière mise à jour : mars 2026</em></p>

      <h2>1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement des données est <strong>{COMPANY_NAME}</strong>,
        joignable à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. Données collectées</h2>
      <p>Nous collectons les données suivantes :</p>
      <ul>
        <li><strong>Données de compte :</strong> adresse e-mail, nom (optionnel), fournies lors de l'inscription via Supabase Auth.</li>
        <li><strong>Données de profil / CV :</strong> informations professionnelles saisies ou importées (expériences, formations, compétences, coordonnées).</li>
        <li><strong>Données de candidatures :</strong> offres d'emploi enregistrées, statuts, documents générés.</li>
        <li><strong>Données de paiement :</strong> gérées exclusivement par Stripe. Nous ne stockons aucun numéro de carte bancaire.</li>
        <li><strong>Données techniques :</strong> logs de connexion, adresse IP (pour la sécurité et le rate-limiting).</li>
      </ul>

      <h2>3. Finalités du traitement</h2>
      <ul>
        <li>Fournir le service de génération et d'adaptation de CV par IA.</li>
        <li>Gérer votre compte utilisateur et vos abonnements.</li>
        <li>Améliorer le service (métriques anonymisées).</li>
        <li>Assurer la sécurité du service.</li>
      </ul>

      <h2>4. Base légale</h2>
      <p>
        Le traitement est fondé sur l'exécution du contrat (fourniture du service) et le consentement
        de l'utilisateur lors de l'inscription.
      </p>

      <h2>5. Partage des données</h2>
      <p>Vos données personnelles ne sont jamais vendues. Elles peuvent être partagées avec :</p>
      <ul>
        <li><strong>Supabase</strong> (hébergement de la base de données et authentification)</li>
        <li><strong>Stripe</strong> (traitement des paiements)</li>
        <li><strong>Google Gemini</strong> (traitement IA - les données envoyées sont limitées au contenu du CV et de l'offre)</li>
        <li><strong>DigitalOcean</strong> (hébergement du serveur)</li>
        <li>
          <strong>Google Ireland Limited</strong> (Google Tag Manager, Google Analytics - mesure d’audience
          et, le cas échéant, publicité ; uniquement si vous y consentez via la bannière cookies)
        </li>
      </ul>

      <h2>6. Durée de conservation</h2>
      <p>
        Les données sont conservées tant que votre compte est actif. Après suppression du compte,
        les données sont effacées sous 30 jours. Les logs techniques sont conservés 12 mois maximum.
      </p>

      <h2>7. Vos droits (RGPD)</h2>
      <p>Conformément au Règlement Général sur la Protection des Données, vous disposez des droits suivants :</p>
      <ul>
        <li>Droit d'accès à vos données</li>
        <li>Droit de rectification</li>
        <li>Droit à l'effacement (« droit à l'oubli »)</li>
        <li>Droit à la portabilité</li>
        <li>Droit d'opposition</li>
        <li>Droit de retirer votre consentement</li>
      </ul>
      <p>
        Pour exercer ces droits, contactez-nous à <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        Nous répondons sous 30 jours.
      </p>

      <h2>8. Cookies et traceurs</h2>
      <p>
        Des cookies et technologies similaires peuvent être utilisés : certains sont strictement nécessaires
        au service (connexion, session, préférences, sécurité) et ne requièrent pas de consentement au sens
        de la directive ePrivacy telle qu’interprétée par la CNIL pour les cookies exemptés.
      </p>
      <p>
        Les traceurs liés à la mesure d’audience (Google Tag Manager, Google Analytics) et, le cas échéant,
        à la publicité, ne sont activés qu’après votre accord, via le bandeau de consentement ou le lien
        « Paramètres cookies ». Vous pouvez retirer ou modifier votre consentement à tout moment ; les choix
        sont mémorisés localement sur votre navigateur (localStorage).
      </p>

      <h2>9. Sécurité</h2>
      <p>
        Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données :
        chiffrement HTTPS, tokens JWT, mots de passe hashés, accès restreint aux bases de données
        (Row Level Security), rate-limiting.
      </p>

      <h2>10. Réclamation</h2>
      <p>
        Si vous estimez que le traitement de vos données n'est pas conforme, vous pouvez introduire
        une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>).
      </p>
    </>
  );
}

function CGU() {
  return (
    <>
      <h1>Conditions Générales d'Utilisation</h1>
      <p><em>Dernière mise à jour : mars 2026</em></p>

      <h2>1. Objet</h2>
      <p>
        Les présentes CGU régissent l'utilisation du service {SITE_NAME} accessible à l'adresse {SITE_URL}.
        En créant un compte, l'utilisateur accepte ces conditions.
      </p>

      <h2>2. Description du service</h2>
      <p>
        {SITE_NAME} est un outil en ligne qui permet de créer, importer et adapter automatiquement
        des CV à des offres d'emploi grâce à l'intelligence artificielle. Le service comprend également
        un suivi de candidatures et la génération de lettres de motivation.
      </p>

      <h2>3. Inscription</h2>
      <p>
        L'inscription est gratuite et nécessite une adresse e-mail valide. L'utilisateur est responsable
        de la confidentialité de ses identifiants de connexion.
      </p>

      <h2>4. Offres et tarifs</h2>
      <ul>
        <li><strong>Offre Gratuite :</strong> 3 adaptations de CV, import de documents, suivi de candidatures, export PDF.</li>
        <li><strong>Offre Pro (10 €/mois) :</strong> adaptations illimitées, lettres de motivation IA, support prioritaire.</li>
      </ul>
      <p>
        Les paiements sont gérés par Stripe. L'abonnement Pro est mensuel et peut être résilié
        à tout moment via le portail de gestion accessible dans l'application. La résiliation prend
        effet à la fin de la période de facturation en cours.
      </p>

      <h2>5. Propriété des contenus</h2>
      <p>
        L'utilisateur conserve la propriété de tous les contenus qu'il saisit ou importe
        (CV, informations personnelles, candidatures). {COMPANY_NAME} ne revendique aucun
        droit sur ces contenus.
      </p>

      <h2>6. Utilisation acceptable</h2>
      <p>L'utilisateur s'engage à ne pas :</p>
      <ul>
        <li>Utiliser le service à des fins illégales ou frauduleuses.</li>
        <li>Tenter d'accéder aux données d'autres utilisateurs.</li>
        <li>Surcharger le service (requêtes abusives, scraping).</li>
        <li>Revendre ou redistribuer le service.</li>
      </ul>

      <h2>7. Limitation de responsabilité</h2>
      <p>
        Le service est fourni « en l'état ». {COMPANY_NAME} ne garantit pas que les CV générés
        par l'IA seront parfaitement adaptés ou exacts. L'utilisateur est responsable de vérifier
        et valider le contenu de ses CV avant envoi.
      </p>
      <p>
        En particulier, bien que l'outil optimise les CV pour les systèmes de filtrage automatique
        des recruteurs (ATS - Applicant Tracking Systems), {COMPANY_NAME} ne garantit pas le
        passage de ces filtres et ne saurait être tenu responsable du résultat des candidatures
        de l'utilisateur.
      </p>
      <p>
        {COMPANY_NAME} ne pourra être tenu responsable de tout dommage indirect lié à l'utilisation
        du service, notamment la perte d'une opportunité d'emploi.
      </p>

      <h2>8. Disponibilité</h2>
      <p>
        {COMPANY_NAME} s'efforce de maintenir le service disponible 24h/24 mais ne garantit pas
        une disponibilité permanente. Des interruptions pour maintenance peuvent survenir.
      </p>

      <h2>9. Modification des CGU</h2>
      <p>
        {COMPANY_NAME} se réserve le droit de modifier les présentes CGU. Les utilisateurs seront
        informés des modifications par e-mail ou notification dans l'application. L'utilisation
        continue du service après modification vaut acceptation.
      </p>

      <h2>10. Résiliation</h2>
      <p>
        L'utilisateur peut supprimer son compte à tout moment. {COMPANY_NAME} se réserve le droit
        de suspendre ou supprimer un compte en cas de violation des présentes CGU.
      </p>

      <h2>11. Droit applicable</h2>
      <p>
        Les présentes CGU sont régies par le droit français. En cas de litige, les tribunaux
        compétents seront ceux du ressort du siège de {COMPANY_NAME}.
      </p>

      <h2>12. Contact</h2>
      <p>
        Pour toute question concernant ces CGU : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}

const PAGES = {
  'mentions-legales': MentionsLegales,
  'confidentialite': PolitiqueConfidentialite,
  'cgu': CGU,
};

export default function LegalPages({ page, onBack }) {
  const PageComponent = PAGES[page];
  if (!PageComponent) return null;

  return (
    <div className="legal-page">
      <header className="legal-header">
        <div className="legal-container">
          <Link to="/" className="legal-back" onClick={(e) => { e.preventDefault(); onBack(); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            Retour à l'accueil
          </Link>
        </div>
      </header>
      <main className="legal-container legal-content">
        <PageComponent />
      </main>
      <footer className="legal-footer">
        <div className="legal-container">
          <nav className="legal-footer-nav">
            <Link to="/mentions-legales">Mentions légales</Link>
            <Link to="/confidentialite">Confidentialité</Link>
            <Link to="/cgu">CGU</Link>
          </nav>
        </div>
      </footer>
      <ContentScrollToTop />
    </div>
  );
}
