import React, { useState } from 'react';
import { Check, ChevronRight, Loader2, Mic, Plus, RotateCcw, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { ResumeData } from 'mockmate-shared';
import {
    GovernedResumeSuggestionResponseSchema,
    type GovernedResumeBulletSuggestion,
    type GovernedResumeSummarySuggestion,
} from 'mockmate-shared/resume-integrity';
import { apiClient, ApiError } from '../../services/apiClient';

interface RewriteEditorScreenProps {
    resumeData: ResumeData;
    jdText: string;
    onProceed: (data: ResumeData) => void;
    onBack: () => void;
    onSpeakBridge: (summary: string) => void;
}

type SuggestionState = 'idle' | 'loading' | 'reviewing';

const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-brand-tint/45 focus:border-brand-primary/60 outline-none transition-all";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-tint mb-2";
const normalizeSource = (value?: string) => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export const RewriteEditorScreen: React.FC<RewriteEditorScreenProps> = ({ resumeData, jdText, onProceed, onBack, onSpeakBridge }) => {
    const [data, setData] = useState<ResumeData>(resumeData);
    const [suggestionState, setSuggestionState] = useState<SuggestionState>('idle');
    const [bulletSuggestions, setBulletSuggestions] = useState<GovernedResumeBulletSuggestion[]>([]);
    const [summarySuggestion, setSummarySuggestion] = useState<GovernedResumeSummarySuggestion | null>(null);
    const [acceptedBullets, setAcceptedBullets] = useState<Set<string>>(new Set());
    const [rejectedBullets, setRejectedBullets] = useState<Set<string>>(new Set());
    const [summaryAccepted, setSummaryAccepted] = useState<boolean | null>(null);
    const [jdUsed, setJdUsed] = useState(false);
    const [filteredSuggestionCount, setFilteredSuggestionCount] = useState(0);
    const [suggestionError, setSuggestionError] = useState('');

    const clearSuggestionReview = (message?: string) => {
        setSuggestionState('idle');
        setBulletSuggestions([]);
        setSummarySuggestion(null);
        setAcceptedBullets(new Set());
        setRejectedBullets(new Set());
        setSummaryAccepted(null);
        setFilteredSuggestionCount(0);
        if (message) setSuggestionError(message);
    };

    const update = (fn: (d: ResumeData) => ResumeData) => {
        setData(prev => fn({
            ...prev,
            basics: { ...prev.basics },
            skills: (prev.skills || []).map(s => ({ ...s, items: [...s.items] })),
            experience: (prev.experience || []).map(e => ({ ...e, bullets: [...e.bullets] })),
            education: (prev.education || []).map(e => ({ ...e })),
            projects: prev.projects ? prev.projects.map(p => ({ ...p })) : []
        }));
        if (suggestionState === 'reviewing') {
            clearSuggestionReview('Your resume changed while suggestions were open, so the old suggestions were discarded. Request fresh suggestions to continue.');
        }
    };

    const bulletKey = (expIdx: number, bulletIdx: number) => `${expIdx}-${bulletIdx}`;

    const handleGetSuggestions = async () => {
        setSuggestionState('loading');
        setSuggestionError('');
        try {
            const result = await apiClient.post(
                '/api/resume/suggest',
                GovernedResumeSuggestionResponseSchema,
                { resumeData: data, jdText },
            );
            setBulletSuggestions(result.bulletSuggestions);
            setSummarySuggestion(result.summarySuggestion);
            setJdUsed(result.jdUsed);
            setFilteredSuggestionCount(result.filteredSuggestionCount);
            setAcceptedBullets(new Set());
            setRejectedBullets(new Set());
            setSummaryAccepted(null);
            setSuggestionState('reviewing');
        } catch (error) {
            const message = error instanceof ApiError
                ? error.message
                : 'We could not prepare safe wording suggestions. Your resume was not changed.';
            setSuggestionError(message);
            setSuggestionState('idle');
        }
    };

    const acceptBullet = (suggestion: GovernedResumeBulletSuggestion) => {
        const current = data.experience?.[suggestion.expIdx]?.bullets?.[suggestion.bulletIdx];
        if (normalizeSource(current) !== normalizeSource(suggestion.original)) {
            clearSuggestionReview('That source bullet changed after these suggestions were created. No AI wording was applied; request fresh suggestions.');
            return;
        }

        setData(prev => {
            const next: ResumeData = {
                ...prev,
                experience: (prev.experience || []).map(exp => ({ ...exp, bullets: [...exp.bullets] })),
            };
            next.experience![suggestion.expIdx].bullets[suggestion.bulletIdx] = suggestion.suggested;
            return next;
        });
        setAcceptedBullets(prev => new Set([...prev, bulletKey(suggestion.expIdx, suggestion.bulletIdx)]));
    };

    const acceptSummary = (suggestion: GovernedResumeSummarySuggestion) => {
        if (normalizeSource(data.summary) !== normalizeSource(suggestion.original)) {
            clearSuggestionReview('The source summary changed after these suggestions were created. No AI wording was applied; request fresh suggestions.');
            return;
        }
        setData(prev => ({ ...prev, summary: suggestion.suggested }));
        setSummaryAccepted(true);
    };

    const rejectBullet = (suggestion: GovernedResumeBulletSuggestion) => {
        setRejectedBullets(prev => new Set([...prev, bulletKey(suggestion.expIdx, suggestion.bulletIdx)]));
    };

    const pending = bulletSuggestions.filter(suggestion => {
        const key = bulletKey(suggestion.expIdx, suggestion.bulletIdx);
        return !acceptedBullets.has(key) && !rejectedBullets.has(key);
    }).length + (summarySuggestion && summaryAccepted === null ? 1 : 0);

    return (
        <div className="w-full bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 rounded-[24px] flex flex-col"
            style={{ height: '82vh', boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
            <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 px-6 sm:px-8 py-5 border-b border-white/5 flex-shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Improve your resume</h2>
                    <p className="text-[11px] text-brand-tint mt-1">Review every AI wording change yourself. MockMate never auto-replaces your experience.</p>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                    {suggestionState === 'idle' && (
                        <button onClick={handleGetSuggestions}
                            className="flex items-center text-xs bg-brand-primary/10 text-brand-primary border border-brand-primary/25 px-4 py-2 rounded-xl hover:bg-brand-primary/15 transition gap-2 font-bold">
                            <Wand2 className="w-3.5 h-3.5" />
                            {jdText ? 'Suggest role-ready wording' : 'Suggest stronger wording'}
                        </button>
                    )}
                    {suggestionState === 'loading' && (
                        <div className="flex items-center text-xs text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-4 py-2 rounded-xl gap-2 font-bold">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing suggestions...
                        </div>
                    )}
                    {suggestionState === 'reviewing' && (
                        <button onClick={() => clearSuggestionReview()}
                            className="flex items-center text-xs bg-white/5 text-brand-tint border border-white/10 px-3 py-2 rounded-xl hover:bg-white/10 transition gap-1.5 font-semibold">
                            <X className="w-3 h-3" /> Done reviewing
                        </button>
                    )}
                    <button onClick={() => onSpeakBridge(data.summary || '')}
                        className="flex items-center text-xs bg-white/5 text-brand-tint border border-white/10 px-3 py-2 rounded-xl hover:bg-white/10 hover:text-white transition gap-1.5 font-semibold">
                        <Mic className="w-3.5 h-3.5" /> Practice speaking
                    </button>
                </div>
            </div>

            {suggestionError && (
                <div className="px-6 sm:px-8 py-3 bg-red-500/10 border-b border-red-300/15 flex-shrink-0" role="alert">
                    <p className="text-xs text-red-200">{suggestionError}</p>
                </div>
            )}

            {suggestionState === 'reviewing' && (
                <div className="px-6 sm:px-8 py-3 bg-brand-primary/5 border-b border-brand-primary/15 flex-shrink-0">
                    <p className="text-xs text-brand-primary font-semibold flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        {jdUsed ? 'The target role influenced emphasis only.' : 'Suggestions focus on clearer resume wording.'} Each proposal passed MockMate's factual-integrity checks, but you still decide whether to use it.
                    </p>
                    {filteredSuggestionCount > 0 && (
                        <p className="mt-1 text-[10px] text-brand-tint">{filteredSuggestionCount} provider suggestion{filteredSuggestionCount === 1 ? ' was' : 's were'} withheld because it did not pass the integrity policy.</p>
                    )}
                    {pending === 0 && (
                        <p className="mt-1 text-[10px] text-brand-tint">No unreviewed safe suggestions remain.</p>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-8 custom-scrollbar">
                <EditorSection title="Professional Summary">
                    {suggestionState === 'reviewing' && summarySuggestion && summaryAccepted === null ? (
                        <SuggestionBox
                            original={summarySuggestion.original}
                            suggested={summarySuggestion.suggested}
                            onAccept={() => acceptSummary(summarySuggestion)}
                            onReject={() => setSummaryAccepted(false)}
                        />
                    ) : (
                        <div className="relative">
                            <textarea value={data.summary || ''} onChange={e => update(d => ({ ...d, summary: e.target.value }))}
                                className={`${inputCls} min-h-[90px] resize-none`} placeholder="Your professional summary..." />
                            {summaryAccepted === true && <AcceptedBadge />}
                        </div>
                    )}
                </EditorSection>

                <EditorSection title="Experience">
                    {(data.experience || []).map((exp, expIdx) => (
                        <div key={expIdx} className="mb-6 bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-bold text-brand-tint uppercase tracking-[0.12em]">Role {expIdx + 1}</span>
                                {expIdx > 0 && <button onClick={() => update(d => ({ ...d, experience: (d.experience || []).filter((_, i) => i !== expIdx) }))}
                                    className="text-brand-tint hover:text-red-300 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                {(['company', 'position'] as const).map(field => (
                                    <div key={field}><label className={labelCls}>{field}</label>
                                        <input type="text" value={exp[field]} onChange={e => update(d => { d.experience![expIdx][field] = e.target.value; return d; })} className={inputCls} /></div>
                                ))}
                                {(['startDate', 'endDate'] as const).map(field => (
                                    <div key={field}><label className={labelCls}>{field === 'startDate' ? 'Start Date' : 'End Date'}</label>
                                        <input type="text" value={exp[field] || ''} onChange={e => update(d => { d.experience![expIdx][field] = e.target.value; return d; })} className={inputCls} /></div>
                                ))}
                            </div>
                            <label className={labelCls}>Achievement bullets</label>
                            <div className="space-y-3">
                                {exp.bullets.map((bullet, bulletIdx) => {
                                    const key = bulletKey(expIdx, bulletIdx);
                                    const suggestion = bulletSuggestions.find(item => item.expIdx === expIdx && item.bulletIdx === bulletIdx);
                                    const isPending = suggestion && suggestionState === 'reviewing' && !acceptedBullets.has(key) && !rejectedBullets.has(key);

                                    if (isPending && suggestion) {
                                        return (
                                            <SuggestionBox
                                                key={key}
                                                original={suggestion.original}
                                                suggested={suggestion.suggested}
                                                onAccept={() => acceptBullet(suggestion)}
                                                onReject={() => rejectBullet(suggestion)}
                                            />
                                        );
                                    }
                                    return (
                                        <div key={key} className="flex gap-2 items-start relative">
                                            {acceptedBullets.has(key) && <AcceptedBadge />}
                                            <textarea value={bullet}
                                                onChange={e => update(d => { d.experience![expIdx].bullets[bulletIdx] = e.target.value; return d; })}
                                                className={`${inputCls} min-h-[56px] resize-none flex-1`} />
                                            {bulletIdx > 0 && <button onClick={() => update(d => { d.experience![expIdx].bullets = d.experience![expIdx].bullets.filter((_, i) => i !== bulletIdx); return d; })}
                                                className="flex-shrink-0 text-brand-tint hover:text-red-300 transition-colors p-2 rounded-xl border border-white/5 hover:border-red-300/30 mt-1"><X className="w-3 h-3" /></button>}
                                        </div>
                                    );
                                })}
                            </div>
                            <button onClick={() => update(d => { d.experience![expIdx].bullets.push(''); return d; })}
                                className="mt-3 text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1.5 transition-colors">
                                <Plus className="w-3.5 h-3.5" /> Add bullet
                            </button>
                        </div>
                    ))}
                    <button onClick={() => update(d => ({ ...d, experience: [...(d.experience || []), { company: '', position: '', startDate: '', endDate: '', bullets: [''] }] }))}
                        className="w-full border border-dashed border-white/10 hover:border-brand-primary/30 rounded-2xl py-3 text-xs text-brand-tint hover:text-white transition-all flex items-center justify-center gap-2">
                        <Plus className="w-3.5 h-3.5" /> Add role
                    </button>
                </EditorSection>

                <EditorSection title="Skills">
                    {(data.skills || []).map((skillGroup, i) => (
                        <div key={i} className="mb-3">
                            <div className="flex gap-3 items-center mb-2">
                                <input value={skillGroup.category} onChange={e => update(d => { d.skills![i].category = e.target.value; return d; })}
                                    className={`${inputCls} flex-shrink-0 w-40 text-xs`} placeholder="Category" />
                                <button onClick={() => update(d => ({ ...d, skills: (d.skills || []).filter((_, idx) => idx !== i) }))}
                                    className="text-brand-tint hover:text-red-300 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {skillGroup.items.map((item, j) => (
                                    <span key={j} className="flex items-center gap-1.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs px-3 py-1.5 rounded-full font-medium">
                                        {item}
                                        <button onClick={() => update(d => { d.skills![i].items = d.skills![i].items.filter((_, idx) => idx !== j); return d; })}
                                            className="text-brand-primary/60 hover:text-red-300 transition-colors"><X className="w-2.5 h-2.5" /></button>
                                    </span>
                                ))}
                                <input placeholder="+ skill, Enter"
                                    className="bg-transparent border border-dashed border-white/10 text-brand-tint text-xs px-3 py-1.5 rounded-full outline-none focus:border-brand-primary/40 focus:text-white transition-all min-w-[140px]"
                                    onKeyDown={e => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { update(d => { d.skills![i].items.push(e.currentTarget.value.trim()); return d; }); e.currentTarget.value = ''; } }} />
                            </div>
                        </div>
                    ))}
                    <button onClick={() => update(d => ({ ...d, skills: [...(d.skills || []), { category: 'New Category', items: [] }] }))}
                        className="mt-2 text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1.5 transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Add skill category
                    </button>
                </EditorSection>

                <EditorSection title="Education">
                    {(data.education || []).map((education, i) => (
                        <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 items-center">
                            <div><label className={labelCls}>Institution</label>
                                <input value={education.institution} onChange={e => update(d => { d.education![i].institution = e.target.value; return d; })} className={inputCls} /></div>
                            <div><label className={labelCls}>Degree</label>
                                <input value={education.degree} onChange={e => update(d => { d.education![i].degree = e.target.value; return d; })} className={inputCls} /></div>
                            <div className="flex gap-2 items-end">
                                <div className="flex-1"><label className={labelCls}>Year</label>
                                    <input value={education.year || ''} onChange={e => update(d => { d.education![i].year = e.target.value; return d; })} className={inputCls} /></div>
                                {i > 0 && <button onClick={() => update(d => ({ ...d, education: (d.education || []).filter((_, idx) => idx !== i) }))}
                                    className="text-brand-tint hover:text-red-300 transition-colors pb-3"><Trash2 className="w-4 h-4" /></button>}
                            </div>
                        </div>
                    ))}
                    <button onClick={() => update(d => ({ ...d, education: [...(d.education || []), { institution: '', degree: '', year: '' }] }))}
                        className="text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1.5 transition-colors mt-1">
                        <Plus className="w-3.5 h-3.5" /> Add education
                    </button>
                </EditorSection>
            </div>

            <div className="px-6 sm:px-8 py-5 border-t border-white/5 flex justify-between items-center flex-shrink-0">
                <button onClick={onBack} className="text-xs text-brand-tint hover:text-white transition-colors uppercase tracking-[0.12em]">Back</button>
                <button onClick={() => onProceed(data)}
                    className="bg-brand-primary hover:bg-brand-primary/90 text-brand-dark font-bold px-8 py-3 rounded-xl text-xs uppercase tracking-[0.12em] transition-all hover:-translate-y-0.5 flex items-center gap-2 shadow-[0_8px_20px_-8px_rgba(255,188,3,0.4)]">
                    Download options <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const EditorSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section>
        <h3 className="text-xs font-bold text-brand-primary/80 uppercase tracking-[0.14em] mb-4 flex items-center gap-3">
            {title} <span className="flex-1 h-px bg-brand-primary/10" />
        </h3>
        {children}
    </section>
);

const SuggestionBox: React.FC<{ original: string; suggested: string; onAccept: () => void; onReject: () => void }> = ({ original, suggested, onAccept, onReject }) => (
    <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 overflow-hidden mb-2">
        <div className="px-4 py-3 border-b border-white/5">
            <p className="text-[10px] font-bold text-brand-tint uppercase tracking-[0.12em] mb-1">Original</p>
            <p className="text-xs text-brand-tint leading-relaxed line-through decoration-white/20">{original}</p>
        </div>
        <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em] mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" />Suggested wording
            </p>
            <p className="text-xs text-white/85 leading-relaxed font-medium">{suggested}</p>
        </div>
        <div className="px-4 py-3 border-t border-white/5 flex gap-2">
            <button onClick={onAccept}
                className="flex items-center gap-1.5 bg-brand-primary hover:bg-brand-primary/90 text-brand-dark text-[10px] font-bold px-4 py-1.5 rounded-lg uppercase tracking-[0.12em] transition-all">
                <Check className="w-3 h-3" /> Use this
            </button>
            <button onClick={onReject}
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-brand-tint text-[10px] font-bold px-4 py-1.5 rounded-lg uppercase tracking-[0.12em] transition-all">
                <RotateCcw className="w-3 h-3" /> Keep original
            </button>
        </div>
    </div>
);

const AcceptedBadge: React.FC = () => (
    <div className="absolute -top-2 -right-2 z-10 bg-brand-primary text-brand-dark text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-[0.12em] flex items-center gap-1">
        <Check className="w-2.5 h-2.5" /> Used
    </div>
);

export default RewriteEditorScreen;
