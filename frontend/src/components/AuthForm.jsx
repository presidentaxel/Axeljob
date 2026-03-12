import { useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/AuthForm.css';

function GoogleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function LinkedInIcon({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

export default function AuthForm({ onSuccess, linkedInOnly = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined,
        },
      });
      if (err) throw err;
    } catch (err) {
      setError(err.message || 'Connexion Google impossible.');
      setGoogleLoading(false);
    }
  };

  const handleLinkedIn = async () => {
    setError('');
    setLinkedInLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'linkedin_oidc',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined,
        },
      });
      if (err) throw err;
    } catch (err) {
      setError(err.message || 'Connexion LinkedIn impossible.');
      setLinkedInLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError('Entre ton email pour réinitialiser le mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: typeof window !== 'undefined' ? window.location.origin + '/login' : undefined,
      });
      if (err) throw err;
      setMessage('Email de réinitialisation envoyé. Vérifie ta boîte mail.');
    } catch (err) {
      setError(err.message || 'Impossible d\'envoyer l\'email.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (resetMode) return handleResetPassword(e);
    if (!email.trim() || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        setMessage('Compte créé. Vérifie ta boîte mail pour confirmer (si activé par le projet).');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        onSuccess?.();
      }
    } catch (err) {
      setError(err.message || 'Erreur connexion.');
    } finally {
      setLoading(false);
    }
  };

  if (linkedInOnly) {
    return (
      <div className="auth-form auth-form-linkedin-only">
        <button
          type="button"
          className="auth-linkedin-btn"
          onClick={handleLinkedIn}
          disabled={linkedInLoading}
        >
          <LinkedInIcon />
          <span>{linkedInLoading ? 'Redirection…' : 'Continuer avec LinkedIn'}</span>
        </button>
        {error && <div className="auth-error">{error}</div>}
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <button
        type="button"
        className="auth-google-btn"
        onClick={handleGoogle}
        disabled={googleLoading}
      >
        <GoogleIcon />
        <span>{googleLoading ? 'Redirection…' : 'Continuer avec Google'}</span>
      </button>
      <button
        type="button"
        className="auth-linkedin-btn"
        onClick={handleLinkedIn}
        disabled={linkedInLoading}
      >
        <LinkedInIcon />
        <span>{linkedInLoading ? 'Redirection…' : 'Continuer avec LinkedIn'}</span>
      </button>
      <span className="auth-divider">ou</span>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="auth-input"
        autoComplete="email"
      />
      {!resetMode && (
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />
      )}
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-message">{message}</div>}
      <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
        {loading ? '…' : resetMode ? 'Envoyer le lien' : isSignUp ? 'Créer un compte' : 'Se connecter'}
      </button>
      {!resetMode && (
        <button type="button" className="auth-toggle" onClick={() => { setResetMode(true); setError(''); setMessage(''); }}>
          Mot de passe oublié ?
        </button>
      )}
      <button type="button" className="auth-toggle" onClick={() => { setIsSignUp((v) => !v); setResetMode(false); setError(''); setMessage(''); }}>
        {resetMode ? '← Retour à la connexion' : isSignUp ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer un compte'}
      </button>
    </form>
  );
}
