import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { HiDocumentText, HiClipboardDocumentList, HiPencilSquare, HiChatBubbleLeftRight, HiChartBarSquare } from 'react-icons/hi2';

/**
 * Barre de navigation workspace /app/* (séparée du shell pour lisibilité d’App.jsx).
 */
export default function AppTopbar({
  session,
  usage,
  checkoutLoading,
  onUpgradeClick,
  onProBadgeClick,
  onSignOutClick,
  onCookieSettingsClick,
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountWrapRef = useRef(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (accountWrapRef.current && !accountWrapRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <img src="/favicon.svg" alt="AxeL Job" className="topbar-logo" />
        <span className="topbar-brand">AxeL Job</span>
      </div>
      <nav className="topbar-nav">
        <NavLink to="/app/cv" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
          <HiDocumentText size={18} />
          <span>Adapter CV</span>
        </NavLink>
        <NavLink to="/app/postule" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
          <HiClipboardDocumentList size={18} />
          <span>Candidatures</span>
        </NavLink>
        <NavLink to="/app/profil" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
          <HiPencilSquare size={18} />
          <span>Profil</span>
        </NavLink>
        <NavLink to="/app/support" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
          <HiChatBubbleLeftRight size={18} />
          <span>Support</span>
        </NavLink>
        {usage?.is_support && (
          <NavLink to="/app/monitoring" className={({ isActive }) => `topbar-link ${isActive ? 'active' : ''}`}>
            <HiChartBarSquare size={18} />
            <span>Monitoring</span>
          </NavLink>
        )}
      </nav>
      <div className="topbar-right">
        {session && usage && usage.plan !== 'pro' && (
          <button type="button" className="topbar-upgrade-btn" onClick={onUpgradeClick} disabled={checkoutLoading}>
            {checkoutLoading ? '…' : 'Passer Pro'}
          </button>
        )}
        {session && usage && usage.plan === 'pro' && (
          <button type="button" className="topbar-pro-badge" onClick={onProBadgeClick}>
            Pro
          </button>
        )}
        {session && (
          <div className="topbar-account-wrap" ref={accountWrapRef}>
            <button
              type="button"
              className="topbar-user-btn"
              onClick={() => setAccountMenuOpen((o) => !o)}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-controls="topbar-account-menu"
              title="Compte et déconnexion"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/></svg>
            </button>
            {accountMenuOpen && (
              <div id="topbar-account-menu" className="topbar-account-menu" role="menu" aria-label="Compte">
                <button
                  type="button"
                  className="topbar-account-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onCookieSettingsClick?.();
                  }}
                >
                  Paramètres cookies
                </button>
                <div className="topbar-account-menu-sep" role="separator" />
                <button
                  type="button"
                  className="topbar-account-menu-item topbar-account-menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    onSignOutClick();
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
