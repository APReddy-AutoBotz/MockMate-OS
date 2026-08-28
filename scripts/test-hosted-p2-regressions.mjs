import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const app = read('../App.tsx');
const onboarding = read('../components/OnboardingQuestions.tsx');
const roleCapture = read('../components/RoleCapture.tsx');
const clearSpeakOnboarding = read('../components/clearspeak/ClearSpeakOnboarding.tsx');
const uploadSetup = read('../components/resume/UploadSetupScreen.tsx');
const sessionControls = read('../components/SessionControlsEditor.tsx');
const sessionPrep = read('../components/SessionPrep.tsx');
const sessionBuilder = read('../components/SessionBuilder.tsx');
const systemStatus = read('../components/SystemStatus.tsx');

const roleSelection = app.slice(app.indexOf("case 'ROLE_SELECTION':"), app.indexOf("case 'CONTEXT_UPLOAD':"));
assert.match(roleSelection, /onBack=\{handleRestart\}/, 'role selection must navigate back to the practice hub');
assert.doesNotMatch(roleSelection, /onBack=\{handleLogout\}/, 'back-to-home must never sign the user out');

const appHeader = app.slice(app.indexOf('{showAppHeader && ('), app.indexOf('</motion.header>'));
assert.ok((appHeader.match(/Sign out/g) || []).length >= 2, 'desktop and mobile header exits must disclose sign-out semantics');
assert.doesNotMatch(appHeader, /End Session|>Exit</, 'header sign-out controls must not use misleading session-only labels');

assert.match(uploadSetup, /aria-label="Choose resume file"/, 'the resume file input must have an accessible name');
assert.match(uploadSetup, /type="button" onClick=\{openFilePicker\}/, 'resume browsing must expose a keyboard-operable native button');
assert.match(uploadSetup, /aria-label="Remove selected resume"/, 'the icon-only resume removal control must have an accessible name');
assert.doesNotMatch(uploadSetup, /document\.getElementById\('file-input'\)/, 'resume browsing must not depend on a mouse-only clickable container');

for (const [source, requiredLabel] of [
  [onboarding, 'htmlFor="onboarding-target-role"'],
  [roleCapture, 'htmlFor="interview-target-role"'],
  [uploadSetup, 'htmlFor="resume-professional-summary"'],
  [uploadSetup, 'htmlFor={`skill-${index}-items`}'],
  [uploadSetup, 'htmlFor={`education-${index}-institution`}'],
  [sessionPrep, 'htmlFor="session-job-description"'],
  [clearSpeakOnboarding, 'htmlFor="cs-role-input"'],
  [clearSpeakOnboarding, 'htmlFor="cs-goal-input"'],
  [clearSpeakOnboarding, 'htmlFor="cs-audience-input"'],
  [clearSpeakOnboarding, 'htmlFor="cs-comfort-lang"'],
]) {
  assert.ok(source.includes(requiredLabel), `core field must retain its programmatic label: ${requiredLabel}`);
}

assert.match(sessionControls, /aria-label=\{label\}/, 'session switches must expose their visible labels');
assert.match(sessionControls, /type="button"[\s\S]*role="switch"/, 'session switches must use a non-submit native button');
assert.doesNotMatch(sessionControls, /<div[^>]+onClick=\{opt\.onToggle\}/, 'session switch rows must not double-toggle through bubbling');

assert.match(systemStatus, /role="status" aria-live="polite" aria-atomic="true"/, 'offline status must be announced as a complete live update');

assert.doesNotMatch(sessionPrep, /buildFallbackInterviewPlan|setPlan\(fallbackPlan\)/, 'browser code must not mint an interview plan after an authority failure');
assert.match(sessionPrep, /setPlanError\('We could not generate an authoritative interview plan\./, 'plan authority failure must be disclosed visibly');
assert.match(sessionPrep, /role="alert"/, 'plan generation failure must use alert semantics');
assert.match(sessionPrep, /planSource=\{plan\.meta\.planSource\}/, 'server plan provenance must reach the review surface');
assert.match(sessionPrep, /sourceMode=\{plan\.meta\.controls\.sourceMode\}/, 'server question source mode must reach the review surface');

assert.match(sessionBuilder, /planSource === 'deterministic_fallback'/, 'provider-free plan provenance must control disclosure');
assert.match(sessionBuilder, /Standard question plan in use\./, 'provider-free plans must be disclosed to the user');
assert.match(sessionBuilder, /sourceMode === 'question_bank'/, 'question-bank plans must not be mislabeled as JD analysis');

console.log('P0-8 hosted P2 navigation, accessibility, and plan-provenance regressions passed.');
