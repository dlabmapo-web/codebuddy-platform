import type {
  MonitoringExercisePreview,
  NavigatorPath,
  StudentContextChangedEvent,
} from '@cove/shared';
import { describe, expect, it } from 'vitest';

import {
  canReturnToLive,
  initialTeacherDisplay,
  isLiveDisplay,
  teacherDisplayReducer,
  type TeacherDisplay,
  type TeacherDisplayAction,
} from './teacher-display';

const live = 'material-live';
const other = 'material-other';

function path(materialId: string, courseId = 'course-1'): NavigatorPath {
  return {
    course: { id: courseId, title: 'Python Basics' },
    module: { id: 'module-1', title: 'Getting started' },
    lecture: { id: 'lecture-1', title: 'Input and output' },
    exercise: { materialId, title: `Exercise ${materialId}` },
  };
}

function snapshot(materialId: string): MonitoringExercisePreview {
  return {
    breadcrumb: {
      course: { id: 'course-1', title: 'Python Basics' },
      module: { id: 'module-1', title: 'Getting started' },
      lecture: { id: 'lecture-1', title: 'Input and output' },
    },
    exercise: {
      materialId,
      title: `Exercise ${materialId}`,
      difficulty: 'EASY',
      language: 'PYTHON',
      description: '',
      inputFormat: '',
      outputFormat: '',
      constraints: '',
      starterCode: 'print()',
      timeLimitMs: 1_000,
      memoryLimitMb: 256,
      sampleTestCases: [],
      hints: [],
      hiddenTestCaseCount: 0,
    },
  };
}

function movement(
  materialId: string | null,
  overrides: Partial<StudentContextChangedEvent> = {},
): StudentContextChangedEvent {
  return {
    studentMembershipId: 'membership-1',
    materialId,
    courseId: materialId ? 'course-1' : null,
    path: materialId ? path(materialId) : null,
    available: materialId !== null,
    changedAt: '2026-08-07T09:00:00.000Z',
    ...overrides,
  };
}

function run(
  actions: TeacherDisplayAction[],
  from: TeacherDisplay = initialTeacherDisplay,
): TeacherDisplay {
  return actions.reduce(teacherDisplayReducer, from);
}

const watching = run([{ type: 'watched', materialId: live, path: path(live) }]);

