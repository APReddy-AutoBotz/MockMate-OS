import { apiClient } from '../apiClient';
import {
  applyItemDecision,
  createGroundingSnapshot,
  createModuleBridge,
  fetchCareerContext,
  rebuildCareerContext,
  setPersonalizationPreference,
} from '../careerContextService';

jest.mock('../apiClient', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('Career Context API route composition', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApiClient.get.mockResolvedValue({} as never);
    mockedApiClient.post.mockResolvedValue({} as never);
  });

  it('uses paths relative to the configured /api base', async () => {
    await fetchCareerContext();
    await rebuildCareerContext();
    await setPersonalizationPreference(true, 1);
    await applyItemDecision('item-1', 'confirm', 1);
    await createGroundingSnapshot({} as never);
    await createModuleBridge({} as never);

    expect(mockedApiClient.get).toHaveBeenCalledWith('career-context', expect.anything());
    expect(mockedApiClient.post).toHaveBeenCalledWith('career-context/rebuild', expect.anything(), {});
    expect(mockedApiClient.post).toHaveBeenCalledWith('career-context/preference', expect.anything(), { personalizationEnabled: true, expectedContextVersion: 1 });
    expect(mockedApiClient.post).toHaveBeenCalledWith('career-context/items/item-1/decision', expect.anything(), { decision: 'confirm', expectedContextVersion: 1, replacementValue: undefined });
    expect(mockedApiClient.post).toHaveBeenCalledWith('career-context/snapshots', expect.anything(), {});
    expect(mockedApiClient.post).toHaveBeenCalledWith('career-context/bridges', expect.anything(), {});
  });
});
