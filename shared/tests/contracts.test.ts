import { FinalReportSchema, QuestionBlueprintSchema } from '../src/index';

describe('Shared Contracts', () => {
    it('validates a complete QuestionBlueprint', () => {
        const validQuestion = {
            id: 'q1',
            phase: 'intro',
            difficulty: 'starter',
            question: 'Tell me about yourself',
            expectedSignals: ['communication', 'clarity'],
            personaFocus: 'hiring_manager'
        };
        const result = QuestionBlueprintSchema.safeParse(validQuestion);
        expect(result.success).toBe(true);
    });

    it('rejects QuestionBlueprint missing expectedSignals', () => {
        const invalidQuestion = {
            id: 'q1',
            phase: 'intro',
            difficulty: 'starter',
            question: 'Tell me about yourself',
            personaFocus: 'hiring_manager'
        };
        const result = QuestionBlueprintSchema.safeParse(invalidQuestion);
        expect(result.success).toBe(false);
    });
});
