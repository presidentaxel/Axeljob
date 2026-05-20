/**
 * Bibliothèque d icônes hi2 pour le canvas (noms exportés react-icons/hi2).
 */
export const CANVAS_ICON_ENTRIES = Object.freeze([
  { name: 'HiPhone', label: 'Téléphone' },
  { name: 'HiEnvelope', label: 'Email' },
  { name: 'HiLink', label: 'Lien' },
  { name: 'HiMapPin', label: 'Lieu' },
  { name: 'HiCalendar', label: 'Calendrier' },
  { name: 'HiBriefcase', label: 'Mallette' },
  { name: 'HiAcademicCap', label: 'Formation' },
  { name: 'HiStar', label: 'Étoile' },
  { name: 'HiHeart', label: 'Cœur' },
  { name: 'HiLightBulb', label: 'Idée' },
  { name: 'HiChartBar', label: 'Graphique' },
  { name: 'HiCodeBracket', label: 'Code' },
  { name: 'HiGlobeAlt', label: 'Web' },
  { name: 'HiLanguage', label: 'Langue' },
  { name: 'HiUser', label: 'Profil' },
  { name: 'HiUsers', label: 'Équipe' },
  { name: 'HiBuildingOffice', label: 'Entreprise' },
  { name: 'HiRocketLaunch', label: 'Lancement' },
  { name: 'HiCheckBadge', label: 'Validé' },
  { name: 'HiShieldCheck', label: 'Sécurité' },
  { name: 'HiWrench', label: 'Outil' },
  { name: 'HiCog6Tooth', label: 'Réglage' },
  { name: 'HiCamera', label: 'Photo' },
  { name: 'HiDocumentText', label: 'Document' },
]);

export function createIconBlockPreset(iconName, color = '#1e293b') {
  return {
    type: 'icon',
    icon_name: iconName,
    w: 10,
    h: 10,
    style: { color },
  };
}
