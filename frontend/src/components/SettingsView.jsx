import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api';
import { supabase } from '../lib/supabase';
import {
  STORAGE_EXPORT_DIR,
  STORAGE_PDF_EXPORT_FILENAME_PATTERN,
  STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE,
  STORAGE_PDF_EXPORT_START_DIR_LABEL,
} from '../constants';
import {
  buildAdaptedPdfFilename,
  DEFAULT_PDF_EXPORT_FILENAME_PATTERN,
} from '../lib/pdfExportFilename';
import {
  clearCanvasLayoutDrafts,
  clearLayoutProposals,
  clearUserCanvasImageLibrary,
  getLocalDataSummary,
  resetEditorHints,
  resetGuidedTours,
} from '../lib/settingsLocalData.js';
import BetaModeToggle from './BetaModeToggle.jsx';
import Button from './ui/Button.jsx';
import '../styles/app/settings.css';

const PDF_VARIABLES = ['{prenom}', '{nom}', '{poste}', '{entreprise}'];

const SETTINGS_NAV = [
  { id: 'settings-account', label: 'Compte' },
  { id: 'settings-plan', label: 'Abonnement', when: (usage) => Boolean(usage) },
  { id: 'settings-export', label: 'Export PDF' },
  { id: 'settings-cv', label: 'CV & modèle' },
  { id: 'settings-editor', label: 'Éditeur' },
  { id: 'settings-local', label: 'Données locales' },
  { id: 'settings-nav', label: 'Raccourcis' },
  { id: 'settings-privacy', label: 'Confidentialité' },
];

function SettingsSection({ id, title, lead, children }) {
  const sectionId = id.replace(/-title$/, '');
  return (
    <section
      id={sectionId}
      className="settings-section"
      aria-labelledby={id}
    >
      <h2 id={id} className="settings-section__title">{title}</h2>
      {lead && <p className="settings-section__lead">{lead}</p>}
      {children}
    </section>
  );
}

function SettingsListRow({ label, detail, onClear, disabled, actionLabel = 'Effacer' }) {
  return (
    <div className="settings-list-row">
      <div className="settings-list-row__text">
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </div>
      <Button type="button" variant="tertiary" size="sm" onClick={onClear} disabled={disabled}>
        {actionLabel}
      </Button>
    </div>
  );
}

/**
 * Page Paramètres : compte, abonnement, export, éditeur, données locales.
 */
