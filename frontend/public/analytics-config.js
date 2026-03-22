/**
 * Configuration mesure d’audience (Google Tag Manager).
 *
 * 1. Créez un conteneur sur https://tagmanager.google.com
 * 2. Remplacez la valeur ci-dessous par votre ID (format GTM-XXXXXXX).
 * 3. Dans GTM, ajoutez une balise « Google tag » ou « Google Analytics : configuration GA4 »
 *    avec l’ID de mesure G-7524WTRGSY, et activez le mode consentement (Consent Mode v2)
 *    pour que les balises ne s’exécutent qu’après consentement analytics_storage / ad_*.
 *
 * Tant que l’ID n’est pas un vrai GTM-…, le script ne charge pas GTM (évite les erreurs en dev).
 */
window.__AXEL_GTM_ID__ = 'GTM-XXXXXXX';
