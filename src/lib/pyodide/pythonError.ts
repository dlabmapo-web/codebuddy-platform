export type PythonExecutionError = {
  type: string;
  message: string;
  line: number | null;
  display: string;
};

const FRIENDLY_EXPLANATIONS: Record<string, string> = {
  SyntaxError: '파이썬이 코드 문장을 읽지 못했어요. 괄호나 따옴표가 빠졌는지, 줄 끝에 콜론(:)이 필요한지 확인해 보세요.',
  IndentationError: '코드의 들여쓰기가 맞지 않아요. 같은 묶음의 코드는 앞쪽 빈칸 수를 똑같이 맞춰 보세요.',
  TabError: '들여쓰기에 탭과 빈칸이 섞여 있어요. 들여쓰기를 모두 같은 방식으로 맞춰 보세요.',
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
  const lineHint = error.line ? `${error.line}번째 줄을 먼저 살펴보세요. ` : '';
  const explanation =
    FRIENDLY_EXPLANATIONS[error.type] ??
    '코드를 실행하는 중 문제가 생겼어요. 오류가 표시된 줄에서 사용한 값과 명령을 차근차근 확인해 보세요.';

  return `${lineHint}${explanation}`;
}
