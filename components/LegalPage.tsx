import React from 'react';
import { ArrowLeft, ShieldCheck, Trash2 } from 'lucide-react';

interface LegalPageProps {
  type: 'privacy' | 'terms';
  onBack: () => void;
}

const PrivacyContent = () => (
  <>
    <p>
      MockMate is built for job seekers who want private practice for resumes, spoken English, and interviews.
      Your practice stays private by default.
    </p>
    <p>
      We store your account, saved reports, resume review results, speaking progress, interview history, and daily
      free-practice usage so you can return to your work.
    </p>
    <p>
      We do not store raw audio by default. We do not keep uploaded resume files by default after they are read for
      review. AI providers may process the text or audio needed to give feedback.
    </p>
    <p>
      You can delete your app data from your account controls. Production launch will keep this policy linked from
      signup, login, and the app footer.
    </p>
  </>
);

const TermsContent = () => (
  <>
    <p>
      MockMate gives practice guidance for job preparation. It does not guarantee interviews, job offers, immigration
      outcomes, salary outcomes, or employer decisions.
    </p>
    <p>
      Use your own judgment before sending any resume, answer, or generated wording to an employer. You are responsible
      for making sure your profile and resume are accurate.
    </p>
    <p>
      Free practice limits may change to keep the app available for everyone. If a daily limit is reached, you can
      continue with saved work or come back the next day.
    </p>
  </>
);

const LegalPage: React.FC<LegalPageProps> = ({ type, onBack }) => {
  const isPrivacy = type === 'privacy';

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12">
      <button
        type="button"
        onClick={onBack}
        className="mb-8 inline-flex w-fit items-center gap-2 rounded-xl border border-brand-tint/15 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-brand-tint hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <section className="rounded-[24px] border border-brand-tint/15 bg-brand-dark/95 p-8 shadow-2xl backdrop-blur-2xl md:p-12">
        <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-primary/25 bg-brand-primary/10 text-brand-primary">
          {isPrivacy ? <ShieldCheck className="h-7 w-7" /> : <Trash2 className="h-7 w-7" />}
        </div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-primary">
          {isPrivacy ? 'Privacy' : 'Terms'}
        </p>
        <h1 className="mb-8 text-3xl font-medium tracking-tight text-white md:text-5xl">
          {isPrivacy ? 'Your practice stays private' : 'Fair use for practice'}
        </h1>
        <div className="space-y-5 text-sm leading-relaxed text-brand-tint md:text-base">
          {isPrivacy ? <PrivacyContent /> : <TermsContent />}
        </div>
      </section>
    </div>
  );
};

export default LegalPage;
