import { WORKFLOW_STAGES, type WorkflowStage } from '@creator/contracts';

const labels: Record<WorkflowStage, string> = {
  CONTENT_REVIEW: 'Content',
  CONTENT_APPROVED: 'Content approved',
  SCRIPT_GENERATING: 'Script generation',
  SCRIPT_REVIEW: 'Script',
  SCRIPT_APPROVED: 'Script approved',
  VOICE_GENERATING: 'Voice generation',
  VOICE_REVIEW: 'Voice',
  VOICE_APPROVED: 'Voice approved',
  AVATAR_GENERATING: 'Avatar generation',
  AVATAR_REVIEW: 'Avatar',
  AVATAR_APPROVED: 'Avatar approved',
  EDIT_GENERATING: 'Edit generation',
  EDIT_REVIEW: 'Edit',
  EDIT_APPROVED: 'Edit approved',
  FINAL_RENDERING: 'Final render',
  FINAL_REVIEW: 'Final review',
  FINAL_APPROVED: 'Ready to download'
};

const current: WorkflowStage = 'CONTENT_REVIEW';

export default function HomePage() {
  const currentIndex = WORKFLOW_STAGES.indexOf(current);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AVALA CREATOR STUDIO</p>
          <h1>Create with your identity. Approve every step.</h1>
          <p className="lede">A controlled workflow for authorized content, your approved voice profile, and your approved avatar. Nothing moves forward without you.</p>
        </div>
        <span className="mode">DEMO MODE</span>
      </header>

      <section className="notice" aria-label="Safety notice">
        Publishing is intentionally excluded. Final output is a downloadable MP4 after your approval.
      </section>

      <section className="workspace">
        <aside className="timeline" aria-label="Project stages">
          <h2>Project timeline</h2>
          <ol>
            {WORKFLOW_STAGES.map((stage, index) => {
              const state = index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'locked';
              return (
                <li key={stage} data-state={state}>
                  <span className="dot" aria-hidden="true" />
                  <div><strong>{labels[stage]}</strong><small>{state}</small></div>
                </li>
              );
            })}
          </ol>
        </aside>

        <article className="editor">
          <div className="editorHeader">
            <div><p className="eyebrow">STAGE 1</p><h2>Review authorized content</h2></div>
            <span className="version">Version 1</span>
          </div>
          <label htmlFor="source">Source content</label>
          <textarea id="source" defaultValue="Paste or upload content that you own or are authorized to adapt. The production implementation will create an immutable version when you save." />
          <label className="attestation"><input type="checkbox" /> I own this content or have permission to adapt it into a video.</label>
          <div className="actions"><button className="secondary">Save version</button><button className="primary" disabled>Approve content</button></div>
          <p className="hint">Approval becomes available only after a version is saved and the rights attestation is recorded.</p>
        </article>
      </section>
    </main>
  );
}
