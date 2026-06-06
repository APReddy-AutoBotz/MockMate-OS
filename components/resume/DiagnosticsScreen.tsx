import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { ResumeData } from '../../types';

interface DiagnosticsScreenProps {
    resumeData: ResumeData;
    scores: any;
    onProceed: () => void;
    onBack: () => void;
}

const scoreColor = (s: number) => s >= 80 ? 'text-brand-primary' : s >= 55 ? 'text-amber-600' : 'text-red-600';
const scoreBg = (s: number) => s >= 80 ? 'bg-brand-primary/10 border-brand-primary/30' : s >= 55 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';
const scoreLabel = (s: number) => s >= 80 ? 'Strong resume' : s >= 55 ? 'Good start' : 'Needs attention';

export const DiagnosticsScreen: React.FC<DiagnosticsScreenProps> = ({ resumeData, scores, onProceed, onBack }) => {
    const ats = scores?.atsDiagnostics || { highConfidenceIssues: [], possibleRiskIssues: [], score: 100 };
    const jd = scores?.jdMatch;
    const atsScore = typeof ats.score === 'number' ? Math.round(ats.score) : 100;

    return (
        <div className="w-full space-y-6 mode-light">
            <div className={`rounded-[24px] border p-6 shadow-sm ${scoreBg(atsScore)} flex flex-col sm:flex-row items-start sm:items-center gap-6`}>
                <div className="text-center flex-shrink-0">
                    <div className={`text-6xl font-semibold tracking-tight ${scoreColor(atsScore)}`}>{atsScore}</div>
                    <div className="text-xs text-[var(--color-paper-muted)] mt-1">ATS score</div>
                </div>
                <div className="flex-1">
                    <h2 className="text-2xl font-semibold text-brand-dark mb-2">{scoreLabel(atsScore)}</h2>
                    <p className="text-[var(--color-paper-muted)] text-sm leading-relaxed">
                        {atsScore >= 80
                            ? 'Your resume has a clear structure. We will still help you polish the wording before download.'
                            : atsScore >= 55
                            ? 'You have a solid base. A few focused edits can make it easier for ATS systems and recruiters to read.'
                            : 'There are important fixes to make before you apply. We will guide you through them step by step.'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-paper-muted)]">What to fix</h3>

                    {ats.highConfidenceIssues.length === 0 && ats.possibleRiskIssues.length === 0 && (
                        <div className="bg-white border border-brand-primary/20 p-4 rounded-2xl flex items-start gap-3">
                            <CheckCircle2 className="text-brand-primary w-5 h-5 mt-0.5 flex-shrink-0" />
                            <div>
                                <h4 className="font-semibold text-brand-dark text-sm">Looks good</h4>
                                <p className="text-[var(--color-paper-muted)] text-xs mt-1">No major issues found. You can move on to improving your content.</p>
                            </div>
                        </div>
                    )}

                    {ats.highConfidenceIssues.length > 0 && (
                        <IssueList title="Fix these first" tone="error" issues={ats.highConfidenceIssues} />
                    )}

                    {ats.possibleRiskIssues.length > 0 && (
                        <IssueList title="Worth checking" tone="warning" issues={ats.possibleRiskIssues} />
                    )}

                    {jd && (
                        <div className="bg-white border border-brand-primary/20 p-4 rounded-2xl">
                            <h4 className="font-semibold text-brand-dark mb-2 text-sm">Job keywords</h4>
                            <p className="text-xs text-[var(--color-paper-muted)] mb-3">
                                <strong className="text-brand-dark font-semibold">{jd.matchedSkills?.length || 0}</strong> keywords matched from your target job description.
                            </p>
                            {jd.deterministicMissingSkills?.length > 0 && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-paper-muted)] mb-2">Missing keywords</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {jd.deterministicMissingSkills.map((skill: string) => (
                                            <span key={skill} className="rounded-full bg-brand-primary/10 text-brand-dark border border-brand-primary/20 px-3 py-1 text-xs font-medium">{skill}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="rounded-[24px] border border-[var(--color-paper-border)] bg-white p-6 shadow-sm flex flex-col">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-paper-muted)] mb-4">What we found</h3>
                    <div className="flex-1 space-y-3 text-sm">
                        <ParsedRow label="Name" value={resumeData.basics.name} />
                        <ParsedRow label="Email" value={resumeData.basics.email} />
                        <ParsedRow label="Phone" value={resumeData.basics.phone} />
                        <ParsedRow label="Location" value={resumeData.basics.location} />
                        <div className="border-t border-[var(--color-paper-border)] pt-3">
                            <ParsedRow label="Summary" value={resumeData.summary ? 'Found' : undefined} />
                            <ParsedRow label="Experience" value={resumeData.experience?.length > 0 ? `${resumeData.experience.length} role${resumeData.experience.length > 1 ? 's' : ''}` : undefined} />
                            <ParsedRow label="Skills" value={resumeData.skills?.length > 0 ? resumeData.skills.map(s => s.category).join(', ') : undefined} />
                            <ParsedRow label="Education" value={resumeData.education?.length > 0 ? `${resumeData.education.length} entry` : undefined} />
                        </div>
                    </div>

                    <div className="flex justify-between items-center mt-6 pt-4 border-t border-[var(--color-paper-border)]">
                        <button onClick={onBack} className="text-xs font-semibold text-[var(--color-paper-muted)] hover:text-brand-dark transition-colors">Upload again</button>
                        <button onClick={onProceed} className="rounded-xl bg-brand-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.12em] text-brand-dark shadow-sm transition-all hover:bg-brand-primary/90">Edit my resume</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IssueList: React.FC<{ title: string; tone: 'error' | 'warning'; issues: any[] }> = ({ title, tone, issues }) => (
    <div className={`border p-4 rounded-2xl ${tone === 'error' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <h4 className={`font-semibold mb-3 text-sm ${tone === 'error' ? 'text-red-700' : 'text-amber-700'}`}>{title}</h4>
        <ul className="space-y-2">
            {issues.map((issue: any) => (
                <li key={issue.id} className="text-xs text-[var(--color-paper-muted)] flex items-start gap-2 leading-relaxed">
                    <span className={tone === 'error' ? 'text-red-500' : 'text-amber-500'}>•</span>{issue.message}
                </li>
            ))}
        </ul>
    </div>
);

const ParsedRow: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-[var(--color-paper-border)] last:border-0">
        <span className="text-xs font-semibold text-[var(--color-paper-muted)] flex-shrink-0">{label}</span>
        {value
            ? <span className="text-xs text-brand-dark text-right font-medium">{value}</span>
            : <span className="text-xs text-red-600 font-medium">Missing. Add this.</span>}
    </div>
);

export default DiagnosticsScreen;
