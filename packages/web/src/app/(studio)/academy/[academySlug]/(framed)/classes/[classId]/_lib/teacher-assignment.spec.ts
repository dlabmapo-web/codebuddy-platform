import { describe, expect, it } from 'vitest';

import {
  assistantCandidates,
  assistantSlotsLeft,
  canEditAssignment,
  canSubmitAssistants,
  canSubmitTeacherSelection,
  currentAssistantIds,
  isReplacement,
  teacherAssignmentState,
  teacherDisplayName,
  unavailableReason,
} from './teacher-assignment';

const membershipA = '60000000-0000-4000-8000-00000000000a';
const membershipB = '60000000-0000-4000-8000-00000000000b';
const membershipC = '60000000-0000-4000-8000-00000000000c';

describe('teacherAssignmentState', () => {
  it('reports an unassigned class', () => {
    expect(teacherAssignmentState(null)).toBe('none');
  });

  it('reports an active teacher membership as assigned', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        roles: ['TEACHER'],
      }),
    ).toBe('active');
  });

  it('reports a suspended membership as unavailable, not as unassigned', () => {
    // The class still stores this person. Collapsing the two states would hide
    // a decision a Manager still has to make.
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'SUSPENDED',
        roles: ['TEACHER'],
      }),
    ).toBe('unavailable');
  });

  /*
   * A director who also teaches. Their membership stores `role = MANAGER`
   * with TEACHER beside it, and reading the primary role alone marked a
   * working assignment "no longer a teacher" the moment they were granted a
   * second role.
   */
  it('keeps a multi-role member assigned while they still hold TEACHER', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        roles: ['TEACHER', 'TEAM_LEAD', 'MANAGER'],
      }),
    ).toBe('active');
  });

  it('reports a membership moved off the teacher role as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        roles: ['TEAM_LEAD'],
      }),
    ).toBe('unavailable');
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        roles: ['STUDENT'],
      }),
    ).toBe('unavailable');
  });

  it('reports an invited membership as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'INVITED',
        roles: ['TEACHER'],
      }),
    ).toBe('unavailable');
  });

  it('reports an inactive user account as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        roles: ['TEACHER'],
      }),
    ).toBe('unavailable');
  });
});

describe('unavailableReason', () => {
  it('blames the role when the membership is still active', () => {
    expect(
      unavailableReason({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        roles: ['TEAM_LEAD'],
      }),
    ).toBe('role');
  });

  it('blames the membership when it is no longer active', () => {
    expect(
      unavailableReason({
        userStatus: 'ACTIVE',
        membershipStatus: 'SUSPENDED',
        roles: ['TEACHER'],
      }),
    ).toBe('suspended');
    expect(
      unavailableReason({
        userStatus: 'ACTIVE',
        membershipStatus: 'LEFT',
        roles: ['TEACHER'],
      }),
    ).toBe('suspended');
  });

  it('blames an inactive user account before membership or role', () => {
    expect(
      unavailableReason({
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        roles: ['TEACHER'],
      }),
    ).toBe('account');
  });
});

describe('canEditAssignment', () => {
  it('needs both the permission and an active class', () => {
    expect(canEditAssignment({ canAssign: true, status: 'ACTIVE' })).toBe(true);
  });

  it('hides the controls without the permission', () => {
    // A Teacher and a Student reach neither, whatever the class status is.
    expect(canEditAssignment({ canAssign: false, status: 'ACTIVE' })).toBe(false);
    expect(canEditAssignment({ canAssign: false, status: 'ARCHIVED' })).toBe(
      false,
    );
  });

  it('keeps an archived class read-only even for a Manager', () => {
    expect(canEditAssignment({ canAssign: true, status: 'ARCHIVED' })).toBe(
      false,
    );
  });
});

describe('canSubmitTeacherSelection', () => {
  it('allows assigning to an unassigned class', () => {
    expect(
      canSubmitTeacherSelection({
        selectedId: membershipA,
        currentId: null,
        pending: false,
      }),
    ).toBe(true);
  });

  it('allows replacing one teacher with another', () => {
    expect(
      canSubmitTeacherSelection({
        selectedId: membershipB,
        currentId: membershipA,
        pending: false,
      }),
    ).toBe(true);
  });

  it('refuses to re-save the teacher already assigned', () => {
    expect(
      canSubmitTeacherSelection({
        selectedId: membershipA,
        currentId: membershipA,
        pending: false,
      }),
    ).toBe(false);
  });

  it('refuses an empty selection, because removal is its own confirmation', () => {
    expect(
      canSubmitTeacherSelection({
        selectedId: null,
        currentId: membershipA,
        pending: false,
      }),
    ).toBe(false);
  });

  it('blocks a second submit while the first is in flight', () => {
    // Two sends of the same revision would turn the second into a conflict.
    expect(
      canSubmitTeacherSelection({
        selectedId: membershipA,
        currentId: null,
        pending: true,
      }),
    ).toBe(false);
  });
});

