import {
  CareerContextItem,
  GroundingProjection,
  GroundingConflict,
  GroundingPurpose
} from 'mockmate-shared';

export function projectCareerContext(
  items: CareerContextItem[],
  purpose: GroundingPurpose = 'general_practice',
  conflictSelections: Record<string, string> = {},
  personalizationEnabled: boolean = false
): {
  projection: GroundingProjection;
  conflicts: GroundingConflict[];
} {
  // Filter eligible active items: status active, sensitivity != personal_contact, provenance != inferred_pending
  const activeItems = items.filter(
    i => i.status === 'active' && i.sensitivity !== 'personal_contact' && i.provenance !== 'inferred_pending'
  );

  // Group by canonical key to detect conflicts
  const conflictsMap = new Map<string, CareerContextItem[]>();
  activeItems.forEach(item => {
    const existing = conflictsMap.get(item.canonicalKey) || [];
    existing.push(item);
    conflictsMap.set(item.canonicalKey, existing);
  });

  const conflicts: GroundingConflict[] = [];
  const selectedItems: CareerContextItem[] = [];

  conflictsMap.forEach((competingItems, canonicalKey) => {
    if (competingItems.length > 1) {
      const selectedId = conflictSelections[canonicalKey];
      const chosen = competingItems.find(i => i.id === selectedId);
      if (chosen) {
        selectedItems.push(chosen);
      } else {
        conflicts.push({
          canonicalKey,
          competingItemIds: competingItems.map(i => i.id),
          descriptions: competingItems.map(i => `${i.label}: ${getItemStringValue(i)}`),
          requiresUserChoice: true,
        });
      }
    } else {
      selectedItems.push(competingItems[0]);
    }
  });

  // Target role determination: if target_role is in conflict and unselected, targetRole = null
  const targetRoleConflict = conflicts.find(c => c.canonicalKey === 'resume.target_role' || c.canonicalKey.includes('target_role'));
  let targetRole: string | null = null;
  if (!targetRoleConflict) {
    const targetRoleItem = selectedItems.find(i => i.kind === 'target_role');
    if (targetRoleItem) {
      targetRole = getItemStringValue(targetRoleItem);
    }
  }

  const alternativeTargetRoles = selectedItems
    .filter(i => i.kind === 'target_role' && getItemStringValue(i) !== targetRole)
    .map(getItemStringValue);

  const careerGoals = selectedItems.filter(i => i.kind === 'career_goal').map(getItemStringValue);
  const skills = selectedItems.filter(i => i.kind === 'skill').flatMap(getItemStringListValue);
  const achievements = selectedItems.filter(i => i.kind === 'achievement').map(getItemStringValue);
  const experienceClaims = selectedItems.filter(i => i.kind === 'experience_claim').map(getItemStringValue);
  const projects = selectedItems.filter(i => i.kind === 'project').map(getItemStringValue);
  const jdMissingSkills = selectedItems.filter(i => i.kind === 'development_priority' && i.source.module === 'resume').flatMap(getItemStringListValue);

  const audienceContextItem = selectedItems.find(i => i.kind === 'audience_context');
  const audienceContext = audienceContextItem ? getItemStringValue(audienceContextItem) : null;
  const communicationGoals = selectedItems.filter(i => i.kind === 'communication_goal').map(getItemStringValue);
  const speakingSupport = selectedItems.filter(i => i.kind === 'speaking_challenge').map(getItemStringValue);
  const practicedVocabulary = selectedItems.filter(i => i.kind === 'practiced_vocabulary').flatMap(getItemStringListValue);
  
  // Interview practice signals included ONLY if personalizationEnabled is true or purpose-allowed
  const practiceSignals = personalizationEnabled
    ? selectedItems.filter(i => i.kind === 'interview_practice_signal').map(getItemStringValue)
    : [];
  const developmentPriorities = selectedItems.filter(i => i.kind === 'development_priority').flatMap(getItemStringListValue);

  return {
    projection: {
      targetRole,
      alternativeTargetRoles,
      careerGoals,
      skills,
      achievements,
      experienceClaims,
      projects,
      jdMissingSkills,
      personalizationEnabled,
      practiceSignals,
      developmentPriorities,
      audienceContext,
      communicationGoal: communicationGoals[0] || null,
      communicationGoals,
      speakingChallenge: speakingSupport[0] || null,
      speakingSupport,
      practicedVocabulary,
      interviewPracticeSignals: practiceSignals,
      conflicts,
    },
    conflicts,
  };
}

/**
 * Resolve the exact item membership authorized by an explicit snapshot
 * request. Unlike the projection preview, snapshot creation must fail closed:
 * every requested conflict needs one winner and selections may not refer to a
 * different/non-conflicting canonical key.
 */
export function resolveSnapshotConflictItems(
  items: CareerContextItem[],
  conflictSelections: Record<string, string>
): CareerContextItem[] {
  const byCanonicalKey = new Map<string, CareerContextItem[]>();
  for (const item of items) {
    const competing = byCanonicalKey.get(item.canonicalKey) || [];
    competing.push(item);
    byCanonicalKey.set(item.canonicalKey, competing);
  }

  for (const selectedKey of Object.keys(conflictSelections)) {
    const competing = byCanonicalKey.get(selectedKey);
    if (!competing || competing.length < 2) {
      throw Object.assign(
        new Error(`Conflict selection for '${selectedKey}' does not identify a requested conflict.`),
        { status: 422 }
      );
    }
  }

  const resolved: CareerContextItem[] = [];
  for (const [canonicalKey, competing] of byCanonicalKey) {
    if (competing.length === 1) {
      resolved.push(competing[0]);
      continue;
    }

    const selectedId = conflictSelections[canonicalKey];
    if (!selectedId) {
      throw Object.assign(
        new Error(`Unresolved conflict for key '${canonicalKey}'. Explicit selection required.`),
        { status: 422 }
      );
    }
    const winner = competing.find(item => item.id === selectedId);
    if (!winner) {
      throw Object.assign(
        new Error(`Conflict winner for '${canonicalKey}' must be one of its requested eligible items.`),
        { status: 422 }
      );
    }
    resolved.push(winner);
  }

  return resolved;
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
