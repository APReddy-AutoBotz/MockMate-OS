import { test, expect } from '@playwright/test';

const openLogin = async (page: any) => {
  await page.goto('/');
  await page.getByRole('button', { name: /get started|start practicing|sign in/i }).first().click();
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
};

test.describe('Authentication surface', () => {
  test('shows the current sign-in controls', async ({ page }) => {
    await openLogin(page);
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
  });

  test('switches between sign-in and account creation without stale legacy fields', async ({ page }) => {
    await openLogin(page);
    await page.getByRole('button', { name: /need an account\? sign up/i }).click();
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /register/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /have an account\? sign in/i })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('preserves accessible labels for hosted auth automation', async ({ page }) => {
    await openLogin(page);
    await expect(page.locator('form[aria-label="Sign in"]')).toBeVisible();
    await page.getByRole('button', { name: /need an account\? sign up/i }).click();
    await expect(page.locator('form[aria-label="Create account"]')).toBeVisible();
  });
});
