import { useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/AuthForm.css';

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
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
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
      <input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="auth-input"
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
      />
      {error && <div className="auth-error">{error}</div>}
      {message && <div className="auth-message">{message}</div>}
      <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
        {loading ? '…' : isSignUp ? 'Créer un compte' : 'Se connecter'}
      </button>
      <button type="button" className="auth-toggle" onClick={() => { setIsSignUp((v) => !v); setError(''); setMessage(''); }}>
        {isSignUp ? 'Déjà un compte ? Se connecter' : 'Pas de compte ? Créer un compte'}
      </button>
    </form>
  );
}
