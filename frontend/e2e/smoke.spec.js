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
});
