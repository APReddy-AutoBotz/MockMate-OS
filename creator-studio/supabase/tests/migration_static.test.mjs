import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const foundation = readFileSync(new URL('../migrations/202608130001_creator_studio_foundation.sql', import.meta.url), 'utf8');
const hardening = readFileSync(new URL('../migrations/202608130002_creator_studio_authority_hardening.sql', import.meta.url), 'utf8');
const m1 = readFileSync(new URL('../migrations/202608130002_m1_authority.sql', import.meta.url), 'utf8');
assert.match(foundation, /artifact_version integer not null/);
assert.match(hardening, /LATEST_ARTIFACT_REQUIRED/);
assert.match(m1, /owner_id = auth\.uid\(\)/);
assert.match(m1, /CONTENT_APPROVAL_REQUIRED/);
assert.match(m1, /UPSTREAM_REVISED/);
assert.match(m1, /on conflict do nothing/);
assert.match(m1, /BIOMETRIC_UPLOADS_NOT_ENABLED/);
assert.match(m1, /private_storage_path !~\* '\^https\?:\/\/'/);
console.log('migration authority static checks passed');
