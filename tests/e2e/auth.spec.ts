import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('MockMate');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Login');
  });

  test('should show validation errors for empty form', async ({ page }) => {
    await page.click('button[type="submit"]');
    
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('[data-testid="login-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="login-error"]')).toContainText('Login failed');
  });

  test('should navigate to signup when clicking signup link', async ({ page }) => {
    await page.click('[data-testid="signup-link"]');
    
    await expect(page.locator('h2')).toContainText('Create Account');
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
  });

  test('should show password strength indicator', async ({ page }) => {
    await page.click('[data-testid="signup-link"]');
    await page.fill('input[name="password"]', 'weak');
    
    await expect(page.locator('[data-testid="password-strength"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-strength"]')).toContainText('Weak');
    
    await page.fill('input[name="password"]', 'StrongP@ssw0rd123!');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText('Strong');
  });

  test('should show error for mismatched passwords', async ({ page }) => {
    await page.click('[data-testid="signup-link"]');
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Different123!');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('[data-testid="confirm-password-error"]')).toBeVisible();
  });

  test('should allow password reset', async ({ page }) => {
    await page.click('[data-testid="forgot-password"]');
    
    await expect(page.locator('h2')).toContainText('Reset Password');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Send Reset Link');
  });

  test('should remember login if checkbox checked', async ({ page }) => {
    await page.check('[data-testid="remember-me"]');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    
    // Check if remember me functionality is working
    const rememberMeChecked = await page.isChecked('[data-testid="remember-me"]');
    expect(rememberMeChecked).toBe(true);
  });
});
