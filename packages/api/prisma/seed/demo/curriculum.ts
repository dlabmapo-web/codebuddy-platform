import type { ExerciseDifficulty } from "../../../src/generated/prisma/enums.js";

/**
 * The curriculum both demo academies teach.
 *
 * Defined once and instantiated per academy rather than written twice: a course
 * is academy-scoped, so Mapo and Gangnam own separate rows, but an investor
 * comparing the two campuses should see the same syllabus taught to different
 * cohorts — which is the actual product claim. Duplicating the text would let
 * the two drift and turn a rehearsed demo into a spot-the-difference.
 *
 * Test cases are real. Every expected output here was derived from the obvious
 * Python solution, so a person can open the workspace mid-demo, type an answer,
 * and watch it pass.
 */

export type DemoTestCase = {
  input: string;
  expectedOutput: string;
  visibility: "SAMPLE" | "HIDDEN";
};

export type DemoExercise = {
  key: string;
  title: string;
  difficulty: ExerciseDifficulty;
  description: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  /** The answer, kept beside the problem so seeded submissions can be real code. */
  solution: string;
  testCases: readonly DemoTestCase[];
  hints: readonly string[];
};

export type DemoLecture = {
  title: string;
  description: string;
  exercises: readonly DemoExercise[];
};

export type DemoModule = {
  title: string;
  description: string;
  lectures: readonly DemoLecture[];
};

export type DemoCourse = {
  key: string;
  title: string;
  description: string;
  modules: readonly DemoModule[];
};

const greeting: DemoExercise = {
  key: "py-hello-name",
  title: "이름 인사하기",
  difficulty: "EASY",
  description:
    "<p>이름을 한 줄 입력받아 <code>안녕하세요, 이름님!</code> 형식으로 출력하세요.</p>",
  inputFormat: "이름이 한 줄로 주어집니다.",
  outputFormat: "인사말 한 줄.",
  constraints: "이름의 길이는 1자 이상 20자 이하입니다.",
  starterCode: "name = input()\n# 여기에 코드를 작성하세요\n",
  solution: 'name = input()\nprint(f"안녕하세요, {name}님!")\n',
  testCases: [
    { input: "민서", expectedOutput: "안녕하세요, 민서님!", visibility: "SAMPLE" },
    { input: "도현", expectedOutput: "안녕하세요, 도현님!", visibility: "SAMPLE" },
    { input: "Jurabek", expectedOutput: "안녕하세요, Jurabek님!", visibility: "HIDDEN" },
  ],
  hints: ["f-문자열을 쓰면 변수와 글자를 한 번에 이어붙일 수 있어요."],
};

const sumTwo: DemoExercise = {
  key: "py-sum-two",
  title: "두 수의 합",
  difficulty: "EASY",
  description:
    "<p>공백으로 구분된 두 정수를 입력받아 그 합을 출력하세요.</p>",
  inputFormat: "한 줄에 두 정수가 공백으로 구분되어 주어집니다.",
  outputFormat: "두 수의 합.",
  constraints: "각 정수는 -1000 이상 1000 이하입니다.",
  starterCode: "a, b = input().split()\n# 여기에 코드를 작성하세요\n",
  solution: "a, b = input().split()\nprint(int(a) + int(b))\n",
  testCases: [
    { input: "3 5", expectedOutput: "8", visibility: "SAMPLE" },
    { input: "10 -4", expectedOutput: "6", visibility: "SAMPLE" },
    { input: "-7 -8", expectedOutput: "-15", visibility: "HIDDEN" },
    { input: "0 0", expectedOutput: "0", visibility: "HIDDEN" },
  ],
  hints: [
    "input() 은 항상 문자열을 돌려줍니다. 더하기 전에 int() 로 바꿔야 해요.",
  ],
};

