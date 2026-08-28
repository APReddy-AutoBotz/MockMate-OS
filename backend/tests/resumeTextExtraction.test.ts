const mockGetText = jest.fn().mockResolvedValue({ text: 'MockMate hosted acceptance resume' });
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockPDFParse = jest.fn().mockImplementation(() => ({
  getText: mockGetText,
  destroy: mockDestroy,
}));

jest.mock('pdf-parse', () => ({ PDFParse: mockPDFParse }));

import { extractTextFromFile } from '../services/resumeParserService';

describe('resume text extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the pdf-parse v2 class API and releases the parser', async () => {
    const pdf = Buffer.from('%PDF-1.7 synthetic fixture');

    await expect(extractTextFromFile(pdf, 'application/pdf'))
      .resolves.toBe('MockMate hosted acceptance resume');

    expect(mockPDFParse).toHaveBeenCalledWith({ data: pdf });
    expect(mockGetText).toHaveBeenCalledTimes(1);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});