describe('live mode', () => {
  it('shows the material the watch authorized', () => {
    expect(watching.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
    expect(watching.live).toMatchObject({ materialId: live, available: true });
  });

  it('offers nothing to return to while the display already is the live one', () => {
    expect(canReturnToLive(watching)).toBe(false);
  });

  /**
   * The acknowledgement and the path that describes it are two separate loads,
   * so the same watch is announced more than once. Producing a new state each
   * time made the effect that announces it re-run on its own output, which is
   * a render loop rather than a stale marker.
   */
  it('is unchanged by re-announcing the watch it already settled on', () => {
    const again = teacherDisplayReducer(watching, {
      type: 'watched',
      materialId: live,
      path: watching.live.path,
    });
    expect(again).toBe(watching);
  });

  it('is unchanged when the path has not arrived yet', () => {
    const withoutPath = run([
      { type: 'watched', materialId: live, path: null },
    ]);
    const again = teacherDisplayReducer(withoutPath, {
      type: 'watched',
      materialId: live,
      path: null,
    });
    expect(again).toBe(withoutPath);
  });

  it('does not carry an old course onto a newly authorized pathless watch', () => {
    const followed = teacherDisplayReducer(watching, {
      type: 'watched',
      materialId: other,
      path: null,
    });
    expect(followed.live).toMatchObject({
      materialId: other,
      courseId: null,
      path: null,
    });
  });

  it('still adopts the path once it does arrive', () => {
    const withoutPath = run([
      { type: 'watched', materialId: live, path: null },
    ]);
    const resolved = teacherDisplayReducer(withoutPath, {
      type: 'watched',
      materialId: live,
      path: path(live),
    });
    expect(resolved.live.path).toEqual(path(live));
    expect(resolved.live.courseId).toBe('course-1');
  });

  it('does not let a late path from the old watch move the live marker back', () => {
    const withoutPath = run([
      { type: 'watched', materialId: live, path: null },
    ]);
    const moved = teacherDisplayReducer(withoutPath, {
      type: 'moved',
      event: movement(other, {
        courseId: 'course-2',
        path: path(other, 'course-2'),
      }),
    });
    const resolved = teacherDisplayReducer(moved, {
      type: 'watch_path_resolved',
      materialId: live,
      path: path(live),
    });

    expect(resolved.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
    expect(resolved.live).toMatchObject({
      materialId: other,
      courseId: 'course-2',
      path: path(other, 'course-2'),
    });
  });

  it('leaves a preview alone rather than settling over it', () => {
    const previewing = run(
      [
        { type: 'preview_requested', materialId: other, token: 1 },
        {
          type: 'preview_resolved',
          token: 1,
          materialId: other,
          snapshot: snapshot(other),
        },
      ],
      watching,
    );
    const reannounced = teacherDisplayReducer(previewing, {
      type: 'watched',
      materialId: live,
      path: previewing.live.path,
    });
    // A re-announced watch is a deliberate act by the server, so it does
    // return the teacher to live — it simply must not be mistaken for a
    // settled no-op while a preview is on screen.
    expect(reannounced).not.toBe(previewing);
    expect(reannounced.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
  });
});

describe('preview mode', () => {
  const previewing = run(
    [
      { type: 'preview_requested', materialId: other, token: 1 },
      {
        type: 'preview_resolved',
        token: 1,
        materialId: other,
        snapshot: snapshot(other),
      },
    ],
    watching,
  );

  it('displays the previewed exercise without moving the live target', () => {
    expect(previewing.display).toMatchObject({ mode: 'preview', materialId: other });
    expect(previewing.live.materialId).toBe(live);
    expect(isLiveDisplay(previewing)).toBe(false);
  });

  it('offers a way back to the student', () => {
    expect(canReturnToLive(previewing)).toBe(true);
  });

  it('keeps the previous display when the request fails', () => {
    const failed = run(
      [
        { type: 'preview_requested', materialId: other, token: 1 },
        { type: 'preview_failed', token: 1, materialId: other },
      ],
      previewing,
    );
    expect(failed.display).toEqual(previewing.display);
    expect(failed.previewFailedMaterialId).toBe(other);
  });

  /**
   * Two clicks, two requests, and the slower one answering last. Committing it
   * would land the teacher on an exercise they had already navigated away from.
   */
  it('drops a response that a newer selection superseded', () => {
    const superseded = run(
      [
        { type: 'preview_requested', materialId: other, token: 1 },
        { type: 'preview_requested', materialId: 'material-third', token: 2 },
        {
          type: 'preview_resolved',
          token: 1,
          materialId: other,
          snapshot: snapshot(other),
        },
      ],
      watching,
    );
    expect(superseded.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
  });
});

describe('student movement', () => {
  const previewing = run(
    [
      { type: 'preview_requested', materialId: other, token: 1 },
      {
        type: 'preview_resolved',
        token: 1,
        materialId: other,
        snapshot: snapshot(other),
      },
    ],
    watching,
  );

  it('moves the marker and leaves the display alone', () => {
    const moved = run(
      [{ type: 'moved', event: movement('material-third') }],
      previewing,
    );
    expect(moved.display).toEqual(previewing.display);
    expect(moved.live.materialId).toBe('material-third');
  });

  it('withdraws live actions when the student leaves the displayed exercise', () => {
    const moved = run(
      [{ type: 'moved', event: movement('material-third') }],
      watching,
    );
    expect(moved.display).toEqual(watching.display);
    expect(isLiveDisplay(moved)).toBe(false);
    expect(canReturnToLive(moved)).toBe(true);
  });

  it('preserves an unsent note through a move', () => {
    const typed = run(
      [{ type: 'feedback_draft', materialId: other, body: 'Check line 3' }],
      previewing,
    );
    const moved = run([{ type: 'moved', event: movement('material-third') }], typed);
    expect(moved.feedbackDrafts[other]).toBe('Check line 3');
  });

  it('keeps each material\'s note on its own thread', () => {
    const typed = run(
      [
        { type: 'feedback_draft', materialId: live, body: 'On the live one' },
        { type: 'feedback_draft', materialId: other, body: 'On the preview' },
      ],
      previewing,
    );
    expect(typed.feedbackDrafts).toEqual({
      [live]: 'On the live one',
      [other]: 'On the preview',
    });
  });

  it('reports a student who left an exercise as unavailable', () => {
    const gone = run([{ type: 'moved', event: movement(null) }], previewing);
    expect(gone.live).toEqual({
      materialId: null,
      courseId: null,
      path: null,
      available: false,
    });
    expect(canReturnToLive(gone)).toBe(false);
    // The last valid display stays on screen for review.
    expect(gone.display).toEqual(previewing.display);
  });

  /**
   * Another course is still a move. The old outline stays displayed; the live
   * path reports where the student went without inventing a row in it.
   */
  it('records a cross-course move as the new live path', () => {
    const moved = run(
      [
        {
          type: 'moved',
          event: movement('material-elsewhere', {
            courseId: 'course-2',
            path: path('material-elsewhere', 'course-2'),
          }),
        },
      ],
      previewing,
    );
    expect(moved.live.courseId).toBe('course-2');
    expect(moved.display).toEqual(previewing.display);
  });
});

describe('returning to live', () => {
  it('does not change the display until a watch is authorized', () => {
    const previewing = run(
      [
        { type: 'preview_requested', materialId: other, token: 1 },
        {
          type: 'preview_resolved',
          token: 1,
          materialId: other,
          snapshot: snapshot(other),
        },
      ],
      watching,
    );
    const requested = run([{ type: 'follow_requested', token: 9 }], previewing);
    expect(requested.following).toBe(true);
    expect(requested.display).toEqual(previewing.display);

    const followed = run(
      [
        {
          type: 'watched',
          materialId: 'material-third',
          path: path('material-third'),
        },
      ],
      requested,
    );
    expect(followed.display).toEqual({
      mode: 'live',
      materialId: 'material-third',
      path: path('material-third'),
    });
    expect(followed.following).toBe(false);
  });

  it('drops a preview that resolves after the teacher chose to follow', () => {
    const state = run(
      [
        { type: 'preview_requested', materialId: other, token: 1 },
        { type: 'follow_requested', token: 9 },
        {
          type: 'preview_resolved',
          token: 1,
          materialId: other,
          snapshot: snapshot(other),
        },
      ],
      watching,
    );
    expect(state.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
  });
});

describe('watch_ended', () => {
  it('keeps the last display and withdraws every live claim', () => {
    const ended = run([{ type: 'watch_ended' }], watching);
    expect(ended.display).toEqual({
      mode: 'live',
      materialId: live,
      path: path(live),
    });
    expect(ended.live.available).toBe(false);
    expect(canReturnToLive(ended)).toBe(false);
  });
});
