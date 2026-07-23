import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ShadingType, TableRow, TableCell, Table, WidthType, UnderlineType } from 'docx';
import { saveAs } from 'file-saver';
import { ResumeData } from 'mockmate-shared';

type TemplateId = 'classic' | 'modern' | 'minimal' | 'graduate' | 'strategy';

// Strips AI schema bleed-through values
const s = (val?: string | null): string => {
    if (!val) return '';
    const t = val.trim();
    if (!t) return '';
    if (/string\s*\(/.test(t) || /not specified/i.test(t) || /not provided/i.test(t) || /\(optional\)/i.test(t) || /^n\/a$/i.test(t) || /^null$/i.test(t)) return '';
    return t;
};

const sp = (n: number) => new Paragraph({ text: '', spacing: { after: n * 20 } }); // spacer paragraph

// ─── CLASSIC CORPORATE ────────────────────────────────────────────────────────
const buildClassic = (d: ResumeData): Paragraph[] => {
    const children: Paragraph[] = [];

    // Name — centered, large
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: s(d.basics.name) || 'Your Name', bold: true, size: 40, font: 'Georgia' })]
    }));

    // Contact line — centered
    const contactParts = [s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean);
    if (contactParts.length) children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: contactParts.join('  |  '), size: 18, font: 'Georgia', color: '444444' })]
    }));

    const sectionTitle = (title: string) => new Paragraph({
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '111111' } },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 20, font: 'Georgia', allCaps: true, characterSpacing: 40 })]
    });

    // Summary
    if (s(d.summary)) {
        children.push(sectionTitle('Professional Summary'));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: s(d.summary), size: 20, font: 'Georgia' })] }));
    }

    // Experience
    if (d.experience?.length) {
        children.push(sectionTitle('Professional Experience'));
        d.experience.forEach(exp => {
            // Position + dates on same line
            children.push(new Paragraph({
                spacing: { before: 120, after: 40 },
                children: [
                    new TextRun({ text: s(exp.position), bold: true, size: 22, font: 'Georgia' }),
                    ...(([s(exp.startDate), s(exp.endDate)].filter(Boolean).length) ? [new TextRun({ text: `  ·  ${[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}`, size: 18, font: 'Georgia', color: '666666' })] : [])
                ]
            }));
            if (s(exp.company)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(exp.company), italics: true, size: 20, font: 'Georgia', color: '444444' })]
            }));
            exp.bullets.map(s).filter(Boolean).forEach(b => children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, font: 'Georgia' })]
            })));
            children.push(sp(1));
        });
    }

    // Skills
    if (d.skills?.length) {
        children.push(sectionTitle('Core Competencies'));
        d.skills.forEach(sg => {
            const items = sg.items.map(s).filter(Boolean);
            if (!items.length) return;
            children.push(new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: `${s(sg.category)}: `, bold: true, size: 19, font: 'Georgia' }),
                    new TextRun({ text: items.join(', '), size: 19, font: 'Georgia' })
                ]
            }));
        });
    }

    // Education
    if (d.education?.length) {
        children.push(sectionTitle('Education'));
        d.education.forEach(edu => {
            children.push(new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: s(edu.institution), bold: true, size: 20, font: 'Georgia' }),
                    ...(s(edu.degree) ? [new TextRun({ text: ` — ${s(edu.degree)}`, italics: true, size: 19, font: 'Georgia', color: '444444' })] : []),
                    ...(s(edu.year) ? [new TextRun({ text: `  ${s(edu.year)}`, size: 18, font: 'Georgia', color: '666666' })] : [])
                ]
            }));
        });
    }

    return children;
};

