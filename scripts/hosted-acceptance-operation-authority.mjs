import {
  AdaptiveAnswerSubmissionRequestSchema,
  CareerContextItemDecisionRequestSchema,
  CareerContextPreferenceRequestSchema,
  GroundingSnapshotCreateRequestSchema,
  InterviewSessionStartRequestSchema,
  ModuleBridgeCreateRequestSchema,
} from '../shared/dist/index.js';
import {
  ResumeScoreRequestSchema,
  ResumeSuggestRequestSchema,
} from '../shared/dist/resumeIntegrity.js';

export const DEFAULT_JSON_REQUEST_BYTES = 256 * 1024;
export const OVERSIZED_RESUME_REQUEST_BYTES = 768 * 1024;
export const ACCOUNT_DELETE_FAILURE_HEADER = 'x-mockmate-preview-failure';
export const ACCOUNT_DELETE_FAILURE_VALUE = 'account-delete-before-mutation';

const profiles = new Set(['en-GB-general-v1', 'en-US-general-v1']);
const modes = new Set(['word', 'phrase', 'sentence_reading', 'free_response']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[a-f0-9]{64}$/;
const capability = /^[a-f0-9]{64}$/;

export class HostedOperationAuthorityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HostedOperationAuthorityError';
  }
}

const refuse = (operation, reason) => {
  throw new HostedOperationAuthorityError(`${operation} ${reason}`);
};

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(operation, value, required, optional = []) {
  if (!isRecord(value)) refuse(operation, 'requires an object body.');
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || keys.some((key) => !allowed.has(key))) {
    refuse(operation, 'does not match its strict request field authority.');
  }
}

function schemaPass(operation, schema, value) {
  if (!schema.safeParse(value).success) refuse(operation, 'does not match the shared request schema.');
}

function validateSelector(operation, value, { requireAttempt = false, requireDuration = false, requireCapability = false } = {}) {
  const required = [
    ...(requireAttempt ? ['attemptId'] : []),
    ...(requireDuration ? ['durationMs'] : []),
    'mode', 'profileId', 'profileVersion', 'promptId', 'promptVersion', 'promptContentHash',
    'referenceSetVersion', 'scoringPolicyVersion',
    ...(requireCapability ? ['submissionCapability'] : []),
  ];
  exactKeys(operation, value, required);
  if (requireAttempt && (typeof value.attemptId !== 'string' || !uuid.test(value.attemptId))) refuse(operation, 'requires a UUID attemptId.');
  if (!profiles.has(value.profileId) || value.profileVersion !== 1 || !modes.has(value.mode)) refuse(operation, 'uses an unsupported accent profile or mode.');
  if (typeof value.promptId !== 'string' || !uuid.test(value.promptId) || !Number.isInteger(value.promptVersion) || value.promptVersion < 1) refuse(operation, 'requires the server prompt selector.');
  if (typeof value.promptContentHash !== 'string' || !sha256.test(value.promptContentHash)) refuse(operation, 'requires a SHA-256 promptContentHash.');
  if (typeof value.referenceSetVersion !== 'string' || value.referenceSetVersion.length < 1 || value.referenceSetVersion.length > 80) refuse(operation, 'requires a bounded referenceSetVersion.');
  if (typeof value.scoringPolicyVersion !== 'string' || value.scoringPolicyVersion.length < 1 || value.scoringPolicyVersion.length > 80) refuse(operation, 'requires a bounded scoringPolicyVersion.');
  if (requireDuration) {
    const maxDuration = value.mode === 'free_response' ? 120000 : 45000;
    if (!Number.isInteger(value.durationMs) || value.durationMs < 250 || value.durationMs > maxDuration) refuse(operation, 'requires a bounded durationMs for the selected mode.');
  }
  if (requireCapability && (typeof value.submissionCapability !== 'string' || !capability.test(value.submissionCapability))) refuse(operation, 'requires a process-local 64-hex submissionCapability.');
}

function parseMultipartMetadata(operation, scenario) {
  const metadata = scenario.multipart?.fields?.metadata;
  if (typeof metadata !== 'string' || Buffer.byteLength(metadata, 'utf8') > 4096) refuse(operation, 'requires one bounded JSON metadata multipart field.');
  try {
    return JSON.parse(metadata);
  } catch {
    refuse(operation, 'contains malformed multipart metadata.');
  }
}

function requireNoBody(operation, scenario) {
  if (scenario.body !== undefined || scenario.multipart !== undefined) refuse(operation, 'must not carry a request body.');
}

