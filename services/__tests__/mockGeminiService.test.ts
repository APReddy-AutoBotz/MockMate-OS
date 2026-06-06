import { calibrateIntent } from '../mockGeminiService';
import { ValidationError } from '../../utils/errorHandler';

describe('Mock Gemini Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('calibrateIntent', () => {
    it('should throw ValidationError for empty intent', async () => {
      await expect(calibrateIntent('')).rejects.toThrow(ValidationError);
      await expect(calibrateIntent('  ')).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for short intent', async () => {
      await expect(calibrateIntent('ab')).rejects.toThrow(ValidationError);
    });

    it('should accept valid intent and make fetch call', async () => {
      const mockResult = {
        recommendedPanelIDs: ['p1', 'p2'],
        recommendedRole: 'Software Engineer'
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
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database error' }),
      });

      await expect(calibrateIntent('Senior Software Engineer')).rejects.toThrow('Database error');
    });
  });
});
