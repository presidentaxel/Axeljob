import { useState } from 'react';
import '../styles/AuthForm.css';
import Button from './ui/Button.jsx';
import Input from './ui/Input.jsx';

/**
 * Modal de réauthentification : demande le mot de passe (ou ré-auth) avant une action sensible.
 * Pour les comptes email : vérifie via signInWithPassword.
 * onConfirm(password) est appelé après vérification réussie ; onCancel pour fermer.
 */
export default function ReauthModal({ title = 'Confirmer ton identité', message = 'Entre ton mot de passe pour continuer.', onConfirm, onCancel }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!password.trim()) {
      setError('Mot de passe requis.');
      return;
    }
    setLoading(true);
    try {
      await onConfirm(password);
      onCancel();
    } catch (err) {
      setError(err.message || 'Mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="reauth-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="reauth-title">
      <div className="reauth-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="reauth-title" className="reauth-title">{title}</h2>
        <p className="reauth-message">{message}</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            autoComplete="current-password"
          />
          {error && <div className="auth-error">{error}</div>}
          <div className="reauth-actions">
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? '…' : 'Confirmer'}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
