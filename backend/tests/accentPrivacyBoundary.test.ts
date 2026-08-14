import fs from 'fs';
import path from 'path';

const routeSource = fs.readFileSync(path.resolve(__dirname, '../clearspeak/routes.ts'), 'utf8');
const serviceSource = fs.readFileSync(path.resolve(__dirname, '../clearspeak/accentV1Service.ts'), 'utf8');
const browserSource = fs.readFileSync(path.resolve(__dirname, '../../components/clearspeak/AccentPracticeV1.tsx'), 'utf8');

const accentAttemptRoute = routeSource.match(
  /router\.post\('\/v1\/accent\/attempts'[\s\S]*?router\.get\('\/v1\/accent\/attempts\/:attemptId\/status'/,
)?.[0] ?? '';

describe('P0-5 ephemeral accent audio privacy boundary', () => {
  it('wipes memory-storage audio on upload validation failures', () => {
    expect(routeSource).toMatch(/function handleMulterError\([\s\S]*?wipeUploadedAudio\(req\);/);
    expect(routeSource).toMatch(/function wipeUploadedAudio\([\s\S]*?buffer\.fill\(0\)/);
  });

  it('wipes uploaded audio in a finally block after every accent attempt handler exit', () => {
    expect(accentAttemptRoute).toContain("router.post('/v1/accent/attempts'");
    expect(accentAttemptRoute).toMatch(/finally\s*\{[\s\S]*?wipeUploadedAudio\(req\);[\s\S]*?\}/);
  });

  it('keeps adapter failure inside the same finally-protected attempt route', () => {
    expect(accentAttemptRoute).toMatch(/real_speech_evidence_unavailable/);
    expect(accentAttemptRoute).toMatch(/finally\s*\{[\s\S]*?wipeUploadedAudio\(req\);/);
  });

  it('never includes raw audio in the immutable lifecycle commit payload', () => {
    const commitBlock = serviceSource.match(
      /commit_clearspeak_accent_attempt_v2[\s\S]*?p_attempt:\s*\{[\s\S]*?result:\s*score\s*\}\s*\}\);/,
    )?.[0] ?? '';
    expect(commitBlock).toContain('duration_ms');
    expect(commitBlock).toContain('mime_type');
    expect(commitBlock).not.toMatch(/\baudio\s*:/);
    expect(commitBlock).not.toMatch(/audioBuffer|audioBlob|rawAudio|transcript/i);
  });

  it('aborts browser upload work before issuing authoritative cancellation', () => {
    const cancellationBlock = browserSource.match(
      /const cancelSubmission[\s\S]*?const terminal\s*=/,
    )?.[0] ?? '';
    expect(cancellationBlock).toMatch(/uploadController\.current\?\.abort\(\)/);
    expect(cancellationBlock).toMatch(/\/cancel`/);
  });
});
