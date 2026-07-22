import { execSync } from 'child_process';

function scanGitHistory() {
  console.log('[Security Gate] Running full-history git repository secret scan...');

  // Get commit count & range
  const commitCount = execSync('git rev-list --all --count', { encoding: 'utf-8' }).trim();
  const firstCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf-8' }).trim().slice(0, 8);
  const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 8);

  console.log(`[Security Gate] Scanning ${commitCount} commits (Range: ${firstCommit}..${headCommit})...`);

  // Define strict regex patterns for sensitive credentials
  const secretPatterns = [
    { name: 'Supabase Service Key (eyJ...)', regex: /eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/g },
    { name: 'Google/Gemini API Key (AIzaSy...)', regex: /AIzaSy[A-Za-z0-9_-]{33}/g },
    { name: 'Groq API Key (gsk_...)', regex: /gsk_[A-Za-z0-9]{32,}/g },
    { name: 'RSA/EC Private Key', regex: /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/g },
    { name: 'Generic Hardcoded Secret Assignment', regex: /(api_key|service_role_key|secret_key|private_key)\s*=\s*['"][A-Za-z0-9_\-]{20,}['"]/gi }
  ];

  // Fetch full patch output across all branches and tags
  const patchOutput = execSync('git log --all -p --full-history', { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' });

  let foundSecrets = 0;

  for (const { name, regex } of secretPatterns) {
    const matches = patchOutput.match(regex);
    if (matches && matches.length > 0) {
      // Filter out obvious test/dummy strings
      const realMatches = matches.filter(m => 
        !m.includes('dummy') && 
        !m.includes('example') && 
        !m.includes('YOUR_') && 
        !m.includes('mock_') && 
        !m.includes('test-key') &&
        !m.includes('sb_service_role_secret')
      );
      if (realMatches.length > 0) {
        console.error(`[Security Gate] EXPOSED SECRET DETECTED: ${name} (Matches: ${realMatches.length})`);
        foundSecrets += realMatches.length;
      }
    }
  }

  if (foundSecrets > 0) {
    console.error(`[Security Gate] FAILED: Found ${foundSecrets} sensitive credential pattern matches in git history.`);
    process.exit(1);
  }

  console.log(`[Security Gate] SUCCESS! Full-history secret scan passed cleanly. Zero secrets found across ${commitCount} commits.`);
}

scanGitHistory();
