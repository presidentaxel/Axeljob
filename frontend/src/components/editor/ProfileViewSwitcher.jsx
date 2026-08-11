import { lazy, Suspense, useLayoutEffect } from 'react';

import ProfileView from '../ProfileView';
import { purgeLegacyBetaFullscreenBodyClass } from '../../lib/betaEditorFullscreen.js';
import { useBetaMode } from '../../lib/useBetaMode.js';

const CvEditorBeta = lazy(() =>
  import('./CvEditorBetaView.jsx').then((mod) => {
    const Component = mod.default;
    if (typeof Component !== 'function') {
      throw new Error(
        'CvEditorBetaView: export default manquant. Rechargez la page (Ctrl+Shift+R).',
      );
    }
    return { default: Component };
  }),
);

/**
 * Aiguillage `/app/profil` Stable <-> Beta.
 *
 * Tant que le toggle Beta de la topbar est OFF (par defaut), on rend
 * `ProfileView` (parcours actuel : formulaires + apercu PDF). Quand il
 * est ON, on rend `CvEditorBeta` (nouvelle experience d edition inline).
 *
 * Le chunk `ProfileViewSwitcher` (lazy dans App.jsx) charge CvEditorBetaView
 * en lazy separe pour un export default fiable sous Vite HMR.
 *
 * Ce switcher est la seule porte d entree de `/app/profil` (App.jsx
 * appelle uniquement `<ProfileViewSwitcher>`) : ainsi App.jsx ne sait
 * pas qu il y a deux modes, et la migration future (suppression du
 * mode stable, par exemple) se fait en un seul endroit.
 */
export default function ProfileViewSwitcher(props) {
  const [betaEnabled] = useBetaMode();

  // Anciennes builds ajoutaient `cv-editor-beta-fullscreen` sur <body> :
  // on nettoie une fois au montage pour ne pas masquer les page-header.
  useLayoutEffect(() => {
    purgeLegacyBetaFullscreenBodyClass();
  }, []);

  if (!betaEnabled) {
    return <ProfileView {...props} />;
  }
  return (
    <Suspense fallback={<div className="cv-editor-beta cv-editor-beta--loading"><p>Chargement de l’éditeur Beta…</p></div>}>
      <CvEditorBeta {...props} />
    </Suspense>
  );
}
