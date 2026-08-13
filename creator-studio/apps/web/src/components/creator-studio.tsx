'use client';

import { useMemo, useState } from 'react';
import { WORKFLOW_STAGES, type WorkflowStage } from '@creator/contracts';

const labels: Record<WorkflowStage, string> = {
  CONTENT_REVIEW: 'Content', CONTENT_APPROVED: 'Content approved', SCRIPT_GENERATING: 'Script generation',
  SCRIPT_REVIEW: 'Script', SCRIPT_APPROVED: 'Script approved', VOICE_GENERATING: 'Voice generation',
  VOICE_REVIEW: 'Voice', VOICE_APPROVED: 'Voice approved', AVATAR_GENERATING: 'Avatar generation',
  AVATAR_REVIEW: 'Avatar', AVATAR_APPROVED: 'Avatar approved', EDIT_GENERATING: 'Edit generation',
  EDIT_REVIEW: 'Edit', EDIT_APPROVED: 'Edit approved', FINAL_RENDERING: 'Final render',
  FINAL_REVIEW: 'Final review', FINAL_APPROVED: 'Ready to download'
};

export function CreatorStudio({ mode }: { mode: 'demo' | 'test' | 'preview' | 'production' }) {
  const [stage, setStage] = useState<WorkflowStage>('CONTENT_REVIEW');
  const [kind, setKind] = useState<'content' | 'script'>('content');
  const [version, setVersion] = useState(0);
  const [text, setText] = useState('A creator explains how deliberate human review keeps generated media accountable.');
  const [notes, setNotes] = useState('');
  const [attested, setAttested] = useState(false);
  const [message, setMessage] = useState('Save an immutable version before approval.');
  const currentIndex = WORKFLOW_STAGES.indexOf(stage);
  const isMock = mode === 'demo' || mode === 'test';
  const approvalEnabled = version > 0 && (kind === 'script' || attested);
  const title = kind === 'content' ? 'Review authorized content' : 'Review generated script';
  const digest = useMemo(() => version ? `sha256:${kind}-v${version}-deterministic-demo` : 'Not versioned', [kind, version]);

  function saveVersion() {
    if (!text.trim()) return setMessage('Text is required.');
    setVersion((value) => value + 1);
    setMessage('New immutable version saved. Any prior approval no longer applies.');
  }
  function approve() {
    if (!approvalEnabled) return;
    if (kind === 'content') {
      setStage('SCRIPT_REVIEW'); setKind('script'); setVersion(1);
      setText('Draft script — review every claim, revise the wording, then explicitly approve this exact version.');
      setAttested(false); setMessage('Content v' + version + ' approved. Deterministic synthetic mock script created for review.');
    } else {
      setStage('SCRIPT_APPROVED'); setMessage('Script approved. Voice stage is now available; biometric uploads remain disabled.');
    }
  }
  function requestRevision() {
    setVersion(0); setMessage('Revision requested. Approval cleared and all downstream artifacts, approvals, and jobs invalidated.');
  }

  return <main className="shell">
    <header className="topbar"><div><p className="eyebrow">AVALA CREATOR STUDIO</p><h1>Create with your identity. Approve every step.</h1><p className="lede">A controlled content-to-script workflow. Workers draft; only you approve an immutable version.</p></div><span className="mode">{isMock ? 'SYNTHETIC DEMO MODE' : mode.toUpperCase()}</span></header>
    <section className="notice">Publishing is intentionally excluded. Voice and avatar inference and biometric uploads are disabled.</section>
    <section className="workspace">
      <aside className="timeline" aria-label="Project stages"><h2>Project timeline</h2><ol>{WORKFLOW_STAGES.map((item, index) => {
        const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'locked';
        return <li key={item} data-state={state}><span className="dot"/><div><strong>{labels[item]}</strong><small>{state === 'locked' ? 'locked — approval required' : state}</small></div></li>;
      })}</ol></aside>
      <article className="editor"><div className="editorHeader"><div><p className="eyebrow">{kind === 'content' ? 'STAGE 1' : 'STAGE 2'}</p><h2>{title}</h2></div><span className="version">Version {version || 'unsaved'}</span></div>
        <label htmlFor="source">{kind === 'content' ? 'Source content' : 'Script draft'}</label><textarea id="source" value={text} onChange={(event) => setText(event.target.value)}/>
        {kind === 'content' && <label className="attestation"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)}/> I own this content or have permission to adapt it into a video.</label>}
        <label htmlFor="notes">Review notes</label><textarea className="notes" id="notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record feedback or reasons for revision."/>
        <div className="binding"><strong>Approval binding</strong><span>{digest}</span></div><p className="status" aria-live="polite">{message}</p>
        <div className="actions"><button className="secondary" onClick={requestRevision} disabled={!version}>Request revision</button><button className="secondary" onClick={saveVersion}>Save new version</button><button className="primary" onClick={approve} disabled={!approvalEnabled}>Approve exact version</button></div>
        {stage === 'SCRIPT_APPROVED' && <div className="available"><strong>Voice stage available</strong><p>Upload remains disabled until consent and deletion controls are complete.</p><button disabled>Upload voice sample</button> <button disabled>Upload avatar sample</button></div>}
      </article>
    </section>
  </main>;
}