const oddEven: DemoExercise = {
  key: "py-odd-even",
  title: "홀수 짝수 판별",
  difficulty: "EASY",
  description:
    "<p>정수를 하나 입력받아 짝수면 <code>even</code>, 홀수면 <code>odd</code> 를 출력하세요.</p>",
  inputFormat: "정수 한 개.",
  outputFormat: "<code>even</code> 또는 <code>odd</code>.",
  constraints: "정수는 -10000 이상 10000 이하입니다.",
  starterCode: "n = int(input())\n# 여기에 코드를 작성하세요\n",
  solution: 'n = int(input())\nprint("even" if n % 2 == 0 else "odd")\n',
  testCases: [
    { input: "4", expectedOutput: "even", visibility: "SAMPLE" },
    { input: "7", expectedOutput: "odd", visibility: "SAMPLE" },
    { input: "0", expectedOutput: "even", visibility: "HIDDEN" },
    { input: "-3", expectedOutput: "odd", visibility: "HIDDEN" },
  ],
  hints: [
    "나머지 연산자 % 를 사용해 보세요.",
    "음수도 잊지 마세요. -3 % 2 의 결과를 직접 확인해 보면 좋아요.",
  ],
};

const grade: DemoExercise = {
  key: "py-grade",
  title: "성적 등급 매기기",
  difficulty: "MEDIUM",
  description:
    "<p>점수를 입력받아 등급을 출력하세요. 90 이상은 <code>A</code>, 80 이상은 <code>B</code>, 70 이상은 <code>C</code>, 그 미만은 <code>F</code> 입니다.</p>",
  inputFormat: "0 이상 100 이하의 정수 한 개.",
  outputFormat: "등급 한 글자.",
  constraints: "점수는 0 이상 100 이하입니다.",
  starterCode: "score = int(input())\n# 여기에 코드를 작성하세요\n",
  solution:
    'score = int(input())\nif score >= 90:\n    print("A")\nelif score >= 80:\n    print("B")\nelif score >= 70:\n    print("C")\nelse:\n    print("F")\n',
  testCases: [
    { input: "95", expectedOutput: "A", visibility: "SAMPLE" },
    { input: "83", expectedOutput: "B", visibility: "SAMPLE" },
    { input: "70", expectedOutput: "C", visibility: "HIDDEN" },
    { input: "69", expectedOutput: "F", visibility: "HIDDEN" },
    { input: "100", expectedOutput: "A", visibility: "HIDDEN" },
  ],
  hints: [
    "elif 는 위에서부터 차례로 검사합니다. 조건의 순서를 확인해 보세요.",
    "경계값 90, 80, 70 이 어느 등급에 속하는지 다시 읽어 보세요.",
  ],
};

const timesTable: DemoExercise = {
  key: "py-times-table",
  title: "구구단 출력",
  difficulty: "EASY",
  description:
    "<p>정수 N 을 입력받아 <code>N x 1 = ...</code> 부터 <code>N x 9 = ...</code> 까지 아홉 줄을 출력하세요.</p>",
  inputFormat: "2 이상 9 이하의 정수 한 개.",
  outputFormat: "아홉 줄. 각 줄은 <code>N x i = 결과</code> 형식입니다.",
  constraints: "N 은 2 이상 9 이하입니다.",
  starterCode: "n = int(input())\n# 여기에 코드를 작성하세요\n",
  solution: 'n = int(input())\nfor i in range(1, 10):\n    print(f"{n} x {i} = {n * i}")\n',
  testCases: [
    {
      input: "2",
      expectedOutput:
        "2 x 1 = 2\n2 x 2 = 4\n2 x 3 = 6\n2 x 4 = 8\n2 x 5 = 10\n2 x 6 = 12\n2 x 7 = 14\n2 x 8 = 16\n2 x 9 = 18",
      visibility: "SAMPLE",
    },
    {
      input: "9",
      expectedOutput:
        "9 x 1 = 9\n9 x 2 = 18\n9 x 3 = 27\n9 x 4 = 36\n9 x 5 = 45\n9 x 6 = 54\n9 x 7 = 63\n9 x 8 = 72\n9 x 9 = 81",
      visibility: "HIDDEN",
    },
  ],
  hints: ["range(1, 10) 은 1 부터 9 까지입니다. 10 은 포함되지 않아요."],
};

