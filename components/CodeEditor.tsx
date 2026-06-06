
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { audioService } from '../services/audioService';
import mockGeminiService from '../services/mockGeminiService';

interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (code: string) => void;
    isProcessing: boolean;
    feedback?: string | null;
    language?: string;
}

declare global {
    interface Window {
        loadPyodide: any;
    }
}

const CodeEditor: React.FC<CodeEditorProps> = ({
    value,
    onChange,
    onSubmit,
    isProcessing,
    feedback,
    language = 'python'
}) => {
    const [lineCount, setLineCount] = useState(1);
    const [terminalOutput, setTerminalOutput] = useState<{ type: 'out' | 'err' | 'sys', text: string }[]>([]);
    const [activeTab, setActiveTab] = useState<'terminal' | 'analysis'>('terminal');
    const [isPyodideLoading, setIsPyodideLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const pyodideRef = useRef<any>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const terminalEndRef = useRef<HTMLDivElement>(null);

    const isNonPython = language.toLowerCase() !== 'python';

    useEffect(() => {
        if (isNonPython) {
            setIsPyodideLoading(false);
            setTerminalOutput([{ type: 'sys', text: `${language.toUpperCase()} practice is ready. Run your answer when you want to test it.` }]);
            return;
        }

        const initPyodide = async () => {
            try {
                if (pyodideRef.current) return;
                setIsPyodideLoading(true);
                if (!window.loadPyodide) {
                    setTerminalOutput([{ type: 'err', text: 'Pyodide runtime not found. Please refresh.' }]);
                    return;
                }
                pyodideRef.current = await window.loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/"
                });
                setIsPyodideLoading(false);
                setTerminalOutput([{ type: 'sys', text: 'Python practice is ready.' }]);
            } catch (err) {
                console.error("Pyodide Load Failed", err);
                setTerminalOutput([{ type: 'err', text: 'Failed to initialize Python runtime.' }]);
                setIsPyodideLoading(false);
            }
        };
        initPyodide();
    }, [language, isNonPython]);

    useEffect(() => {
        const lines = value.split('\n').length;
        setLineCount(Math.max(lines, 1));
    }, [value]);

    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [terminalOutput]);

    // Automatically switch to analysis tab when feedback arrives
    useEffect(() => {
        if (feedback) {
            setActiveTab('analysis');
        }
    }, [feedback]);

    const runCode = async () => {
        if (isRunning) return;
        setIsRunning(true);
        setActiveTab('terminal');
        audioService.playStart();

        if (isNonPython) {
            setTerminalOutput(prev => [...prev, { type: 'sys', text: `Checking your ${language.toUpperCase()} answer...` }]);
            const result = await mockGeminiService.simulateExecution(value, language);
            const newLogs: { type: 'out' | 'err' | 'sys', text: string }[] = [];
            if (result.stdout) newLogs.push({ type: 'out', text: result.stdout.trim() });
            if (result.stderr) newLogs.push({ type: 'err', text: result.stderr.trim() });
            if (newLogs.length === 0) newLogs.push({ type: 'sys', text: 'Execution finished (No output).' });

            setTerminalOutput(prev => [...prev, ...newLogs]);
            setIsRunning(false);
            return;
        }

        // Python Native Path
        if (!pyodideRef.current) {
            setTerminalOutput(prev => [...prev, { type: 'err', text: 'Python kernel not ready.' }]);
            setIsRunning(false);
            return;
        }

        setTerminalOutput(prev => [...prev, { type: 'sys', text: 'Running your code...' }]);

        try {
            pyodideRef.current.runPython(`
                import sys
                import io
                sys.stdout = io.StringIO()
                sys.stderr = io.StringIO()
            `);

            await pyodideRef.current.runPythonAsync(value);

            const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
            const stderr = pyodideRef.current.runPython("sys.stderr.getvalue()");

            const newLogs: { type: 'out' | 'err' | 'sys', text: string }[] = [];
            if (stdout) newLogs.push({ type: 'out', text: stdout.trim() });
            if (stderr) newLogs.push({ type: 'err', text: stderr.trim() });

            if (newLogs.length === 0) {
                newLogs.push({ type: 'sys', text: 'Execution finished successfully.' });
            }

            setTerminalOutput(prev => [...prev, ...newLogs]);
        } catch (err: any) {
            setTerminalOutput(prev => [...prev, { type: 'err', text: err.message }]);
        } finally {
            setIsRunning(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textareaRef.current!.selectionStart;
            const end = textareaRef.current!.selectionEnd;
            const newValue = value.substring(0, start) + "    " + value.substring(end);
            onChange(newValue);
            setTimeout(() => {
                textareaRef.current!.selectionStart = textareaRef.current!.selectionEnd = start + 4;
            }, 0);
        }
        if (e.ctrlKey && e.key === 'Enter') {
            runCode();
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-brand-dark shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] overflow-hidden relative border-l border-white/5">
            {/* Command Header */}
            <div className="flex items-center justify-between px-6 py-3 bg-white/[0.01] border-b border-white/5 backdrop-blur-3xl z-20">
                <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-3 py-1 px-3 bg-white/[0.03] border border-white/5 rounded-lg">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                        <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${isPyodideLoading ? 'text-brand-primary/70' : 'text-brand-primary'}`}>
                            {isPyodideLoading ? 'Preparing...' : isNonPython ? `${language.toUpperCase()} practice` : 'Python practice'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={runCode}
                        disabled={isPyodideLoading || isRunning || !value.trim()}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black px-4 py-2 rounded-lg text-[9px] uppercase tracking-[0.12em] transition-all active:scale-95 disabled:opacity-40"
                    >
                        {isRunning ? 'Executing...' : 'Run logic'}
                    </button>
                    <button
                        onClick={() => { audioService.playConfirm(); onSubmit(value); }}
                        disabled={isProcessing || !value.trim()}
                        className="flex items-center gap-2 bg-brand-primary text-brand-dark font-black px-5 py-2 rounded-lg text-[9px] uppercase tracking-[0.12em] hover:bg-brand-primary/90 active:scale-95 transition-all shadow-xl shadow-brand-primary/20 disabled:opacity-40"
                    >
                        {isProcessing ? 'Evaluating...' : 'Submit Evaluation'}
                    </button>
                </div>
            </div>

            <div className="flex-grow flex overflow-hidden min-h-0 relative">
                {/* Visual Gutters */}
                <div className="w-12 bg-black/20 flex flex-col items-end pt-8 pr-4 text-[11px] font-mono text-brand-tint/25 select-none border-r border-white/5">
                    {Array.from({ length: Math.max(lineCount, 50) }).map((_, i) => (
                        <div key={i} className="leading-6 h-6">{i + 1}</div>
                    ))}
                </div>

                {/* Editor Surface */}
                <div className="relative flex-grow h-full bg-transparent">
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`# Architect your ${language} solution here...`}
                        className="absolute inset-0 w-full h-full bg-transparent p-8 text-[13px] font-mono text-white leading-6 focus:outline-none resize-none scrollbar-hide selection:bg-brand-primary/20 caret-brand-primary"
                        spellCheck="false"
                    />
                </div>
            </div>

            {/* Premium Tabbed Command Center - FILL HEIGHT */}
            <div className="h-[40%] flex flex-col border-t border-white/10 bg-black/60 backdrop-blur-3xl">
                <div className="flex items-center justify-between px-6 py-2 bg-white/[0.02] border-b border-white/5">
                    <div className="flex gap-6">
                        <button
                            onClick={() => setActiveTab('terminal')}
                            className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] pb-1 transition-all border-b ${activeTab === 'terminal' ? 'text-white border-brand-primary' : 'text-brand-tint/70 border-transparent hover:text-white'
                                }`}
                        >
                            Log Output
                        </button>
                        <button
                            onClick={() => setActiveTab('analysis')}
                            className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.12em] pb-1 transition-all border-b ${activeTab === 'analysis' ? 'text-brand-primary border-brand-primary' : 'text-brand-tint/70 border-transparent hover:text-white'
                                }`}
                        >
                            AI Architect
                        </button>
                    </div>

                    <button
                        onClick={() => setTerminalOutput([{ type: 'sys', text: 'Protocol Reset.' }])}
                        className="text-[8px] font-black text-brand-tint/70 hover:text-white uppercase tracking-[0.12em] transition-colors"
                    >
                        Clear
                    </button>
                </div>

                <div className="flex-grow p-5 overflow-y-auto custom-scrollbar font-mono">
                    <AnimatePresence mode="wait">
                        {activeTab === 'terminal' ? (
                            <motion.div
                                key="term"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-1.5"
                            >
                                {terminalOutput.map((log, i) => (
                                    <div key={i} className={`flex gap-3 text-[11px] leading-relaxed ${log.type === 'err' ? 'text-alert-coral' :
                                            log.type === 'sys' ? 'text-brand-tint italic' :
                                                'text-white/80'
                                        }`}>
                                        <span className="text-brand-tint/60 shrink-0 font-bold">{log.type === 'out' ? '>>' : log.type === 'err' ? '!!' : '..'}</span>
                                        <span className="break-all">{log.text}</span>
                                    </div>
                                ))}
                                <div ref={terminalEndRef} />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="analysis"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="h-full flex flex-col"
                            >
                                {feedback ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary shadow-[0_0_8px_rgba(255,188,3,0.3)]" />
                                            <span className="text-[9px] font-black text-white uppercase tracking-[0.12em]">Code feedback</span>
                                        </div>
                                        <p className="text-[12px] text-brand-tint leading-relaxed bg-white/[0.02] p-3 rounded-lg border border-white/5 whitespace-pre-wrap">
                                            {feedback}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex-grow flex flex-col items-center justify-center opacity-10 filter grayscale space-y-3">
                                        <div className="w-8 h-8 rounded-full border border-dashed border-white/40 animate-spin-slow" />
                                        <span className="text-[8px] font-black uppercase tracking-[0.12em]">Waiting for feedback</span>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default CodeEditor;