// ─── MODERN TECH ─────────────────────────────────────────────────────────────
const buildModern = (d: ResumeData): Paragraph[] => {
    const BLUE = '1a56db';
    const children: Paragraph[] = [];

    children.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: s(d.basics.name) || 'Your Name', bold: true, size: 48, font: 'Arial', color: '000000' })]
    }));

    const contactParts = [s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean);
    if (contactParts.length) children.push(new Paragraph({
        spacing: { after: 240 },
        children: [new TextRun({ text: contactParts.join(' · '), size: 18, font: 'Arial', color: '555555' })]
    }));

    const secTitle = (title: string) => new Paragraph({
        spacing: { before: 240, after: 120 },
        border: { bottom: { style: BorderStyle.THICK, size: 12, color: BLUE } },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 19, font: 'Arial', color: BLUE, characterSpacing: 40 })]
    });

    if (s(d.summary)) {
        children.push(secTitle('Summary'));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: s(d.summary), size: 20, font: 'Arial', color: '333333' })] }));
    }

    if (d.experience?.length) {
        children.push(secTitle('Experience'));
        d.experience.forEach(exp => {
            children.push(new Paragraph({
                spacing: { before: 120, after: 40 },
                children: [
                    new TextRun({ text: s(exp.company), bold: true, size: 22, font: 'Arial' }),
                    ...(([s(exp.startDate), s(exp.endDate)].filter(Boolean).length) ? [new TextRun({ text: `  ${[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}`, size: 18, color: '666666', font: 'Arial' })] : [])
                ]
            }));
            if (s(exp.position)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(exp.position), italics: true, size: 20, font: 'Arial', color: '444444' })]
            }));
            exp.bullets.map(s).filter(Boolean).forEach(b => children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, font: 'Arial' })]
            })));
            children.push(sp(1));
        });
    }

    if (d.skills?.length) {
        children.push(secTitle('Skills'));
        d.skills.forEach(sg => {
            const items = sg.items.map(s).filter(Boolean);
            if (!items.length) return;
            children.push(new Paragraph({
                spacing: { after: 80 },
                children: [
                    new TextRun({ text: `${s(sg.category)}: `, bold: true, size: 19, font: 'Arial', color: '444444' }),
                    new TextRun({ text: items.join(', '), size: 19, font: 'Arial' })
                ]
            }));
        });
    }

    if (d.education?.length) {
        children.push(secTitle('Education'));
        d.education.forEach(edu => {
            children.push(new Paragraph({
                spacing: { after: 80 },
                children: [
                    new TextRun({ text: s(edu.institution), bold: true, size: 20, font: 'Arial' }),
                    ...(s(edu.degree) ? [new TextRun({ text: ` — ${s(edu.degree)}`, size: 19, font: 'Arial', color: '555555' })] : []),
                    ...(s(edu.year) ? [new TextRun({ text: `   ${s(edu.year)}`, size: 18, font: 'Arial', color: '777777' })] : [])
                ]
            }));
        });
    }

    return children;
};

// ─── MINIMALIST ───────────────────────────────────────────────────────────────
const buildMinimal = (d: ResumeData): Paragraph[] => {
    const children: Paragraph[] = [];

    children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: s(d.basics.name) || 'Your Name', size: 60, font: 'Arial', color: '000000' })]
    }));

    const contactParts = [s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean);
    if (contactParts.length) children.push(new Paragraph({
        spacing: { after: 360 },
        children: [new TextRun({ text: contactParts.join('  ·  '), size: 17, font: 'Arial', color: 'aaaaaa' })]
    }));

    const secTitle = (title: string) => new Paragraph({
        spacing: { before: 320, after: 120 },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 16, font: 'Arial', color: 'aaaaaa', characterSpacing: 80 })]
    });

    if (s(d.summary)) {
        children.push(secTitle('About'));
        children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: s(d.summary), size: 20, font: 'Arial', color: '444444' })] }));
    }

    if (d.experience?.length) {
        children.push(secTitle('Experience'));
        d.experience.forEach(exp => {
            children.push(new Paragraph({
                spacing: { before: 120, after: 20 },
                children: [
                    new TextRun({ text: s(exp.position), bold: true, size: 22, font: 'Arial' }),
                    ...(([s(exp.startDate), s(exp.endDate)].filter(Boolean).length) ? [new TextRun({ text: `   ${[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}`, size: 17, color: 'aaaaaa', font: 'Arial' })] : [])
                ]
            }));
            if (s(exp.company)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(exp.company), size: 19, font: 'Arial', color: '888888' })]
            }));
            exp.bullets.map(s).filter(Boolean).forEach(b => children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, font: 'Arial', color: '333333' })]
            })));
            children.push(sp(2));
        });
    }

    if (d.skills?.length) {
        children.push(secTitle('Skills'));
        d.skills.forEach(sg => {
            const items = sg.items.map(s).filter(Boolean);
            if (!items.length) return;
            children.push(new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: `${s(sg.category)}: `, bold: true, size: 19, font: 'Arial', color: '333333' }),
                    new TextRun({ text: items.join(', '), size: 19, font: 'Arial', color: '555555' })
                ]
            }));
        });
    }

    if (d.education?.length) {
        children.push(secTitle('Education'));
        d.education.forEach(edu => {
            children.push(new Paragraph({
                spacing: { after: 80 },
                children: [
                    new TextRun({ text: s(edu.institution), bold: true, size: 20, font: 'Arial', color: '111111' }),
                    ...(s(edu.degree) ? [new TextRun({ text: ` — ${s(edu.degree)}`, size: 19, font: 'Arial', color: '666666' })] : []),
                    ...(s(edu.year) ? [new TextRun({ text: `   ${s(edu.year)}`, size: 18, font: 'Arial', color: 'aaaaaa' })] : [])
                ]
            }));
        });
    }

    return children;
};

