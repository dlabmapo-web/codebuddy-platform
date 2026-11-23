import { describe, expect, it } from 'vitest';

import {
  canEditAssignment,
  canSubmitTeachers,
  currentTeacherIds,
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


describe('class teachers', () => {
  it('reads every teacher off the class, with no homeroom or assistant split', () => {
    expect(
      currentTeacherIds([
        { membershipId: membershipA },
        { membershipId: membershipB },
        { membershipId: membershipC },
      ]),
    ).toEqual([membershipA, membershipB, membershipC]);
  });

  it('refuses to submit the set already stored', () => {
    expect(
      canSubmitTeachers({ selectedIds: [membershipB], currentIds: [membershipB], pending: false }),
    ).toBe(false);
  });

  it('submits a swap that keeps the same number of teachers', () => {
    expect(
      canSubmitTeachers({ selectedIds: [membershipC], currentIds: [membershipB], pending: false }),
    ).toBe(true);
  });

  it('submits an emptied set, which is how the last teacher goes', () => {
    expect(
      canSubmitTeachers({ selectedIds: [], currentIds: [membershipB], pending: false }),
    ).toBe(true);
  });

  it('takes any number of teachers', () => {
    const many = Array.from({ length: 12 }, (_, i) => `60000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`);
    expect(canSubmitTeachers({ selectedIds: many, currentIds: [], pending: false })).toBe(true);
  });

  it('refuses while a save is in flight, so one click cannot send twice', () => {
    expect(
      canSubmitTeachers({ selectedIds: [membershipB], currentIds: [], pending: true }),
    ).toBe(false);
  });
});