export default function SettingsView({
  session,
  usage,
  templateId,
  templatesList = [],
  onUpgradeClick,
  onBillingPortalClick,
  onCookieSettingsClick,
}) {
  const [profileBasics, setProfileBasics] = useState({ prenom: '', nom: '', titre_professionnel: '' });
  const [profileLoading, setProfileLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [pdfPattern, setPdfPattern] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_PDF_EXPORT_FILENAME_PATTERN)
        || DEFAULT_PDF_EXPORT_FILENAME_PATTERN;
    } catch {
      return DEFAULT_PDF_EXPORT_FILENAME_PATTERN;
    }
  });

  const [exportDossier, setExportDossier] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_EXPORT_DIR) || '';
    } catch {
      return '';
    }
  });

  const exportDirLabel = useMemo(() => {
    try {
      return localStorage.getItem(STORAGE_PDF_EXPORT_START_DIR_LABEL) || '';
    } catch {
      return '';
    }
  }, []);

  const [localSummary, setLocalSummary] = useState(() => getLocalDataSummary());

  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [setPasswordNew, setSetPasswordNew] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');

  const pdfPatternInputRef = useRef(null);
  const messageTimerRef = useRef(null);
  const stackRef = useRef(null);
  const [activeSectionId, setActiveSectionId] = useState('settings-account');

  const navItems = useMemo(
    () => SETTINGS_NAV.filter((item) => !item.when || item.when(usage)),
    [usage],
  );

  const refreshLocalSummary = useCallback(() => {
    setLocalSummary(getLocalDataSummary());
  }, []);

  useEffect(() => {
    if (!navItems.length) return undefined;
    if (!navItems.some((item) => item.id === activeSectionId)) {
      setActiveSectionId(navItems[0].id);
    }
    return undefined;
  }, [navItems, activeSectionId]);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack || !navItems.length) return undefined;

    const sections = navItems
      .map((item) => document.getElementById(item.id))
      .filter(Boolean);
    if (!sections.length) return undefined;

    const root = stack.closest('.app-page');
    const ratios = new Map();

    const pickActive = () => {
      let bestId = navItems[0].id;
      let bestRatio = -1;
      for (const section of sections) {
        const ratio = ratios.get(section.id) ?? 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = section.id;
        }
      }
      if (bestRatio <= 0) {
        // Fallback : première section dont le top est au-dessus du milieu du root
        const rootTop = root ? root.getBoundingClientRect().top : 0;
        const midpoint = rootTop + (root ? root.clientHeight * 0.28 : 120);
        for (const section of sections) {
          const top = section.getBoundingClientRect().top;
          if (top <= midpoint) bestId = section.id;
        }
      }
      setActiveSectionId((prev) => (prev === bestId ? prev : bestId));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        pickActive();
      },
      {
        root: root || null,
        rootMargin: '-12% 0px -62% 0px',
        threshold: [0, 0.08, 0.2, 0.35, 0.5, 0.75, 1],
      },
    );

    sections.forEach((section) => observer.observe(section));
    pickActive();
    return () => observer.disconnect();
  }, [navItems]);

  const scrollToSection = useCallback((sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveSectionId(sectionId);
    try {
      window.history.replaceState(null, '', `#${sectionId}`);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash || !navItems.some((item) => item.id === hash)) return undefined;
    const t = window.setTimeout(() => scrollToSection(hash), 0);
    return () => window.clearTimeout(t);
  }, [navItems, scrollToSection]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setProfileLoading(true);
    apiGet('/api/cv?profile=1')
      .then((data) => {
        if (cancelled || !data) return;
        setProfileBasics({
          prenom: data.prenom || '',
          nom: data.nom || '',
          titre_professionnel: data.titre_professionnel || '',
        });
      })
      .catch(() => { /* aperçu PDF avec valeurs par défaut */ })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => () => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
  }, []);

  const showSuccess = (text) => {
    setError('');
    setMessage(text);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setMessage(''), 5000);
  };

  const templateName = useMemo(() => {
    const t = templatesList.find((x) => x.id === templateId);
    return t?.name || templateId || '-';
  }, [templatesList, templateId]);

  const pdfExportFilenameExample = useMemo(
    () => buildAdaptedPdfFilename(pdfPattern, {
      prenom: profileBasics.prenom,
      nom: profileBasics.nom,
      poste: profileBasics.titre_professionnel || 'Intitulé du poste',
      entreprise: 'Entreprise',
    }),
    [pdfPattern, profileBasics.prenom, profileBasics.nom, profileBasics.titre_professionnel],
  );

  const savePdfPattern = useCallback(() => {
    const trimmed = pdfPattern.trim() || DEFAULT_PDF_EXPORT_FILENAME_PATTERN;
    try {
      localStorage.setItem(STORAGE_PDF_EXPORT_FILENAME_PATTERN, trimmed);
      setPdfPattern(trimmed);
      showSuccess('Modèle de nom PDF enregistré.');
    } catch {
      setError('Impossible d’enregistrer le modèle localement.');
    }
  }, [pdfPattern]);

  const saveExportDossier = useCallback(() => {
    try {
      const trimmed = exportDossier.trim();
      if (trimmed) localStorage.setItem(STORAGE_EXPORT_DIR, trimmed);
      else localStorage.removeItem(STORAGE_EXPORT_DIR);
      showSuccess('Préférence de dossier enregistrée.');
    } catch {
      setError('Impossible d’enregistrer le dossier.');
    }
  }, [exportDossier]);

  const insertPdfVariable = useCallback((token) => {
    const input = pdfPatternInputRef.current;
    if (!input) {
      setPdfPattern((prev) => `${prev}${prev.endsWith(' ') || !prev ? '' : ' '}${token}`);
      return;
    }
    const start = input.selectionStart ?? pdfPattern.length;
    const end = input.selectionEnd ?? start;
    const next = pdfPattern.slice(0, start) + token + pdfPattern.slice(end);
    setPdfPattern(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + token.length;
      input.setSelectionRange(pos, pos);
    });
  }, [pdfPattern]);

  const runLocalClear = useCallback((label, fn) => {
    if (!window.confirm(`Effacer ${label} sur cet appareil ? Cette action est irréversible.`)) return;
    if (fn()) {
      refreshLocalSummary();
      showSuccess(`${label} effacé.`);
    } else {
      setError(`Impossible d’effacer ${label}.`);
    }
  }, [refreshLocalSummary]);

  const accountEmail = session?.user?.email || '-';
  const isPro = usage?.plan === 'pro' || usage?.paywall_disabled;

  return (
    <div className="settings-page">
      {message && <div className="settings-toast settings-toast--success" role="status">{message}</div>}
      {error && <div className="settings-toast settings-toast--error" role="alert">{error}</div>}

      <div className="settings-shell">
        <aside className="settings-rail" aria-label="Sections des paramètres">
          <nav className="settings-rail-nav">
            {navItems.map((item) => {
              const isActive = activeSectionId === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`settings-rail-link${isActive ? ' is-active' : ''}`}
                  aria-current={isActive ? 'true' : undefined}
                  onClick={(e) => {
                    if (
                      e.button !== 0
                      || e.metaKey
                      || e.ctrlKey
                      || e.shiftKey
                      || e.altKey
                    ) return;
                    e.preventDefault();
                    scrollToSection(item.id);
                  }}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <div className="settings-stack" ref={stackRef}>
      <SettingsSection id="settings-account-title" title="Compte" lead="Identité de connexion et accès sécurisé.">
        <dl className="settings-meta">
          <dt>Email</dt>
          <dd>{accountEmail}</dd>
        </dl>
        <div className="settings-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setSetPasswordOpen(true);
              setSetPasswordNew('');
              setSetPasswordConfirm('');
              setSetPasswordError('');
            }}
          >
            Mot de passe
          </Button>
        </div>
      </SettingsSection>

      {usage && (
        <SettingsSection id="settings-plan-title" title="Abonnement">
          <dl className="settings-meta">
            <dt>Plan</dt>
            <dd>
              <span className={`settings-plan-badge ${isPro ? 'settings-plan-badge--pro' : ''}`}>
                {isPro ? 'Pro' : 'Gratuit'}
              </span>
            </dd>
            {usage.adaptations_used != null && (
              <>
                <dt>Adaptations</dt>
                <dd>{usage.adaptations_used}{usage.adaptations_limit ? ` / ${usage.adaptations_limit}` : ''}</dd>
              </>
            )}
          </dl>
          <div className="settings-actions">
            {!isPro && typeof onUpgradeClick === 'function' && (
              <Button type="button" variant="primary" size="sm" onClick={onUpgradeClick}>
                Passer Pro
              </Button>
            )}
            {isPro && usage.stripe_subscription && typeof onBillingPortalClick === 'function' && (
              <Button type="button" variant="secondary" size="sm" onClick={onBillingPortalClick}>
                Gérer l&apos;abonnement
              </Button>
            )}
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        id="settings-export-title"
        title="Export PDF"
        lead="Personnalise le nom de fichier et le dossier suggéré lors de l'enregistrement d'un CV adapté."
      >
        <div className="settings-split">
          <div className="settings-split__col">
            <label className="settings-field">
              Modèle du nom de fichier
              <input
                ref={pdfPatternInputRef}
                className="ds-input"
                type="text"
                value={pdfPattern}
                onChange={(e) => setPdfPattern(e.target.value)}
                spellCheck={false}
              />
            </label>
            <div className="settings-chips" aria-label="Variables">
              {PDF_VARIABLES.map((token) => (
                <button key={token} type="button" className="settings-chip" onClick={() => insertPdfVariable(token)}>
                  {token}
                </button>
              ))}
            </div>
            <p className="settings-preview">
              Aperçu
              <code>{profileLoading ? '…' : pdfExportFilenameExample}</code>
            </p>
            <div className="settings-actions">
              <Button type="button" variant="primary" size="sm" onClick={savePdfPattern}>
                Enregistrer
              </Button>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                onClick={() => setPdfPattern(DEFAULT_PDF_EXPORT_FILENAME_PATTERN)}
              >
                Réinitialiser
              </Button>
            </div>
          </div>
          <div className="settings-split__col">
            <label className="settings-field">
              Dossier d&apos;export (suggestion)
              <input
                className="ds-input"
                type="text"
                value={exportDossier}
                onChange={(e) => setExportDossier(e.target.value)}
                placeholder="Ex. Entreprise - Poste"
                spellCheck={false}
              />
            </label>
            <p className="settings-field-hint">
              Utilisé comme base pour organiser tes exports (mémorisé sur cet appareil).
            </p>
            {exportDirLabel && (
              <p className="settings-field-hint">
                Dernier dossier navigateur&nbsp;: <strong>{exportDirLabel}</strong>
              </p>
            )}
            <div className="settings-actions">
              <Button type="button" variant="secondary" size="sm" onClick={saveExportDossier}>
                Enregistrer le dossier
              </Button>
            </div>
            <hr className="settings-divider" />
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                try {
                  localStorage.removeItem(STORAGE_PRE_EXPORT_TEMPLATE_OPTIONS_DONE);
                  showSuccess('Le panneau de personnalisation réapparaîtra avant le prochain export.');
                } catch {
                  setError('Impossible de réinitialiser cette préférence.');
                }
              }}
            >
              Réafficher la personnalisation avant export
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="settings-cv-title" title="CV & modèle" lead="Couleurs, polices et sections se gèrent dans le profil CV.">
        <dl className="settings-meta">
          <dt>Modèle actif</dt>
          <dd>{templateName}</dd>
        </dl>
        <div className="settings-actions">
          <Button as={Link} to="/app/profil" variant="secondary" size="sm">
            Ouvrir le profil CV
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection id="settings-editor-title" title="Éditeur">
        <div className="settings-row">
          <div className="settings-row__text">
            <strong>Mode Beta</strong>
            <p>Canvas libre, score ATS et barre d&apos;outils avancée.</p>
          </div>
          <BetaModeToggle />
        </div>
      </SettingsSection>

      <SettingsSection
        id="settings-local-title"
        title="Données sur cet appareil"
        lead="Brouillons et caches locaux (non synchronisés entre appareils)."
      >
        <div className="settings-list-grid">
          <div className="settings-list-grid__col">
            <SettingsListRow
              label="Brouillons canvas"
              detail={localSummary.draftCount ? `${localSummary.draftCount} brouillon(s)` : 'Vide'}
              disabled={!localSummary.draftCount}
              onClear={() => runLocalClear('les brouillons canvas', clearCanvasLayoutDrafts)}
            />
            <SettingsListRow
              label="Modèles canvas enregistrés"
              detail={localSummary.proposalCount ? `${localSummary.proposalCount} modèle(s)` : 'Vide'}
              disabled={!localSummary.proposalCount}
              onClear={() => runLocalClear('les modèles canvas', clearLayoutProposals)}
            />
            <SettingsListRow
              label="Bibliothèque d'images"
              detail={localSummary.imageCount ? `${localSummary.imageCount} image(s)` : 'Vide'}
              disabled={!localSummary.imageCount}
              onClear={() => runLocalClear('la bibliothèque d\'images', clearUserCanvasImageLibrary)}
            />
          </div>
          <div className="settings-list-grid__col">
            <hr className="settings-divider settings-divider--mobile-only" />
            <SettingsListRow
              label="Visite guidée"
              detail="Réafficher les astuces au prochain passage"
              onClear={() => {
                if (resetGuidedTours(session?.user?.id)) showSuccess('Visite guidée réinitialisée.');
              }}
            />
            <SettingsListRow
              label="Astuces éditeur"
              detail="Bandeaux d'aide dans l'éditeur Beta"
              onClear={() => {
                if (resetEditorHints()) showSuccess('Astuces éditeur réinitialisées.');
              }}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection id="settings-nav-title" title="Raccourcis">
        <nav className="settings-nav-list" aria-label="Pages de l'application">
          <Link to="/app/cv" className="settings-nav-link">Adapter un CV</Link>
          <Link to="/app/postule" className="settings-nav-link">Mes candidatures</Link>
          <Link to="/app/profil" className="settings-nav-link">Profil CV</Link>
          <Link to="/app/support" className="settings-nav-link">Support</Link>
        </nav>
      </SettingsSection>

      <SettingsSection id="settings-privacy-title" title="Confidentialité" lead="Préférences cookies et documents légaux.">
        {typeof onCookieSettingsClick === 'function' && (
          <div className="settings-actions settings-actions--spaced">
            <Button type="button" variant="secondary" size="sm" onClick={onCookieSettingsClick}>
              Paramètres cookies
            </Button>
          </div>
        )}
        <nav className="settings-links" aria-label="Documents légaux">
          <Link to="/confidentialite">Politique de confidentialité</Link>
          <Link to="/cgu">Conditions d&apos;utilisation</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </SettingsSection>

        </div>
      </div>

      {setPasswordOpen && (
        <div
          className="settings-modal-overlay"
          onClick={() => setSetPasswordOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-password-title"
        >
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="settings-password-title">Définir un mot de passe</h3>
            <p className="settings-section__lead">
              Connexion par email + mot de passe, en plus des autres méthodes.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSetPasswordError('');
                if (setPasswordNew.length < 6) {
                  setSetPasswordError('Au moins 6 caractères.');
                  return;
                }
                if (setPasswordNew !== setPasswordConfirm) {
                  setSetPasswordError('Les mots de passe ne correspondent pas.');
                  return;
                }
                setSetPasswordLoading(true);
                try {
                  const { error: updateErr } = await supabase.auth.updateUser({ password: setPasswordNew });
                  if (updateErr) throw updateErr;
                  showSuccess('Mot de passe enregistré.');
                  setSetPasswordOpen(false);
                } catch (err) {
                  setSetPasswordError(err?.message || 'Impossible de définir le mot de passe.');
                } finally {
                  setSetPasswordLoading(false);
                }
              }}
            >
              <label className="settings-field">
                Nouveau mot de passe
                <input
                  className="ds-input"
                  type="password"
                  value={setPasswordNew}
                  onChange={(e) => setSetPasswordNew(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  aria-invalid={setPasswordError ? 'true' : undefined}
                />
              </label>
              <label className="settings-field">
                Confirmer
                <input
                  className="ds-input"
                  type="password"
                  value={setPasswordConfirm}
                  onChange={(e) => setSetPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  aria-invalid={setPasswordError ? 'true' : undefined}
                />
              </label>
              {setPasswordError && <p className="ds-field-error" role="alert">{setPasswordError}</p>}
              <div className="settings-modal__actions">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={setPasswordLoading}
                  disabled={
                    setPasswordNew.length < 6
                    || setPasswordNew !== setPasswordConfirm
                  }
                >
                  Enregistrer
                </Button>
                <Button type="button" variant="tertiary" size="sm" onClick={() => setSetPasswordOpen(false)}>
                  Annuler
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