const stars: DemoExercise = {
  key: "py-stars",
  title: "별 찍기",
  difficulty: "MEDIUM",
  description:
    "<p>정수 N 을 입력받아 첫 줄에 별 한 개, 둘째 줄에 두 개, N 번째 줄에 N 개를 출력하세요.</p>",
  inputFormat: "1 이상 20 이하의 정수 한 개.",
  outputFormat: "N 줄의 별.",
  constraints: "N 은 1 이상 20 이하입니다.",
  starterCode: "n = int(input())\n# 여기에 코드를 작성하세요\n",
  solution: 'n = int(input())\nfor i in range(1, n + 1):\n    print("*" * i)\n',
  testCases: [
    { input: "3", expectedOutput: "*\n**\n***", visibility: "SAMPLE" },
    { input: "1", expectedOutput: "*", visibility: "HIDDEN" },
    { input: "5", expectedOutput: "*\n**\n***\n****\n*****", visibility: "HIDDEN" },
  ],
  hints: ['문자열에 정수를 곱하면 반복됩니다. "*" * 3 을 실행해 보세요.'],
};

const maximum: DemoExercise = {
  key: "py-max",
  title: "최댓값 찾기",
  difficulty: "EASY",
  description:
    "<p>공백으로 구분된 정수들을 한 줄로 입력받아 그중 가장 큰 값을 출력하세요.</p>",
  inputFormat: "공백으로 구분된 정수 목록 한 줄.",
  outputFormat: "가장 큰 정수.",
  constraints: "정수는 1개 이상 100개 이하입니다.",
  starterCode: "numbers = input().split()\n# 여기에 코드를 작성하세요\n",
  solution: "numbers = [int(x) for x in input().split()]\nprint(max(numbers))\n",
  testCases: [
    { input: "3 9 2 7", expectedOutput: "9", visibility: "SAMPLE" },
    { input: "5", expectedOutput: "5", visibility: "SAMPLE" },
    { input: "-4 -9 -1", expectedOutput: "-1", visibility: "HIDDEN" },
  ],
  hints: [
    "split() 의 결과는 문자열 목록입니다. 비교하기 전에 정수로 바꾸세요.",
    '문자열끼리 비교하면 "9" 가 "10" 보다 크다고 나옵니다.',
  ],
};

const average: DemoExercise = {
  key: "py-average",
  title: "평균 구하기",
  difficulty: "MEDIUM",
  description:
    "<p>정수들을 입력받아 평균을 소수점 둘째 자리까지 반올림해 출력하세요.</p>",
  inputFormat: "공백으로 구분된 정수 목록 한 줄.",
  outputFormat: "소수점 둘째 자리까지의 평균.",
  constraints: "정수는 1개 이상 100개 이하입니다.",
  starterCode: "numbers = [int(x) for x in input().split()]\n# 여기에 코드를 작성하세요\n",
  solution:
    'numbers = [int(x) for x in input().split()]\nprint(f"{sum(numbers) / len(numbers):.2f}")\n',
  testCases: [
    { input: "1 2 3 4", expectedOutput: "2.50", visibility: "SAMPLE" },
    { input: "10 20", expectedOutput: "15.00", visibility: "SAMPLE" },
    { input: "7", expectedOutput: "7.00", visibility: "HIDDEN" },
    { input: "1 2", expectedOutput: "1.50", visibility: "HIDDEN" },
  ],
  hints: [
    "f-문자열에서 :.2f 를 쓰면 소수점 둘째 자리까지 출력됩니다.",
    "정수 나눗셈 // 이 아니라 / 를 사용하세요.",
  ],
};

