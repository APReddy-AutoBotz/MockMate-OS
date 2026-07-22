import { calibrateIntent } from '../mockGeminiService';
import * as supabaseClient from '../supabaseClient';
import { ApiError } from '../apiClient';

describe('Mock Gemini Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    jest.spyOn(supabaseClient, 'getAccessToken').mockResolvedValue('test-mock-token');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('calibrateIntent', () => {
    it('should throw ApiError for short intent', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({ code: 'INVALID_PAYLOAD', error: 'Invalid calibrate payload' })
      });
      await expect(calibrateIntent('ab')).rejects.toThrow(ApiError);
    });

    it('should accept valid intent and make fetch call', async () => {
      const mockResult = {
        recommendedPanelIDs: ['p1', 'p2'],
        recommendedRole: 'Software Engineer',
        matchReasons: { p1: 'Culture match', p2: 'Tech match' },
        suggestedControls: {
          difficulty: 'intermediate',
          totalQuestions: 5,
          includeBehavioral: true,
          includeCoding: false,
          timePerQuestion: '90s',
          deliveryMode: 'exam',
          reasoningMode: 'classic_behavioral',
          sourceMode: 'question_bank'
        },
        jdInsights: {
          source: 'job_description',
          role: 'Software Engineer',
          level: 'Senior',
          mustHaveSkills: ['Problem Solving'],
          niceToHave: [],
          domains: [],
          tools: [],
          softSkills: [],
          competencyWeights: { PROBLEM_FRAMING: 0.5 }
        },
        fallbackUsed: false
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await calibrateIntent('Senior Software Engineer');
      expect(result).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw Error on fetch failures', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database error' }),
      });

      await expect(calibrateIntent('Senior Software Engineer')).rejects.toThrow('Database error');
    });
  });
});
