import { createClearSpeakGroundedInterviewDraft } from '../shared/dist/index.js';
import { projectCareerContext } from '../backend/dist/services/careerContextProjectionService.js';

console.log('[ClearSpeak -> Interview Journey] Verifying ClearSpeak speaking goal grounding in Interview draft...');

const snapshotId = '66666666-6666-6666-6666-666666666666';
const bridgeId = '77777777-7777-7777-7777-777777777777';

const draft = createClearSpeakGroundedInterviewDraft(
  snapshotId,
  bridgeId,
  'Engineering Manager',
  'Practice executive communication and crisp conciseness'
);

if (draft.bridgeIntent?.sourceModule !== 'clearspeak') {
  console.error('FAILED: sourceModule is not clearspeak');
  process.exit(1);
}

const csItems = [
  {
    id: '88888888-8888-8888-8888-888888888888',
    kind: 'communication_goal',
    canonicalKey: 'clearspeak.goal',
    label: 'Communication Goal',
    value: { type: 'text', text: 'Conciseness & Executive Presence' },
    source: { module: 'clearspeak', recordId: 'p1', fieldPath: 'goal', sourceRevision: 'v1', sourceHash: 'cs1', capturedAt: new Date().toISOString() },
    provenance: 'direct_source',
    status: 'active',
    sensitivity: 'standard',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '99999999-9999-9999-9999-999999999999',
    kind: 'practice_metric',
    canonicalKey: 'clearspeak.delivery_score',
    label: 'Delivery Score',
    value: { type: 'metric', metric: 'WPM', value: 145, scale: 'wpm', measuredAt: new Date().toISOString() },
    source: { module: 'clearspeak', recordId: 's1', fieldPath: 'score', sourceRevision: 'v1', sourceHash: 'cs2', capturedAt: new Date().toISOString() },
    provenance: 'system_observed',
    status: 'active',
    sensitivity: 'standard',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const { projection } = projectCareerContext(csItems, 'clearspeak_to_interview', {}, false);

// Delivery metrics MUST NOT enter Interview evaluator or signals
if (projection.practiceSignals && projection.practiceSignals.length > 0) {
  console.error('FAILED: numeric practice metric leaked into interview practice signals!');
  process.exit(1);
}

if (!projection.communicationGoal || projection.communicationGoal !== 'Conciseness & Executive Presence') {
  console.error('FAILED: communication goal missing from clearspeak_to_interview projection');
  process.exit(1);
}

console.log('[ClearSpeak -> Interview Journey] PASSED: ClearSpeak to Interview goal transfer verified 100%!');
