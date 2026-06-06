import React, { useState } from 'react';
import { ArrowRight, CheckCircle, DownloadCloud, Printer, RotateCcw } from 'lucide-react';
import { ResumeData } from '../../types';
import { generateDocx } from './exportUtils';
import ResumePreview from './templates/ResumePreview';

interface ExportScreenProps {
    resumeData: ResumeData;
    onInterviewBridge: () => void;
    onRestart: () => void;
    onBack: () => void;
}

type TemplateId = 'classic' | 'modern' | 'minimal' | 'graduate' | 'strategy';

const TEMPLATES: { id: TemplateId; label: string; desc: string }[] = [
    { id: 'classic', label: 'Classic', desc: 'Traditional layout for most roles' },
    { id: 'modern', label: 'Modern', desc: 'Clean layout with a subtle accent' },
    { id: 'minimal', label: 'Minimal', desc: 'Simple spacing with strong readability' },
    { id: 'graduate', label: 'Graduate', desc: 'Education-forward for early careers' },
    { id: 'strategy', label: 'Two-column', desc: 'Structured layout with a sidebar' },
];

export const ExportScreen: React.FC<ExportScreenProps> = ({ resumeData, onInterviewBridge, onRestart, onBack }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>('classic');

    const handleDownloadDocx = async () => {
        setIsExporting(true);
        try {
            await generateDocx(resumeData, selectedTemplate);
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const handlePrintPdf = () => {
        const el = document.getElementById('resume-preview-container');
        if (!el) return;

        const printWindow = window.open('', '_blank', 'width=900,height=750');
        if (!printWindow) {
            alert('Please allow pop-ups for this site to use PDF export.');
            return;
        }

        const resumeHtml = el.outerHTML;
        const candidateName = (resumeData.basics?.name || 'Resume').replace(/[<>&]/g, '');

        printWindow.document.open();
        printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${candidateName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: white;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #resume-preview-container {
      min-height: 0 !important;
      box-shadow: none !important;
      margin: 0 auto;
    }
    @page { size: A4 portrait; margin: 0; }
    .page-no-break { page-break-inside: avoid; }
  </style>
</head>
<body>
  ${resumeHtml}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.print();
        window.addEventListener('afterprint', function () { window.close(); });
      }, 600);
    });
  <\/script>
</body>
</html>`);
        printWindow.document.close();
    };

    return (
        <div className="flex w-full flex-col gap-5 lg:flex-row lg:gap-6">
            <div className="flex flex-col lg:w-[320px] flex-shrink-0 gap-5 print:hidden">
                <div className="bg-gradient-to-b from-brand-primary/10 to-transparent border border-brand-primary/20 rounded-2xl p-6 text-center"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,188,3,0.1)' }}>
                    <CheckCircle className="w-10 h-10 text-brand-primary mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-white tracking-tight mb-1">Your resume is ready</h2>
                    <p className="text-brand-tint text-xs">Choose a template and download your file.</p>
                </div>

                <div className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 rounded-2xl p-5"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                    <h3 className="text-[10px] font-bold text-brand-tint uppercase tracking-[0.12em] mb-4">Choose template</h3>
                    <div className="space-y-2">
                        {TEMPLATES.map(t => (
                            <button key={t.id} onClick={() => setSelectedTemplate(t.id)}
                                className={`w-full rounded-xl p-3 text-left transition-all border ${
                                    selectedTemplate === t.id
                                        ? 'border-brand-primary/40 bg-brand-primary/10'
                                        : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'}`}>
                                <p className={`text-sm font-bold ${selectedTemplate === t.id ? 'text-brand-primary' : 'text-white'}`}>{t.label}</p>
                                <p className="text-xs text-brand-tint mt-0.5">{t.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 rounded-2xl p-5 space-y-3"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                    <h3 className="text-[10px] font-bold text-brand-tint uppercase tracking-[0.12em] mb-4">Download</h3>
                    <button onClick={handleDownloadDocx} disabled={isExporting}
                        className="w-full bg-brand-primary hover:bg-brand-primary/90 disabled:opacity-40 text-brand-dark font-bold py-3 rounded-xl text-xs uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(255,188,3,0.4)]">
                        {isExporting ? 'Preparing...' : <><DownloadCloud className="w-4 h-4" />Download DOCX</>}
                    </button>
                    {selectedTemplate === 'strategy' && (
                        <p className="text-[10px] text-brand-tint text-center leading-relaxed px-1">
                            DOCX uses a clean single-column layout for ATS compatibility. Use PDF to keep the two-column design.
                        </p>
                    )}
                    <button onClick={handlePrintPdf}
                        className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-2 border border-white/5">
                        <Printer className="w-4 h-4" />Export as PDF
                    </button>
                </div>

                <div className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/5 rounded-2xl p-5 text-center"
                    style={{ boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}>
                    <h3 className="text-sm font-bold text-white mb-1">Ready to practice your interview?</h3>
                    <p className="text-brand-tint text-xs mb-4 leading-relaxed">Use your resume to practice interview questions for your role.</p>
                    <button onClick={onInterviewBridge}
                        className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold py-3 rounded-xl text-xs uppercase tracking-[0.12em] transition-all flex items-center justify-center gap-2">
                        Start interview practice <ArrowRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex gap-6 px-2">
                    <button onClick={onBack} className="text-xs text-brand-tint hover:text-white transition-colors uppercase tracking-[0.12em]">Back</button>
                    <button onClick={onRestart} className="text-xs text-brand-tint hover:text-white transition-colors uppercase tracking-[0.12em] flex items-center gap-1.5">
                        <RotateCcw className="w-3 h-3" />Start over
                    </button>
                </div>
            </div>

            <div className="custom-scrollbar flex max-h-[70dvh] min-h-[420px] flex-1 justify-center overflow-y-auto rounded-2xl border border-white/5 bg-gray-200 p-3 sm:p-4 lg:h-[85vh] lg:max-h-none">
                <ResumePreview resumeData={resumeData} template={selectedTemplate} />
            </div>
        </div>
    );
};

export default ExportScreen;
