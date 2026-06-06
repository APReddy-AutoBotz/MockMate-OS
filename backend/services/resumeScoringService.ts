import { ResumeData } from '../types';
import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY || 'dummy';
const groq = new Groq({ apiKey });

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

    // High Confidence: Missing sections
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

    // High Confidence: Missing contact info
    if (!resume.basics.email || !resume.basics.phone) {
        result.highConfidenceIssues.push({ id: 'missing_contact', message: 'Missing email or phone number in contact information.' });
        result.score -= 20;
    }

    // High Confidence: Vague Bullets or missing verbs
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
                const hasVerb = actionVerbs.some(verb => lowerBullet.includes(verb));
                if (!hasVerb) vagueBulletCount++;
            }
        });
    });

    if (totalBullets > 0 && vagueBulletCount / totalBullets > 0.4) {
        result.highConfidenceIssues.push({ id: 'vague_bullets', message: `Over 40% of your bullets are vague or lack strong action verbs.` });
        result.score -= 15;
    }

    // Possible Risks
    if (!resume.summary || resume.summary.split(' ').length < 15) {
        result.possibleRiskIssues.push({ id: 'weak_summary', message: 'Summary is extremely brief or missing. Recommend expanding.' });
        result.score -= 5;
    }

    if (resume.skills?.length === 1 && resume.skills[0].items.length > 10) {
        result.possibleRiskIssues.push({ id: 'weak_skill_groups', message: 'Skills are grouped in one massive list. Consider categorizing them (e.g., Languages, Tools).' });
        result.score -= 5;
    }

    // Risky formatting detection via rawText layout estimation
    if (rawText.split('\n').filter(line => line.length > 80 && line.includes('   ')).length > 5) {
        result.possibleRiskIssues.push({ id: 'layout_risk', message: 'Our system had trouble grouping your text. This usually happens if you used a multi-column visual layout. We recommend testing a single-column layout instead.' });
        result.score -= 10;
    }

    return result;
}

export const runJDMatch = async (resume: ResumeData, jdText: string) => {
    // 1. Deterministic Extraction (Layer 1)
    const normalizedJD = jdText.toLowerCase();
    const allResumeText = JSON.stringify(resume).toLowerCase();
    
    // Simplistic taxonomy definition for MVP
    const taxonomy = ['react', 'node', 'typescript', 'javascript', 'python', 'java', 'c++', 'aws', 'azure', 'gcp', 'agile', 'scrum', 'sql', 'nosql', 'leadership', 'communication', 'management'];
    
    const matchedSkills = taxonomy.filter(skill => normalizedJD.includes(skill) && allResumeText.includes(skill));
    const missingSkills = taxonomy.filter(skill => normalizedJD.includes(skill) && !allResumeText.includes(skill));

    // 2. LLM Refinement (Layer 2)
    const prompt = `You are a precision JD Match Engine.
Task: Take the deterministic missing skills and matched skills, and extract any remaining "must-have" requirements from the JD that are not explicitly matched in the resume. Categorize them into 'Hard Skills' and 'Soft Skills'.

JD Text:
"""
${jdText.substring(0, 5000)}
"""

Deterministic Missing Skills: ${missingSkills.join(', ')}

Output valid JSON exactly matching the schema. DO NOT hallucinate missing skills if they aren't actually in the JD.

SCHEMA:
{
    "additionalMissingHardSkills": ["string"],
    "additionalMissingSoftSkills": ["string"],
    "jdMatchScore": 85 // estimated 0-100 score based on what is present vs missing
}
`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        });

        // Parse AI response
        const aiText = response.choices?.[0]?.message?.content || '{}';
        const parsedAI = JSON.parse(aiText);

        return {
            matchedSkills,
            deterministicMissingSkills: missingSkills,
            llmMissingHardSkills: parsedAI.additionalMissingHardSkills || [],
            llmMissingSoftSkills: parsedAI.additionalMissingSoftSkills || [],
            jdMatchScore: parsedAI.jdMatchScore || Math.max(0, 100 - (missingSkills.length * 10))
        };
    } catch (e) {
        console.error("Error in runJDMatch LLM step:", e);
        // Fallback to purely deterministic
        return {
            matchedSkills,
            deterministicMissingSkills: missingSkills,
            llmMissingHardSkills: [],
            llmMissingSoftSkills: [],
            jdMatchScore: Math.max(0, 100 - (missingSkills.length * 10))
        };
    }
}
