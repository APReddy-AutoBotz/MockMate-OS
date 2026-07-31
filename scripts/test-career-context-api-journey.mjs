import { projectCareerContext } from '../backend/dist/services/careerContextProjectionService.js';

console.log('[API Journey] Verifying Career Context API contracts and pure projection logic...');

const mockItems = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    kind: 'target_role',
    canonicalKey: 'resume.target_role',
    label: 'Target Role',
    value: { type: 'text', text: 'Staff Software Engineer' },
    source: { module: 'resume', recordId: 'r1', fieldPath: 'targetRole', sourceRevision: 'v1', sourceHash: 'h1', capturedAt: new Date().toISOString() },
    provenance: 'user_confirmed',
    status: 'active',
    sensitivity: 'standard',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    kind: 'skill',
    canonicalKey: 'resume.skills',
    label: 'Skills',
    value: { type: 'string_list', values: ['TypeScript', 'Node.js', 'PostgreSQL'] },
    source: { module: 'resume', recordId: 'r1', fieldPath: 'skills', sourceRevision: 'v1', sourceHash: 'h2', capturedAt: new Date().toISOString() },
    provenance: 'direct_source',
    status: 'active',
    sensitivity: 'standard',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

const { projection, conflicts } = projectCareerContext(mockItems, 'resume_to_interview', {}, false);

if (projection.targetRole !== 'Staff Software Engineer') {
  console.error('FAILED: expected targetRole to be Staff Software Engineer');
  process.exit(1);
}

if (!projection.skills || projection.skills.length !== 3) {
  console.error('FAILED: expected 3 skills');
  process.exit(1);
}

if (conflicts.length !== 0) {
  console.error('FAILED: expected 0 conflicts');
  process.exit(1);
}

console.log('[API Journey] PASSED: Career Context API projection verified 100%!');
