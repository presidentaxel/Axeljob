import { useState } from 'react';
import { apiPost } from '../api';

/**
 * Saisie code promo / concours dans le menu compte (topbar).
 */
export default function TopbarPromoCode({ onSuccess }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Entre un code.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost('/api/promo/redeem', { code: trimmed });
      setMessage(res?.message || 'Code appliqué.');
      setCode('');
      onSuccess?.(res);
    } catch (err) {
      setError(err?.message || err?.detail || 'Code refusé.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="topbar-account-promo" onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
      <label className="topbar-account-promo-label" htmlFor="topbar-promo-code-input">
        Code promo ou concours
      </label>
      <div className="topbar-account-promo-row">
        <input
          id="topbar-promo-code-input"
          type="text"
          className="input-field topbar-account-promo-input"
          placeholder="Ex. WELCOME3"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          maxLength={32}
        />
        <button type="submit" className="btn btn-secondary btn-sm topbar-account-promo-btn" disabled={loading}>
          {loading ? '…' : 'OK'}
        </button>
      </div>
      {error && (
        <p className="topbar-account-promo-feedback topbar-account-promo-feedback--error" role="alert">
          {error}
        </p>
      )}
      {message && !error && (
        <p className="topbar-account-promo-feedback topbar-account-promo-feedback--ok" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
