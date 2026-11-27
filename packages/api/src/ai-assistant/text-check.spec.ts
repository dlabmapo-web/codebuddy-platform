import { describe, expect, it } from "vitest";

import { answerText, checkLibraryText, checkReply, codeLike, hiddenValueIn, hiddenValues, newCode, plainText, solutionLines, unmarked } from "./text-check.js";

const solution = "a = int(input())\nb = int(input())\nif a > b:\n    print(a)\nelse:\n    print(b)";
const reply = (text: string, over: Partial<Parameters<typeof checkReply>[0]> = {}) =>
  checkReply({ text, locale: "en", max: 600, solutions: [solution], visible: "", ...over });

describe("checkReply", () => {
  it("accepts an ordinary reply in either language", () => {
    expect(reply("With 2 and 5 your program printed 2. Look at what you print when a < b.")).toBeNull();
    expect(reply("2와 5에서 프로그램은 2를 출력했어요. 어떤 수를 출력하는지 살펴볼까요?", { locale: "ko" })).toBeNull();
  });
  it.each([
    ["", "SIZE"],
    ["x".repeat(601), "SIZE"],
    ["See https://example.com for more.", "LINK"],
    ["```\nprint(a)\n```", "CODE"],
    ["Try this:\na = int(input())\nprint(a)", "CODE"],
    ["Write if a > b: then you are done.", null],
  ])("%j → %s", (text, problem) => {
    expect(reply(text)).toBe(problem);
  });
  it("refuses a line of the solution the student does not already have", () => {
    const long = "total = sum(map(int, input().split()))";
    expect(reply(`Just use ${long} here.`, { solutions: [long] })).toBe("SOLUTION");
    expect(reply(`Look at total = sum(map(int,input().split())) again.`, { solutions: [long], visible: long })).toBeNull();
  });
  it("needs the reader's language", () => {
    expect(reply("Only English.", { locale: "ko" })).toBe("LANGUAGE");
    expect(reply("한국어예요.")).toBe("LANGUAGE");
    expect(reply("Your program printed 안녕 instead.", { visible: 'print("안녕")' })).toBeNull();
  });
});

describe("newCode", () => {
  const newCode3 = (text: string, visible: string) => newCode(text, visible, visible);
  const code = 's = input()\ncount = 0\nfor ch in s:\n    if ch in "aeiou":\n        count += 1\nprint(count)';
  it("allows quoting the student's own code, whole or in part", () => {
    expect(newCode3('Line 4, `if ch in "aeiou":`, only looks for small vowels.', code)).toBe(false);
    expect(newCode3('The check `ch in "aeiou"` misses capital letters.', code)).toBe(false);
    expect(newCode3("라인 4의 `count += 1`은 맞아요. 대문자는 어떻게 될까요?", code)).toBe(false);
  });
  it("refuses a corrected line or expression, quoted or not", () => {
    expect(newCode3('Use `ch.lower() in "aeiou"` instead.', code)).toBe(true);
    expect(newCode3('Change it to if ch in "aeiouAEIOU": and it works.', code)).toBe(true);
    expect(newCode3("Write total = total + i inside the loop.", code)).toBe(true);
    expect(newCode3("Make it `range(1, n + 1)`.", "for i in range(1, n):")).toBe(true);
    expect(newCode3("`word[::-1]`를 써 보세요.", code)).toBe(true);
  });
  it("allows what real answers say: a value given to an input, and \"in\" before the student's own text", () => {
    const sum = "n = int(input())\ntotal = 0\nfor i in range(1, n):\n    total += i\nprint(total)";
    expect(newCode("For N = 5, write down the numbers that should be added.", sum, sum)).toBe(false);
    expect(newCode("For n = 5 your loop stops at 4.", sum, sum)).toBe(false);
    expect(newCode('At line 4, the check only recognizes lowercase vowels in `"aeiou"`. The task says capitals count.', code, code)).toBe(false);
  });
  it("still refuses a fix to the student's own names, and a method call they did not write", () => {
    const vowels = 'for ch in s:\n    if ch in "aeiou":\n        count += 1\nprint(count)';
    expect(newCode("Set count = 0 before the loop.", vowels, vowels)).toBe(true);
    expect(newCode("Compare `ch.lower()` with the vowels.", vowels, vowels)).toBe(true);
    expect(newCode('Use ch.lower() in "aeiou" instead.', vowels, vowels)).toBe(true);
  });
  it("allows the student's own code without backticks, and a description that is not code", () => {
    expect(newCode3('Your check ch in "aeiou" only sees small letters.', code)).toBe(false);
    expect(newCode3("Your loop `range(1, n)` stops at `n - 1`, so n is never added.", "for i in range(1, n):")).toBe(false);
    expect(newCode3("`count = 0`으로 시작하는 건 맞아요.", code)).toBe(false);
    expect(newCode3("print(min(a, b)) picks the smaller one.", "print(min(a, b))")).toBe(false);
  });
  it("leaves plain prose alone", () => {
    expect(newCode3("Your program counts only small vowels. What happens to a capital A?", code)).toBe(false);
  });
});

