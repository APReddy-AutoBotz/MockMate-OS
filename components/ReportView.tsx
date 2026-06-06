
import React, { useState } from 'react';
import { UserProfile } from '../types';

interface RoleCaptureProps {
    userProfile: UserProfile | null;
    onRoleSubmit: (role: string, sessionType: 'structured' | 'conversational') => void;
    onBack: () => void;
    onViewHistory: () => void;
}

const RoleCapture: React.FC<RoleCaptureProps> = ({ userProfile, onRoleSubmit, onBack, onViewHistory }) => {
    const [intentText, setIntentText] = useState('');

    const handleSubmit = (sessionType: 'structured' | 'conversational') => {
        const trimmedIntent = intentText.trim();
        if (trimmedIntent) {
            onRoleSubmit(trimmedIntent, sessionType);
        }
    };

    const welcomeMessage = userProfile ? `Welcome back, ${userProfile.name}!` : 'Welcome to MockMate';

    return (
        <div className="relative flex flex-col items-center text-center text-text-primary p-4">
            <div className="absolute top-4 right-4 flex gap-4">
                <button 
                    onClick={onViewHistory} 
                    className="text-[10px] font-black text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-full px-4 py-2 hover:bg-brand-primary/20 transition-all uppercase tracking-[0.12em]"
                >
                    View Progress
                </button>
                <button 
                    onClick={onBack} 
                    className="text-[10px] font-black text-brand-tint bg-white/5 border border-white/10 rounded-full px-4 py-2 hover:bg-white/10 transition-all uppercase tracking-[0.12em]"
                    aria-label="Logout"
                >
                    Logout
                </button>
            </div>
            
            <h2 className="text-4xl font-bold mb-3 mt-8">{welcomeMessage}</h2>
            <p className="text-brand-tint mb-8 max-w-md">Describe the interview you're preparing for. MockMate will create a realistic practice session from your goal.</p>
            
            <div className="w-full max-w-md flex flex-col items-center">
                <textarea
                    value={intentText}
                    onChange={(e) => setIntentText(e.target.value)}
                    placeholder="e.g., 'Staff Nurse for a pediatric ward' or 'Senior Software Engineer at a fintech startup'"
                    className="w-full h-32 bg-brand-dark/80 border-2 border-brand-primary/30 rounded-lg py-4 px-5 text-white focus:outline-none focus:ring-2 focus:ring-brand-primary text-lg transition-colors focus:border-brand-primary resize-none"
                    aria-label="Your interview goal"
                    autoFocus
                />
                
                <p className="text-brand-tint mt-8 mb-4 font-semibold">Choose your preparation style:</p>

                <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => handleSubmit('structured')}
                        disabled={!intentText.trim()}
                        className="w-full bg-brand-primary/10 text-white p-4 rounded-lg hover:bg-brand-primary/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-brand-primary/30"
                    >
                        <h3 className="font-bold text-lg">Structured Session</h3>
                        <p className="text-sm text-brand-tint">Generate a full interview plan upfront. Best for targeted practice.</p>
                    </button>
                     <button
                        onClick={() => handleSubmit('conversational')}
                        disabled={!intentText.trim()}
                        className="w-full bg-white/5 text-white p-4 rounded-lg hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                    >
                        <h3 className="font-bold text-lg">Conversational Flow</h3>
                        <p className="text-sm text-brand-tint">A dynamic, unscripted interview. Best for practicing adaptability.</p>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RoleCapture;
