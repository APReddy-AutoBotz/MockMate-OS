// Resume to ClearSpeak Grounding Journey Verification
import { buildResumeContextItems } from '../backend/dist/services/careerContextAdapters/resumeContextAdapter.js';

console.log('[Resume -> ClearSpeak Journey] Verifying Resume context ingestion for ClearSpeak passage generation...');

const resumeInput = {
  resumeData: {
    basics: { name: 'Alice', email: 'alice@example.com', phone: '555-1234' },
    summary: 'Senior Backend Engineer specialized in distributed systems.',
    skills: [{ category: 'Languages', items: ['Go', 'Rust', 'Python'] }],
    experience: [
      { company: 'Acme Corp', position: 'Tech Lead', bullets: ['Led migration of 50 microservices to Kubernetes, reducing latency by 40%.'] }
    ]
  },
  recordId: '55555555-5555-5555-5555-555555555555',
  targetRole: 'Staff Infrastructure Engineer'
};

const items = buildResumeContextItems(resumeInput);

// Verify no email/phone item created
const contactItems = items.filter(i => i.sensitivity === 'personal_contact' || i.canonicalKey.includes('contact'));
if (contactItems.length > 0) {
  console.error('FAILED: contact item created from Resume ingestion');
  process.exit(1);
}

// Verify experience bullet extracted
const experienceClaim = items.find(i => i.kind === 'experience_claim' || i.kind === 'achievement');
if (!experienceClaim || !getItemText(experienceClaim).includes('reducing latency by 40%')) {
  console.error('FAILED: experience bullet not extracted properly');
  process.exit(1);
}

function getItemText(item) {
  return item.value.type === 'text' ? item.value.text : item.label;
}

console.log('[Resume -> ClearSpeak Journey] PASSED: Resume to ClearSpeak material extraction verified 100%!');
