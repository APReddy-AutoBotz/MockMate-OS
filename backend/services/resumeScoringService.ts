import { ResumeData } from 'mockmate-shared';
import type { GovernedJDMatchResult } from 'mockmate-shared/resume-integrity';
import Groq from 'groq-sdk';

const providerClient = (): Groq | null => {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    return apiKey ? new Groq({ apiKey }) : null;
};

export interface ATSDiagnosticsResult {
    highConfidenceIssues: { id: string, message: string }[];
    possibleRiskIssues: { id: string, message: string }[];
    score: number;
}

export const runATSDiagnostics = (resume: ResumeData, rawText: string): ATSDiagnosticsResult => {
    const result: ATSDiagnosticsResult = {
        highConfidenceIssues: [],
        possibleRiskIssues: [],
        score: 100
    };

    if (!resume.experience || resume.experience.length === 0) {
        result.highConfidenceIssues.push({ id: 'missing_exp', message: 'Missing mandatory Experience section.' });
        result.score -= 20;
    }
    if (!resume.education || resume.education.length === 0) {
        result.highConfidenceIssues.push({ id: 'missing_edu', message: 'Missing mandatory Education section.' });
        result.score -= 10;
    }
    if (!resume.skills || resume.skills.length === 0) {
        result.highConfidenceIssues.push({ id: 'missing_skills', message: 'Missing mandatory Skills section.' });
        result.score -= 10;
    }
    if (!resume.basics.email || !resume.basics.phone) {
        result.highConfidenceIssues.push({ id: 'missing_contact', message: 'Missing email or phone number in contact information.' });
        result.score -= 20;
    }

    let vagueBulletCount = 0;
    let totalBullets = 0;
    const actionVerbs = ['managed', 'developed', 'led', 'designed', 'created', 'built', 'implemented', 'improved', 'reduced', 'increased', 'delivered'];
    resume.experience?.forEach(exp => {
        exp.bullets?.forEach(bullet => {
            totalBullets++;
            if (bullet.length < 30) {
                vagueBulletCount++;
            } else {
                const lowerBullet = bullet.toLowerCase();
                if (!actionVerbs.some(verb => lowerBullet.includes(verb))) vagueBulletCount++;
            }
        });
    });

    if (totalBullets > 0 && vagueBulletCount / totalBullets > 0.4) {
        result.highConfidenceIssues.push({ id: 'vague_bullets', message: 'Over 40% of your bullets are vague or lack strong action verbs.' });
        result.score -= 15;
    }

    if (!resume.summary || resume.summary.split(' ').length < 15) {
        result.possibleRiskIssues.push({ id: 'weak_summary', message: 'Summary is extremely brief or missing. Recommend expanding.' });
        result.score -= 5;
    }
    if (resume.skills?.length === 1 && resume.skills[0].items.length > 10) {
        result.possibleRiskIssues.push({ id: 'weak_skill_groups', message: 'Skills are grouped in one massive list. Consider categorizing them (e.g., Languages, Tools).' });
        result.score -= 5;
    }
    if (rawText.split('\n').filter(line => line.length > 80 && line.includes('   ')).length > 5) {
        result.possibleRiskIssues.push({ id: 'layout_risk', message: 'Our system had trouble grouping your text. This usually happens if you used a multi-column visual layout. We recommend testing a single-column layout instead.' });
        result.score -= 10;
    }

    result.score = Math.max(0, Math.min(100, result.score));
    return result;
};

const cleanMissingRequirements = (value: unknown, jdText: string, resumeText: string): string[] => {
    if (!Array.isArray(value)) return [];
    const normalizedJD = jdText.toLowerCase();
    const normalizedResume = resumeText.toLowerCase();
    const seen = new Set<string>();
    const grounded: string[] = [];

    for (const candidate of value) {
        if (typeof candidate !== 'string') continue;
        const text = candidate.replace(/\s+/g, ' ').trim();
        const normalized = text.toLowerCase();
        if (!text || text.length > 120 || seen.has(normalized)) continue;
        if (!normalizedJD.includes(normalized) || normalizedResume.includes(normalized)) continue;
        seen.add(normalized);
        grounded.push(text);
        if (grounded.length >= 20) break;
    }
    return grounded;
};

const uniqueRequirements = (values: string[]): string[] => {
    const seen = new Set<string>();
    return values.filter(value => {
        const normalized = value.toLowerCase().trim();
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
};

const buildJDResult = (
    matchedSkills: string[],
    deterministicMissingSkills: string[],
    llmMissingHardSkills: string[] = [],
    llmMissingSoftSkills: string[] = [],
): GovernedJDMatchResult => {
    const knownRequirements = uniqueRequirements([
        ...matchedSkills,
        ...deterministicMissingSkills,
        ...llmMissingHardSkills,
        ...llmMissingSoftSkills,
    ]);

    if (knownRequirements.length === 0) {
        return {
            scoreStatus: 'insufficient_coverage',
            jdMatchScore: null,
            matchedSkills,
            deterministicMissingSkills,
            llmMissingHardSkills,
            llmMissingSoftSkills,
        };
    }

    return {
        scoreStatus: 'scored',
        jdMatchScore: Math.round((matchedSkills.length / knownRequirements.length) * 100),
        matchedSkills,
        deterministicMissingSkills,
        llmMissingHardSkills,
        llmMissingSoftSkills,
    };
};

export const runJDMatch = async (resume: ResumeData, jdText: string): Promise<GovernedJDMatchResult> => {
    const normalizedJD = jdText.toLowerCase();
    const resumeText = JSON.stringify(resume);
    const normalizedResume = resumeText.toLowerCase();

    const taxonomy = [
        'react', 'node', 'typescript', 'javascript', 'python', 'java', 'c++', 'aws', 'azure', 'gcp',
        'agile', 'scrum', 'sql', 'nosql', 'leadership', 'communication', 'management', 'tableau',
        'power bi', 'salesforce', 'sap', 'uipath', 'automation anywhere', 'power automate', 'cpa',
    ];
    const requiredTaxonomy = taxonomy.filter(skill => normalizedJD.includes(skill));
    const matchedSkills = requiredTaxonomy.filter(skill => normalizedResume.includes(skill));
    const missingSkills = requiredTaxonomy.filter(skill => !normalizedResume.includes(skill));
    const deterministic = buildJDResult(matchedSkills, missingSkills);

    const groq = providerClient();
    if (!groq) return deterministic;

    const prompt = `You are a JD requirement classifier. The server owns scoring; you only identify additional requirements that are explicitly written in the supplied job description and absent from the candidate resume.

RULES:
- Never infer or invent a requirement.
- Return only phrases that appear verbatim in the JD text.
- Do not convert a JD requirement into a candidate skill.
- Output JSON exactly as {"additionalMissingHardSkills":[],"additionalMissingSoftSkills":[]}.

JD TEXT:\n${jdText.substring(0, 5000)}

CANDIDATE RESUME:\n${resumeText.substring(0, 8000)}

KNOWN MISSING TAXONOMY TERMS: ${missingSkills.join(', ')}`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' },
        });
        const parsed = JSON.parse(response.choices?.[0]?.message?.content || '{}');
        const llmMissingHardSkills = cleanMissingRequirements(parsed.additionalMissingHardSkills, jdText, resumeText);
        const llmMissingSoftSkills = cleanMissingRequirements(parsed.additionalMissingSoftSkills, jdText, resumeText);
        return buildJDResult(matchedSkills, missingSkills, llmMissingHardSkills, llmMissingSoftSkills);
    } catch {
        console.error('[RESUME_JD_CLASSIFIER_UNAVAILABLE]');
        return deterministic;
    }
};