describe("hiddenValues", () => {
  it("keeps lines of hidden data a student cannot see, long enough to mean something", () => {
    expect(hiddenValues(["Apple pie\nEAT", "820", "7", "banana"], "Example: banana")).toEqual(["Apple pie", "EAT", "820"]);
  });
  it("finds one in an answer", () => {
    expect(hiddenValueIn("Try the word Apple pie.", ["Apple pie", "820"])).toBe(true);
    expect(hiddenValueIn("You passed 3 of 15 tests.", ["820"])).toBe(false);
  });
});

describe("plainText", () => {
  it("drops inline code marks and keeps fences for the checker", () => {
    expect(plainText(" Is the value in `n` added? ")).toBe("Is the value in n added?");
    expect(plainText("`total`와 `i`를 보세요.")).toBe("total와 i를 보세요.");
    expect(plainText("```\nprint(1)\n```")).toBe("```\nprint(1)\n```");
    expect(plainText("a\u0000b")).toBe("ab");
  });
});

describe("answerText and unmarked", () => {
  it("keeps the two marks a student sees, and nothing that cannot be stored", () => {
    expect(answerText(" The **loop stops early** at `range(1, n)`.\u0000 ")).toBe("The **loop stops early** at `range(1, n)`.");
  });

  it("gives the checks the words alone, but leaves a power as code", () => {
    expect(unmarked("The **loop stops early**, so **n**은 더해지지 않아요.")).toBe("The loop stops early, so n은 더해지지 않아요.");
    expect(unmarked("Try n**2 and m**3.")).toBe("Try n**2 and m**3.");
    expect(unmarked("** not a mark **")).toBe("** not a mark **");
    // A highlight never hides new code from the check.
    expect(newCode(unmarked("Use **n**2** here."), "", "n = 3")).toBe(true);
    expect(newCode(unmarked("The **loop stops early** at `range(1, n)`."), "for i in range(1, n):", "for i in range(1, n):")).toBe(false);
  });
});

describe("solutionLines", () => {
  it("ignores short lines and lines already on screen", () => {
    expect(solutionLines([solution], "a = int(input())")).toEqual(["b=int(input())", "print(a)", "print(b)"]);
  });
});

describe("checkLibraryText", () => {
  const check = (text: string, locale: "ko" | "en" = "en") => checkLibraryText({ text, locale, max: 400, solutions: [solution] });
  it.each([
    "Just print max(a, b).", "Use range(1, n + 1) in the loop.", "Check whether n % 2 == 0.", 'Print "*" * i for each line.',
    'Use if ch in "aeiou" and add 1.', "Print word[::-1].", "Print round(sum(nums) / len(nums), 1).", "After sorting, print nums[-2].",
    "If n % i == 0 set is_prime = False.", "Check i % 15 == 0 first.",
  ])("refuses code in a hint: %s", (text) => {
    expect(check(text)).not.toBeNull();
  });
  it.each([
    "max(a, b)를 출력하면 돼요.", "반복문에서 range(1, n + 1)을 쓰면 돼요.", "n % 2 == 0인지 확인해 보세요.", "word[::-1]을 출력해 보세요.",
    "정렬한 뒤 nums[-2]를 출력해 보세요.", 'if ch in "aeiou"를 쓰고 1을 더해 보세요.',
  ])("refuses code in a Korean hint: %s", (text) => {
    expect(check(text, "ko")).not.toBeNull();
  });
  it.each([
    "Keep track of both input numbers, and first think about what you need to print.",
    "The loop stops before reaching n, so the last number is missing. Where could you check the range?",
    "Checking only whether a number ends in 5 can miss some multiples of 5.",
    "For a number that meets both conditions, the labels appear on two separate lines.",
    "Look at 1, 2, 3 (and 4) by hand. Is 50% enough?",
    "What type does input() give?",
  ])("accepts prose: %s", (text) => {
    expect(check(text)).toBeNull();
  });
  it("accepts Korean prose", () => {
    expect(check("두 수의 크기를 비교하면 어떤 수가 더 큰지 알 수 있어요.", "ko")).toBeNull();
    expect(codeLike.test("입력한 수가 1일 때도 (그리고 2일 때도) 살펴보세요.")).toBe(false);
  });
});
