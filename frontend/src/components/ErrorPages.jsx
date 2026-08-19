import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from './ui/Button.jsx';

function setNoindexFollow() {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', 'noindex, follow');
}

/** Page 404 - routes SPA inconnues */
export function NotFoundPage() {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = 'Page introuvable (404) | AxeL Job';
    setNoindexFollow();
  }, []);
  return (
    <div className="login-screen">
      <div className="login-screen-card" style={{ textAlign: 'center' }}>
        <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>
          Erreur 404
        </p>
        <h1>Page introuvable</h1>
        <p className="login-screen-intro">
          Cette adresse n&apos;existe pas ou a été déplacée. Vérifie l&apos;URL ou reviens à l&apos;accueil.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
          <Button variant="primary" onClick={() => navigate('/')}>
            Accueil
          </Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Page précédente
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Page 500 - erreur React non gérée (Error Boundary) */
export function ServerErrorPage({ onRetry }) {
  useEffect(() => {
    document.title = 'Erreur (500) | AxeL Job';
    setNoindexFollow();
  }, []);
  return (
    <div className="login-screen">
      <div className="login-screen-card" style={{ textAlign: 'center' }}>
        <img src="/favicon.svg" alt="AxeL Job" className="login-screen-logo" />
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.875rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em' }}>
          Erreur
        </p>
        <h1>Un problème est survenu</h1>
        <p className="login-screen-intro">
          L&apos;application a rencontré une erreur inattendue. Tu peux réessayer ou recharger la page.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
          {typeof onRetry === 'function' && (
            <Button variant="primary" onClick={onRetry}>
              Réessayer
            </Button>
          )}
          <Button variant="secondary" onClick={() => window.location.assign('/')}>
            Recharger l&apos;accueil
          </Button>
        </div>
      </div>
    </div>
  );
}
