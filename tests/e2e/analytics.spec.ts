import { test, expect } from '@playwright/test';

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication and setup
    await page.goto('/');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should display analytics dashboard', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await expect(page.locator('h1')).toContainText('Analytics Dashboard');
    await expect(page.locator('[data-testid="total-sessions"]')).toBeVisible();
    await expect(page.locator('[data-testid="completed-sessions"]')).toBeVisible();
    await expect(page.locator('[data-testid="average-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-duration"]')).toBeVisible();
  });

  test('should show session trends chart', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await expect(page.locator('[data-testid="session-trends-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="scores-over-time-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="competency-performance-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="sessions-by-role-chart"]')).toBeVisible();
  });

  test('should allow time range filtering', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    // Test different time ranges
    await page.click('[data-testid="time-range-week"]');
    await expect(page.locator('[data-testid="time-range-week"]')).toHaveClass(/active/);
    
    await page.click('[data-testid="time-range-month"]');
    await expect(page.locator('[data-testid="time-range-month"]')).toHaveClass(/active/);
    
    await page.click('[data-testid="time-range-all"]');
    await expect(page.locator('[data-testid="time-range-all"]')).toHaveClass(/active/);
  });

  test('should display detailed metrics', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    // Check metric values are numbers
    const totalSessions = await page.textContent('[data-testid="total-sessions"]');
    expect(totalSessions).toMatch(/\d+/);
    
    const averageScore = await page.textContent('[data-testid="average-score"]');
    expect(averageScore).toMatch(/\d+\.?\d*/);
    
    const totalDuration = await page.textContent('[data-testid="total-duration"]');
    expect(totalDuration).toMatch(/\d+h \d+m/);
  });

  test('should show competency breakdown', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="competency-breakdown"]');
    
    await expect(page.locator('[data-testid="competency-list"]')).toBeVisible();
    
    // Check competency items
    const competencyItems = await page.locator('[data-testid="competency-item"]').count();
    expect(competencyItems).toBeGreaterThan(0);
    
    // Check competency scores
    const firstCompetency = page.locator('[data-testid="competency-item"]').first();
    await expect(firstCompetency.locator('[data-testid="competency-name"]')).toBeVisible();
    await expect(firstCompetency.locator('[data-testid="competency-score"]')).toBeVisible();
    await expect(firstCompetency.locator('[data-testid="competency-progress"]')).toBeVisible();
  });

  test('should allow exporting analytics data', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="export-analytics"]');
    
    // Check export options
    await expect(page.locator('[data-testid="export-pdf"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-csv"]')).toBeVisible();
    await expect(page.locator('[data-testid="export-json"]')).toBeVisible();
    
    // Test CSV export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toMatch(/.*\.csv$/);
  });

  test('should display progress over time', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="progress-over-time"]');
    
    await expect(page.locator('[data-testid="progress-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="milestone-timeline"]')).toBeVisible();
    
    // Check milestone items
    const milestones = await page.locator('[data-testid="milestone-item"]').count();
    expect(milestones).toBeGreaterThan(0);
  });

  test('should show comparison with peers', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="peer-comparison"]');
    
    await expect(page.locator('[data-testid="comparison-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="percentile-rank"]')).toBeVisible();
    
    // Check percentile display
    const percentileRank = await page.textContent('[data-testid="percentile-rank"]');
    expect(percentileRank).toMatch(/\d+th percentile/);
  });

  test('should handle empty analytics gracefully', async ({ page }) => {
    // Mock new user with no sessions
    await page.evaluate(() => {
      localStorage.setItem('mockmate_user_sessions', JSON.stringify([]));
    });
    
    await page.click('[data-testid="analytics-tab"]');
    
    await expect(page.locator('[data-testid="no-data-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="no-data-message"]')).toContainText('No analytics data available');
    
    // Should show prompt to start first session
    await expect(page.locator('[data-testid="start-first-session"]')).toBeVisible();
  });

  test('should update analytics in real-time', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    // Get initial metrics
    const initialSessions = await page.textContent('[data-testid="total-sessions"]');
    
    // Complete a new session
    await page.click('[data-testid="start-new-session"]');
    await page.waitForSelector('[data-testid="question-text"]');
    await page.fill('[data-testid="response-input"]', 'Test response for analytics.');
    await page.click('[data-testid="submit-response"]');
    await page.click('[data-testid="end-session"]');
    
    // Return to analytics
    await page.click('[data-testid="analytics-tab"]');
    
    // Check if metrics updated
    const updatedSessions = await page.textContent('[data-testid="total-sessions"]');
    expect(updatedSessions).not.toBe(initialSessions);
  });

  test('should allow setting goals and tracking progress', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="goals-settings"]');
    
    await expect(page.locator('[data-testid="goal-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="sessions-per-week"]')).toBeVisible();
    await expect(page.locator('[data-testid="target-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="competency-focus"]')).toBeVisible();
    
    // Set goals
    await page.fill('[data-testid="sessions-per-week"]', '3');
    await page.fill('[data-testid="target-score"]', '85');
    await page.selectOption('[data-testid="competency-focus"]', 'Communication');
    await page.click('[data-testid="save-goals"]');
    
    // Check goal tracking
    await page.click('[data-testid="goal-progress"]');
    await expect(page.locator('[data-testid="goal-progress-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="goal-status"]')).toBeVisible();
  });

  test('should show detailed session history', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="session-history"]');
    
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible();
    
    // Check session items
    const sessionItems = await page.locator('[data-testid="session-item"]').count();
    if (sessionItems > 0) {
      const firstSession = page.locator('[data-testid="session-item"]').first();
      await expect(firstSession.locator('[data-testid="session-date"]')).toBeVisible();
      await expect(firstSession.locator('[data-testid="session-score"]')).toBeVisible();
      await expect(firstSession.locator('[data-testid="session-duration"]')).toBeVisible();
      await expect(firstSession.locator('[data-testid="view-report"]')).toBeVisible();
      
      // Test viewing report from history
      await firstSession.locator('[data-testid="view-report"]').click();
      await expect(page.locator('h1')).toContainText('Interview Report');
    }
  });

  test('should provide insights and recommendations', async ({ page }) => {
    await page.click('[data-testid="analytics-tab"]');
    
    await page.click('[data-testid="insights-tab"]');
    
    await expect(page.locator('[data-testid="ai-insights"]')).toBeVisible();
    await expect(page.locator('[data-testid="recommendations"]')).toBeVisible();
    
    // Check insights content
    const insights = await page.locator('[data-testid="insight-item"]').count();
    expect(insights).toBeGreaterThan(0);
    
    // Check recommendations
    const recommendations = await page.locator('[data-testid="recommendation-item"]').count();
    expect(recommendations).toBeGreaterThan(0);
    
    // Test actionable recommendations
    const firstRecommendation = page.locator('[data-testid="recommendation-item"]').first();
    await expect(firstRecommendation.locator('[data-testid="recommendation-text"]')).toBeVisible();
    await expect(firstRecommendation.locator('[data-testid="apply-recommendation"]')).toBeVisible();
  });
});
