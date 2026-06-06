import React, { useState } from 'react';
import type { ClearSpeakLevel, ClearSpeakProfile, ClearSpeakRole, MainStruggle, PracticeDuration } from './types';
import { saveProfile } from '../../services/clearSpeakService';

interface ClearSpeakOnboardingProps {
  onComplete: (profile: ClearSpeakProfile) => void;
}

const SCENARIOS: { label: string; value: string }[] = [
  { label: 'Introducing myself', value: 'Introducing Myself to the Team' },
  { label: 'Explaining my work', value: 'Explaining Technical Concepts' },
  { label: 'Answering tough questions', value: 'Managing Stakeholder Pushback' },
  { label: 'Presenting results', value: 'Delivering a Metrics Review' },
  { label: 'Sharing an idea', value: 'Pitching a New Strategy' },
  { label: 'Disagreeing politely', value: 'Disagreeing Politely' },
];

const LEVELS: { value: ClearSpeakLevel; label: string; hint: string }[] = [
  { value: 1, label: 'I stay quiet', hint: 'I know what to say, but I worry about mistakes.' },
  { value: 2, label: 'I speak, but hesitate', hint: 'I have ideas, but I pause or translate in my head.' },
  { value: 3, label: 'I speak well and want polish', hint: 'I want to sound clearer and more natural.' },
];

const STRUGGLES: { value: MainStruggle; label: string; desc: string }[] = [
  { value: 'mental_translation_delay', label: 'Translating in my head', desc: 'The answer is clear in my first language, but slow in English.' },
  { value: 'fear_of_judgment', label: 'Fear of being judged', desc: 'I worry people will think I am less capable.' },
  { value: 'speed_trap', label: 'Speaking too fast or too slow', desc: 'I lose control when the conversation moves quickly.' },
  { value: 'vocabulary_loss', label: 'Missing the right words', desc: 'I use simple words even when my ideas are more advanced.' },
];

const TOTAL_STEPS = 7;