const reverseString: DemoExercise = {
  key: "py-reverse",
  title: "문자열 뒤집기",
  difficulty: "EASY",
  description: "<p>문자열을 한 줄 입력받아 거꾸로 출력하세요.</p>",
  inputFormat: "문자열 한 줄.",
  outputFormat: "뒤집힌 문자열.",
  constraints: "문자열의 길이는 1자 이상 100자 이하입니다.",
  starterCode: "text = input()\n# 여기에 코드를 작성하세요\n",
  solution: "text = input()\nprint(text[::-1])\n",
  testCases: [
    { input: "python", expectedOutput: "nohtyp", visibility: "SAMPLE" },
    { input: "cove", expectedOutput: "evoc", visibility: "SAMPLE" },
    { input: "a", expectedOutput: "a", visibility: "HIDDEN" },
  ],
  hints: ["슬라이싱 [::-1] 은 문자열을 거꾸로 뒤집습니다."],
};

const countVowels: DemoExercise = {
  key: "py-vowels",
  title: "모음 세기",
  difficulty: "MEDIUM",
  description:
    "<p>영어 문자열을 입력받아 모음(a, e, i, o, u)의 개수를 출력하세요. 대문자도 세어야 합니다.</p>",
  inputFormat: "영어 문자열 한 줄.",
  outputFormat: "모음의 개수.",
  constraints: "문자열의 길이는 1자 이상 200자 이하입니다.",
  starterCode: "text = input()\n# 여기에 코드를 작성하세요\n",
  solution:
    'text = input()\nprint(sum(1 for c in text.lower() if c in "aeiou"))\n',
  testCases: [
    { input: "hello", expectedOutput: "2", visibility: "SAMPLE" },
    { input: "Programming", expectedOutput: "3", visibility: "SAMPLE" },
    { input: "XYZ", expectedOutput: "0", visibility: "HIDDEN" },
    { input: "AEIOU", expectedOutput: "5", visibility: "HIDDEN" },
  ],
  hints: [
    "대문자를 잊지 마세요. lower() 로 먼저 소문자로 바꾸면 편합니다.",
    "in 연산자로 한 글자가 모음인지 확인할 수 있어요.",
  ],
};

const bubbleSort: DemoExercise = {
  key: "algo-bubble-sort",
  title: "버블 정렬 구현",
  difficulty: "MEDIUM",
  description:
    "<p>정수 목록을 입력받아 오름차순으로 정렬해 공백으로 구분해 출력하세요. <strong>내장 sort 를 쓰지 말고</strong> 직접 구현해 보세요.</p>",
  inputFormat: "공백으로 구분된 정수 목록 한 줄.",
  outputFormat: "공백으로 구분된 오름차순 정수 목록.",
  constraints: "정수는 1개 이상 1000개 이하입니다.",
  starterCode: "numbers = [int(x) for x in input().split()]\n# 여기에 코드를 작성하세요\n",
  solution:
    'numbers = [int(x) for x in input().split()]\nfor i in range(len(numbers)):\n    for j in range(len(numbers) - i - 1):\n        if numbers[j] > numbers[j + 1]:\n            numbers[j], numbers[j + 1] = numbers[j + 1], numbers[j]\nprint(" ".join(str(x) for x in numbers))\n',
  testCases: [
    { input: "5 2 9 1", expectedOutput: "1 2 5 9", visibility: "SAMPLE" },
    { input: "3", expectedOutput: "3", visibility: "SAMPLE" },
    { input: "-1 -5 0 3", expectedOutput: "-5 -1 0 3", visibility: "HIDDEN" },
    { input: "2 2 1 1", expectedOutput: "1 1 2 2", visibility: "HIDDEN" },
  ],
  hints: [
    "두 값을 바꿀 때는 a, b = b, a 를 쓸 수 있습니다.",
    "안쪽 반복문의 범위가 매번 하나씩 줄어드는 이유를 생각해 보세요.",
  ],
};

