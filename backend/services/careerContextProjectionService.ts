import {
  CareerContextItem,
  GroundingProjection,
  GroundingConflict
} from 'mockmate-shared';

export function projectCareerContext(items: CareerContextItem[]): {
  projection: GroundingProjection;
  conflicts: GroundingConflict[];
} {
  // Only include active, non-contact items
  const activeItems = items.filter(
    i => i.status === 'active' && i.sensitivity !== 'personal_contact' && i.provenance !== 'inferred_pending'
  );

  const conflictsMap = new Map<string, CareerContextItem[]>();
  activeItems.forEach(item => {
    const existing = conflictsMap.get(item.canonicalKey) || [];
    existing.push(item);
    conflictsMap.set(item.canonicalKey, existing);
  });

  const conflicts: GroundingConflict[] = [];
  conflictsMap.forEach((competingItems, canonicalKey) => {
    if (competingItems.length > 1) {
      conflicts.push({
        canonicalKey,
        competingItemIds: competingItems.map(i => i.id),
        descriptions: competingItems.map(i => `${i.label}: ${getItemStringValue(i)}`),
        requiresUserChoice: true,
      });
    }
  });

  const targetRoleItems = activeItems.filter(i => i.kind === 'target_role');
  const targetRole = targetRoleItems.length > 0 ? getItemStringValue(targetRoleItems[0]) : null;
  const alternativeTargetRoles = targetRoleItems.length > 1 ? targetRoleItems.slice(1).map(getItemStringValue) : [];

  const careerGoals = activeItems.filter(i => i.kind === 'career_goal').map(getItemStringValue);
  const skills = activeItems.filter(i => i.kind === 'skill').flatMap(getItemStringListValue);
  const achievements = activeItems.filter(i => i.kind === 'achievement').map(getItemStringValue);
  const experienceClaims = activeItems.filter(i => i.kind === 'experience_claim').map(getItemStringValue);
  const projects = activeItems.filter(i => i.kind === 'project').map(getItemStringValue);
  
  const audienceContextItem = activeItems.find(i => i.kind === 'audience_context');
  const audienceContext = audienceContextItem ? getItemStringValue(audienceContextItem) : null;
  const communicationGoals = activeItems.filter(i => i.kind === 'communication_goal').map(getItemStringValue);
  const speakingSupport = activeItems.filter(i => i.kind === 'speaking_challenge').map(getItemStringValue);
  const practicedVocabulary = activeItems.filter(i => i.kind === 'practiced_vocabulary').flatMap(getItemStringListValue);
  const interviewPracticeSignals = activeItems.filter(i => i.kind === 'interview_practice_signal' || i.kind === 'development_priority').map(getItemStringValue);

  return {
    projection: {
      targetRole,
      alternativeTargetRoles,
      careerGoals,
      skills,
      achievements,
      experienceClaims,
      projects,
      audienceContext,
      communicationGoals,
      speakingSupport,
      practicedVocabulary,
      interviewPracticeSignals,
      conflicts,
    },
    conflicts,
  };
}

function getItemStringValue(item: CareerContextItem): string {
  const val = item.value;
  if (val.type === 'text') return val.text;
  if (val.type === 'string_list') return val.values.join(', ');
  if (val.type === 'metric') return `${val.metric}: ${val.value}`;
  if (val.type === 'evidence') return val.summary;
  return item.label;
}

function getItemStringListValue(item: CareerContextItem): string[] {
  const val = item.value;
  if (val.type === 'string_list') return val.values;
  if (val.type === 'text') return [val.text];
  return [];
}
