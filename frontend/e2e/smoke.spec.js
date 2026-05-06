import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('la page d’accueil charge et le titre mentionne AxeL Job', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AxeL Job/i);
  });

  test('la route /login affiche le formulaire de connexion', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /AxeL Job/i })).toBeVisible();
  });

  test('parcours adaptation: endpoint adapt mocké joignable', async ({ page }) => {
    await page.route('**/api/adapt', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, adaptation_id: 'mock_adapt_1' }),
      });
    });
    await page.goto('/');
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: 'mock annonce' }),
      });
      return r.status;
    });
    expect(status).toBe(200);
  });

  test('parcours export PDF: endpoint pdf mocké joignable', async ({ page }) => {
    await page.route('**/api/pdf', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="cv.pdf"',
          'X-CV-PDF-Engine': 'weasyprint',
        },
        body: '%PDF-1.4 mock',
      });
    });
    await page.goto('/');
    const status = await page.evaluate(async () => {
      const r = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return r.status;
    });
    expect(status).toBe(200);
  });

  test('parcours paiement: endpoint checkout mocké joignable', async ({ page }) => {
    await page.route('**/api/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://checkout.stripe.test/session_123' }),
      });
    });
    await page.goto('/');
    const payload = await page.evaluate(async () => {
      const r = await fetch('/api/create-checkout-session', { method: 'POST' });
      return r.json();
    });
    expect(payload.url).toContain('checkout.stripe.test');
  });
});