const binarySearch: DemoExercise = {
  key: "algo-binary-search",
  title: "이진 탐색",
  difficulty: "HARD",
  description:
    "<p>첫 줄에 오름차순 정수 목록, 둘째 줄에 찾을 값이 주어집니다. 값의 위치(0부터 시작)를 출력하고, 없으면 <code>-1</code> 을 출력하세요.</p>",
  inputFormat: "첫 줄에 정렬된 정수 목록, 둘째 줄에 찾을 정수.",
  outputFormat: "위치 또는 -1.",
  constraints: "정수는 1개 이상 100000개 이하입니다.",
  starterCode:
    "numbers = [int(x) for x in input().split()]\ntarget = int(input())\n# 여기에 코드를 작성하세요\n",
  solution:
    "numbers = [int(x) for x in input().split()]\ntarget = int(input())\nlow, high = 0, len(numbers) - 1\nresult = -1\nwhile low <= high:\n    mid = (low + high) // 2\n    if numbers[mid] == target:\n        result = mid\n        break\n    if numbers[mid] < target:\n        low = mid + 1\n    else:\n        high = mid - 1\nprint(result)\n",
  testCases: [
    { input: "1 3 5 7 9\n7", expectedOutput: "3", visibility: "SAMPLE" },
    { input: "1 3 5 7 9\n4", expectedOutput: "-1", visibility: "SAMPLE" },
    { input: "2\n2", expectedOutput: "0", visibility: "HIDDEN" },
    { input: "1 2 3 4 5 6\n1", expectedOutput: "0", visibility: "HIDDEN" },
  ],
  hints: [
    "중간값을 구할 때 정수 나눗셈 // 를 사용하세요.",
    "찾지 못하고 반복문이 끝나면 -1 이 남아 있어야 합니다.",
  ],
};

const factorial: DemoExercise = {
  key: "algo-factorial",
  title: "팩토리얼 (재귀)",
  difficulty: "MEDIUM",
  description:
    "<p>정수 N 을 입력받아 N! 을 출력하세요. 재귀 함수로 작성해 보세요.</p>",
  inputFormat: "0 이상 20 이하의 정수 한 개.",
  outputFormat: "N 팩토리얼.",
  constraints: "N 은 0 이상 20 이하입니다.",
  starterCode:
    "def factorial(n):\n    # 여기에 코드를 작성하세요\n    pass\n\nprint(factorial(int(input())))\n",
  solution:
    "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\n\nprint(factorial(int(input())))\n",
  testCases: [
    { input: "5", expectedOutput: "120", visibility: "SAMPLE" },
    { input: "0", expectedOutput: "1", visibility: "SAMPLE" },
    { input: "10", expectedOutput: "3628800", visibility: "HIDDEN" },
    { input: "20", expectedOutput: "2432902008176640000", visibility: "HIDDEN" },
  ],
  hints: [
    "0! 과 1! 은 모두 1 입니다. 이것이 재귀의 종료 조건이에요.",
    "종료 조건이 없으면 재귀는 끝나지 않습니다.",
  ],
};

const fibonacci: DemoExercise = {
  key: "algo-fibonacci",
  title: "피보나치 수열",
  difficulty: "HARD",
  description:
    "<p>정수 N 을 입력받아 피보나치 수열의 N 번째 값을 출력하세요. 0번째는 0, 1번째는 1 입니다.</p>",
  inputFormat: "0 이상 50 이하의 정수 한 개.",
  outputFormat: "N 번째 피보나치 수.",
  constraints: "N 은 0 이상 50 이하입니다. 단순 재귀로는 시간이 초과될 수 있습니다.",
  starterCode: "n = int(input())\n# 여기에 코드를 작성하세요\n",
  solution:
    "n = int(input())\na, b = 0, 1\nfor _ in range(n):\n    a, b = b, a + b\nprint(a)\n",
  testCases: [
    { input: "0", expectedOutput: "0", visibility: "SAMPLE" },
    { input: "7", expectedOutput: "13", visibility: "SAMPLE" },
    { input: "1", expectedOutput: "1", visibility: "HIDDEN" },
    { input: "50", expectedOutput: "12586269025", visibility: "HIDDEN" },
  ],
  hints: [
    "단순 재귀는 같은 값을 여러 번 계산합니다. 반복문을 써 보세요.",
    "a, b = b, a + b 한 줄로 다음 수로 넘어갈 수 있습니다.",
  ],
};

