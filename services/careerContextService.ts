import { apiClient } from './apiClient';
import {
  CareerContextGetResponse,
  CareerContextGetResponseSchema,
  CareerContextPreferenceResponse,
  CareerContextPreferenceResponseSchema,
  CareerContextItemDecisionResponse,
  CareerContextItemDecisionResponseSchema,
  GroundingSnapshotCreateRequest,
  GroundingSnapshotCreateResponse,
  GroundingSnapshotCreateResponseSchema,
  ModuleBridgeCreateRequest,
  ModuleBridgeCreateResponse,
  ModuleBridgeCreateResponseSchema,
} from 'mockmate-shared';

export async function fetchCareerContext(): Promise<CareerContextGetResponse> {
  return apiClient.get('/api/career-context', CareerContextGetResponseSchema);
}

export async function setPersonalizationPreference(
  personalizationEnabled: boolean,
  expectedContextVersion?: number
): Promise<CareerContextPreferenceResponse> {
  return apiClient.post(
    '/api/career-context/preference',
    CareerContextPreferenceResponseSchema,
    { personalizationEnabled, expectedContextVersion }
  );
}

export async function applyItemDecision(
  itemId: string,
  decision: 'confirm' | 'reject' | 'revoke' | 'dispute' | 'replace' | 'edit',
  expectedContextVersion?: number,
  replacementValue?: string
): Promise<CareerContextItemDecisionResponse> {
  return apiClient.post(
    `/api/career-context/items/${itemId}/decision`,
    CareerContextItemDecisionResponseSchema,
    { decision, expectedContextVersion, replacementValue }
  );
}

export async function createGroundingSnapshot(
  request: GroundingSnapshotCreateRequest
): Promise<GroundingSnapshotCreateResponse> {
  return apiClient.post(
    '/api/career-context/snapshots',
    GroundingSnapshotCreateResponseSchema,
    request
  );
}

export async function createModuleBridge(
  request: ModuleBridgeCreateRequest
): Promise<ModuleBridgeCreateResponse> {
  return apiClient.post(
    '/api/career-context/bridges',
    ModuleBridgeCreateResponseSchema,
    request
  );
}