// ─── GRADUATE FRESH ───────────────────────────────────────────────────────────
const buildGraduate = (d: ResumeData): Paragraph[] => {
    const INDIGO = '3730a3';
    const children: Paragraph[] = [];

    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: s(d.basics.name) || 'Your Name', bold: true, size: 44, font: 'Georgia', color: INDIGO })]
    }));

    const contactParts = [s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean);
    if (contactParts.length) children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: contactParts.join(' | '), size: 18, font: 'Georgia', color: '555555' })]
    }));

    const secTitle = (title: string) => new Paragraph({
        spacing: { before: 240, after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'c7d2fe' } },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 19, font: 'Georgia', color: INDIGO, characterSpacing: 40 })]
    });

    // Education FIRST
    if (d.education?.length) {
        children.push(secTitle('Education'));
        d.education.forEach(edu => {
            children.push(new Paragraph({
                spacing: { before: 80, after: 40 },
                children: [
                    new TextRun({ text: s(edu.institution), bold: true, size: 21, font: 'Georgia' }),
                    ...(s(edu.year) ? [new TextRun({ text: `   ${s(edu.year)}`, size: 18, font: 'Georgia', color: '777777' })] : [])
                ]
            }));
            if (s(edu.degree)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(edu.degree), italics: true, size: 19, font: 'Georgia', color: '555555' })]
            }));
        });
    }

    if (s(d.summary)) {
        children.push(secTitle('Objective'));
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: s(d.summary), size: 20, font: 'Georgia' })] }));
    }

    if (d.experience?.length) {
        children.push(secTitle('Experience'));
        d.experience.forEach(exp => {
            children.push(new Paragraph({
                spacing: { before: 120, after: 40 },
                children: [
                    new TextRun({ text: s(exp.position), bold: true, size: 21, font: 'Georgia' }),
                    ...(([s(exp.startDate), s(exp.endDate)].filter(Boolean).length) ? [new TextRun({ text: `  ·  ${[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}`, size: 18, color: '666666', font: 'Georgia' })] : [])
                ]
            }));
            if (s(exp.company)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(exp.company), italics: true, size: 19, font: 'Georgia', color: '555555' })]
            }));
            exp.bullets.map(s).filter(Boolean).forEach(b => children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, font: 'Georgia' })]
            })));
            children.push(sp(1));
        });
    }

    if (d.skills?.length) {
        children.push(secTitle('Skills'));
        d.skills.forEach(sg => {
            const items = sg.items.map(s).filter(Boolean);
            if (!items.length) return;
            children.push(new Paragraph({
                spacing: { after: 60 },
                children: [
                    new TextRun({ text: `${s(sg.category)}: `, bold: true, size: 19, font: 'Georgia', color: '444444' }),
                    new TextRun({ text: items.join(', '), size: 19, font: 'Georgia' })
                ]
            }));
        });
    }

    return children;
};