export const pythonFoundations: DemoCourse = {
  key: "python-foundations",
  title: "파이썬 기초",
  description:
    "처음 프로그래밍을 배우는 학생을 위한 12주 과정입니다. 입출력에서 시작해 조건문과 반복문을 지나 리스트와 문자열까지 다룹니다.",
  modules: [
    {
      title: "1. 입출력과 변수",
      description: "화면에 출력하고 키보드로 입력받는 법을 익힙니다.",
      lectures: [
        {
          title: "첫 번째 프로그램",
          description: "print 와 input 으로 대화하는 프로그램을 만들어 봅니다.",
          exercises: [greeting],
        },
        {
          title: "숫자 다루기",
          description: "문자열과 정수의 차이를 이해하고 변환합니다.",
          exercises: [sumTwo],
        },
      ],
    },
    {
      title: "2. 조건과 반복",
      description: "프로그램이 스스로 판단하고 같은 일을 반복하게 만듭니다.",
      lectures: [
        {
          title: "조건문",
          description: "if, elif, else 로 흐름을 나눕니다.",
          exercises: [oddEven, grade],
        },
        {
          title: "반복문",
          description: "for 와 range 로 반복을 표현합니다.",
          exercises: [timesTable, stars],
        },
      ],
    },
    {
      title: "3. 리스트와 문자열",
      description: "여러 값을 한 번에 다루는 방법을 배웁니다.",
      lectures: [
        {
          title: "리스트",
          description: "여러 개의 값을 모아 두고 계산합니다.",
          exercises: [maximum, average],
        },
        {
          title: "문자열",
          description: "글자를 자르고 뒤집고 세어 봅니다.",
          exercises: [reverseString, countVowels],
        },
      ],
    },
  ],
};

export const algorithmsIntro: DemoCourse = {
  key: "algorithms-intro",
  title: "알고리즘 입문",
  description:
    "파이썬 기초를 마친 학생을 위한 심화 과정입니다. 정렬과 탐색, 재귀를 직접 구현하며 시간 복잡도를 처음 만나 봅니다.",
  modules: [
    {
      title: "1. 정렬과 탐색",
      description: "라이브러리를 쓰기 전에 직접 만들어 봅니다.",
      lectures: [
        {
          title: "정렬",
          description: "가장 단순한 정렬을 손으로 구현합니다.",
          exercises: [bubbleSort],
        },
        {
          title: "탐색",
          description: "정렬된 자료에서 절반씩 줄여 나갑니다.",
          exercises: [binarySearch],
        },
      ],
    },
    {
      title: "2. 재귀",
      description: "함수가 스스로를 부르는 구조를 익힙니다.",
      lectures: [
        {
          title: "재귀 기초",
          description: "종료 조건과 점화식을 나눠서 생각합니다.",
          exercises: [factorial, fibonacci],
        },
      ],
    },
  ],
};

export const demoCourses = [pythonFoundations, algorithmsIntro] as const;

/** Flattened, in curriculum order — the order a class works through them. */
export function courseExercises(course: DemoCourse): readonly DemoExercise[] {
  return course.modules.flatMap((module) =>
    module.lectures.flatMap((lecture) => lecture.exercises),
  );
}
