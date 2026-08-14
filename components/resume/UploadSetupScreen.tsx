import React, { useState, useCallback } from 'react';
import { UploadCloud, PenTool, Loader2, FileText, X, Plus, Trash2 } from 'lucide-react';
import { ResumeData } from 'mockmate-shared';
import { GovernedResumeScoreResponseSchema, ResumeParseResponseSchema } from 'mockmate-shared/resume-integrity';
import { apiClient, ApiError } from '../../services/apiClient';

interface UploadSetupScreenProps {
    onComplete: (data: ResumeData, jd: string, rawText: string, atsMetrics: unknown) => void;
}

const inputCls = "w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-brand-tint/45 focus:border-brand-primary/60 focus:bg-white/[0.06] outline-none transition-all";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary/80 mb-2";

const supportedResumeFile = (file: File) => {
    const name = file.name.toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.docx');
};

const friendlyResumeError = (error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if ((error instanceof ApiError && error.status === 429) || /429|quota|too many|rate/i.test(message)) {
        return "You've used today's free resume reviews. You can keep editing your resume here and try another review tomorrow.";
    }
    if (error instanceof ApiError && error.status === 503) {
        return 'Resume AI is temporarily unavailable. Your file was not changed or saved; please try again later or build the resume manually.';
    }
    return message || 'We could not review your resume. Please try again.';
};

