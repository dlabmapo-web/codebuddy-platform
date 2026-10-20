export type MaterialCreationKind = 'python' | 'pdfPractice' | 'pdf' | 'written' | 'turtle' | 'multipleChoice' | 'shortAnswer' | 'video';

export function availableMaterialKinds(options: {
  editable: boolean;
  exerciseEditable: boolean;
  guiEnabled: boolean;
  multipleChoiceEnabled: boolean;
  shortAnswerEnabled: boolean;
  videoEnabled: boolean;
}): MaterialCreationKind[] {
  const kinds: MaterialCreationKind[] = [];
  if (options.exerciseEditable) kinds.push('python');
  if (options.editable) {
    kinds.push('pdfPractice', 'pdf', options.guiEnabled ? 'turtle' : 'written');
    if (options.multipleChoiceEnabled) kinds.push('multipleChoice');
    if (options.shortAnswerEnabled) kinds.push('shortAnswer');
    if (options.videoEnabled) kinds.push('video');
  }
  return kinds;
}
