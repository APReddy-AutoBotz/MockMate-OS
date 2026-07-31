import { ResumeData, CareerContextItemDraft } from 'mockmate-shared';
import crypto from 'crypto';

export interface ResumeAdapterInput {
  resumeData: ResumeData;
  recordId: string;
  targetRole?: string;
  jdMissingSkills?: string[];
  revision?: string;
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

function cleanExcerpt(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (
    trimmed === '[_]' ||
    trimmed === 'Placeholder' ||
    trimmed === '[X%]' ||
    trimmed === '[N users]' ||
    /\[X%\]|\[N users\]/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

export function buildResumeContextItems(input: ResumeAdapterInput): CareerContextItemDraft[] {
  const { resumeData, recordId, targetRole, jdMissingSkills, revision = 'v1' } = input;
  const items: CareerContextItemDraft[] = [];

  // 1. Target Role (user confirmed / selected)
  if (targetRole && targetRole.trim()) {
    const roleText = targetRole.trim();
    items.push({
      kind: 'target_role',
      canonicalKey: 'resume.target_role',
      label: 'Target Role',
      value: { type: 'text', text: roleText },
      source: {
        module: 'resume',
        recordId,
        fieldPath: 'targetRole',
        sourceRevision: revision,
        sourceHash: computeHash(roleText),
        capturedAt: new Date().toISOString(),
      },
      exactExcerpt: roleText,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
    });
  }

  // 2. Summary
  if (resumeData.summary) {
    const summaryText = cleanExcerpt(resumeData.summary);
    if (summaryText) {
      items.push({
        kind: 'experience_claim',
        canonicalKey: 'resume.summary',
        label: 'Professional Summary',
        value: { type: 'text', text: summaryText },
        source: {
          module: 'resume',
          recordId,
          fieldPath: 'summary',
          sourceRevision: revision,
          sourceHash: computeHash(summaryText),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: summaryText,
        provenance: 'direct_source',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  // 3. Skills
  if (resumeData.skills && resumeData.skills.length > 0) {
    const allSkills = resumeData.skills
      .flatMap(s => s.items)
      .map(cleanExcerpt)
      .filter((s): s is string => Boolean(s));

    if (allSkills.length > 0) {
      items.push({
        kind: 'skill',
        canonicalKey: 'resume.skills',
        label: 'Resume Skills',
        value: { type: 'string_list', values: allSkills },
        source: {
          module: 'resume',
          recordId,
          fieldPath: 'skills',
          sourceRevision: revision,
          sourceHash: computeHash(allSkills.join(',')),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: allSkills.join(', '),
        provenance: 'direct_source',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  // 4. Experience bullets & claims
  if (resumeData.experience && resumeData.experience.length > 0) {
    resumeData.experience.forEach((exp, expIdx) => {
      const expBullets: string[] = Array.isArray(exp.bullets)
        ? exp.bullets
        : (Array.isArray((exp as any).highlights) ? (exp as any).highlights : []);

      expBullets.forEach((bullet, bulletIdx) => {
        const cleanBullet = cleanExcerpt(bullet);
        if (!cleanBullet) return;

        const isAchievement = /\b(\d+%|\$\d+|\d+x|improved|reduced|increased|delivered)\b/i.test(cleanBullet);
        items.push({
          kind: isAchievement ? 'achievement' : 'experience_claim',
          canonicalKey: `resume.experience[${expIdx}].bullet[${bulletIdx}]`,
          label: `${exp.position} at ${exp.company}`,
          value: { type: 'text', text: cleanBullet },
          source: {
            module: 'resume',
            recordId,
            fieldPath: `experience[${expIdx}].bullets[${bulletIdx}]`,
            sourceRevision: revision,
            sourceHash: computeHash(cleanBullet),
            capturedAt: new Date().toISOString(),
          },
          exactExcerpt: cleanBullet,
          provenance: 'direct_source',
          status: 'active',
          sensitivity: 'standard',
        });
      });
    });
  }

  // 5. Projects
  if (resumeData.projects && resumeData.projects.length > 0) {
    resumeData.projects.forEach((proj, projIdx) => {
      if (!proj.name.trim()) return;
      const projText = cleanExcerpt(`${proj.name}: ${proj.description}`);
      if (!projText) return;

      items.push({
        kind: 'project',
        canonicalKey: `resume.project[${projIdx}]`,
        label: `Project: ${proj.name}`,
        value: { type: 'text', text: projText },
        source: {
          module: 'resume',
          recordId,
          fieldPath: `projects[${projIdx}]`,
          sourceRevision: revision,
          sourceHash: computeHash(projText),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: projText,
        provenance: 'direct_source',
        status: 'active',
        sensitivity: 'standard',
      });
    });
  }

  // 6. JD Missing Skills -> ingested as development_priority target gaps
  if (jdMissingSkills && jdMissingSkills.length > 0) {
    const cleanGaps = jdMissingSkills.map(cleanExcerpt).filter((g): g is string => Boolean(g));
    if (cleanGaps.length > 0) {
      items.push({
        kind: 'development_priority',
        canonicalKey: 'resume.jd_target_gaps',
        label: 'Target JD Skill Gaps',
        value: { type: 'string_list', values: cleanGaps },
        source: {
          module: 'resume',
          recordId,
          fieldPath: 'jdMissingSkills',
          sourceRevision: revision,
          sourceHash: computeHash(cleanGaps.join(',')),
          capturedAt: new Date().toISOString(),
        },
        exactExcerpt: cleanGaps.join(', '),
        provenance: 'system_observed',
        status: 'active',
        sensitivity: 'standard',
      });
    }
  }

  return items;
}
