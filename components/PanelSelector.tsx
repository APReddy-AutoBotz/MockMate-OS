
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PERSONAS_CONFIG, Persona } from '../personas.config';

interface PanelSelectorProps {
    selectedPanelIDs: string[];
    onSelectionChange: (ids: string[]) => void;
    matchReasons?: Record<string, string>;
}

const PanelSelector: React.FC<PanelSelectorProps> = ({ selectedPanelIDs, onSelectionChange, matchReasons }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeSlot, setActiveSlot] = useState<number | null>(null);

    const selectedPersonas = selectedPanelIDs.map(id => PERSONAS_CONFIG.find(p => p.id === id)).filter(Boolean) as Persona[];

    const openModal = (slotIndex: number) => {
        setActiveSlot(slotIndex);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setActiveSlot(null);
    };

    const handlePersonaSelect = (personaId: string) => {
        if (activeSlot === null) return;
        const newSelection = [...selectedPanelIDs];
        newSelection[activeSlot] = personaId;
        onSelectionChange(newSelection);
        closeModal();
    };

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
                {selectedPersonas.map((persona, index) => (
                    <motion.button
                        type="button"
                        key={persona.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        onClick={() => openModal(index)}
                        aria-label={`Change interviewer: ${persona.name}, ${persona.title}`}
                        className="relative group flex min-h-[116px] w-full items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left shadow-2xl backdrop-blur-3xl transition-all hover:border-brand-primary/30 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark sm:p-5 lg:p-6"
                    >
                        {/* Elite Icon Circle */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-brand-primary bg-brand-primary/5 text-brand-primary transition-all duration-500 group-hover:bg-brand-primary group-hover:text-brand-dark sm:h-14 sm:w-14">
                            <persona.icon className="h-6 w-6 sm:h-7 sm:w-7" />
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col justify-center text-left">
                            <p className="text-lg font-semibold leading-tight tracking-tight text-white transition-colors group-hover:text-brand-primary">
                                {persona.name}
                            </p>
                            <p className="mt-2 text-[10px] font-bold uppercase leading-snug tracking-[0.08em] text-brand-tint sm:text-[11px]">
                                {persona.title}
                            </p>
                        </div>

                        <div className="absolute right-3 top-3 opacity-100 transition-all lg:opacity-0 lg:group-hover:opacity-100">
                            <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.1em] text-brand-primary">Change</span>
                        </div>
                    </motion.button>
                ))}
            </div>

            {/* Modal for Selecting Personas */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-dark/95 p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] backdrop-blur-3xl sm:p-6 md:p-12"
                    >
                        <motion.div
                            initial={{ scale: 0.98, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.98, y: 20 }}
                            className="custom-scrollbar max-h-[88dvh] w-full max-w-5xl overflow-y-auto rounded-[24px] border border-white/[0.08] bg-brand-dark p-5 shadow-2xl sm:p-8 md:rounded-[2.5rem] md:p-12 lg:p-16"
                        >
                            <div className="mb-8 flex flex-col items-start justify-between gap-5 md:mb-12 md:flex-row md:items-center">
                                <div className="space-y-2">
                                    <span className="text-[9px] text-brand-primary font-bold tracking-[0.12em] uppercase">Step 2 of 2</span>
                                    <h3 className="text-2xl font-medium tracking-tight text-white md:text-4xl">Select your interviewer</h3>
                                </div>
                                <button
                                    onClick={closeModal}
                                    className="bg-white/5 text-white/60 px-8 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95 border border-white/[0.08]"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
                                {PERSONAS_CONFIG.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => handlePersonaSelect(p.id)}
                                        className={`relative flex items-start gap-4 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-all hover:border-brand-primary/40 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark sm:p-6 md:gap-6 md:p-8 ${selectedPanelIDs.includes(p.id) ? 'cursor-not-allowed opacity-20 grayscale' : ''}`}
                                        disabled={selectedPanelIDs.includes(p.id)}
                                    >
                                        <div className="shrink-0 rounded-xl border-2 border-brand-primary/40 bg-brand-primary/5 p-4 text-brand-primary transition-all duration-500 group-hover:bg-brand-primary group-hover:text-brand-dark md:p-5">
                                            <p.icon className="h-7 w-7 md:h-9 md:w-9" />
                                        </div>
                                        <div className="relative z-10 space-y-3">
                                            <h4 className="text-xl font-medium leading-tight tracking-tight text-white transition-colors group-hover:text-brand-primary md:text-2xl">{p.name}</h4>
                                            <p className="text-[10px] font-bold uppercase leading-snug tracking-[0.08em] text-brand-tint md:text-[11px]">{p.title}</p>
                                            <p className="border-l-2 border-brand-primary/20 py-0.5 pl-4 text-xs leading-relaxed text-brand-tint md:text-sm">{p.blurb}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PanelSelector;
