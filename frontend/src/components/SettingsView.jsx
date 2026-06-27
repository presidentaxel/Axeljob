import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost } from '../api';
import { supabase } from '../lib/supabase';
import { STORAGE_PDF_EXPORT_FILENAME_PATTERN } from '../constants';
import {
  buildAdaptedPdfFilename,
  DEFAULT_PDF_EXPORT_FILENAME_PATTERN,
} from '../lib/pdfExportFilename';
import BetaModeToggle from './BetaModeToggle.jsx';
import '../styles/app/settings.css';

const PDF_VARIABLES = ['{prenom}', '{nom}', '{poste}', '{entreprise}'];

/**
 * Page Paramètres : compte, export PDF, éditeur Beta, confidentialité.
 */
export default function SettingsView({ session, onCookieSettingsClick }) {
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

  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [setPasswordNew, setSetPasswordNew] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const pdfPatternInputRef = useRef(null);
  const messageTimerRef = useRef(null);

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

  const accountEmail = session?.user?.email || '—';

  return (
    <div className="settings-page">
      {message && <div className="settings-toast settings-toast--success" role="status">{message}</div>}
      {error && <div className="settings-toast settings-toast--error" role="alert">{error}</div>}

      <section className="settings-card" aria-labelledby="settings-account-title">
        <h2 id="settings-account-title" className="settings-card__title">Compte</h2>
        <p className="settings-card__lead">Identité de connexion et accès sécurisé.</p>
        <dl className="settings-meta">
          <dt>Email</dt>
          <dd>{accountEmail}</dd>
        </dl>
        <hr className="settings-divider" />
        <p className="settings-card__lead">
          Définis un mot de passe pour te connecter par email en plus du lien magique ou de Google / LinkedIn.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSetPasswordOpen(true);
              setSetPasswordNew('');
              setSetPasswordConfirm('');
              setSetPasswordError('');
            }}
          >
            Définir ou modifier mon mot de passe
          </button>
        </div>
        <hr className="settings-divider" />
        <p className="settings-card__lead">
          Invite quelqu&apos;un qui n&apos;a pas encore de compte — un email d&apos;inscription lui sera envoyé.
        </p>
        <form
          className="settings-actions settings-actions--inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setInviteError('');
            setError('');
            if (!inviteEmail.trim()) return;
            setInviteLoading(true);
            try {
              await apiPost('/api/invite', { email: inviteEmail.trim() });
              showSuccess(`Invitation envoyée à ${inviteEmail.trim()}`);
              setInviteEmail('');
            } catch (err) {
              setInviteError(err?.message || err?.detail || 'Impossible d\'envoyer l\'invitation.');
            } finally {
              setInviteLoading(false);
            }
          }}
        >
          <label className="settings-field">
            <span className="settings-field-hint">Email de l&apos;invité</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@exemple.fr"
              autoComplete="email"
            />
          </label>
          <button type="submit" className="btn btn-secondary btn-sm" disabled={inviteLoading}>
            {inviteLoading ? 'Envoi…' : 'Inviter'}
          </button>
        </form>
        {inviteError && <p className="settings-error">{inviteError}</p>}
      </section>

      <section className="settings-card" aria-labelledby="settings-export-title">
        <h2 id="settings-export-title" className="settings-card__title">Export PDF</h2>
        <p className="settings-card__lead">
          Lors de l&apos;enregistrement d&apos;un CV adapté, le navigateur propose un nom de fichier basé sur ce modèle.
          Tu peux toujours le modifier dans la fenêtre d&apos;enregistrement.
        </p>
        <label className="settings-field">
          Modèle du nom de fichier
          <input
            ref={pdfPatternInputRef}
            type="text"
            value={pdfPattern}
            onChange={(e) => setPdfPattern(e.target.value)}
            spellCheck={false}
            aria-describedby="settings-pdf-preview"
          />
        </label>
        <div className="settings-chips" aria-label="Variables disponibles">
          {PDF_VARIABLES.map((token) => (
            <button
              key={token}
              type="button"
              className="settings-chip"
              onClick={() => insertPdfVariable(token)}
            >
              {token}
            </button>
          ))}
        </div>
        <p id="settings-pdf-preview" className="settings-preview">
          Aperçu avec ton profil
          <code>{profileLoading ? '…' : pdfExportFilenameExample}</code>
        </p>
        <div className="settings-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={savePdfPattern}>
            Enregistrer le modèle
          </button>
          <button
            type="button"
            className="btn btn-tertiary btn-sm"
            onClick={() => setPdfPattern(DEFAULT_PDF_EXPORT_FILENAME_PATTERN)}
          >
            Réinitialiser
          </button>
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-editor-title">
        <h2 id="settings-editor-title" className="settings-card__title">Éditeur</h2>
        <div className="settings-row">
          <div className="settings-row__text">
            <strong>Mode Beta</strong>
            <p>
              Éditeur canvas libre, score ATS et nouvelle barre d&apos;outils. Réversible à tout moment
              (identique au switch dans la barre du haut).
            </p>
          </div>
          <BetaModeToggle />
        </div>
      </section>

      <section className="settings-card" aria-labelledby="settings-privacy-title">
        <h2 id="settings-privacy-title" className="settings-card__title">Confidentialité</h2>
        <p className="settings-card__lead">
          Gère tes préférences cookies et consulte les documents légaux.
        </p>
        <div className="settings-actions">
          {typeof onCookieSettingsClick === 'function' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCookieSettingsClick}>
              Paramètres cookies
            </button>
          )}
        </div>
        <nav className="settings-links" aria-label="Documents légaux">
          <Link to="/confidentialite">Politique de confidentialité</Link>
          <Link to="/cgu">Conditions d&apos;utilisation</Link>
          <Link to="/mentions-legales">Mentions légales</Link>
        </nav>
      </section>

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
            <p className="settings-card__lead">
              Tu pourras te connecter avec ton email et ce mot de passe, en plus des autres méthodes.
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSetPasswordError('');
                if (setPasswordNew.length < 6) {
                  setSetPasswordError('Le mot de passe doit faire au moins 6 caractères.');
                  return;
                }
                if (setPasswordNew !== setPasswordConfirm) {
                  setSetPasswordError('Les deux mots de passe ne correspondent pas.');
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
                  type="password"
                  value={setPasswordNew}
                  onChange={(e) => setSetPasswordNew(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                />
              </label>
              <label className="settings-field">
                Confirmer
                <input
                  type="password"
                  value={setPasswordConfirm}
                  onChange={(e) => setSetPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                />
              </label>
              {setPasswordError && <p className="settings-error">{setPasswordError}</p>}
              <div className="settings-modal__actions">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={
                    setPasswordLoading
                    || setPasswordNew.length < 6
                    || setPasswordNew !== setPasswordConfirm
                  }
                >
                  {setPasswordLoading ? '…' : 'Enregistrer'}
                </button>
                <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setSetPasswordOpen(false)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
