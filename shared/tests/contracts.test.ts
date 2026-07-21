import {
  ApiErrorSchema,
  InterviewSessionContextSchema,
  SessionControlsSchema,
  FinalReportSchema,
  QuestionBlueprintSchema,
} from '../src';

describe('Shared Runtime Contracts (Zod)', () => {
  it('rejects an invalid ApiError', () => {
    const invalid = {
      code: 'NOT_A_REAL_CODE',
      message: 'Hello',
    };
    const result = ApiErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates a correct ApiError', () => {
    const valid = {
      code: 'NOT_FOUND',
      message: 'User not found',
    };
    const result = ApiErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects SessionControls with ambiguous or missing deliveryMode', () => {
    const invalid = {
      reasoningMode: 'classic_behavioral',
      // missing deliveryMode
    };
    const result = SessionControlsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates SessionControls with valid canonical modes', () => {
    const valid = {
      deliveryMode: 'coach',
      reasoningMode: 'problem_framing',
    };
    const result = SessionControlsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects QuestionBlueprint without required question field', () => {
    const invalid = {
      id: 'q1',
      // question missing
    };
    const result = QuestionBlueprintSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('validates QuestionBlueprint with valid fields', () => {
    const valid = {
      id: 'q1',
      question: 'Tell me about yourself',
    };
    const result = QuestionBlueprintSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
