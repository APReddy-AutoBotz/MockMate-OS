# Netlify Preview Full QA Plan

Target branch: `netlify-preview`

This plan governs the browser/API QA tranche for the protected Netlify preview. It does not authorize public production promotion, store publication, unrelated infrastructure mutation, new paid-provider purchase, or secret disclosure.

## Required surfaces

- Landing, Sign in, Sign up, email-confirmation state and Google OAuth error handling.
- Onboarding, Hub and responsive navigation.
- Resume upload/setup, diagnostics, rewrite, preview/export and integrity failure paths.
- Interview role/setup, grounded and ungrounded launch paths, session controls, report/history and replay behavior.
- Career Context list/version/snapshot/bridge/conflict flows and cross-user isolation.
- ClearSpeak onboarding, dashboard, standard speaking session, history/feedback and Resume/Interview grounding bridges.
- Accent Practice V1 with both `General UK English` (`en-GB-general-v1`) and `General US English` (`en-US-general-v1`), all four practice modes, microphone consent, permission denial, offline/device failure, recording preview/discard, scorer-unavailable truth, evidence result presentation, history refresh/delete and raw-audio non-retention messaging.
- Privacy, account deletion and failure/retry states.
- Desktop Chrome/Firefox/WebKit plus representative mobile Chrome/Safari layouts.

## QA rules

1. Use exact current branch head and report it.
2. Repair obsolete tests before trusting their results.
3. Run source tests and Playwright locally with deterministic mocked/bounded dependencies where external secrets are unavailable.
4. Clearly separate product defects from known hosted configuration blockers.
5. Do not fabricate successful AI/scoring/OAuth behavior when the provider or server secrets are absent.
6. No real customer data, no real resumes, no retained raw audio, no credentials in logs/evidence.
7. Any P1/P2 defect must include exact file/line, user impact, reproduction and proposed fix.
