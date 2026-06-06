import React from 'react';
import { ResumeData } from '../../../types';

// ─────────────────────────────────────────────────────────────────────────────
// SANITIZER
// ─────────────────────────────────────────────────────────────────────────────
const s = (val?: string | null): string => {
    if (!val) return '';
    let t = val.trim();
    if (!t) return '';
    if (/^(string|number|boolean|object|array)$/i.test(t)) return '';
    if (/string\s*\(/.test(t)) return '';
    if (/not specified/i.test(t)) return '';
    if (/not provided/i.test(t)) return '';
    if (/\(optional\)/i.test(t)) return '';
    if (/^n\/a$/i.test(t)) return '';
    if (/^null$/i.test(t)) return '';
    // Strip AI-injected surrounding quotes
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        t = t.slice(1, -1).trim();
    }
    return t;
};

const contactLine = (d: ResumeData['basics'], sep = ' · ') =>
    [d.email, d.phone, d.location, d.linkedinUrl].map(s).filter(Boolean).join(sep);

interface ResumePreviewProps {
    resumeData: ResumeData;
    template: 'classic' | 'modern' | 'minimal' | 'graduate' | 'strategy';
}

// Shared: page-break-inside avoid on each experience block
const expStyle: React.CSSProperties = { pageBreakInside: 'avoid', breakInside: 'avoid' };

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 1 — CLASSIC CORPORATE
// McKinsey / Harvard Business School. Serif. Centered. Black & white.
// ═════════════════════════════════════════════════════════════════════════════
const ClassicTemplate: React.FC<{ d: ResumeData }> = ({ d }) => {
    const R: React.CSSProperties = { fontFamily: "'Georgia','Times New Roman',serif", background: '#fff', color: '#111', padding: '52px 60px', maxWidth: '210mm', margin: '0 auto', fontSize: '10.5pt', lineHeight: 1.5 };
    const secTitle = (title: string) => (
        <div style={{ borderBottom: '1.5px solid #111', paddingBottom: '3px', marginBottom: '10px', marginTop: '20px' }}>
            <span style={{ fontSize: '8.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2.5px' }}>{title}</span>
        </div>
    );
    return (
        <div id="resume-preview-container" style={R}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '26pt', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '6px' }}>{s(d.basics.name) || 'Your Name'}</div>
                {contactLine(d.basics, '  |  ') && <div style={{ fontSize: '9pt', color: '#444' }}>{contactLine(d.basics, '  |  ')}</div>}
            </div>
            {s(d.summary) && <>{secTitle('Professional Summary')}<p style={{ margin: '0 0 16px', lineHeight: 1.6 }}>{s(d.summary)}</p></>}
            {d.experience?.length > 0 && <>
                {secTitle('Professional Experience')}
                {d.experience.map((exp, i) => (
                    <div key={i} style={{ ...expStyle, marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1px' }}>
                            <span style={{ fontWeight: 700, fontSize: '11pt' }}>{s(exp.position)}</span>
                            <span style={{ fontSize: '9pt', color: '#555', flexShrink: 0 }}>{[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}</span>
                        </div>
                        {s(exp.company) && <div style={{ fontStyle: 'italic', color: '#444', marginBottom: '5px', fontSize: '10pt' }}>{s(exp.company)}</div>}
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {exp.bullets.map(s).filter(Boolean).map((b, j) => <li key={j} style={{ marginBottom: '3px' }}>{b}</li>)}
                        </ul>
                    </div>
                ))}
            </>}
            {d.skills?.length > 0 && <>
                {secTitle('Core Competencies')}
                {d.skills.map((sg, i) => sg.items.filter(s).length > 0 && (
                    <p key={i} style={{ margin: '0 0 4px', fontSize: '10pt' }}>
                        <strong>{s(sg.category)}: </strong>{sg.items.map(s).filter(Boolean).join(', ')}
                    </p>
                ))}
            </>}
            {d.education?.length > 0 && <>
                {secTitle('Education')}
                {d.education.map((edu, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <div><span style={{ fontWeight: 700 }}>{s(edu.institution)}</span>{s(edu.degree) && <span style={{ fontStyle: 'italic', color: '#444' }}> — {s(edu.degree)}</span>}</div>
                        {s(edu.year) && <span style={{ fontSize: '9.5pt', color: '#555', flexShrink: 0 }}>{s(edu.year)}</span>}
                    </div>
                ))}
            </>}
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 2 — MODERN TECH
// Google / LinkedIn Engineering. Blue section underlines. Clean Arial.
// ═════════════════════════════════════════════════════════════════════════════
const ModernTemplate: React.FC<{ d: ResumeData }> = ({ d }) => {
    const BLUE = '#1a56db';
    const R: React.CSSProperties = { fontFamily: "'Arial','Helvetica Neue',sans-serif", background: '#fff', color: '#111', padding: '44px 52px', maxWidth: '210mm', margin: '0 auto', fontSize: '10pt', lineHeight: 1.55 };
    const secTitle = (title: string) => (
        <div style={{ borderBottom: `2px solid ${BLUE}`, paddingBottom: '3px', marginBottom: '12px', marginTop: '22px' }}>
            <span style={{ fontSize: '9pt', fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '1.5px' }}>{title}</span>
        </div>
    );
    return (
        <div id="resume-preview-container" style={R}>
            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '26pt', fontWeight: 900, letterSpacing: '-0.5px', marginBottom: '5px' }}>{s(d.basics.name) || 'Your Name'}</div>
                {contactLine(d.basics) && <div style={{ fontSize: '9pt', color: '#555' }}>{contactLine(d.basics)}</div>}
            </div>
            {s(d.summary) && <>{secTitle('Summary')}<p style={{ margin: '0 0 16px', color: '#333', lineHeight: 1.6 }}>{s(d.summary)}</p></>}
            {d.experience?.length > 0 && <>
                {secTitle('Experience')}
                {d.experience.map((exp, i) => (
                    <div key={i} style={{ ...expStyle, marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                            <span style={{ fontWeight: 700, fontSize: '11.5pt' }}>{s(exp.company)}</span>
                            <span style={{ fontSize: '8.5pt', color: '#666', flexShrink: 0 }}>{[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}</span>
                        </div>
                        {s(exp.position) && <div style={{ fontStyle: 'italic', color: '#444', marginBottom: '5px', fontSize: '10pt' }}>{s(exp.position)}</div>}
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            {exp.bullets.map(s).filter(Boolean).map((b, j) => <li key={j} style={{ marginBottom: '3px', lineHeight: 1.5 }}>{b}</li>)}
                        </ul>
                    </div>
                ))}
            </>}
            {d.skills?.length > 0 && <>
                {secTitle('Skills')}
                <div style={{ marginBottom: '16px' }}>
                    {d.skills.map((sg, i) => sg.items.filter(s).length > 0 && (
                        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: '9pt', fontWeight: 700, color: '#555', minWidth: '110px', flexShrink: 0 }}>{s(sg.category)}:</span>
                            <span style={{ fontSize: '9.5pt' }}>{sg.items.map(s).filter(Boolean).join(', ')}</span>
                        </div>
                    ))}
                </div>
            </>}
            {d.education?.length > 0 && <>
                {secTitle('Education')}
                {d.education.map((edu, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div><span style={{ fontWeight: 700 }}>{s(edu.institution)}</span>{s(edu.degree) && <span style={{ color: '#444' }}> — {s(edu.degree)}</span>}</div>
                        {s(edu.year) && <span style={{ fontSize: '9pt', color: '#666', flexShrink: 0 }}>{s(edu.year)}</span>}
                    </div>
                ))}
            </>}
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 3 — MINIMALIST IMPACT
// Ultra spacious. Giant name. No borders. Grey micro-caps labels.
// ═════════════════════════════════════════════════════════════════════════════
const MinimalTemplate: React.FC<{ d: ResumeData }> = ({ d }) => {
    const R: React.CSSProperties = { fontFamily: "'Helvetica Neue','Arial',sans-serif", background: '#fff', color: '#1a1a1a', padding: '60px 68px', maxWidth: '210mm', margin: '0 auto', fontSize: '10pt', lineHeight: 1.65 };
    const secTitle = (title: string) => (
        <div style={{ fontSize: '8pt', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '3px', marginBottom: '12px', marginTop: '30px' }}>{title}</div>
    );
    return (
        <div id="resume-preview-container" style={R}>
            <div style={{ marginBottom: '36px' }}>
                <div style={{ fontSize: '34pt', fontWeight: 300, letterSpacing: '-1.5px', lineHeight: 1, marginBottom: '10px' }}>{s(d.basics.name) || 'Your Name'}</div>
                {contactLine(d.basics) && <div style={{ fontSize: '8.5pt', color: '#888', letterSpacing: '0.5px' }}>{contactLine(d.basics)}</div>}
            </div>
            {s(d.summary) && <>{secTitle('About')}<p style={{ margin: '0 0 24px', fontWeight: 300, color: '#444', maxWidth: '480px', lineHeight: 1.7 }}>{s(d.summary)}</p></>}
            {d.experience?.length > 0 && <>
                {secTitle('Experience')}
                {d.experience.map((exp, i) => (
                    <div key={i} style={{ ...expStyle, marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1px' }}>
                            <span style={{ fontWeight: 600, fontSize: '12pt' }}>{s(exp.position)}</span>
                            <span style={{ fontSize: '8.5pt', color: '#aaa', flexShrink: 0 }}>{[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}</span>
                        </div>
                        {s(exp.company) && <div style={{ fontWeight: 300, color: '#777', fontSize: '9.5pt', marginBottom: '7px' }}>{s(exp.company)}</div>}
                        <ul style={{ margin: 0, paddingLeft: '14px' }}>
                            {exp.bullets.map(s).filter(Boolean).map((b, j) => <li key={j} style={{ marginBottom: '3px', fontWeight: 300, color: '#333', lineHeight: 1.55 }}>{b}</li>)}
                        </ul>
                    </div>
                ))}
            </>}
            {d.skills?.length > 0 && <>
                {secTitle('Skills')}
                <div style={{ marginBottom: '24px' }}>
                    {d.skills.map((sg, i) => sg.items.filter(s).length > 0 && (
                        <p key={i} style={{ margin: '0 0 4px', fontWeight: 300 }}>
                            <span style={{ fontWeight: 500, color: '#111' }}>{s(sg.category)}: </span>{sg.items.map(s).filter(Boolean).join(', ')}
                        </p>
                    ))}
                </div>
            </>}
            {d.education?.length > 0 && <>
                {secTitle('Education')}
                {d.education.map((edu, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
                        <div><span style={{ fontWeight: 500 }}>{s(edu.institution)}</span>{s(edu.degree) && <span style={{ fontWeight: 300, color: '#666' }}> — {s(edu.degree)}</span>}</div>
                        {s(edu.year) && <span style={{ fontSize: '8.5pt', color: '#aaa', flexShrink: 0 }}>{s(edu.year)}</span>}
                    </div>
                ))}
            </>}
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 4 — GRADUATE FRESH
// Education first. Indigo-purple accents. Centered academic header.
// ═════════════════════════════════════════════════════════════════════════════
const GraduateTemplate: React.FC<{ d: ResumeData }> = ({ d }) => {
    const INDIGO = '#3730a3';
    const R: React.CSSProperties = { fontFamily: "'Georgia',serif", background: '#fff', color: '#1a1a1a', padding: '48px 56px', maxWidth: '210mm', margin: '0 auto', fontSize: '10.5pt', lineHeight: 1.5 };
    const secTitle = (title: string) => (
        <div style={{ borderBottom: '1.5px solid #c7d2fe', paddingBottom: '3px', marginBottom: '12px', marginTop: '20px' }}>
            <span style={{ fontSize: '9pt', fontWeight: 700, color: INDIGO, textTransform: 'uppercase', letterSpacing: '1.5px' }}>{title}</span>
        </div>
    );
    return (
        <div id="resume-preview-container" style={R}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <div style={{ fontSize: '26pt', fontWeight: 700, color: INDIGO, letterSpacing: '0.3px', marginBottom: '8px' }}>{s(d.basics.name) || 'Your Name'}</div>
                <div style={{ width: '50px', height: '2px', background: '#6366f1', margin: '0 auto 10px' }} />
                {contactLine(d.basics, ' | ') && <div style={{ fontSize: '9pt', color: '#555' }}>{contactLine(d.basics, ' | ')}</div>}
            </div>
            {/* Education FIRST */}
            {d.education?.length > 0 && <>
                {secTitle('Education')}
                {d.education.map((edu, i) => (
                    <div key={i} style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, fontSize: '11pt' }}>{s(edu.institution)}</span>
                            {s(edu.year) && <span style={{ fontSize: '9pt', color: '#666', flexShrink: 0 }}>{s(edu.year)}</span>}
                        </div>
                        {s(edu.degree) && <p style={{ margin: '2px 0 0', fontStyle: 'italic', color: '#555', fontSize: '10pt' }}>{s(edu.degree)}</p>}
                    </div>
                ))}
            </>}
            {s(d.summary) && <>{secTitle('Objective')}<p style={{ margin: '0 0 16px', color: '#333', lineHeight: 1.6 }}>{s(d.summary)}</p></>}
            {d.experience?.length > 0 && <>
                {secTitle('Experience')}
                {d.experience.map((exp, i) => (
                    <div key={i} style={{ ...expStyle, marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1px' }}>
                            <span style={{ fontWeight: 700, fontSize: '11pt' }}>{s(exp.position)}</span>
                            <span style={{ fontSize: '9pt', color: '#666', flexShrink: 0 }}>{[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}</span>
                        </div>
                        {s(exp.company) && <div style={{ fontStyle: 'italic', color: '#555', marginBottom: '5px', fontSize: '10pt' }}>{s(exp.company)}</div>}
                        <ul style={{ margin: 0, paddingLeft: '18px' }}>
                            {exp.bullets.map(s).filter(Boolean).map((b, j) => <li key={j} style={{ marginBottom: '3px' }}>{b}</li>)}
                        </ul>
                    </div>
                ))}
            </>}
            {d.skills?.length > 0 && <>
                {secTitle('Skills')}
                {d.skills.map((sg, i) => sg.items.filter(s).length > 0 && (
                    <p key={i} style={{ margin: '0 0 4px', fontSize: '10pt' }}>
                        <strong>{s(sg.category)}: </strong>{sg.items.map(s).filter(Boolean).join(', ')}
                    </p>
                ))}
            </>}
        </div>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE 5 — STRATEGY BLOCK
// True two-column. Dark navy left sidebar. Executive / consulting.
// ═════════════════════════════════════════════════════════════════════════════
const StrategyTemplate: React.FC<{ d: ResumeData }> = ({ d }) => {
    const DARK = '#0f172a';
    const TEAL = '#14b8a6';
    return (
        <div id="resume-preview-container" style={{ fontFamily: "'Arial','Helvetica Neue',sans-serif", display: 'flex', maxWidth: '210mm', margin: '0 auto', background: '#fff', overflow: 'hidden' }}>
            {/* Left sidebar */}
            <div style={{ width: '36%', background: DARK, color: '#e2e8f0', padding: '36px 22px', flexShrink: 0 }}>
                <div style={{ fontSize: '17pt', fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: '20px', letterSpacing: '-0.5px', textTransform: 'uppercase' }}>{s(d.basics.name) || 'Your Name'}</div>
                <SideSecTitle color={TEAL}>Contact</SideSecTitle>
                {[s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean).map((item, i) => (
                    <p key={i} style={{ fontSize: '8pt', marginBottom: '5px', color: '#cbd5e1', wordBreak: 'break-all', lineHeight: 1.4 }}>{item}</p>
                ))}
                {d.skills?.length > 0 && <>
                    <SideSecTitle color={TEAL}>Skills</SideSecTitle>
                    {d.skills.map((sg, i) => sg.items.filter(s).length > 0 && (
                        <div key={i} style={{ marginBottom: '10px' }}>
                            <p style={{ fontSize: '7pt', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{s(sg.category)}</p>
                            <p style={{ fontSize: '8.5pt', color: '#cbd5e1', lineHeight: 1.5, margin: 0 }}>{sg.items.map(s).filter(Boolean).join(' · ')}</p>
                        </div>
                    ))}
                </>}
                {d.education?.length > 0 && <>
                    <SideSecTitle color={TEAL}>Education</SideSecTitle>
                    {d.education.map((edu, i) => (
                        <div key={i} style={{ marginBottom: '10px' }}>
                            <p style={{ fontSize: '9pt', fontWeight: 700, color: '#e2e8f0', marginBottom: '2px' }}>{s(edu.institution)}</p>
                            {s(edu.degree) && <p style={{ fontSize: '8pt', color: '#94a3b8', marginBottom: '2px' }}>{s(edu.degree)}</p>}
                            {s(edu.year) && <p style={{ fontSize: '7.5pt', color: '#64748b' }}>{s(edu.year)}</p>}
                        </div>
                    ))}
                </>}
            </div>
            {/* Main area */}
            <div style={{ flex: 1, padding: '36px 28px', background: '#fff', color: '#111' }}>
                {s(d.summary) && <>
                    <MainSecTitle>Profile</MainSecTitle>
                    <p style={{ margin: '0 0 20px', fontSize: '10pt', color: '#333', lineHeight: 1.65 }}>{s(d.summary)}</p>
                </>}
                {d.experience?.length > 0 && <>
                    <MainSecTitle>Experience</MainSecTitle>
                    {d.experience.map((exp, i) => (
                        <div key={i} style={{ ...expStyle, marginBottom: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                                <span style={{ fontWeight: 700, fontSize: '11pt', color: '#000' }}>{s(exp.position)}</span>
                                <span style={{ fontSize: '8.5pt', color: '#666', flexShrink: 0 }}>{[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}</span>
                            </div>
                            {s(exp.company) && <div style={{ fontSize: '9.5pt', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>{s(exp.company)}</div>}
                            <ul style={{ margin: 0, paddingLeft: '15px' }}>
                                {exp.bullets.map(s).filter(Boolean).map((b, j) => <li key={j} style={{ marginBottom: '3px', fontSize: '9.5pt', color: '#222', lineHeight: 1.5 }}>{b}</li>)}
                            </ul>
                        </div>
                    ))}
                </>}
            </div>
        </div>
    );
};

const SideSecTitle: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
    <div style={{ fontSize: '7.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', color, marginBottom: '8px', marginTop: '18px', borderBottom: '1px solid rgba(20,184,166,0.3)', paddingBottom: '4px' }}>{children}</div>
);
const MainSecTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ fontSize: '8.5pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', color: '#0f172a', borderBottom: '2.5px solid #0f172a', paddingBottom: '3px', marginBottom: '12px', marginTop: '0' }}>{children}</div>
);

// ═════════════════════════════════════════════════════════════════════════════
export const ResumePreview: React.FC<ResumePreviewProps> = ({ resumeData, template }) => {
    switch (template) {
        case 'modern':   return <ModernTemplate d={resumeData} />;
        case 'minimal':  return <MinimalTemplate d={resumeData} />;
        case 'graduate': return <GraduateTemplate d={resumeData} />;
        case 'strategy': return <StrategyTemplate d={resumeData} />;
        default:         return <ClassicTemplate d={resumeData} />;
    }
};

export default ResumePreview;