export const UploadSetupScreen: React.FC<UploadSetupScreenProps> = ({ onComplete }) => {
    const [mode, setMode] = useState<'CHOOSER' | 'UPLOAD' | 'SCRATCH'>('CHOOSER');
    const [file, setFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [jdText, setJdText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState('');

    const [basics, setBasics] = useState({ name: '', email: '', phone: '', location: '' });
    const [summary, setSummary] = useState('');
    const [skills, setSkills] = useState([{ category: 'Technical Skills', items: '' }]);
    const [education, setEducation] = useState([{ institution: '', degree: '', year: '' }]);
    const [experience, setExperience] = useState([{ company: '', position: '', startDate: '', endDate: '', bullets: [''] }]);

    const selectFile = useCallback((candidate?: File | null) => {
        if (!candidate) {
            setFile(null);
            return;
        }
        if (!supportedResumeFile(candidate)) {
            setFile(null);
            setError('Please choose a PDF or DOCX file.');
            return;
        }
        if (candidate.size > 10 * 1024 * 1024) {
            setFile(null);
            setError('Please choose a resume smaller than 10MB.');
            return;
        }
        setFile(candidate);
        setError('');
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        setIsDragOver(false);
        selectFile(event.dataTransfer.files[0]);
    }, [selectFile]);

    const handleFileUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        setError('');
        const formData = new FormData();
        formData.append('resume', file);
        try {
            const parsed = await apiClient.post('/api/resume/parse', ResumeParseResponseSchema, formData);
            const score = await apiClient.post('/api/resume/score', GovernedResumeScoreResponseSchema, {
                resumeData: parsed.resumeData,
                rawText: parsed.rawText,
                jdText,
            });
            onComplete(parsed.resumeData, jdText, parsed.rawText, score);
        } catch (caught) {
            setError(friendlyResumeError(caught));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleScratchProceed = async () => {
        setIsProcessing(true);
        setError('');
        try {
            const builtData: ResumeData = {
                basics,
                summary,
                skills: skills.map(group => ({
                    category: group.category,
                    items: group.items.split(',').map(skill => skill.trim()).filter(Boolean),
                })),
                experience: experience.map(role => ({ ...role, bullets: role.bullets.filter(Boolean) })),
                education,
                projects: [],
            };
            const score = await apiClient.post('/api/resume/score', GovernedResumeScoreResponseSchema, {
                resumeData: builtData,
                rawText: '',
                jdText,
            });
            onComplete(builtData, jdText, '', score);
        } catch (caught) {
            setError(friendlyResumeError(caught));
        } finally {
            setIsProcessing(false);
        }
    };

    if (mode === 'CHOOSER') return (
        <div className="flex flex-col items-center px-0 sm:px-4">
            <div className="mb-8 text-center sm:mb-10">
                <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em] mb-3">Choose how to start</p>
                <h2 className="mb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">Bring your resume or build one here.</h2>
                <p className="text-brand-tint text-base max-w-md leading-relaxed">Make it easier for ATS systems and recruiters to understand your experience.</p>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                {[
                    { icon: UploadCloud, label: 'Upload existing resume', desc: 'Fastest. We will read your PDF or DOCX and show what to improve.', action: () => setMode('UPLOAD') },
                    { icon: PenTool, label: 'Build from scratch', desc: 'No resume yet? We will guide you section by section.', action: () => setMode('SCRATCH') }
                ].map(({ icon: Icon, label, desc, action }) => (
                    <button key={label} onClick={action}
                        className="group flex flex-col items-start rounded-[22px] border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 text-left transition-all duration-500 hover:-translate-y-1 hover:border-brand-primary/30 hover:shadow-[0_20px_40px_-20px_rgba(255,188,3,0.15)] sm:p-8"
                        style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                        <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center mb-5 text-brand-primary group-hover:scale-110 transition-transform duration-300">
                            <Icon className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">{label}</h3>
                        <p className="text-sm text-brand-tint leading-relaxed">{desc}</p>
                    </button>
                ))}
            </div>
        </div>
    );

    if (mode === 'UPLOAD') return (
        <div className="mx-auto w-full max-w-2xl px-0 sm:px-4">
            <button onClick={() => setMode('CHOOSER')} className="text-brand-tint hover:text-white text-xs font-bold uppercase tracking-[0.12em] mb-8 transition-colors">Back</button>
            <h2 className="text-3xl font-black text-white tracking-tighter mb-2">Upload your resume</h2>
            <p className="text-brand-tint text-sm mb-8">We will review it and show practical ways to improve it.</p>

            <div
                onDrop={onDrop}
                onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => document.getElementById('file-input')?.click()}
                className={`relative mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all sm:p-10 ${isDragOver ? 'border-brand-primary/70 bg-brand-primary/10' : 'border-white/10 hover:border-brand-primary/30 hover:bg-white/[0.02]'}`}>
                <input id="file-input" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden"
                    onChange={event => selectFile(event.target.files?.[0])} />
                {file ? (
                    <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-brand-primary" />
                        <div className="text-left">
                            <p className="text-white font-semibold text-sm">{file.name}</p>
                            <p className="text-brand-tint text-xs">{(file.size / 1024).toFixed(0)} KB</p>
                        </div>
                        <button onClick={(event) => { event.stopPropagation(); setFile(null); }} className="ml-4 text-brand-tint hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                ) : (
                    <>
                        <UploadCloud className={`w-10 h-10 mb-3 transition-colors ${isDragOver ? 'text-brand-primary' : 'text-brand-tint'}`} />
                        <p className="text-white font-semibold text-sm mb-1">Drop your resume here</p>
                        <p className="text-brand-tint text-xs">or click to browse. PDF or DOCX, max 10MB.</p>
                    </>
                )}
            </div>

            <div className="mb-6">
                <label className={labelCls}>Target job description <span className="text-brand-tint normal-case tracking-normal">optional, but helpful</span></label>
                <textarea value={jdText} onChange={event => setJdText(event.target.value)} rows={4}
                    className={inputCls} placeholder="Paste the job description here to compare your resume with the role." />
            </div>

            {error && <div role="alert" className="text-red-300 text-sm mb-4 px-4 py-3 bg-red-900/20 border border-red-400/20 rounded-xl">{error}</div>}

            <button onClick={handleFileUpload} disabled={isProcessing || !file}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-40 text-brand-dark font-bold py-4 rounded-xl text-sm uppercase tracking-[0.12em] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(255,188,3,0.4)]">
                {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Reviewing your resume...</> : 'Review my resume'}
            </button>
        </div>
    );

    return (
        <div className="mx-auto w-full max-w-2xl px-0 pb-10 sm:px-4">
            <button onClick={() => setMode('CHOOSER')} className="text-brand-tint hover:text-white text-xs font-bold uppercase tracking-[0.12em] mb-8 transition-colors">Back</button>
            <h2 className="text-3xl font-black text-white tracking-tighter mb-2">Build your resume</h2>
            <p className="text-brand-tint text-sm mb-8">Fill in the sections below. We will help you improve the wording next.</p>

            <Section title="Contact Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(['name', 'email', 'phone', 'location'] as const).map(field => (
                        <div key={field}>
                            <label className={labelCls}>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                            <input className={inputCls} placeholder={field === 'name' ? 'Full Name' : field === 'email' ? 'you@example.com' : field === 'phone' ? '+1 555 000 0000' : 'City, Country'}
                                value={basics[field]} onChange={event => setBasics({ ...basics, [field]: event.target.value })} />
                        </div>
                    ))}
                </div>
            </Section>

            <Section title="Professional Summary">
                <textarea className={inputCls} rows={3} placeholder="A 2-3 sentence summary of your background, key skills, and career goal."
                    value={summary} onChange={event => setSummary(event.target.value)} />
            </Section>

            <Section title="Experience">
                {experience.map((role, index) => (
                    <div key={index} className="mb-6 bg-white/[0.02] border border-white/5 rounded-2xl p-5">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-xs font-bold text-brand-tint uppercase tracking-[0.12em]">Role {index + 1}</span>
                            {index > 0 && <button onClick={() => setExperience(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-red-300 hover:text-red-200 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            {(['company', 'position'] as const).map(field => <div key={field}><label className={labelCls}>{field}</label><input className={inputCls} placeholder={field === 'company' ? 'Company Name' : 'Job Title'} value={role[field]} onChange={event => setExperience(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} /></div>)}
                            {(['startDate', 'endDate'] as const).map(field => <div key={field}><label className={labelCls}>{field === 'startDate' ? 'Start Date' : 'End Date'}</label><input className={inputCls} placeholder="e.g. Jan 2022" value={role[field]} onChange={event => setExperience(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))} /></div>)}
                        </div>
                        <label className={labelCls}>Key achievements, one per line</label>
                        {role.bullets.map((bullet, bulletIndex) => (
                            <div key={bulletIndex} className="flex gap-2 mb-2">
                                <input className={inputCls} placeholder={`Achievement ${bulletIndex + 1}...`} value={bullet}
                                    onChange={event => setExperience(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, bullets: item.bullets.map((currentBullet, currentBulletIndex) => currentBulletIndex === bulletIndex ? event.target.value : currentBullet) } : item))} />
                                {bulletIndex > 0 && <button onClick={() => setExperience(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, bullets: item.bullets.filter((_, currentBulletIndex) => currentBulletIndex !== bulletIndex) } : item))} className="text-brand-tint hover:text-red-300 transition-colors flex-shrink-0"><X className="w-4 h-4" /></button>}
                            </div>
                        ))}
                        <button onClick={() => setExperience(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, bullets: [...item.bullets, ''] } : item))}
                            className="text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1 mt-1 transition-colors"><Plus className="w-3 h-3" /> Add bullet</button>
                    </div>
                ))}
                <button onClick={() => setExperience(current => [...current, { company: '', position: '', startDate: '', endDate: '', bullets: [''] }])}
                    className="w-full border border-dashed border-white/10 rounded-2xl py-3 text-xs text-brand-tint hover:text-white hover:border-brand-primary/30 transition-all flex items-center justify-center gap-2">
                    <Plus className="w-3.5 h-3.5" /> Add another role
                </button>
            </Section>

            <Section title="Skills">
                {skills.map((group, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 items-center">
                        <input className={inputCls} placeholder="Category" value={group.category} onChange={event => setSkills(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item))} />
                        <div className="sm:col-span-2 flex gap-2">
                            <input className={inputCls} placeholder="Skill 1, Skill 2, Skill 3..." value={group.items} onChange={event => setSkills(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, items: event.target.value } : item))} />
                            {index > 0 && <button onClick={() => setSkills(current => current.filter((_, itemIndex) => itemIndex !== index))} className="text-brand-tint hover:text-red-300 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                    </div>
                ))}
                <button onClick={() => setSkills(current => [...current, { category: '', items: '' }])}
                    className="text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1 transition-colors mt-1"><Plus className="w-3 h-3" /> Add skill category</button>
            </Section>

            <Section title="Education">
                {education.map((entry, index) => (
                    <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <input className={inputCls} placeholder="Institution" value={entry.institution} onChange={event => setEducation(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, institution: event.target.value } : item))} />
                        <input className={inputCls} placeholder="Degree / Major" value={entry.degree} onChange={event => setEducation(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, degree: event.target.value } : item))} />
                        <input className={inputCls} placeholder="Year" value={entry.year} onChange={event => setEducation(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, year: event.target.value } : item))} />
                    </div>
                ))}
                <button onClick={() => setEducation(current => [...current, { institution: '', degree: '', year: '' }])}
                    className="text-xs text-brand-primary/80 hover:text-brand-primary flex items-center gap-1 transition-colors mt-1"><Plus className="w-3 h-3" /> Add education</button>
            </Section>

            <Section title="Target Job Description">
                <textarea rows={4} className={inputCls} placeholder="Paste a job description to compare your resume with the role." value={jdText} onChange={event => setJdText(event.target.value)} />
            </Section>

            {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-900/20 px-4 py-3 text-sm text-red-200">{error}</div>}

            <button onClick={handleScratchProceed} disabled={isProcessing || !basics.name.trim()}
                className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-40 text-brand-dark font-bold py-4 rounded-xl text-sm uppercase tracking-[0.12em] transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 shadow-[0_10px_30px_-10px_rgba(255,188,3,0.4)] mt-4">
                {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Building your resume...</> : 'Review my resume'}
            </button>
        </div>
    );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="mb-8">
        <h3 className="text-xs font-bold text-brand-primary uppercase tracking-[0.14em] mb-4 flex items-center gap-3">
            {title}
            <span className="flex-1 h-px bg-brand-primary/10" />
        </h3>
        {children}
    </div>
);

export default UploadSetupScreen;
