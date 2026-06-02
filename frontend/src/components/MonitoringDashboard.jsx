import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiGet } from '../api';
import { HiChartBarSquare } from 'react-icons/hi2';

const DAY_OPTIONS = [7, 14, 30];

function formatBytes(n) {
  if (n == null || Number.isNaN(n)) return '-';
  const mb = n / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} Go`;
  return `${mb.toFixed(1)} Mo`;
}

/**
 * Tableau de bord réservé aux admins (SUPPORT_ADMIN_EMAILS / SUPPORT_EMAIL).
 */
export default function MonitoringDashboard({ usage }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState(null);
  const [news, setNews] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const [s, n] = await Promise.all([
        apiGet(`/api/admin/monitoring/summary?days=${days}`),
        apiGet('/api/admin/monitoring/news'),
      ]);
      setSummary(s);
      setNews(n);
    } catch (e) {
      if (e.status === 403) {
        setError("Tu n'as pas accès à cette page.");
      } else {
        setError(e.message || 'Chargement impossible.');
      }
      setSummary(null);
      setNews(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!usage?.is_support) return;
    load();
  }, [usage?.is_support, load]);

  // Ne rediriger que si l’URL est vraiment /app/monitoring : le composant est monté sur toutes les vues
  // (panneau display:none), sinon chaque setUsage(…) renvoyait les non-admins vers /app/cv.
  useEffect(() => {
    if (!usage || usage.is_support) return;
    if (!location.pathname.startsWith('/app/monitoring')) return;
    navigate('/app/cv', { replace: true });
  }, [usage, navigate, location.pathname]);

  if (!usage?.is_support) {
    return null;
  }

  const fileAgg = summary?.events_from_log_files;
  const dbAgg = summary?.events_from_database;
  const bde = summary?.bde_cashback;
  const health = summary?.health;
  const prom = summary?.prometheus;
  const op = summary?.operational;
  const users = op?.users;
  const sys = op?.system;
  const proc = op?.process;
  const cap = op?.capacity_estimate;
  const http = op?.http_since_process_start;
  const dbPing = op?.database_ping;
  const alerts = op?.alerts;

  const renderBars = (agg) => {
    if (!agg?.by_type || typeof agg.by_type !== 'object') return <p className="monitoring-muted">Aucune donnée pour cette période.</p>;
    const entries = Object.entries(agg.by_type).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...entries.map(([, n]) => n), 1);
    return (
      <ul className="monitoring-bar-list">
        {entries.map(([name, count]) => (
          <li key={name} className="monitoring-bar-row">
            <span className="monitoring-bar-label" title={name}>
              {name}
            </span>
            <div className="monitoring-bar-track">
              <div className="monitoring-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="monitoring-bar-count">{count}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="monitoring-page">
      <div className="support-hero monitoring-hero">
        <h1 className="support-hero-title">
          <HiChartBarSquare className="monitoring-hero-icon" aria-hidden />
          Monitoring
        </h1>
        <p className="support-hero-subtitle">
          Charge API, droplet, utilisateurs, erreurs et alertes email. Données du worker courant + Prometheus pour l’historique.
        </p>
      </div>

      <div className="page-content monitoring-content">
        <div className="monitoring-toolbar">
          <label className="monitoring-days-label">
            Période (événements produit)
            <select className="input-field monitoring-days-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} jours
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn-secondary monitoring-refresh" onClick={load} disabled={loading}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>

        {error && <p className="monitoring-error">{error}</p>}

        {!loading && !error && summary && (
          <>
            {!op && (
              <p className="monitoring-muted">
                Le backend ne renvoie pas encore le bloc <code className="monitoring-code">operational</code> - déploie la dernière version de l’API.
              </p>
            )}
            {op && (
            <>
            <section className="monitoring-section">
              <h2 className="support-section-title">Utilisateurs &amp; capacité (estimation)</h2>
              <p className="monitoring-muted">
                {users?.note}
              </p>
              <div className="monitoring-cards">
                <div className="monitoring-card">
                  <h3>Inscrits (auth.users)</h3>
                  <p className="monitoring-card-metric">{users?.registered_total != null ? users.registered_total : '-'}</p>
                  <p className="monitoring-muted">Requiert SUPABASE_DATABASE_URL</p>
                </div>
                <div className="monitoring-card">
                  <h3>Actifs (TTL)</h3>
                  <p className="monitoring-card-metric">{users?.active_distinct_subs ?? 0}</p>
                  <p className="monitoring-muted">Fenêtre {Math.round((users?.active_with_jwt_ttl_sec ?? 0) / 60)} min · JWT sur requêtes API</p>
                </div>
                <div className="monitoring-card">
                  <h3>Pic actifs</h3>
                  <p className="monitoring-card-metric">{users?.peak_active_distinct_subs ?? 0}</p>
                  <p className="monitoring-muted">Depuis redémarrage du worker</p>
                </div>
                <div className="monitoring-card monitoring-card--wide">
                  <h3>Capacité indicative</h3>
                  <p className="monitoring-card-metric">
                    {cap?.estimated_max_active_users_at_target_cpu != null
                      ? `~${cap.estimated_max_active_users_at_target_cpu} actifs @ ${cap.target_cpu_percent}% CPU`
                      : '-'}
                  </p>
                  {cap?.samples_in_window > 0 && (
                    <p className="monitoring-muted" style={{ marginTop: '0.35rem', fontSize: '0.8125rem' }}>
                      {cap.samples_in_window} mesure{cap.samples_in_window > 1 ? 's' : ''} en fenêtre
                      {cap.ema_estimate != null && ` · EMA ~${cap.ema_estimate}`}
                      {cap.window_median_estimate != null && ` · médiane ~${cap.window_median_estimate}`}
                      {cap.instant_estimate != null && ` · instantané ~${cap.instant_estimate}`}
                      {cap.idle_cpu_baseline_percent != null &&
                        ` · plateau idle ~${cap.idle_cpu_baseline_percent}% retiré`}
                    </p>
                  )}
                  <p className="monitoring-muted">{cap?.note}</p>
                </div>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">Droplet &amp; processus API</h2>
              <div className="monitoring-cards">
                <div className="monitoring-card">
                  <h3>CPU système</h3>
                  <p className="monitoring-card-metric">{sys?.system_cpu_percent != null ? `${sys.system_cpu_percent}%` : '-'}</p>
                  <p className="monitoring-muted">{sys?.psutil_available ? 'psutil OK' : 'psutil indisponible - pip install psutil'}</p>
                </div>
                <div className="monitoring-card">
                  <h3>CPU processus</h3>
                  <p className="monitoring-card-metric">{sys?.process_cpu_percent != null ? `${sys.process_cpu_percent}%` : '-'}</p>
                </div>
                <div className="monitoring-card">
                  <h3>RAM système</h3>
                  <p className="monitoring-card-metric">{sys?.system_memory_used_percent != null ? `${sys.system_memory_used_percent}%` : '-'}</p>
                  {sys?.system_swap_used_percent != null && sys.system_swap_used_percent > 0 && (
                    <p className="monitoring-muted">Swap {sys.system_swap_used_percent}%</p>
                  )}
                </div>
                <div className="monitoring-card">
                  <h3>Load (1 min)</h3>
                  <p className="monitoring-card-metric">
                    {sys?.system_load1 != null && sys.system_load1 > 0 ? sys.system_load1 : '-'}
                  </p>
                  <p className="monitoring-muted">Unix uniquement · Prometheus : cv_bot_system_load1</p>
                </div>
                <div className="monitoring-card">
                  <h3>RSS processus</h3>
                  <p className="monitoring-card-metric">{formatBytes(sys?.process_rss_bytes)}</p>
                </div>
                <div className="monitoring-card">
                  <h3>Threads / FDs</h3>
                  <p className="monitoring-card-metric">
                    {sys?.process_threads != null ? sys.process_threads : '-'}
                    <span className="monitoring-muted"> · </span>
                    {sys?.process_open_fds != null ? sys.process_open_fds : '-'}
                  </p>
                  <p className="monitoring-muted">Mémoire virtuelle {formatBytes(sys?.process_virtual_memory_bytes)}</p>
                </div>
                <div className="monitoring-card">
                  <h3>Uptime worker</h3>
                  <p className="monitoring-card-metric">{proc?.uptime_human || `${proc?.uptime_sec ?? 0}s`}</p>
                </div>
                <div className="monitoring-card">
                  <h3>Requêtes simultanées</h3>
                  <p className="monitoring-card-metric">{proc?.inflight_requests ?? 0}</p>
                  <p className="monitoring-muted">Pic {proc?.max_concurrent_requests ?? 0}</p>
                </div>
                <div className="monitoring-card monitoring-card--wide">
                  <h3>Base (ping)</h3>
                  <p className="monitoring-card-metric">
                    {dbPing?.ok == null ? 'N/A' : dbPing.ok ? 'OK' : 'Échec'}
                  </p>
                  <p className="monitoring-muted">
                    {dbPing?.latency_ms != null ? `${dbPing.latency_ms} ms` : ''}
                    {dbPing?.last_check_ts ? ` · dernier check ${new Date(dbPing.last_check_ts * 1000).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">HTTP par route (depuis redémarrage)</h2>
              <p className="monitoring-muted">
                Durée moyenne par endpoint (template FastAPI). Prometheus :{' '}
                <code className="monitoring-code">cv_bot_http_request_duration_seconds</code>, tailles{' '}
                <code className="monitoring-code">cv_bot_http_request_content_length_bytes</code> /{' '}
                <code className="monitoring-code">cv_bot_http_response_content_length_bytes</code>, capacité{' '}
                <code className="monitoring-code">cv_bot_capacity_estimated_max_active_users</code>.
              </p>
              <div className="monitoring-table-wrap">
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Requêtes</th>
                      <th>Durée moy.</th>
                      <th>Total durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(http?.top_routes || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="monitoring-muted">Aucune requête encore sur ce worker.</td>
                      </tr>
                    )}
                    {(http?.top_routes || []).map((row) => (
                      <tr key={row.route}>
                        <td className="monitoring-table-route" title={row.route}>{row.route}</td>
                        <td>{row.requests}</td>
                        <td>{row.avg_duration_sec}s</td>
                        <td>{row.total_duration_sec}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">Fenêtres glissantes (erreurs &amp; lenteur)</h2>
              <div className="monitoring-split">
                <div className="monitoring-split-col">
                  <h3 className="monitoring-subhead">5 minutes</h3>
                  <pre className="monitoring-pre">{JSON.stringify(http?.last_5m || {}, null, 2)}</pre>
                </div>
                <div className="monitoring-split-col">
                  <h3 className="monitoring-subhead">15 minutes</h3>
                  <pre className="monitoring-pre">{JSON.stringify(http?.last_15m || {}, null, 2)}</pre>
                </div>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">Alertes email (Resend)</h2>
              <p className="monitoring-muted">
                Active avec <code className="monitoring-code">MONITORING_ALERT_ENABLED=1</code>, destinataires{' '}
                <code className="monitoring-code">MONITORING_ALERT_EMAILS</code> (sinon premier admin support). Même{' '}
                <code className="monitoring-code">RESEND_API_KEY</code> que le reste de l’app.
              </p>
              <p className="monitoring-muted">
                État :{' '}
                <strong>{alerts?.enabled ? 'activé' : 'désactivé'}</strong>
              </p>
              <pre className="monitoring-pre">{JSON.stringify(alerts?.config || {}, null, 2)}</pre>
              <h3 className="monitoring-subhead" style={{ marginTop: '1rem' }}>Derniers événements (mémoire worker)</h3>
              {(alerts?.last_events || []).length === 0 ? (
                <p className="monitoring-muted">Aucune alerte enregistrée sur ce processus.</p>
              ) : (
                <ul className="monitoring-news-list">
                  {(alerts.last_events || []).slice().reverse().map((ev) => (
                    <li key={`${ev.ts}-${ev.kind}`} className="monitoring-news-card">
                      <div className="monitoring-news-meta">
                        <span className="monitoring-news-date">{ev.kind}</span>
                        <span className="monitoring-news-date">{ev.ts}</span>
                      </div>
                      <p className="monitoring-news-summary">{ev.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </>
            )}

            <section className="monitoring-section">
              <h2 className="support-section-title">Santé &amp; configuration</h2>
              <div className="monitoring-cards">
                <div className="monitoring-card">
                  <h3>API</h3>
                  <p className="monitoring-card-metric">{health?.status || '-'}</p>
                  <p className="monitoring-muted">
                    {health?.production ? 'Production' : 'Non-production'} · workers async: {health?.thread_pool_max_workers ?? '-'}
                  </p>
                </div>
                <div className="monitoring-card">
                  <h3>Données</h3>
                  <p className="monitoring-card-metric">{health?.supabase?.backend || '-'}</p>
                  <pre className="monitoring-pre">{JSON.stringify(health?.supabase || {}, null, 2)}</pre>
                </div>
                <div className="monitoring-card monitoring-card--wide">
                  <h3>Prometheus</h3>
                  <p className="monitoring-muted">
                    Chemin <code className="monitoring-code">{prom?.path}</code>
                    {prom?.protected ? ' (protégé par jeton)' : ' (sans jeton - risqué en prod)'}
                  </p>
                  <p className="monitoring-hint">{prom?.hint}</p>
                </div>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">Événements produit</h2>
              <div className="monitoring-split">
                <div className="monitoring-split-col">
                  <h3 className="monitoring-subhead">
                    Fichiers logs <span className="monitoring-badge">{fileAgg?.source}</span>
                  </h3>
                  <p className="monitoring-muted">
                    Total {fileAgg?.events_total ?? 0}
                    {fileAgg?.truncated ? ' (tronqué)' : ''} · utilisateurs anonymisés ~{fileAgg?.unique_anon_users ?? 0}
                  </p>
                  {renderBars(fileAgg)}
                </div>
                <div className="monitoring-split-col">
                  <h3 className="monitoring-subhead">
                    Base Supabase (PG) <span className="monitoring-badge">{dbAgg ? dbAgg.source : 'indisponible'}</span>
                  </h3>
                  {dbAgg ? (
                    <>
                      <p className="monitoring-muted">
                        Total {dbAgg.events_total} · utilisateurs anonymisés ~{dbAgg.unique_anon_users}
                      </p>
                      {renderBars(dbAgg)}
                    </>
                  ) : (
                    <p className="monitoring-muted">
                      Actif seulement si <code className="monitoring-code">SUPABASE_DATABASE_URL</code> est configuré (accès PG direct).
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="monitoring-section">
              <h2 className="support-section-title">Affiliation BDE (cashback)</h2>
              {!bde ? (
                <p className="monitoring-muted">
                  Disponible seulement avec <code className="monitoring-code">SUPABASE_DATABASE_URL</code> (agrégat SQL).
                </p>
              ) : (
                <>
                  <div className="monitoring-cards">
                    <div className="monitoring-card">
                      <h3>Clients attribués</h3>
                      <p className="monitoring-card-metric">{bde.total_referred_users ?? 0}</p>
                    </div>
                    <div className="monitoring-card">
                      <h3>Clients Pro</h3>
                      <p className="monitoring-card-metric">{bde.total_pro_users ?? 0}</p>
                    </div>
                    <div className="monitoring-card monitoring-card--wide">
                      <h3>Montant total dû</h3>
                      <p className="monitoring-card-metric">{(bde.total_amount_due_eur ?? 0).toFixed(2)} €</p>
                      <p className="monitoring-muted">
                        Calculé sur les comptes actuellement en plan Pro (période {bde.period_days} jours).
                      </p>
                      {bde.config_error && (
                        <p className="monitoring-error">Fichier de règles cashback invalide côté serveur.</p>
                      )}
                    </div>
                  </div>
                  <div className="monitoring-table-wrap" style={{ marginTop: '0.8rem' }}>
                    <table className="monitoring-table">
                      <thead>
                        <tr>
                          <th>Code BDE</th>
                          <th>Clients attribués</th>
                          <th>Clients Pro</th>
                          <th>Taux</th>
                          <th>Montant dû</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(bde.rows || []).length === 0 && (
                          <tr>
                            <td colSpan={5} className="monitoring-muted">Aucune attribution sur la période.</td>
                          </tr>
                        )}
                        {(bde.rows || []).map((row) => (
                          <tr key={row.partner_code}>
                            <td className="monitoring-table-route">{row.partner_code}</td>
                            <td>{row.referred_users}</td>
                            <td>{row.pro_users}</td>
                            <td>{Number(row.cashback_rate_eur || 0).toFixed(2)} €</td>
                            <td>{Number(row.amount_due_eur || 0).toFixed(2)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {!loading && !error && news && (
          <section className="monitoring-section">
            <h2 className="support-section-title">Actualités</h2>
            {news.note && <p className="monitoring-muted">{news.note}</p>}
            {news.error && <p className="monitoring-error">{news.error}</p>}
            {news.items?.length === 0 && !news.error && <p className="monitoring-muted">Aucune entrée pour le moment.</p>}
            <ul className="monitoring-news-list">
              {(news.items || []).map((item) => (
                <li key={item.id || item.title} className="monitoring-news-card">
                  <div className="monitoring-news-meta">
                    <span className="monitoring-news-date">{item.date || '-'}</span>
                    {item.link ? (
                      <a href={item.link} target="_blank" rel="noopener noreferrer" className="monitoring-news-link">
                        Lien
                      </a>
                    ) : null}
                  </div>
                  <h3 className="monitoring-news-title">{item.title}</h3>
                  <p className="monitoring-news-summary">{item.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
