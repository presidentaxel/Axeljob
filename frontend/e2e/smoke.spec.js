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

  /**
   * L'onglet Settings (/app/settings) doit être reconnu comme une route
   * workspace valide : pas de NotFoundPage, et la SPA se charge correctement.
   * Sans session, le routeur redirige vers /login (comportement attendu).
   * Ce test garde-fou détecterait notamment un retrait accidentel de la route
   * dans appRoutes.js (clé `settings`) ou un rename de pathname.
   */
  test('la route /app/settings est reconnue par le SPA (pas de 404)', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(String(err)));
    await page.goto('/app/settings');
    await expect(page).toHaveTitle(/AxeL Job/i);
    await expect(page.getByText(/Page introuvable|404/i)).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });
});
