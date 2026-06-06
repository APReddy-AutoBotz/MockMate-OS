import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PERSONAS_CONFIG, Persona } from '../personas.config';

// Fix: Add orbitDuration to the persona type to satisfy its use in transition.
const Orb: React.FC<{ persona: Persona & { orbitDuration: number }, radius: number }> = ({ persona, radius }) => {
    const shouldReduceMotion = useReducedMotion();
    const PersonaIcon = persona.icon;

    const animation = shouldReduceMotion ? {
        transform: `rotate(0deg) translateX(${radius}px) rotate(0deg)`
    } : {
        transform: [
            `rotate(0deg) translateX(${radius}px) rotate(0deg)`,
            `rotate(360deg) translateX(${radius}px) rotate(-360deg)`,
        ],
    };

    return (
        <motion.div
            className="absolute top-1/2 left-1/2"
            style={{
                width: 0,
                height: 0,
            }}
            animate={animation}
            transition={{
                duration: persona.orbitDuration,
                ease: 'linear',
                repeat: Infinity,
            }}
        >
            <div title={persona.blurb} className="w-20 h-20 -ml-10 -mt-10 rounded-full bg-brand-dark border-2 border-brand-primary/40 flex items-center justify-center shadow-lg">
                <PersonaIcon className={`w-10 h-10 text-${persona.color}`} />
            </div>
        </motion.div>
    );
};

interface InterviewOrbitProps {
    panelIDs: string[];
}

const InterviewOrbit: React.FC<InterviewOrbitProps> = ({ panelIDs }) => {
    const radii = [120, 180, 240];
    const orbitDurations = [20, 25, 30]; // Durations for orbits

    const selectedPersonas = panelIDs
        .map((id, index) => {
            const persona = PERSONAS_CONFIG.find(p => p.id === id);
            if (persona) {
                return { ...persona, orbitDuration: orbitDurations[index % orbitDurations.length] };
            }
            return null;
        })
        .filter((p): p is Persona & { orbitDuration: number } => !!p);


    return (
        <div className="relative w-full h-full flex items-center justify-center aspect-square max-w-xl mx-auto">
            <div className="relative w-full h-full flex items-center justify-center">
                <div className="absolute w-40 h-40 bg-brand-dark/60 border-2 border-brand-primary/20 rounded-full flex items-center justify-center text-center p-4 shadow-2xl">
                    <div className="flex flex-col items-center">
                        <motion.div 
                            className="w-3 h-3 bg-alert-coral rounded-full mb-2"
                            animate={{ scale: [1, 1.5, 1], opacity: [0.8, 1, 0.8] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <span className="font-bold text-lg text-text-primary">Live Session</span>
                        <p className="text-xs text-brand-tint">Focus and respond</p>
                    </div>
                </div>
                {selectedPersonas.map((persona, index) => (
                    <Orb key={persona.id} persona={persona} radius={radii[index % radii.length]} />
                ))}
            </div>
        </div>
    );
};

export default InterviewOrbit;
