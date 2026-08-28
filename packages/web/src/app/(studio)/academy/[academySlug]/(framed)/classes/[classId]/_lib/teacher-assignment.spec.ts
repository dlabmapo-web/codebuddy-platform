import { describe, expect, it } from 'vitest';

import {
  canEditAssignment,
  canSubmitTeacherSelection,
  isReplacement,
  teacherAssignmentState,
  teacherDisplayName,
  unavailableReason,
} from './teacher-assignment';

const membershipA = '60000000-0000-4000-8000-00000000000a';
const membershipB = '60000000-0000-4000-8000-00000000000b';

describe('teacherAssignmentState', () => {
  it('reports an unassigned class', () => {
    expect(teacherAssignmentState(null)).toBe('none');
  });

  it('reports an active teacher membership as assigned', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        role: 'TEACHER',
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
        role: 'TEACHER',
      }),
    ).toBe('unavailable');
  });

  it('reports a membership moved off the teacher role as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        role: 'TEAM_LEAD',
      }),
    ).toBe('unavailable');
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'ACTIVE',
        role: 'STUDENT',
      }),
    ).toBe('unavailable');
  });

  it('reports an invited membership as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'ACTIVE',
        membershipStatus: 'INVITED',
        role: 'TEACHER',
      }),
    ).toBe('unavailable');
  });

  it('reports an inactive user account as unavailable', () => {
    expect(
      teacherAssignmentState({
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        role: 'TEACHER',
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
        role: 'TEAM_LEAD',
      }),
    ).toBe('role');
  });

  it('blames the membership when it is no longer active', () => {
    expect(
      unavailableReason({
        userStatus: 'ACTIVE',
        membershipStatus: 'SUSPENDED',
        role: 'TEACHER',
      }),
    ).toBe('suspended');
    expect(
      unavailableReason({
        userStatus: 'ACTIVE',
        membershipStatus: 'LEFT',
        role: 'TEACHER',
      }),
    ).toBe('suspended');
  });

  it('blames an inactive user account before membership or role', () => {
    expect(
      unavailableReason({
        userStatus: 'SUSPENDED',
        membershipStatus: 'ACTIVE',
        role: 'TEACHER',
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
