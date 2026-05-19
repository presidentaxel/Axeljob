import { lazy, Suspense } from 'react';

import ProfileView from '../ProfileView';
import { useBetaMode } from '../../lib/useBetaMode.js';

/**
 * Aiguillage `/app/profil` Stable <-> Beta.
 *
 * Tant que le toggle Beta de la topbar est OFF (par defaut), on rend
 * `ProfileView` (parcours actuel : formulaires + apercu PDF). Quand il
 * est ON, on rend `CvEditorBeta` (nouvelle experience d edition inline).
 *
 * Le composant Beta est charge en lazy pour ne pas embarquer son code
 * dans le bundle initial des users qui n ont pas opte pour la beta.
 *
 * Ce switcher est la seule porte d entree de `/app/profil` (App.jsx
 * appelle uniquement `<ProfileViewSwitcher>`) : ainsi App.jsx ne sait
 * pas qu il y a deux modes, et la migration future (suppression du
 * mode stable, par exemple) se fait en un seul endroit.
 */
const CvEditorBeta = lazy(() => import('./CvEditorBeta.jsx'));

export default function ProfileViewSwitcher(props) {
  const [betaEnabled] = useBetaMode();
  if (!betaEnabled) {
    return <ProfileView {...props} />;
  }
  return (
    <Suspense fallback={<div className="cv-editor-beta cv-editor-beta--loading"><p>Chargement de l’éditeur Beta…</p></div>}>
      <CvEditorBeta {...props} />
    </Suspense>
  );
}
