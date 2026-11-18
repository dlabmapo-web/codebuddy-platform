/** User-facing names; internal merge keys never serve as product labels. */
export function reviewFieldKey(unitKey: string) {
    if (unitKey.startsWith('@order') || unitKey === '@parent')
        return 'placement';
    if (unitKey.startsWith('@'))
        return 'presence';
    const key = unitKey.split(':')[0];
    const labels = {
        'material.title': 'title', 'material.required': 'required', 'course.title': 'title', 'course.description': 'description',
        'module.title': 'title', 'module.description': 'description', 'lecture.title': 'title', 'lecture.description': 'description',
        'exercise.description': 'description', 'exercise.inputFormat': 'input', 'exercise.outputFormat': 'output', 'exercise.constraints': 'constraints',
        'exercise.difficulty': 'difficulty', 'exercise.starterCode': 'starterCode', 'exercise.language': 'language', 'exercise.limits': 'limits',
        'exercise.gradingProfile': 'grading', 'exercise.submissionPolicy': 'submission', 'exercise.manualAssessment': 'grading',
        'exercise.feedbackPolicy': 'feedback', 'exercise.aiFeedback': 'feedback', 'exercise.quiz': 'answers', 'exercise.referencePdf': 'referencePdf',
        'exercise.solution': 'solution', 'exercise.solutions@order': 'solutionOrder', 'exercise.testCase': 'testCase', 'exercise.testCases@order': 'testOrder',
        'exercise.hint': 'hint', 'exercise.hints@order': 'hintOrder', 'explanation.body': 'body', 'explanation.sideBody': 'sideNotes',
        'pdf.file': 'pdf', 'pdf.placement': 'placement', 'video.media': 'video', 'video.instructions': 'instructions', 'video.placement': 'placement', 'video.scoring': 'grading',
        'manual.description': 'description', 'manual.hint': 'hint', 'manual.modelAnswer': 'modelAnswer', 'manual.file': 'starterFile',
        'manual.entryPoint': 'entryPoint', 'manual.solutionFiles@presence': 'solutionFile', 'manual.solutionFile': 'solutionFile',
        'manual.asset': 'attachment', 'manual.solutionAsset': 'solutionAttachment', 'manual.assets@order': 'attachment', 'manual.solutionAssets@order': 'solutionAttachment',
        'manual.canvas': 'canvas', 'manual.execution': 'execution', 'manual.scoring': 'grading', 'manual.submission': 'submission',
        'sa.prompt': 'prompt', 'sa.explanation': 'answerExplanation', 'mc.prompt': 'prompt', 'mc.description': 'description', 'mc.structure': 'answers', 'mc.option': 'option', 'mc.explanation': 'answerExplanation', 'sa.rule': 'answerRule',
    } as const;
    return labels[key as keyof typeof labels] ?? 'settings';
}