// ─── STRATEGY BLOCK ──────────────────────────────────────────────────────────
// Note: DOCX cannot do true two-column layouts without complex XML hacks that
// break ATS parsers. Instead we produce a clean single-column executive layout
// with bold dark section blocks — ATS-safe and recruiter-professional.
const buildStrategy = (d: ResumeData): Paragraph[] => {
    const children: Paragraph[] = [];

    // Header block — bold name + dark rule
    children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: (s(d.basics.name) || 'Your Name').toUpperCase(), bold: true, size: 44, font: 'Arial', color: '0f172a' })]
    }));

    const contactParts = [s(d.basics.email), s(d.basics.phone), s(d.basics.location), s(d.basics.linkedinUrl)].filter(Boolean);
    if (contactParts.length) children.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: contactParts.join('  ·  '), size: 17, font: 'Arial', color: '475569' })]
    }));

    const secTitle = (title: string) => new Paragraph({
        spacing: { before: 280, after: 100 },
        border: { bottom: { style: BorderStyle.THICK, size: 18, color: '0f172a' } },
        children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 18, font: 'Arial', color: '0f172a', characterSpacing: 60 })]
    });

    if (s(d.summary)) {
        children.push(secTitle('Profile'));
        children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: s(d.summary), size: 20, font: 'Arial', color: '333333' })] }));
    }

    if (d.experience?.length) {
        children.push(secTitle('Experience'));
        d.experience.forEach(exp => {
            children.push(new Paragraph({
                spacing: { before: 140, after: 40 },
                children: [
                    new TextRun({ text: s(exp.position), bold: true, size: 22, font: 'Arial', color: '000000' }),
                    ...(([s(exp.startDate), s(exp.endDate)].filter(Boolean).length) ? [new TextRun({ text: `   ${[s(exp.startDate), s(exp.endDate)].filter(Boolean).join(' – ')}`, size: 17, color: '888888', font: 'Arial' })] : [])
                ]
            }));
            if (s(exp.company)) children.push(new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: s(exp.company), bold: true, size: 19, font: 'Arial', color: '475569' })]
            }));
            exp.bullets.map(s).filter(Boolean).forEach(b => children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 40 },
                children: [new TextRun({ text: b, size: 19, font: 'Arial', color: '222222' })]
            })));
            children.push(sp(2));
        });
    }

    if (d.skills?.length) {
        children.push(secTitle('Skills'));
        d.skills.forEach(sg => {
            const items = sg.items.map(s).filter(Boolean);
            if (!items.length) return;
            children.push(new Paragraph({
                spacing: { after: 80 },
                children: [
                    new TextRun({ text: `${s(sg.category).toUpperCase()}   `, bold: true, size: 17, font: 'Arial', color: '475569', characterSpacing: 20 }),
                    new TextRun({ text: items.join(' · '), size: 19, font: 'Arial', color: '111111' })
                ]
            }));
        });
    }

    if (d.education?.length) {
        children.push(secTitle('Education'));
        d.education.forEach(edu => {
            children.push(new Paragraph({
                spacing: { before: 80, after: 60 },
                children: [
                    new TextRun({ text: s(edu.institution), bold: true, size: 21, font: 'Arial', color: '0f172a' }),
                    ...(s(edu.degree) ? [new TextRun({ text: `  —  ${s(edu.degree)}`, size: 19, font: 'Arial', color: '555555' })] : []),
                    ...(s(edu.year) ? [new TextRun({ text: `   ${s(edu.year)}`, size: 17, font: 'Arial', color: '888888' })] : [])
                ]
            }));
        });
    }

    return children;
};

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export const generateDocx = async (resumeData: ResumeData, template: TemplateId = 'classic') => {
    const builders: Record<TemplateId, (d: ResumeData) => Paragraph[]> = {
        classic:  buildClassic,
        modern:   buildModern,
        minimal:  buildMinimal,
        graduate: buildGraduate,
        strategy: buildStrategy,
    };

    const paragraphs = builders[template](resumeData);

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1008,    // ~0.7in
                        bottom: 1008,
                        left: 1134,   // ~0.79in
                        right: 1134,
                    }
                }
            },
            children: paragraphs,
        }]
    });

    try {
        const blob = await Packer.toBlob(doc);
        const name = s(resumeData.basics.name)?.replace(/\s+/g, '_') || 'Resume';
        saveAs(blob, `${name}_${template}.docx`);
    } catch (e) {
        console.error('Error generating docx:', e);
        throw e;
    }
};
