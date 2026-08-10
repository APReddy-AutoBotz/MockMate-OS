import { CareerContextItem } from 'mockmate-shared';
import {
  projectCareerContext,
  resolveSnapshotConflictItems,
} from '../services/careerContextProjectionService';

const item = (id: string, value: string, canonicalKey = 'resume.target_role'): CareerContextItem => ({
  id,
  userId: '11111111-1111-1111-1111-111111111111',
  kind: canonicalKey === 'resume.target_role' ? 'target_role' : 'skill',
  canonicalKey,
  label: value,
  value: { type: 'text', text: value },
  source: {
    module: 'resume',
    recordId: 'resume-1',
    fieldPath: canonicalKey,
    sourceRevision: 'v1',
    sourceHash: `hash-${id}`,
    capturedAt: '2026-08-10T00:00:00.000Z',
  },
  exactExcerpt: value,
  provenance: 'user_confirmed',
  status: 'active',
  sensitivity: 'standard',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
});

describe('authoritative conflict-resolved snapshot membership', () => {
  const winnerA = item('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Platform Engineer');
  const winnerB = item('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Security Engineer');
  const skill = item('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'TypeScript', 'resume.skill.typescript');

  it.each([
    [winnerA, winnerB],
    [winnerB, winnerA],
  ])('keeps only selected winner %s in membership, references, and projection', (winner, loser) => {
    const resolved = resolveSnapshotConflictItems(
      [winner, skill],
      [winnerA, winnerB, skill],
      { 'resume.target_role': winner.id }
    );
    expect(resolved.map(contextItem => contextItem.id)).toEqual([winner.id, skill.id]);
    expect(resolved.map(contextItem => contextItem.id)).not.toContain(loser.id);

    const { projection, conflicts } = projectCareerContext(resolved, 'resume_to_interview');
    expect(projection.targetRole).toBe(winner.value.type === 'text' ? winner.value.text : null);
    expect(JSON.stringify(projection)).not.toContain(loser.exactExcerpt);
    expect(conflicts).toEqual([]);
  });

  it('rejects missing, foreign, cross-key, and unnecessary selections', () => {
    expect(() => resolveSnapshotConflictItems([winnerA], [winnerA, winnerB], {})).toThrow('Explicit selection required');
    expect(() => resolveSnapshotConflictItems([winnerA], [winnerA, winnerB], {
      'resume.target_role': 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    })).toThrow('invalid for the authoritative context');
    expect(() => resolveSnapshotConflictItems([skill], [winnerA, winnerB, skill], {
      'resume.target_role': skill.id,
    })).toThrow('invalid for the authoritative context');
    expect(() => resolveSnapshotConflictItems([skill], [skill], {
      'resume.skill.typescript': skill.id,
    })).toThrow('invalid for the authoritative context');
    expect(() => resolveSnapshotConflictItems([winnerA, winnerB], [winnerA, winnerB], {
      'resume.target_role': winnerA.id,
    })).toThrow('only the selected authoritative winner');
  });
});