describe('isReplacement', () => {
  it('warns only when somebody actually loses the class', () => {
    expect(isReplacement({ selectedId: membershipB, currentId: membershipA })).toBe(
      true,
    );
  });

  it('stays quiet when the class had no teacher', () => {
    expect(isReplacement({ selectedId: membershipA, currentId: null })).toBe(
      false,
    );
  });

  it('stays quiet when the current teacher is reselected', () => {
    expect(isReplacement({ selectedId: membershipA, currentId: membershipA })).toBe(
      false,
    );
  });
});

describe('teacherDisplayName', () => {
  it('prefers the display name', () => {
    expect(
      teacherDisplayName(
        { displayName: 'Ada', email: 'ada@example.com' },
        'Name not set',
      ),
    ).toBe('Ada');
  });

  it('falls back to the email, which still identifies the person', () => {
    expect(
      teacherDisplayName(
        { displayName: null, email: 'ada@example.com' },
        'Name not set',
      ),
    ).toBe('ada@example.com');
  });

  it('uses the label only when neither is known', () => {
    expect(
      teacherDisplayName({ displayName: null, email: null }, 'Name not set'),
    ).toBe('Name not set');
    expect(teacherDisplayName(null, 'Name not set')).toBe('Name not set');
  });
});


describe('assistant teachers', () => {
  const seat = (membershipId: string, isHomeroom: boolean) => ({
    membershipId,
    isHomeroom,
  });

  it('reads the assistants off the class teacher list', () => {
    expect(
      currentAssistantIds([
        seat(membershipA, true),
        seat(membershipB, false),
        seat(membershipC, false),
      ]),
    ).toEqual([membershipB, membershipC]);
  });

  it('reports no assistants for a class with only a homeroom teacher', () => {
    expect(currentAssistantIds([seat(membershipA, true)])).toEqual([]);
  });

  /*
   * Filtered out rather than shown and refused: offering the homeroom teacher
   * would let a manager submit the one change the API exists to reject.
   */
  it('never offers the homeroom teacher as their own assistant', () => {
    expect(
      assistantCandidates(
        [{ membershipId: membershipA }, { membershipId: membershipB }],
        membershipA,
      ),
    ).toEqual([{ membershipId: membershipB }]);
  });

  it('offers everybody while the class is unassigned', () => {
    expect(
      assistantCandidates([{ membershipId: membershipA }], null),
    ).toHaveLength(1);
  });

  it('counts the seats left from the assistant cap', () => {
    expect(assistantSlotsLeft(0)).toBe(2);
    expect(assistantSlotsLeft(2)).toBe(0);
    // A class already over the cap reports no room rather than a negative.
    expect(assistantSlotsLeft(3)).toBe(0);
  });

  it('refuses to submit the set already stored', () => {
    expect(
      canSubmitAssistants({
        selectedIds: [membershipB],
        currentIds: [membershipB],
        pending: false,
      }),
    ).toBe(false);
  });

  it('submits a swap that keeps the same number of assistants', () => {
    expect(
      canSubmitAssistants({
        selectedIds: [membershipC],
        currentIds: [membershipB],
        pending: false,
      }),
    ).toBe(true);
  });

  it('submits an emptied set, which is how the last assistant goes', () => {
    expect(
      canSubmitAssistants({
        selectedIds: [],
        currentIds: [membershipB],
        pending: false,
      }),
    ).toBe(true);
  });

  it('refuses more assistants than the class may carry', () => {
    expect(
      canSubmitAssistants({
        selectedIds: [membershipA, membershipB, membershipC],
        currentIds: [],
        pending: false,
      }),
    ).toBe(false);
  });

  it('refuses while a save is in flight, so one click cannot send twice', () => {
    expect(
      canSubmitAssistants({
        selectedIds: [membershipB],
        currentIds: [],
        pending: true,
      }),
    ).toBe(false);
  });
});
