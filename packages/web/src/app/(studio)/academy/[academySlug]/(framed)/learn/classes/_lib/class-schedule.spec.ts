import { describe, expect, it } from 'vitest';

import { splitSchedule } from './class-schedule';

describe('splitSchedule', () => {
  it('lifts the meeting time out of the academy’s own format', () => {
    expect(
      splitSchedule('토 10:00 — 기초 과정을 마친 학생을 위한 심화 반입니다.'),
    ).toEqual({
      schedule: '토 10:00',
      description: '기초 과정을 마친 학생을 위한 심화 반입니다.',
    });
  });

  it('handles multi-day schedules', () => {
    expect(splitSchedule('월·수·금 17:00 — 처음 시작하는 학생을 위한 반입니다.'))
      .toEqual({
        schedule: '월·수·금 17:00',
        description: '처음 시작하는 학생을 위한 반입니다.',
      });
  });

  it('accepts an en dash or a hyphen as the separator', () => {
    expect(splitSchedule('화·목 19:00 – Evening group').schedule).toBe(
      '화·목 19:00',
    );
    expect(splitSchedule('Tue 18:30 - Evening group').schedule).toBe(
      'Tue 18:30',
    );
  });

  it('leaves prose alone when the head carries no clock time', () => {
    // The dash is doing ordinary punctuation work here. Treating it as a
    // schedule would put half a sentence in a chip.
    const text = 'For returning students — bring your own laptop.';
    expect(splitSchedule(text)).toEqual({ schedule: null, description: text });
  });

  it('leaves prose alone when the head is a whole sentence', () => {
    const text =
      'This class meets after school and runs until 18:00 — bring a laptop.';
    expect(splitSchedule(text).schedule).toBeNull();
  });

  it('keeps a description that merely ends in a dash', () => {
    const text = '토 10:00 —';
    expect(splitSchedule(text)).toEqual({ schedule: null, description: text });
  });

  it('returns an empty description unchanged', () => {
    expect(splitSchedule('')).toEqual({ schedule: null, description: '' });
  });

  it('does not split on a dash that opens the text', () => {
    expect(splitSchedule('— 10:00 something').schedule).toBeNull();
  });
});
