import { apiError, apiOk } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/requireAdmin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { validateTestCases } from '@/lib/judge/testCaseValidation';

type ImportTestCase = {
  order_no: number;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
};

type ImportHint = {
  order_no: number;
  hint_text: string;
  trigger_pattern: string;
};

type ImportRow = {
  key: string;
  subject: { order_no: number; title: string; description: string };
  stage: { order_no: number; title: string; description: string };
  chapter: { order_no: number; title: string; description: string };
  problem: {
    order_no: number;
    title: string;
    difficulty: 'easy' | 'medium' | 'hard';
    description: string;
    input_format: string;
    output_format: string;
    constraint_text: string;
    starter_code: string;
    is_published: boolean;
    use_ai_feedback: boolean;
  };
  test_cases: ImportTestCase[];
  hints: ImportHint[];
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase('ko-KR');
}

function validOrder(value: number) {
  return Number.isInteger(value) && value > 0;
}

function validateRows(rows: ImportRow[]) {
  const errors: string[] = [];
  const keys = new Set<string>();

  if (rows.length === 0) errors.push('등록할 문제가 없습니다.');
  if (rows.length > 200) errors.push('한 번에 최대 200개 문제까지 등록할 수 있습니다.');

  rows.forEach((row, index) => {
    const label = `${index + 1}행`;
    if (!row.key?.trim()) errors.push(`${label}: 문제키가 없습니다.`);
    if (keys.has(row.key)) errors.push(`${label}: 문제키 "${row.key}"가 중복됩니다.`);
    keys.add(row.key);

    for (const [name, item] of [
      ['과목', row.subject],
      ['단계', row.stage],
      ['챕터', row.chapter],
    ] as const) {
      if (!item?.title?.trim()) errors.push(`${label}: ${name}명이 없습니다.`);
      if (!validOrder(Number(item?.order_no))) errors.push(`${label}: ${name}번호는 1 이상의 정수여야 합니다.`);
    }

    if (!validOrder(Number(row.problem?.order_no))) errors.push(`${label}: 문제순서는 1 이상의 정수여야 합니다.`);
    if (!row.problem?.title?.trim()) errors.push(`${label}: 문제제목이 없습니다.`);
    if (!row.problem?.description?.trim()) errors.push(`${label}: 문제설명이 없습니다.`);
    if (!['easy', 'medium', 'hard'].includes(row.problem?.difficulty)) {
      errors.push(`${label}: 난이도는 easy, medium, hard 중 하나여야 합니다.`);
    }
    if (!row.test_cases?.length) errors.push(`${label}: 테스트케이스가 1개 이상 필요합니다.`);
    const testCaseError = validateTestCases(row.test_cases ?? []);
    if (testCaseError) errors.push(`${label}: ${testCaseError}`);
    row.test_cases?.forEach((testCase, testIndex) => {
      if (!testCase.expected_output?.trim()) {
        errors.push(`${label}: 테스트케이스 ${testIndex + 1}의 정답출력이 없습니다.`);
      }
    });
  });

  return errors.slice(0, 30);
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const rows = (body?.rows ?? []) as ImportRow[];
  const validationErrors = validateRows(rows);
  if (validationErrors.length > 0) {
    return apiError(validationErrors.join('\n'), 'INVALID_IMPORT_DATA', 400);
  }

  const db = supabaseAdmin();
  const [subjectResult, stageResult, chapterResult, problemResult, maxProblemResult] = await Promise.all([
    db.from('subjects').select('id, title, order_no'),
    db.from('stages').select('id, subject_id, title, order_no'),
    db.from('chapters').select('id, stage_id, title, order_no'),
    db.from('problems').select('id, chapter_id, title, order_no'),
    db.from('problems').select('problem_no').order('problem_no', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (subjectResult.error || stageResult.error || chapterResult.error || problemResult.error || maxProblemResult.error) {
    return apiError('기존 커리큘럼 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  const subjectByTitle = new Map((subjectResult.data ?? []).map((item) => [normalized(item.title), item]));
  const subjectByOrder = new Map((subjectResult.data ?? []).map((item) => [item.order_no, item]));
  const stageByParentTitle = new Map((stageResult.data ?? []).map((item) => [`${item.subject_id}:${normalized(item.title)}`, item]));
  const stageByParentOrder = new Map((stageResult.data ?? []).map((item) => [`${item.subject_id}:${item.order_no}`, item]));
  const chapterByParentTitle = new Map((chapterResult.data ?? []).map((item) => [`${item.stage_id}:${normalized(item.title)}`, item]));
  const chapterByParentOrder = new Map((chapterResult.data ?? []).map((item) => [`${item.stage_id}:${item.order_no}`, item]));
  const problemByParentTitle = new Map((problemResult.data ?? []).map((item) => [`${item.chapter_id}:${normalized(item.title)}`, item]));
  const problemByParentOrder = new Map((problemResult.data ?? []).map((item) => [`${item.chapter_id}:${item.order_no}`, item]));

  const createdSubjectIds: string[] = [];
  const createdStageIds: string[] = [];
  const createdChapterIds: string[] = [];
  const createdProblemIds: string[] = [];

  async function rollback() {
    if (createdProblemIds.length) await db.from('problems').delete().in('id', createdProblemIds);
    if (createdChapterIds.length) await db.from('chapters').delete().in('id', createdChapterIds);
    if (createdStageIds.length) await db.from('stages').delete().in('id', createdStageIds);
    if (createdSubjectIds.length) await db.from('subjects').delete().in('id', createdSubjectIds);
  }

  try {
    for (const row of rows) {
      const subjectTitleKey = normalized(row.subject.title);
      let subject = subjectByTitle.get(subjectTitleKey);
      const subjectOrderConflict = subjectByOrder.get(row.subject.order_no);
      if (!subject && subjectOrderConflict) {
        throw new Error(`과목번호 ${row.subject.order_no}는 이미 "${subjectOrderConflict.title}" 과목에서 사용 중입니다.`);
      }
      if (!subject) {
        const id = crypto.randomUUID();
        const { error } = await db.from('subjects').insert({
          id,
          title: row.subject.title.trim(),
          description: row.subject.description?.trim() || null,
          order_no: row.subject.order_no,
          is_published: true,
        });
        if (error) throw new Error(`과목 "${row.subject.title}" 생성 실패: ${error.message}`);
        subject = { id, title: row.subject.title.trim(), order_no: row.subject.order_no };
        createdSubjectIds.push(id);
        subjectByTitle.set(subjectTitleKey, subject);
        subjectByOrder.set(subject.order_no, subject);
      }

      const stageTitleKey = `${subject.id}:${normalized(row.stage.title)}`;
      const stageOrderKey = `${subject.id}:${row.stage.order_no}`;
      let stage = stageByParentTitle.get(stageTitleKey);
      const stageOrderConflict = stageByParentOrder.get(stageOrderKey);
      if (!stage && stageOrderConflict) {
        throw new Error(`"${subject.title}"의 단계번호 ${row.stage.order_no}는 이미 "${stageOrderConflict.title}"에서 사용 중입니다.`);
      }
      if (!stage) {
        const id = crypto.randomUUID();
        const { error } = await db.from('stages').insert({
          id,
          subject_id: subject.id,
          title: row.stage.title.trim(),
          description: row.stage.description?.trim() || null,
          order_no: row.stage.order_no,
          is_published: true,
        });
        if (error) throw new Error(`단계 "${row.stage.title}" 생성 실패: ${error.message}`);
        stage = { id, subject_id: subject.id, title: row.stage.title.trim(), order_no: row.stage.order_no };
        createdStageIds.push(id);
        stageByParentTitle.set(stageTitleKey, stage);
        stageByParentOrder.set(stageOrderKey, stage);
      }

      const chapterTitleKey = `${stage.id}:${normalized(row.chapter.title)}`;
      const chapterOrderKey = `${stage.id}:${row.chapter.order_no}`;
      let chapter = chapterByParentTitle.get(chapterTitleKey);
      const chapterOrderConflict = chapterByParentOrder.get(chapterOrderKey);
      if (!chapter && chapterOrderConflict) {
        throw new Error(`"${stage.title}"의 챕터번호 ${row.chapter.order_no}는 이미 "${chapterOrderConflict.title}"에서 사용 중입니다.`);
      }
      if (!chapter) {
        const id = crypto.randomUUID();
        const { error } = await db.from('chapters').insert({
          id,
          stage_id: stage.id,
          title: row.chapter.title.trim(),
          description: row.chapter.description?.trim() || null,
          order_no: row.chapter.order_no,
          is_published: true,
        });
        if (error) throw new Error(`챕터 "${row.chapter.title}" 생성 실패: ${error.message}`);
        chapter = { id, stage_id: stage.id, title: row.chapter.title.trim(), order_no: row.chapter.order_no };
        createdChapterIds.push(id);
        chapterByParentTitle.set(chapterTitleKey, chapter);
        chapterByParentOrder.set(chapterOrderKey, chapter);
      }

      const problemTitleKey = `${chapter.id}:${normalized(row.problem.title)}`;
      const problemOrderKey = `${chapter.id}:${row.problem.order_no}`;
      const titleConflict = problemByParentTitle.get(problemTitleKey);
      const orderConflict = problemByParentOrder.get(problemOrderKey);
      if (titleConflict) throw new Error(`"${chapter.title}"에 "${row.problem.title}" 문제가 이미 있습니다.`);
      if (orderConflict) throw new Error(`"${chapter.title}"의 문제순서 ${row.problem.order_no}가 이미 사용 중입니다.`);

      problemByParentTitle.set(problemTitleKey, {
        id: row.key,
        chapter_id: chapter.id,
        title: row.problem.title,
        order_no: row.problem.order_no,
      });
      problemByParentOrder.set(problemOrderKey, {
        id: row.key,
        chapter_id: chapter.id,
        title: row.problem.title,
        order_no: row.problem.order_no,
      });
    }

    let nextProblemNo = (maxProblemResult.data?.problem_no ?? 0) + 1;
    const problemRecords = rows.map((row) => {
      const subject = subjectByTitle.get(normalized(row.subject.title))!;
      const stage = stageByParentTitle.get(`${subject.id}:${normalized(row.stage.title)}`)!;
      const chapter = chapterByParentTitle.get(`${stage.id}:${normalized(row.chapter.title)}`)!;
      const id = crypto.randomUUID();
      createdProblemIds.push(id);
      return {
        id,
        import_key: row.key,
        chapter_id: chapter.id,
        problem_no: nextProblemNo++,
        order_no: row.problem.order_no,
        title: row.problem.title.trim(),
        difficulty: row.problem.difficulty,
        description: row.problem.description.trim(),
        input_format: row.problem.input_format?.trim() || null,
        output_format: row.problem.output_format?.trim() || null,
        constraint_text: row.problem.constraint_text?.trim() || null,
        starter_code: row.problem.starter_code ?? '',
        time_limit_ms: 3000,
        memory_limit_mb: 256,
        is_published: row.problem.is_published,
        use_ai_feedback: row.problem.use_ai_feedback,
        created_by: auth.user.id,
      };
    });

    // import_key is only used while constructing related rows and is not a DB column.
    const problemIdByKey = new Map(problemRecords.map((record) => [record.import_key, record.id]));
    const { error: problemInsertError } = await db.from('problems').insert(
      problemRecords.map(({ import_key: _importKey, ...record }) => record),
    );
    if (problemInsertError) throw new Error(`문제 등록 실패: ${problemInsertError.message}`);

    const testCaseRecords = rows.flatMap((row) =>
      row.test_cases.map((testCase) => ({
        problem_id: problemIdByKey.get(row.key)!,
        order_no: testCase.order_no,
        input: testCase.input ?? '',
        expected_output: testCase.expected_output,
        is_sample: testCase.is_sample,
        is_hidden: testCase.is_hidden,
      })),
    );
    const hintRecords = rows.flatMap((row) =>
      row.hints.map((hint) => ({
        problem_id: problemIdByKey.get(row.key)!,
        order_no: hint.order_no,
        hint_text: hint.hint_text,
        trigger_pattern: hint.trigger_pattern?.trim() || null,
      })),
    );

    const [testCaseInsert, hintInsert] = await Promise.all([
      db.from('test_cases').insert(testCaseRecords),
      hintRecords.length > 0 ? db.from('problem_hints').insert(hintRecords) : Promise.resolve({ error: null }),
    ]);
    if (testCaseInsert.error) throw new Error(`테스트케이스 등록 실패: ${testCaseInsert.error.message}`);
    if (hintInsert.error) throw new Error(`힌트 등록 실패: ${hintInsert.error.message}`);

    return apiOk({
      imported: {
        subjects: createdSubjectIds.length,
        stages: createdStageIds.length,
        chapters: createdChapterIds.length,
        problems: createdProblemIds.length,
        testCases: testCaseRecords.length,
        hints: hintRecords.length,
      },
    }, 201);
  } catch (caught) {
    await rollback();
    return apiError(
      caught instanceof Error ? caught.message : '일괄 등록 중 오류가 발생했습니다.',
      'IMPORT_FAILED',
      400,
    );
  }
}
