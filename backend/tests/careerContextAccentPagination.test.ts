import fs from 'node:fs';
import path from 'node:path';

describe('Career Context Accent keyset pagination', () => {
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../routes/careerContextRoutes.ts'),
    'utf8',
  );

  it('preserves PostgreSQL timestamptz microseconds instead of round-tripping the cursor through JS Date', () => {
    const pageBoundary = '2026-08-16T06:02:54.123456Z';
    const nextEligibleAttempt = '2026-08-16T06:02:54.123400Z';
    const truncatedBoundary = new Date(Date.parse(pageBoundary)).toISOString();
    const truncatedBoundaryAtMicrosecondWidth = '2026-08-16T06:02:54.123000Z';

    expect(truncatedBoundary).toBe('2026-08-16T06:02:54.123Z');
    expect(nextEligibleAttempt < pageBoundary).toBe(true);
    expect(nextEligibleAttempt > truncatedBoundaryAtMicrosecondWidth).toBe(true);

    expect(routeSource).toContain("const rawCreatedAt = typeof lastAttempt?.created_at === 'string' ? lastAttempt.created_at : '';");
    expect(routeSource).toContain('createdAt: rawCreatedAt,');
    expect(routeSource).not.toContain('createdAt: new Date(parsedCreatedAt).toISOString()');
  });

  it('retains deterministic privacy-minimal keyset traversal and rejects unsafe cursor syntax', () => {
    expect(routeSource).toContain(".select('attempt_id,result,created_at')");
    expect(routeSource).toContain(".order('created_at', { ascending: false })");
    expect(routeSource).toContain(".order('attempt_id', { ascending: false })");
    expect(routeSource).toContain('.limit(ACCENT_ATTEMPT_REBUILD_PAGE_SIZE)');
    expect(routeSource).toContain('created_at.lt.${accentCursor.createdAt}');
    expect(routeSource).toContain('attempt_id.lt.${accentCursor.attemptId}');
    expect(routeSource).toContain('/[(),]/.test(rawCreatedAt)');
    expect(routeSource).not.toContain('.range(');
  });
});
