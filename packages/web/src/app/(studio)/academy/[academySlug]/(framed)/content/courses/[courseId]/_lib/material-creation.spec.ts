import { describe, expect, it } from 'vitest';
import { availableMaterialKinds, unavailableMaterialKinds } from './material-creation';

const options = { editable: false, exerciseEditable: false, guiEnabled: false, multipleChoiceEnabled: false, shortAnswerEnabled: false, videoEnabled: false };

describe('material creation permissions', () => {
  it('offers no creation actions to read-only staff', () => {
    expect(availableMaterialKinds(options)).toEqual([]);
  });
  it('limits exercise authors to coding practice', () => {
    expect(availableMaterialKinds({ ...options, exerciseEditable: true, guiEnabled: true, multipleChoiceEnabled: true, shortAnswerEnabled: true, videoEnabled: true })).toEqual(['python']);
  });
  it('retains standard authoring choices when optional features are disabled', () => {
    expect(availableMaterialKinds({ ...options, editable: true, exerciseEditable: true })).toEqual(['python', 'explanation', 'pdfPractice', 'pdf', 'written']);
  });
  it('offers enabled manual/video types and replaces written response with turtle in GUI mode', () => {
    expect(availableMaterialKinds({ ...options, editable: true, guiEnabled: true, multipleChoiceEnabled: true, shortAnswerEnabled: true, videoEnabled: true })).toEqual(['explanation', 'pdfPractice', 'pdf', 'turtle', 'multipleChoice', 'shortAnswer', 'video']);
  });
  it('shows a web course every kind, with the coding ones unavailable and the written response kept', () => {
    const web = { ...options, courseLanguage: 'WEB' as const, editable: true, exerciseEditable: true, guiEnabled: true, multipleChoiceEnabled: true, shortAnswerEnabled: true, videoEnabled: true };
    expect(availableMaterialKinds(web)).toEqual(['python', 'explanation', 'pdfPractice', 'pdf', 'turtle', 'written', 'multipleChoice', 'shortAnswer', 'video']);
    expect(unavailableMaterialKinds('WEB')).toEqual(['python', 'pdfPractice', 'turtle']);
    expect(unavailableMaterialKinds('PYTHON')).toEqual([]);
    expect(unavailableMaterialKinds('C_CPP')).toEqual([]);
  });
  it('offers a web course nothing when only coding practice could be added', () => {
    expect(availableMaterialKinds({ ...options, courseLanguage: 'WEB', exerciseEditable: true })).toEqual([]);
  });
});
