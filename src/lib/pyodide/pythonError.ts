export type PythonExecutionError = {
  type: string;
  message: string;
  line: number | null;
  offset: number | null;
  display: string;
};

export type SyntaxLesson = {
  category: string;
  title: string;
  whatHappened: string;
  why: string;
  where: string;
  example: string;
  nextStep: string;
};

type SyntaxLessonRule = {
  category: string;
  errorTypes: string[];
  messagePattern: RegExp;
  createLesson: (error: PythonExecutionError) => Omit<SyntaxLesson, 'category'>;
};

const lineLocation = (error: PythonExecutionError, detail: string): string =>
  error.line
    ? `${error.line}번째 줄${error.offset ? ` ${error.offset}번째 글자 근처` : ''}에서 ${detail}`
    : detail;

const SYNTAX_LESSON_RULES: SyntaxLessonRule[] = [
  {
    category: 'missing-colon',
    errorTypes: ['SyntaxError'],
    messagePattern: /expected ':'/i,
    createLesson: (error) => ({
      title: '줄 끝에 콜론(:)이 필요해요',
      whatHappened: '파이썬이 코드 묶음이 시작되는 위치를 찾지 못했어요.',
      why: 'if문, 반복문, 함수처럼 아래에 들여쓴 코드가 이어지는 문장은 조건이나 이름 뒤에 콜론(:)을 써야 해요.',
      where: lineLocation(error, '줄 끝에 콜론(:)이 있는지 확인해 보세요.'),
      example: 'if temperature > 30:\n    print("더워요")',
      nextStep: '강조된 줄의 끝을 확인하고 콜론을 추가한 뒤 다시 실행해 보세요.',
    }),
  },
  {
    category: 'expected-indented-block',
    errorTypes: ['IndentationError'],
    messagePattern: /expected an indented block/i,
    createLesson: (error) => ({
      title: '안쪽 코드에 들여쓰기가 필요해요',
      whatHappened: '파이썬이 코드 묶음 안에서 실행할 문장을 찾지 못했어요.',
      why: 'if문, 반복문, 함수 아래에 속한 코드는 보통 앞에 공백 4칸을 넣어 바깥 코드와 구분해요.',
      where: lineLocation(error, '줄 앞에 공백이 필요한지 확인해 보세요.'),
      example: 'if is_ready:\n    print("시작")',
      nextStep: '강조된 줄을 바로 위 문장보다 공백 4칸 안쪽으로 옮긴 뒤 다시 실행해 보세요.',
    }),
  },
  {
    category: 'unexpected-indent',
    errorTypes: ['IndentationError'],
    messagePattern: /unexpected indent/i,
    createLesson: (error) => ({
      title: '필요하지 않은 들여쓰기가 있어요',
      whatHappened: '파이썬이 새로운 코드 묶음을 예상하지 않은 곳에서 들여쓰기를 발견했어요.',
      why: '코드 묶음 안에 있지 않은 문장은 같은 단계의 다른 문장과 시작 위치를 맞춰야 해요.',
      where: lineLocation(error, '줄 앞의 공백이 주변 줄보다 많은지 확인해 보세요.'),
      example: 'name = "민수"\nprint(name)',
      nextStep: '강조된 줄의 시작 위치를 같은 단계의 주변 코드와 맞춘 뒤 다시 실행해 보세요.',
    }),
  },
  {
    category: 'tabs-and-spaces',
    errorTypes: ['TabError'],
    messagePattern: /tabs and spaces|inconsistent use/i,
    createLesson: (error) => ({
      title: '탭과 공백이 섞여 있어요',
      whatHappened: '겉보기에는 비슷하지만 서로 다른 들여쓰기 문자가 함께 사용됐어요.',
      why: '파이썬은 탭과 공백을 서로 다르게 계산할 수 있어서 한 가지 방식으로 통일해야 해요.',
      where: lineLocation(error, '들여쓰기를 지우고 공백으로 다시 입력해 보세요.'),
      example: 'for item in items:\n    print(item)',
      nextStep: '강조된 줄의 들여쓰기를 지운 다음 공백 4칸으로 다시 입력해 보세요.',
    }),
  },
  {
    category: 'unclosed-delimiter',
    errorTypes: ['SyntaxError'],
    messagePattern: /(?:was never closed|unmatched ['")\]}])/i,
    createLesson: (error) => ({
      title: '여는 기호와 닫는 기호가 맞지 않아요',
      whatHappened: '괄호나 대괄호, 중괄호 중 하나가 닫히지 않았거나 짝이 맞지 않아요.',
      why: '여는 기호 `(`, `[`, `{`에는 각각 알맞은 닫는 기호 `)`, `]`, `}`가 필요해요.',
      where: lineLocation(error, '기호의 짝을 확인해 보세요. 오류는 이전 줄에서 시작됐을 수도 있어요.'),
      example: 'print(total + tax)\ncolors = ["빨강", "파랑"]',
      nextStep: '강조된 줄과 바로 위 줄에서 여는 기호와 닫는 기호의 개수를 비교해 보세요.',
    }),
  },
  {
    category: 'unterminated-string',
    errorTypes: ['SyntaxError'],
    messagePattern: /unterminated string literal|EOL while scanning string literal/i,
    createLesson: (error) => ({
      title: '문자열을 닫는 따옴표가 필요해요',
      whatHappened: '글자가 어디에서 끝나는지 파이썬이 찾지 못했어요.',
      why: '작은따옴표나 큰따옴표로 시작한 문자열은 같은 종류의 따옴표로 닫아야 해요.',
      where: lineLocation(error, '문자열의 시작과 끝에 같은 따옴표가 있는지 확인해 보세요.'),
      example: 'message = "안녕하세요"\nprint(message)',
      nextStep: '강조된 줄에서 따옴표가 짝을 이루는지 확인한 뒤 다시 실행해 보세요.',
    }),
  },
  {
    category: 'assignment-in-condition',
    errorTypes: ['SyntaxError'],
    messagePattern: /maybe you meant ['"]==['"]|cannot assign to/i,
    createLesson: (error) => ({
      title: '값 저장과 값 비교를 구분해 보세요',
      whatHappened: '파이썬이 값을 저장하는 기호를 사용할 수 없는 위치에서 발견했어요.',
      why: '`=`는 값을 저장할 때 사용하고, 두 값이 같은지 비교할 때는 `==`를 사용해요.',
      where: lineLocation(error, '조건 안에서 `=`를 사용했는지 확인해 보세요.'),
      example: 'score = 90\nif score == 90:\n    print("같아요")',
      nextStep: '이 줄이 값을 저장하는 문장인지 비교하는 조건인지 생각한 뒤 알맞은 기호를 사용해 보세요.',
    }),
  },
  {
    category: 'missing-separator',
    errorTypes: ['SyntaxError'],
    messagePattern: /perhaps you forgot a comma|invalid decimal literal/i,
    createLesson: (error) => ({
      title: '값 사이를 구분하는 기호를 확인해 보세요',
      whatHappened: '여러 값이나 문장이 붙어 있어서 파이썬이 각각을 구분하지 못했어요.',
      why: '함수의 여러 값이나 리스트의 여러 항목은 쉼표로 구분해야 해요.',
      where: lineLocation(error, '서로 붙어 있는 값 사이에 쉼표가 필요한지 확인해 보세요.'),
      example: 'print("이름", "나이")\nnums = [1, 2, 3]',
      nextStep: '강조된 줄에서 값과 값 사이의 쉼표를 확인한 뒤 다시 실행해 보세요.',
    }),
  },
];

const SYNTAX_ERROR_TYPES = new Set(['SyntaxError', 'IndentationError', 'TabError']);

export function isSyntaxExecutionError(error: PythonExecutionError | null): error is PythonExecutionError {
  return Boolean(error && SYNTAX_ERROR_TYPES.has(error.type));
}

export function createSyntaxLesson(error: PythonExecutionError): SyntaxLesson | null {
  if (!isSyntaxExecutionError(error)) return null;

  const rule = SYNTAX_LESSON_RULES.find(
    (candidate) =>
      candidate.errorTypes.includes(error.type) &&
      candidate.messagePattern.test(error.message),
  );

  if (rule) {
    return { category: rule.category, ...rule.createLesson(error) };
  }

  return {
    category: 'generic-syntax-error',
    title: '파이썬이 이 문장을 이해하지 못했어요',
    whatHappened: '기호, 따옴표, 괄호, 들여쓰기 또는 키워드가 빠졌거나 잘못 놓였을 수 있어요.',
    why: '파이썬 코드는 정해진 문장 모양을 따라야 컴퓨터가 순서대로 읽을 수 있어요.',
    where: lineLocation(error, '강조된 줄과 바로 위 줄을 함께 확인해 보세요.'),
    example: 'if is_sunny:\n    print("산책해요")',
    nextStep: '콜론, 괄호, 따옴표와 들여쓰기를 차례로 확인한 뒤 다시 실행해 보세요.',
  };
}

const FRIENDLY_RUNTIME_EXPLANATIONS: Record<string, string> = {
  NameError: '사용한 이름을 파이썬이 찾지 못했어요. 이름에 오타가 있는지, 사용하기 전에 값을 만들었는지 확인해 보세요.',
  TypeError: '서로 맞지 않는 종류의 값을 함께 사용했어요. 숫자와 글자를 섞어 계산하지 않았는지 확인해 보세요.',
  ValueError: '값의 종류는 맞지만 지금 사용할 수 없는 값이에요. 입력값이나 변환하려는 값을 확인해 보세요.',
  IndexError: '리스트나 글자의 범위를 벗어난 위치를 찾으려고 했어요. 첫 번째 위치는 0부터 시작한다는 점을 확인해 보세요.',
  KeyError: '딕셔너리 안에 없는 이름표(키)를 찾으려고 했어요. 저장된 키의 이름을 확인해 보세요.',
  ZeroDivisionError: '어떤 수를 0으로 나누려고 했어요. 나누기 전에 나누는 수가 0인지 확인해 보세요.',
  AttributeError: '이 값에는 사용하려는 기능이 없어요. 점(.) 앞에 있는 값과 기능 이름이 맞는지 확인해 보세요.',
  ModuleNotFoundError: '불러오려는 도구를 찾지 못했어요. import 뒤의 이름에 오타가 있는지 확인해 보세요.',
  ImportError: '도구를 불러오는 방법이 맞지 않아요. import 문에 적은 이름을 확인해 보세요.',
  EOFError: '프로그램이 입력을 기다렸지만 더 이상 받은 값이 없어요. 필요한 입력을 모두 넣었는지 확인해 보세요.',
  RecursionError: '같은 함수가 너무 많이 반복해서 자기 자신을 불렀어요. 반복을 멈추는 조건이 있는지 확인해 보세요.',
};

export function explainPythonError(error: PythonExecutionError): string {
  const syntaxLesson = createSyntaxLesson(error);
  if (syntaxLesson) return `${syntaxLesson.whatHappened} ${syntaxLesson.nextStep}`;

  const lineHint = error.line ? `${error.line}번째 줄을 먼저 살펴보세요. ` : '';
  const explanation =
    FRIENDLY_RUNTIME_EXPLANATIONS[error.type] ??
    '코드를 실행하는 중 문제가 생겼어요. 오류가 표시된 줄에서 사용한 값과 명령을 차근차근 확인해 보세요.';

  return `${lineHint}${explanation}`;
}
