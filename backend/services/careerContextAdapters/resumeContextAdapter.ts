import { ResumeData, CareerContextItem } from 'mockmate-shared';
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

export function buildResumeContextItems(input: ResumeAdapterInput): CareerContextItem[] {
  const { resumeData, recordId, targetRole, jdMissingSkills, revision = 'v1' } = input;
  const items: CareerContextItem[] = [];
  const capturedAt = new Date().toISOString();

  // 1. Target Role (user confirmed / selected)
  if (targetRole && targetRole.trim()) {
    const roleText = targetRole.trim();
    const sourceHash = computeHash(roleText);
    items.push({
      id: `ctx_res_${recordId}_target_role`,
      kind: 'target_role',
      canonicalKey: 'resume.target_role',
      label: 'Target Role',
      value: { type: 'text', text: roleText },
      source: {
        module: 'resume',
        recordId,
        fieldPath: 'targetRole',
        sourceRevision: revision,
        sourceHash,
        capturedAt,
      },
      exactExcerpt: roleText,
      provenance: 'user_confirmed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 3. Summary
  if (resumeData.summary && resumeData.summary.trim()) {
    const summaryText = resumeData.summary.trim();
    items.push({
      id: `ctx_res_${recordId}_summary`,
      kind: 'experience_claim',
      canonicalKey: 'resume.summary',
      label: 'Professional Summary',
      value: { type: 'text', text: summaryText },
      source: { module: 'resume', recordId, fieldPath: 'summary', sourceRevision: revision, sourceHash: computeHash(summaryText), capturedAt },
      exactExcerpt: summaryText,
      provenance: 'direct_source',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  // 4. Skills
  if (resumeData.skills && resumeData.skills.length > 0) {
    const allSkills = resumeData.skills.flatMap(s => s.items).filter(Boolean);
    if (allSkills.length > 0) {
      items.push({
        id: `ctx_res_${recordId}_skills`,
        kind: 'skill',
        canonicalKey: 'resume.skills',
        label: 'Resume Skills',
        value: { type: 'string_list', values: allSkills },
        source: { module: 'resume', recordId, fieldPath: 'skills', sourceRevision: revision, sourceHash: computeHash(allSkills.join(',')), capturedAt },
        exactExcerpt: allSkills.join(', '),
        provenance: 'direct_source',
        status: 'active',
        sensitivity: 'standard',
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
    }
  }

  // 5. Experience bullets & claims
  if (resumeData.experience && resumeData.experience.length > 0) {
    resumeData.experience.forEach((exp, expIdx) => {
      const expBullets: string[] = Array.isArray(exp.bullets) ? exp.bullets : (Array.isArray((exp as any).highlights) ? (exp as any).highlights : []);
      if (expBullets.length > 0) {
        expBullets.forEach((bullet, bulletIdx) => {
          if (!bullet.trim()) return;
          // Filter out metric placeholders like [_] or blank template strings
          const cleanBullet = bullet.trim();
          if (cleanBullet === '[_]' || cleanBullet === 'Placeholder') return;

          const isAchievement = /\b(\d+%|\$\d+|\d+x|improved|reduced|increased|delivered)\b/i.test(cleanBullet);
          items.push({
            id: `ctx_res_${recordId}_exp_${expIdx}_bullet_${bulletIdx}`,
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
              capturedAt,
            },
            exactExcerpt: cleanBullet,
            provenance: 'direct_source',
            status: 'active',
            sensitivity: 'standard',
            createdAt: capturedAt,
            updatedAt: capturedAt,
          });
        });
      }
    });
  }

  // 6. Projects
  if (resumeData.projects && resumeData.projects.length > 0) {
    resumeData.projects.forEach((proj, projIdx) => {
      if (!proj.name.trim()) return;
      const projText = `${proj.name}: ${proj.description}`;
      items.push({
        id: `ctx_res_${recordId}_project_${projIdx}`,
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
          capturedAt,
        },
        exactExcerpt: projText,
        provenance: 'direct_source',
        status: 'active',
        sensitivity: 'standard',
        createdAt: capturedAt,
        updatedAt: capturedAt,
      });
    });
  }

  // 7. JD Missing Skills -> ingested as development_priority target gaps (NOT candidate demonstrated skills)
  if (jdMissingSkills && jdMissingSkills.length > 0) {
    items.push({
      id: `ctx_res_${recordId}_jd_gaps`,
      kind: 'development_priority',
      canonicalKey: 'resume.jd_target_gaps',
      label: 'Target JD Skill Gaps',
      value: { type: 'string_list', values: jdMissingSkills },
      source: {
        module: 'resume',
        recordId,
        fieldPath: 'jdMissingSkills',
        sourceRevision: revision,
        sourceHash: computeHash(jdMissingSkills.join(',')),
        capturedAt,
      },
      exactExcerpt: jdMissingSkills.join(', '),
      provenance: 'system_observed',
      status: 'active',
      sensitivity: 'standard',
      createdAt: capturedAt,
      updatedAt: capturedAt,
    });
  }

  return items;
}
