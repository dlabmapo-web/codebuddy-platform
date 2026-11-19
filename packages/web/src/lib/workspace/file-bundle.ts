import { decodeFileBundle, encodeFileBundle, isFileBundle, type CompiledLanguage, type ExerciseProject } from '@cove/shared';

/**
 * Work written before an exercise gained several files, as a bundle.
 *
 * A draft or attempt saved while the problem was single-file is one program's
 * text. It is kept, not discarded: it becomes the first C/C++ source of the
 * project's starting files, where the student most likely wrote it. Anything
 * already a bundle, or any problem that is not multi-file, passes unchanged.
 */
export function coerceToBundle(code: string, starter: string): string {
  if (!isFileBundle(starter) || isFileBundle(code)) return code;
  const files = decodeFileBundle(starter) ?? [];
  if (!code.trim()) return starter;
  const target = files.find((file) => /\.(c|cc|cpp)$/i.test(file.path)) ?? files[0];
  return target
    ? encodeFileBundle(files.map((file) => (file === target ? { ...file, content: code } : file)))
    : code;
}


/**
 * The two starting projects an author can pick, after Elice's own: C's
 * three-file sum (DC-C-1 Week 9) and C++'s rectangle class. The header is
 * read-only, so a student practises using a declaration rather than changing it.
 */
export function projectTemplate(language: CompiledLanguage): ExerciseProject {
  const files =
    language === 'C'
      ? [
          { path: 'main.c', content: '#include <stdio.h>\n#include "sum.h"\n\nint main(void) {\n    int a, b;\n    scanf("%d %d", &a, &b);\n    printf("%d\\n", sum(a, b));\n    return 0;\n}\n', readOnly: false },
          { path: 'sum.c', content: '#include "sum.h"\n\nint sum(int a, int b) {\n    /* Write your code here. */\n    return 0;\n}\n', readOnly: false },
          { path: 'sum.h', content: '#ifndef SUM_H\n#define SUM_H\n\nint sum(int a, int b);\n\n#endif\n', readOnly: true },
        ]
      : [
          { path: 'main.cpp', content: '#include <iostream>\n#include "rectangle.h"\n\nint main() {\n    int width, height;\n    std::cin >> width >> height;\n    Rectangle rect;\n    rect.set_values(width, height);\n    std::cout << rect.area() << "\\n";\n    return 0;\n}\n', readOnly: false },
          { path: 'rectangle.cpp', content: '#include "rectangle.h"\n\nvoid Rectangle::set_values(int x, int y) {\n    width = x;\n    height = y;\n}\n\nint Rectangle::area() {\n    // Write your code here.\n    return 0;\n}\n', readOnly: false },
          { path: 'rectangle.h', content: '#ifndef RECTANGLE_H\n#define RECTANGLE_H\n\nclass Rectangle {\n    int width, height;\npublic:\n    void set_values(int x, int y);\n    int area();\n};\n\n#endif\n', readOnly: true },
        ];
  return {
    version: 1,
    files: files.map((file) => ({ ...file, hidden: false, openByDefault: true })),
    sources: files.filter((file) => !file.path.endsWith('.h')).map((file) => file.path),
    includeLearnerSources: false,
    fileTree: 'CLOSED',
  };
}
