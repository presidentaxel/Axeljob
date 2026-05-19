import { useState } from 'react';

function getCompanyLogoUrl(companyName) {
  if (!companyName || typeof companyName !== 'string') return null;
  try {
    const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
    const path = `/api/company-logo?company=${encodeURIComponent(companyName.trim())}`;
    return base ? `${base}${path}` : path;
  } catch {
    return null;
  }
}

export default function CompanyLogo({ companyName, className, size = 40 }) {
  const [failed, setFailed] = useState(false);
  const url = getCompanyLogoUrl(companyName);
  const initial = (companyName || '?').trim().charAt(0).toUpperCase();
  if (failed || !url) {
    return (
      <div className={`company-logo-fallback ${className || ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={className}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  );
}