export function jsonRequestLimitForOperation(operation) {
  return operation === 'partial-failure.oversized'
    ? OVERSIZED_RESUME_REQUEST_BYTES
    : DEFAULT_JSON_REQUEST_BYTES;
}

export function operationOwnedHeaders(operation) {
  if (operation === 'partial-failure.account-delete') {
    return { [ACCOUNT_DELETE_FAILURE_HEADER]: ACCOUNT_DELETE_FAILURE_VALUE };
  }
  return {};
}

export function validateHostedOperationBody(scenario) {
  const operation = scenario?.operation;
  if (typeof operation !== 'string') refuse('unknown operation', 'is missing.');

  switch (operation) {
    case 'resume.score':
      schemaPass(operation, ResumeScoreRequestSchema, scenario.body);
      return;
    case 'resume.suggest':
      schemaPass(operation, ResumeSuggestRequestSchema, scenario.body);
      return;
    case 'partial-failure.malformed': {
      exactKeys(operation, scenario.body, ['resumeData', 'rawText', 'jdText', 'unsupportedProbeField']);
      if (scenario.body.unsupportedProbeField !== 'reject-me') refuse(operation, 'requires the deterministic unsupported field probe.');
      const base = { resumeData: scenario.body.resumeData, rawText: scenario.body.rawText, jdText: scenario.body.jdText };
      schemaPass(operation, ResumeScoreRequestSchema, base);
      if (ResumeScoreRequestSchema.safeParse(scenario.body).success) refuse(operation, 'must remain intentionally invalid under the strict Resume score schema.');
      return;
    }
    case 'partial-failure.oversized': {
      exactKeys(operation, scenario.body, ['resumeData', 'rawText', 'jdText']);
      if (typeof scenario.body.rawText !== 'string' || scenario.body.rawText.length <= 500000 || scenario.body.rawText.length > 600000 || Buffer.byteLength(scenario.body.rawText, 'utf8') !== scenario.body.rawText.length) {
        refuse(operation, 'requires 500001-600000 single-byte rawText characters.');
      }
      schemaPass(operation, ResumeScoreRequestSchema, { ...scenario.body, rawText: '' });
      if (ResumeScoreRequestSchema.safeParse(scenario.body).success) refuse(operation, 'must exceed the shared Resume rawText boundary.');
      return;
    }
    case 'interview.create':
      schemaPass(operation, InterviewSessionStartRequestSchema, scenario.body);
      return;
    case 'interview.answer':
    case 'interview.stale':
    case 'concurrency.exactly-once':
    case 'replay.response-loss':
      schemaPass(operation, AdaptiveAnswerSubmissionRequestSchema, scenario.body);
      return;
    case 'career-context.rebuild':
    case 'career-context.state':
      requireNoBody(operation, scenario);
      return;
    case 'career-context.create':
      schemaPass(operation, GroundingSnapshotCreateRequestSchema, scenario.body);
      return;
    case 'career-context.bridge':
      schemaPass(operation, ModuleBridgeCreateRequestSchema, scenario.body);
      return;
    case 'career-context.update':
    case 'career-context.stale':
      schemaPass(operation, CareerContextPreferenceRequestSchema, scenario.body);
      return;
    case 'career-context.delete':
      schemaPass(operation, CareerContextItemDecisionRequestSchema, scenario.body);
      return;
    case 'clearspeak.prompt':
      exactKeys(operation, scenario.body, ['profileId', 'mode'], ['profileVersion']);
      if (!profiles.has(scenario.body.profileId) || !modes.has(scenario.body.mode) || (scenario.body.profileVersion !== undefined && scenario.body.profileVersion !== 1)) refuse(operation, 'uses an unsupported server-owned profile or practice mode.');
      return;
    case 'clearspeak.authority':
      validateSelector(operation, scenario.body, { requireAttempt: true });
      return;
    case 'clearspeak.create':
    case 'clearspeak.replay':
      validateSelector(operation, parseMultipartMetadata(operation, scenario), { requireAttempt: true, requireDuration: true, requireCapability: true });
      return;
    case 'clearspeak.cancel':
      exactKeys(operation, scenario.body, ['submissionCapability']);
      if (typeof scenario.body.submissionCapability !== 'string' || !capability.test(scenario.body.submissionCapability)) refuse(operation, 'requires a process-local 64-hex submissionCapability.');
      return;
    case 'partial-failure.account-delete':
      requireNoBody(operation, scenario);
      return;
    default:
      return;
  }
}
