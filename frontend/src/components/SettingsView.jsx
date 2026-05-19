import { useState, useEffect, useMemo, useRef } from 'react';
import { apiGet, apiPost } from '../api';
import { supabase } from '../lib/supabase';
import { buildAdaptedPdfFilename } from '../lib/pdfExportFilename';
import '../styles/ProfileView.css';

function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`profile-section profile-section--collapsible ${open ? 'open' : 'closed'}`}>
      <button type="button" className="profile-section-toggle" onClick={() => setOpen((v) => !v)}>
        <span className="profile-section-toggle-text">
          <h2>{title}</h2>
        </span>
        <svg className={`profile-chevron ${open ? 'profile-chevron--open' : ''}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && <div className="profile-section-body">{children}</div>}
    </section>
  );
}

/**
 * Page Settings : regroupe Compte & sécurité (mot de passe, invitation) et Export du CV adapté (PDF).
 * Une fetch légère de /api/cv?profile=1 sert uniquement à composer l'exemple de nom de fichier PDF.
 */
export default function SettingsView({ session }) {
  const [profileBasics, setProfileBasics] = useState({ prenom: '', nom: '', titre_professionnel: '' });
  const [profileLoading, setProfileLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [setPasswordOpen, setSetPasswordOpen] = useState(false);
  const [setPasswordNew, setSetPasswordNew] = useState('');
  const [setPasswordConfirm, setSetPasswordConfirm] = useState('');
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [setPasswordError, setSetPasswordError] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

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
      .catch(() => {
        /* silencieux : l'exemple PDF tombera sur des valeurs par défaut. */
      })
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
    setMessage(text);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setMessage(''), 5000);
  };

  const pdfExportFilenameExample = useMemo(
    () => buildAdaptedPdfFilename('', {
      prenom: profileBasics.prenom,
      nom: profileBasics.nom,
      poste: profileBasics.titre_professionnel || 'Intitulé du poste',
      entreprise: 'Entreprise',
    }),
    [profileBasics.prenom, profileBasics.nom, profileBasics.titre_professionnel],
  );

  return (
    <div className="profile-view">
      {message && <div className="profile-toast profile-toast--success" role="status">{message}</div>}
      {error && <div className="profile-toast profile-toast--error" role="alert">{error}</div>}

      <CollapsibleSection title="Compte et sécurité" defaultOpen={true}>
        <p className="profile-section-desc">Gère la sécurité de ton compte (mot de passe, invitations).</p>
        <div className="profile-set-password-block">
          <p className="profile-section-desc">Tu peux définir un mot de passe pour te connecter aussi par email et mot de passe (utile si tu n&apos;utilises que le lien magique ou Google/LinkedIn).</p>
          <button type="button" className="btn btn-secondary" onClick={() => { setSetPasswordOpen(true); setSetPasswordNew(''); setSetPasswordConfirm(''); setSetPasswordError(''); }}>
            Définir ou modifier mon mot de passe
          </button>
        </div>
        {setPasswordOpen && (
          <div className="profile-change-email-overlay" onClick={() => setSetPasswordOpen(false)} role="dialog" aria-modal="true">
            <div className="profile-change-email-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Définir un mot de passe</h3>
              <p className="profile-change-email-hint">Tu pourras ensuite te connecter avec ton email et ce mot de passe en plus du lien magique ou des réseaux sociaux.</p>
              <form onSubmit={async (e) => {
                e.preventDefault();
                setSetPasswordError('');
                if (setPasswordNew.length < 6) { setSetPasswordError('Le mot de passe doit faire au moins 6 caractères.'); return; }
                if (setPasswordNew !== setPasswordConfirm) { setSetPasswordError('Les deux mots de passe ne correspondent pas.'); return; }
                setSetPasswordLoading(true);
                try {
                  const { error: updateErr } = await supabase.auth.updateUser({ password: setPasswordNew });
                  if (updateErr) throw updateErr;
                  showSuccess('Mot de passe enregistré. Tu peux maintenant te connecter avec ton email et ce mot de passe.');
                  setSetPasswordOpen(false);
                } catch (err) {
                  setSetPasswordError(err?.message || 'Impossible de définir le mot de passe.');
                } finally {
                  setSetPasswordLoading(false);
                }
              }}>
                <label>Nouveau mot de passe <input type="password" value={setPasswordNew} onChange={(e) => setSetPasswordNew(e.target.value)} placeholder="••••••••" className="auth-input" autoComplete="new-password" minLength={6} /></label>
                <label>Confirmer le mot de passe <input type="password" value={setPasswordConfirm} onChange={(e) => setSetPasswordConfirm(e.target.value)} placeholder="••••••••" className="auth-input" autoComplete="new-password" minLength={6} /></label>
                {setPasswordError && <div className="auth-error">{setPasswordError}</div>}
                <div className="reauth-actions">
                  <button type="submit" className="btn btn-primary" disabled={setPasswordLoading || setPasswordNew.length < 6 || setPasswordNew !== setPasswordConfirm}>{setPasswordLoading ? '…' : 'Enregistrer le mot de passe'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSetPasswordOpen(false)}>Annuler</button>
                </div>
              </form>
            </div>
          </div>
        )}
        <div className="profile-invite-block">
          <p className="profile-section-desc">Invite une personne qui n&apos;a pas encore de compte : elle recevra un email avec un lien pour s&apos;inscrire.</p>
          <form
            className="profile-invite-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setInviteError('');
              setError('');
              if (!inviteEmail.trim()) return;
              setInviteLoading(true);
              try {
                await apiPost('/api/invite', { email: inviteEmail.trim() });
                showSuccess('Invitation envoyée par email à ' + inviteEmail.trim());
                setInviteEmail('');
              } catch (err) {
                setInviteError(err?.message || err?.detail || 'Impossible d\'envoyer l\'invitation.');
              } finally {
                setInviteLoading(false);
              }
            }}
          >
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@exemple.fr" className="auth-input" />
            <button type="submit" className="btn btn-secondary" disabled={inviteLoading}>{inviteLoading ? 'Envoi…' : 'Inviter par email'}</button>
          </form>
          {inviteError && <div className="auth-error">{inviteError}</div>}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Export du CV adapté (PDF)" defaultOpen={true}>
        <p className="profile-section-desc">
          Depuis l&apos;onglet CV, quand tu enregistres le PDF du CV <strong>adapté</strong> à une offre, le navigateur ouvre
          la fenêtre d&apos;enregistrement avec un <strong>nom déjà proposé</strong> (ton prénom, nom et l&apos;intitulé de l&apos;offre).
          Tu peux le modifier ou choisir un autre dossier à ce moment-là, comme pour n&apos;importe quel téléchargement.
        </p>
        <p className="profile-export-pdf-preview" role="status">
          <strong>Exemple de nom suggéré</strong> (avec ton profil et un intitulé fictif)&nbsp;:{' '}
          <span className="profile-export-filename-ex">
            {profileLoading ? '…' : pdfExportFilenameExample}
          </span>
        </p>
      </CollapsibleSection>
    </div>
  );
}
