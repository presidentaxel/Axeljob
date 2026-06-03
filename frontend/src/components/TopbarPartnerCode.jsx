import { useState } from 'react';
import { apiPost } from '../api';

/**
 * Saisie code partenaire / concours (menu compte).
 * Les liens taggés (UTM + partner_code) restent le canal principal ; ce champ sert de secours.
 */
export default function TopbarPartnerCode({ onSuccess }) {
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
      setError('Saisis le code reçu.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost('/api/promo/redeem', { code: trimmed });
      setMessage(res?.message || 'Code enregistré.');
      setCode('');
      onSuccess?.(res);
    } catch (err) {
      setError(err?.message || err?.detail || 'Code non reconnu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="topbar-account-code" onClick={(e) => e.stopPropagation()}>
      <p className="topbar-account-code-hint">Code partenaire ou concours</p>
      <form className="topbar-account-code-form" onSubmit={handleSubmit}>
        <input
          id="topbar-partner-code-input"
          type="text"
          className="topbar-account-code-input"
          placeholder="Ex. BDE_PARIS"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={loading}
          maxLength={32}
          aria-label="Code partenaire ou concours"
        />
        <button
          type="submit"
          className="topbar-account-code-submit"
          disabled={loading || !code.trim()}
        >
          {loading ? '…' : 'Valider'}
        </button>
      </form>
      {(error || message) && (
        <p
          className={`topbar-account-code-feedback${error ? ' topbar-account-code-feedback--error' : ' topbar-account-code-feedback--ok'}`}
          role={error ? 'alert' : 'status'}
        >
          {error || message}
        </p>
      )}
    </div>
  );
}
