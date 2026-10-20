import { describe, expect, it } from 'vitest';
import { availableMaterialKinds } from './material-creation';

const options = { editable: false, exerciseEditable: false, guiEnabled: false, multipleChoiceEnabled: false, shortAnswerEnabled: false, videoEnabled: false };

describe('material creation permissions', () => {
  it('offers no creation actions to read-only staff', () => {
    expect(availableMaterialKinds(options)).toEqual([]);
  });
  it('limits exercise authors to coding practice', () => {
    expect(availableMaterialKinds({ ...options, exerciseEditable: true, guiEnabled: true, multipleChoiceEnabled: true, shortAnswerEnabled: true, videoEnabled: true })).toEqual(['python']);
  });
  it('retains standard authoring choices when optional features are disabled', () => {
    expect(availableMaterialKinds({ ...options, editable: true, exerciseEditable: true })).toEqual(['python', 'pdfPractice', 'pdf', 'written']);
  });
  it('offers enabled manual/video types and replaces written response with turtle in GUI mode', () => {
    expect(availableMaterialKinds({ ...options, editable: true, guiEnabled: true, multipleChoiceEnabled: true, shortAnswerEnabled: true, videoEnabled: true })).toEqual(['pdfPractice', 'pdf', 'turtle', 'multipleChoice', 'shortAnswer', 'video']);
  });
});
