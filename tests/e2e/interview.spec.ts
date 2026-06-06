import { test, expect } from '@playwright/test';

test.describe('Interview Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.goto('/');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should start new interview session', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    await expect(page.locator('h1')).toContainText('Interview Session');
    await expect(page.locator('[data-testid="question-display"]')).toBeVisible();
    await expect(page.locator('[data-testid="response-input"]')).toBeVisible();
  });

  test('should display onboarding for new users', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Check if onboarding appears for first-time users
    const onboardingVisible = await page.locator('[data-testid="onboarding"]').isVisible();
    if (onboardingVisible) {
      await expect(page.locator('[data-testid="target-role-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="experience-select"]')).toBeVisible();
      
      await page.fill('[data-testid="target-role-input"]', 'Software Engineer');
      await page.selectOption('[data-testid="experience-select"]', 'mid');
      await page.click('[data-testid="continue-button"]');
    }
  });

  test('should show question and allow response', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Wait for question to load
    await page.waitForSelector('[data-testid="question-text"]');
    const questionText = await page.textContent('[data-testid="question-text"]');
    expect(questionText).toBeTruthy();
    expect(questionText!.length).toBeGreaterThan(10);
    
    // Test response input
    await page.fill('[data-testid="response-input"]', 'This is my response to the question.');
    await expect(page.locator('[data-testid="response-input"]')).toHaveValue('This is my response to the question.');
  });

  test('should handle voice recording', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Mock microphone permission
    await page.context().grantPermissions(['microphone']);
    
    await page.click('[data-testid="start-recording"]');
    await expect(page.locator('[data-testid="recording-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="stop-recording"]')).toBeVisible();
    
    await page.click('[data-testid="stop-recording"]');
    await expect(page.locator('[data-testid="transcript-display"]')).toBeVisible();
  });

  test('should provide real-time feedback', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    await page.fill('[data-testid="response-input"]', 'I have extensive experience in this area and have successfully led multiple projects.');
    await page.click('[data-testid="submit-response"]');
    
    // Check for feedback indicators
    await expect(page.locator('[data-testid="feedback-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="confidence-score"]')).toBeVisible();
    await expect(page.locator("[data-testid='sentiment-analysis']")).toBeVisible();
  });

  test('should navigate between questions', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Submit first response
    await page.fill('[data-testid="response-input"]', 'My response to the first question.');
    await page.click('[data-testid="submit-response"]');
    
    // Wait for next question
    await page.waitForSelector('[data-testid="question-text"]');
    
    // Check question counter
    const questionCounter = await page.textContent('[data-testid="question-counter"]');
    expect(questionCounter).toMatch(/Question 2 of \d+/);
    
    // Test skip functionality
    await page.click('[data-testid="skip-question"]');
    await page.waitForSelector('[data-testid="question-text"]');
  });

  test('should complete interview and show report', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Complete multiple questions (simulate)
    for (let i = 0; i < 3; i++) {
      await page.waitForSelector('[data-testid="question-text"]');
      await page.fill('[data-testid="response-input"]', `Response to question ${i + 1}`);
      await page.click('[data-testid="submit-response"]');
      
      // Wait a moment for processing
      await page.waitForTimeout(1000);
      
      if (i < 2) {
        await page.click('[data-testid="next-question"]');
      }
    }
    
    // End session
    await page.click('[data-testid="end-session"]');
    
    // Check report generation
    await expect(page.locator('h1')).toContainText('Interview Report');
    await expect(page.locator('[data-testid="overall-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="readiness-level"]')).toBeVisible();
    await expect(page.locator('[data-testid="strengths-section"]')).toBeVisible();
    await expect(page.locator("[data-testid='improvements-section']")).toBeVisible();
  });

  test('should allow downloading report', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Complete a quick session
    await page.waitForSelector('[data-testid="question-text"]');
    await page.fill('[data-testid="response-input"]', 'Complete response for testing.');
    await page.click('[data-testid="submit-response"]');
    await page.click('[data-testid="end-session"]');
    
    // Wait for report to load
    await page.waitForSelector('[data-testid="download-report"]');
    
    // Test download functionality
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-report"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/.*\.pdf$/);
  });

  test('should handle session interruption', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    await page.waitForSelector('[data-testid="question-text"]');
    await page.fill('[data-testid="response-input"]', 'Partial response...');
    
    // Navigate away
    await page.goto('/dashboard');
    
    // Check for session recovery prompt
    const recoveryPrompt = await page.locator('[data-testid="session-recovery"]').isVisible();
    if (recoveryPrompt) {
      await expect(page.locator('[data-testid="resume-session"]')).toBeVisible();
      await expect(page.locator("[data-testid='start-new']")).toBeVisible();
    }
  });

  test('should display timer and handle time limits', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    await expect(page.locator('[data-testid="timer"]')).toBeVisible();
    
    // Check initial time
    const initialTime = await page.textContent('[data-testid="timer"]');
    expect(initialTime).toMatch(/\d+:\d+/);
    
    // Wait for timer to count down
    await page.waitForTimeout(2000);
    
    const updatedTime = await page.textContent('[data-testid="timer"]');
    expect(updatedTime).not.toBe(initialTime);
  });

  test('should adapt difficulty based on performance', async ({ page }) => {
    await page.click('[data-testid="start-new-session"]');
    
    // Submit high-quality responses
    const responses = [
      'I have extensive experience in this area with multiple successful projects.',
      'My approach involves systematic analysis and strategic planning.',
      'I consistently deliver results that exceed expectations and drive innovation.'
    ];
    
    for (const response of responses) {
      await page.waitForSelector('[data-testid="question-text"]');
      await page.fill('[data-testid="response-input"]', response);
      await page.click('[data-testid="submit-response"]');
      await page.waitForTimeout(1000);
    }
    
    // Check if difficulty indicator updates
    const difficultyIndicator = await page.locator('[data-testid="difficulty-indicator"]');
    if (await difficultyIndicator.isVisible()) {
      const difficulty = await difficultyIndicator.textContent();
      expect(difficulty).toMatch(/Easy|Medium|Hard/);
    }
  });
});