const ClearSpeakOnboarding: React.FC<ClearSpeakOnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedProfile = localStorage.getItem('mockmate_user_profile');
  const userProfile = storedProfile ? JSON.parse(storedProfile) : null;

  const [form, setForm] = useState<{
    role: ClearSpeakRole;
    level: ClearSpeakLevel | null;
    goal: string;
    audienceContext: string;
    mainStruggle: MainStruggle | null;
    comfortLanguage: string;
    practiceDuration: PracticeDuration;
  }>({
    role: '',
    level: null,
    goal: '',
    audienceContext: '',
    mainStruggle: null,
    comfortLanguage: 'en',
    practiceDuration: 5,
  });

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return form.role.trim().length > 2;
      case 1: return form.level !== null;
      case 2: return form.goal.trim().length > 5;
      case 3: return form.audienceContext.trim().length > 3;
      case 4: return form.mainStruggle !== null;
      case 5:
      case 6: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    if (!form.role || !form.level || !form.mainStruggle) return;
    setSaving(true);
    setError(null);
    try {
      const profile = await saveProfile(form as any);
      onComplete(profile);
    } catch (err: any) {
      setError(err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div className="flex flex-col gap-6">
            <StepHeader title="What are you practicing for?" body="We will choose words and practice topics that match your real goal." />
            {userProfile?.targetRole && form.role === '' && (
              <button
                onClick={() => setForm(f => ({ ...f, role: userProfile.targetRole }))}
                className="w-full p-5 bg-brand-primary/10 border border-brand-primary/25 rounded-2xl text-left flex items-center justify-between gap-4 hover:bg-brand-primary/15 transition-all"
              >
                <div>
                  <p className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em] mb-1">From your profile</p>
                  <p className="text-lg text-white font-bold">{userProfile.targetRole}</p>
                </div>
                <span className="px-4 py-2 bg-brand-primary text-brand-dark text-[10px] font-bold uppercase tracking-[0.12em] rounded-xl">Use this</span>
              </button>
            )}
            <input
              type="text"
              placeholder="e.g. Software Engineer, Marketing Lead"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className={inputCls}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SCENARIOS.map(s => (
                <ChoiceButton key={s.value} active={form.role === s.value} onClick={() => setForm(f => ({ ...f, role: s.value }))}>
                  {s.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
        );
      case 1:
        return (
          <fieldset className="flex flex-col gap-6">
            <StepHeader title="How does speaking English feel right now?" body="Choose the answer that feels most honest today." />
            <div className="flex flex-col gap-4">
              {LEVELS.map(l => (
                <label key={l.value} className={`w-full flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${form.level === l.value ? activeCls : inactiveCls}`}>
                  <input type="radio" name="level" checked={form.level === l.value} onChange={() => setForm(f => ({ ...f, level: l.value }))} className="mt-1 h-5 w-5 accent-brand-primary" />
                  <span>
                    <strong className="text-lg text-white font-bold block">{l.label}</strong>
                    <span className="text-sm text-brand-tint mt-1 block">{l.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      case 2:
        return (
          <fieldset className="flex flex-col gap-5">
            <StepHeader title="What do you want to say more clearly?" body="Write one real situation you want to practice." />
            <input
              id="cs-goal-input"
              type="text"
              placeholder="e.g. Explain my project without hesitation"
              value={form.goal}
              onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              className={`${inputCls} text-lg`}
            />
            <p className="text-brand-tint text-xs">No pressure. We will turn this into short speaking practice.</p>
          </fieldset>
        );
      case 3:
        return (
          <fieldset className="flex flex-col gap-6">
            <StepHeader title="Who do you need to speak with?" body="This helps us make the practice feel realistic." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['Interviewer', 'Manager', 'Client', 'Team meeting'].map(aud => (
                <ChoiceButton key={aud} active={form.audienceContext === aud} onClick={() => setForm(f => ({ ...f, audienceContext: aud }))}>
                  {aud}
                </ChoiceButton>
              ))}
            </div>
            <input
              id="cs-audience-input"
              type="text"
              placeholder="Or type another situation"
              value={form.audienceContext}
              onChange={e => setForm(f => ({ ...f, audienceContext: e.target.value }))}
              className={inputCls}
            />
          </fieldset>
        );
      case 4:
        return (
          <fieldset className="flex flex-col gap-6">
            <StepHeader title="What feels hardest?" body="We will focus your practice on this first." />
            <div className="flex flex-col gap-4">
              {STRUGGLES.map(s => (
                <label key={s.value} className={`w-full flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${form.mainStruggle === s.value ? activeCls : inactiveCls}`}>
                  <input type="radio" name="mainStruggle" checked={form.mainStruggle === s.value} onChange={() => setForm(f => ({ ...f, mainStruggle: s.value }))} className="mt-1 h-5 w-5 accent-brand-primary" />
                  <span>
                    <strong className="text-lg font-bold text-white block">{s.label}</strong>
                    <span className="text-sm text-brand-tint leading-snug block mt-1">{s.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      case 5:
        return (
          <fieldset className="flex flex-col gap-6">
            <StepHeader title="Which support language helps you most?" body="Your speaking practice stays in English, but tips can be easier in a familiar language." />
            <select id="cs-comfort-lang" value={form.comfortLanguage} onChange={e => setForm(f => ({ ...f, comfortLanguage: e.target.value }))} className={`${inputCls} cursor-pointer`}>
              <option value="en" className="bg-brand-dark text-white">English</option>
              <option value="hi" className="bg-brand-dark text-white">Hindi</option>
              <option value="es" className="bg-brand-dark text-white">Spanish</option>
              <option value="pt" className="bg-brand-dark text-white">Portuguese</option>
            </select>
          </fieldset>
        );
      case 6:
        return (
          <fieldset className="flex flex-col gap-6">
            <StepHeader title="How much time can you practice daily?" body="Short, steady practice works better than waiting for the perfect time." />
            {[3, 5].map(duration => (
              <label key={duration} className={`w-full flex items-start gap-4 p-5 rounded-2xl border transition-all cursor-pointer ${form.practiceDuration === duration ? activeCls : inactiveCls}`}>
                <input type="radio" name="duration" value={duration} checked={form.practiceDuration === duration} onChange={() => setForm(f => ({ ...f, practiceDuration: duration as PracticeDuration }))} className="mt-1 h-5 w-5 accent-brand-primary" />
                <span>
                  <strong className="text-lg font-bold text-white/90 block">{duration} minutes</strong>
                  <span className="text-sm text-brand-tint">{duration === 3 ? 'Quick daily habit' : 'A little deeper practice'}</span>
                </span>
              </label>
            ))}
          </fieldset>
        );
      default:
        return null;
    }
  };

  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col p-6 sm:p-10 bg-brand-dark/90 backdrop-blur-2xl rounded-[24px] border border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.45)] animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex flex-col gap-2 mb-10">
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.12em]">Quick setup</span>
          <span className="text-[10px] font-bold text-brand-tint">{step + 1} of {TOTAL_STEPS}</span>
        </div>
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-brand-primary transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex-grow min-h-[400px]">
        {renderStep()}
      </div>

      <div className="mt-10 flex flex-col gap-4">
        {error && <p className="text-red-300 text-sm text-center mb-2">{error}</p>}
        <div className="flex gap-4">
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="px-6 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 transition-all">
              Back
            </button>
          )}
          <button
            onClick={step === TOTAL_STEPS - 1 ? handleSubmit : () => setStep(s => s + 1)}
            disabled={!canAdvance() || saving}
            className={`flex-1 py-4 font-bold rounded-xl transition-all shadow-lg uppercase tracking-[0.12em] text-[11px] ${
              canAdvance()
                ? 'bg-brand-primary hover:bg-brand-primary/90 text-brand-dark shadow-brand-primary/20'
                : 'bg-white/5 text-brand-tint/50 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving...' : step === TOTAL_STEPS - 1 ? 'Start practicing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

const inputCls = "w-full bg-white/5 border border-white/10 focus:border-brand-primary rounded-xl p-4 text-white placeholder:text-brand-tint/45 outline-none transition-all";
const activeCls = 'bg-brand-primary/10 border-brand-primary/40 shadow-[0_0_20px_rgba(255,188,3,0.08)]';
const inactiveCls = 'bg-white/5 border-white/10 hover:border-white/25';

const StepHeader: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <header>
    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight">{title}</h2>
    <p className="text-brand-tint text-sm leading-relaxed">{body}</p>
  </header>
);

const ChoiceButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`p-4 rounded-xl border text-left transition-all text-sm font-bold text-white ${active ? activeCls : inactiveCls}`}>
    {children}
  </button>
);

export default ClearSpeakOnboarding;
