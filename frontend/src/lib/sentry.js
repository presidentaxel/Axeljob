/**
 * Sentry SPA (AXE-368). Hors CMP. DSN vide = no-op.
 * Environment = VITE_SENTRY_ENVIRONMENT (pas MODE, leçon AXE-271). Replay off.
 */
import * as Sentry from '@sentry/react';
import { scrubBreadcrumb, scrubEvent, tracesSampleRate } from './sentryScrub.js';

export function sentryDsn() {
  return String(import.meta.env.VITE_SENTRY_DSN || '').trim();
}

export function sentryEnvironment() {
  return String(import.meta.env.VITE_SENTRY_ENVIRONMENT || '').trim() || 'production';
}

export function initSentry() {
  const dsn = sentryDsn();
  if (!dsn) return false;
  const environment = sentryEnvironment();
  Sentry.init({
    dsn,
    environment,
    release: String(import.meta.env.VITE_SENTRY_RELEASE || '').trim() || undefined,
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(
      environment,
      import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE,
    ),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  return true;
}

export function captureSentryException(error, errorInfo) {
  if (!sentryDsn()) return;
  Sentry.captureException(error, {
    extra: errorInfo ? { componentStack: errorInfo.componentStack } : undefined,
  });
}
