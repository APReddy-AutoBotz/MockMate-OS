import { execSync } from 'child_process';

function scanGitHistory() {
  console.log('[Security Gate] Running full-history git repository secret scan (Tool: GitHistoryScanner v1.2.0)...');

  const commitCount = execSync('git rev-list --all --count', { encoding: 'utf-8' }).trim();
  const firstCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf-8' }).trim().slice(0, 8);
  const headCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim().slice(0, 8);

  console.log(`[Security Gate] Scanning ${commitCount} commits across all refs (Range: ${firstCommit}..${headCommit})...`);

  const secretPatterns = [
    { name: 'GitHub Personal Access Token', regex: /(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59})/g },
    { name: 'Google/Gemini API Key', regex: /AIzaSy[A-Za-z0-9_-]{33}/g },
    { name: 'Groq API Key', regex: /gsk_[A-Za-z0-9]{32,}/g },
    { name: 'Supabase Service Key (JWT)', regex: /eyJ[A-Za-z0-9_-]{30,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}/g },
    { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
    { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{32,}/g },
    { name: 'Stripe API Key', regex: /(sk|rk)_live_[0-9a-zA-Z]{24,}/g },
    { name: 'Slack Token', regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/g },
    { name: 'Private Key', regex: /-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/g },
    { name: 'Generic Hardcoded Secret Assignment', regex: /(api_key|service_role_key|secret_key|private_key|auth_token)\s*=\s*['"][A-Za-z0-9_\-]{24,}['"]/gi }
  ];

  const patchOutput = execSync('git log --all -p --full-history', { maxBuffer: 50 * 1024 * 1024, encoding: 'utf-8' });

  let foundSecrets = 0;

  for (const { name, regex } of secretPatterns) {
    const matches = patchOutput.match(regex);
    if (matches && matches.length > 0) {
      const realMatches = matches.filter(m => 
        !m.includes('dummy') && 
        !m.includes('example') && 
        !m.includes('YOUR_') && 
        !m.includes('mock_') && 
        !m.includes('test-key') &&
        !m.includes('sb_service_role_secret') &&
        !m.includes('placeholder')
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

  console.log(`[Security Gate] SUCCESS! Full-history secret scan passed cleanly. 0 secrets found across ${commitCount} commits.`);
}

scanGitHistory();
