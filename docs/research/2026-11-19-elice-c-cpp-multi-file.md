# Elice C/C++ multi-file exercises: observed behaviour

Date: 2026-11-19. Method: the D.LAB Elice organization (`dlab.elice.io`),
inspected in the browser with an organization-admin account. Two real courses
were read, and a private test course was created, authored, solved and graded
end to end. Implementation design:
[C/C++ multi-file exercises](../superpowers/specs/2026-11-19-c-cpp-multi-file-design.md).

Earlier notes this builds on:
[Elice C/C++ runtime](2026-11-09-elice-c-cpp-runtime.md),
[Elice grading compatibility](../design/2026-09-10-elice-grading-compatibility-spec.md)
(the STDIO autograder, comparators, scores and messages, which are the same for
C/C++ and are not repeated here).

## 1. Evidence inventory

| Ref | What | Where |
| --- | --- | --- |
| R1 | C Basic course, Week 9 "Standard libraries and header files": practice "[실습] 표준 라이브러리와 헤더 파일" and the final mission | DC-C-1, course 793625, lecture 6805502, pages 55856736 and 55856737 |
| R2 | R1's author view: skeleton tree, Compile and Run Script, STDIO grader | page 55856736 `/edit` |
| R3 | C Advanced course: file I/O lessons and the Week 10/11 management-program projects | DC-C-2, course 24518, lectures 210519 and 212369 |
| T1 | Test exercise E1: C, `main.c` + `sum.c` + `sum.h`, STDIO grader with 2 cases | test course 794396, page 55893876 |
| T2 | Test exercise E2: Elice's stock C++ template with its custom unit-test grader | test course 794396, page 55893951 |
| T3 | Teacher views of a real C class (8 learners), read only | class "[봉선]DC-C-1(C언어기본)" |

Test artifacts still in Elice (delete when no longer needed): course
"[TEST] Cove C/C++ research" (Draft, unregistered, course 794396) with lecture
"C/C++ exercise research" (E1, E2), and the empty class
"[TEST] Cove C/C++ research". No learners were added; the inspecting account is
an admin elsewhere in the organization and Elice refuses to add it as a learner.

## 2. What "multi-file" means in the D.LAB courses

R1 is the only multi-file lesson. The DC-C-2 projects (R3) are single `main.c`.

- **R1 practice.** The task: split "read two numbers and print their sum" into a
  main file, a header file and a source file. The editor opens three tabs,
  `main.cpp | sum.c | sum.h`, all empty. The reference solution:
  - `sum.h`: `int sum(int n1, int n2);`
  - `sum.c`: `int sum(int n1, int n2){ return n1+n2; }`
  - `main.cpp`: `#include <stdio.h>`, `#include "sum.h"`, and a `main` that
    reads two numbers with `scanf` and prints `sum(n1, n2)`.
- **R1 mission.** Same pattern: `main.cpp`, `amusement.c` and `amusement.h`. The
  statement's table calls the main file `main.c`, while the editor gives
  `main.cpp`. The content is not consistent about it, and it works only because
  of the build rule below.
- **R1's build (R2).** Compile and Run Script:
  `g++ -std=c++11 main.cpp sum.c sum.h -o main`, then `./main`.
  - g++ compiles every input as C++, `.c` included, so a `.c` function links with
    a `.cpp` caller without `extern "C"`.
  - The header is passed to g++ too. That is harmless, and not something the
    lesson needs.

## 3. Authoring (teacher)

### 3.1 Creating the exercise

1. Course → lecture → **New Material → Programming exercise**. Exercise types:
   CLI Programming, Arduino, Scratch, Multi-Language, Entry, MicroBit. C/C++ is
   **CLI Programming**. Submit button: Enable / Disable.
2. Opening it shows "Exercise image is not ready yet → Create a new image":
   - **Use Template** (Python, Java, C++, R, Web, PHP) or **Create** (from
     scratch);
   - then the **Exercise Env.**: the only C option is "C / C++" (GCC 5.4.0,
     Make 4.1).

### 3.2 The editor tabs

The author editor has these tabs: **Skeleton Code**, **Grader Code**,
**Basic Info**, **Grading settings**, **Achievement**, **AI Helpy Guide** and
**Env Settings**.

- **The left panel** holds the Description, Instructions and Solution. All three
  are rich text.
- **The Solution is free text.** R1's per-file "View Solution" is only headings
  plus code blocks that the author typed. It is not a structured set of files.

### 3.3 Skeleton Code: the files the student starts with

- A file tree with **New File**, **New Folder** and **Upload**.
- Each file has a ⋮ menu: **Read only**, **Hide**, **Rename** and **Delete**.
  - Read only shows a lock icon.
  - Hide shows an eye-off icon, and the file cannot be opened by default.
- **Default files** is a required checklist: which files open as tabs when the
  student arrives. Saving is refused until at least one is chosen. R1 opens all
  three files; the stock template opens `main.cpp` only.
- Line endings: the template's `rectangle.cpp` has CRLF endings, which the
  editor shows. Uploaded files keep what they had.
- **The stock C++ template is itself multi-file:**
  - `main.cpp`, `rectangle.cpp`, `rectangle.h`;
  - `EliceUtils.cpp/.h`, the grader helper;
  - `input.txt` and `elice.png`.

  Its Run script is `g++ main.cpp rectangle.cpp -o main` + `./main`, with no
  `-std`.
- **Observed defect:** after uploading files into an empty tree, "Select default
  files" stayed disabled until a file was created by hand.

### 3.4 Grader Code: how Run and Submit work

The tab has two views: **STDIO Grader Maker** (a form) and **Code Viewer** (the
raw `.elice/` folder).

- **Run** executes `.elice/runner.sh`. This is the "Compile and Run Script"
  field: a bash script that the teacher writes in full.
- **Submit** executes `.elice/grader.sh`.
  - With the STDIO maker, `grader.sh` is `python_sys -u .elice/autograder.py`.
    The autograder reads `.elice/elice_exercise.json`:
    `cmd: ["bash", ".elice/runner.sh"]`, plus one `grading_checks` entry per
    case (`type`, `score`, `input_file`, `output_file`, `time_limit`).
  - **The whole runner, compile included, runs once per test case.**
- **Which files compile is decided only by the script.** A file that is not
  named in it is never compiled (T1, §4.3).
- **The STDIO case form:**
  - grading method: the five comparators already in Cove's `CaseComparator`;
  - score in % (the cases must add up to 100) for a relative grade;
  - input, expected output, and a per-case time limit.

  Adding a case sets the material time limit to the sum of the case limits plus
  10 s. Two 2-second cases gave 72 s here, because of a 60 s default that was
  still being counted. The grading-message templates are the same as Python's.
- **The stock template uses a custom grader:**
  - `grader.sh` runs `g++ -std=c++11 EliceUtils.cpp .elice/grader.cpp rectangle.cpp -o grader`
    and then `./grader`. It links the student's `rectangle.cpp` into a
    teacher-written C++ test program.
  - `grader.cpp` calls `utils.secure_send_grader(...)` for messages,
    `secure_send_image("elice.png")`, `secure_send_file("input.txt")` and
    `secure_send_score(n)`.

### 3.5 Basic Info, Grading settings and Env Settings

- **Basic Info:** title, "Don't include in score", Submit button on/off, and
  **Editor File Tree Default Status: Close / Open / Disable** (whether the
  student's explorer starts closed, starts open, or is not available).
- **Grading settings:** relative or absolute grade, and grader allowed IPs.
- **Env Settings:** environment, time limit, memory limit (512 MB default), and
  GUI view (VNC or HTTP 8080).

## 4. Learning (student), from T1

### 4.1 The workspace

- The problem statement is on the left. The editor shows the default files as
  tabs.
- The file explorer is behind the folder icon. It starts closed under the
  default setting. Its toolbar has New File, New Folder and Upload.
- Hidden files never appear.
- A read-only file opens with the banner "[Read-Only] This file is read-only."
  and cannot be edited.
- **Teacher-provided files:** the ⋮ menu shows Rename and Delete, both
  disabled.
- **Files the student creates:** Rename and Delete are enabled, and Delete asks
  for confirmation.
- **Toolbar icons:**
  - **File** (paperclip): files sent by a custom grader.
  - **Reset the file**: per file. It says "clear all the code you wrote at
    current file and reset it". There is no whole-workspace reset.
  - **⋮**: Environment, Editor Preferences, Code Revision History,
    Execution/Submission History, Code Sharing.

### 4.2 Run

- Run starts the script in an interactive terminal. The prompt (`printf`) shows
  before input is typed, Enter sends a line, and Run turns into Stop with a
  countdown of the material time limit ("Remaining: 01:06").
- Output, then `/* Code running is complete! */`.
- **A compile error** prints GCC's output with the file and position
  (`sum.c:6:1: error: expected ';' before '}' token`). The runner then fails
  with `./main: No such file or directory`, which the student also sees.

### 4.3 Files the student creates are not compiled

The student created `extra.c` and filled it with invalid C. Run still compiled
and ran the program (`Sum: 3`), because the teacher's script names only
`main.c sum.c`. A student can therefore add a helper file and find that
including it gives "undefined reference" at link time. Nothing in the UI
explains this.

### 4.4 Submit

- Grading prints in the same terminal:
  - "Beginning grading…";
  - `Case N. Correct! (+50)` or `Case N. Incorrect. (+0)`;
  - "Grading complete.";
  - `Total score: X / 100`.
- Last submit score and time update beside the buttons.
- **A compile error shows no diagnostics on Submit.** Every case simply reads
  "Incorrect (+0)", because each case compiles, fails and produces no output.
- **With the custom grader (T2)**, the teacher's messages print in the terminal
  ("Executing your code…", "Testcase 1: Right (100 pts.)"). The files the grader
  sends open in the File panel, as an image preview and an `input.txt` download.

### 4.5 History

- **Execution/Submission history** lists every Run and Grade with its time and
  score. Each entry keeps:
  - a snapshot of **every file** at that moment, including files the student
    created and later deleted;
  - that run's terminal output.

  The transcript of a Run repeats the typed input ("1 21 2" for input "1 2").
- **Code revision history** is per file: a version slider for the active file,
  and "Load selected versions".

## 5. Teaching (teacher) and managing (manager), from T3 and the test class

- **Class Management → Create Class:**
  - name;
  - Learning Content: only courses registered as organization content can be
    attached ("Add later" is allowed);
  - Invite Members: roles Learner, Parent and Educator, from the organization
    member list, by registering new members, or by bulk registration.

  A member already registered in another group can be added only with the same
  role.
- **Class Home:** average progress, average practice score and average test
  score, a histogram of learners, the schedule and the board.
- **Courses → Learning Status:**
  - per-learner progress, practice score, test score and completion, with a ⋮
    menu offering "Approve completion";
  - Learning Status by Lecture;
  - per learner, a lecture list and then a per-material table with scores and
    links.
- **Opening a learner's material** (Tutoring mode,
  `/admin/users/{userId}`) shows that learner's actual workspace:
  - the file tree and tabs, read only, with "[Read only] Please switch to edit
    mode to edit Student codes" and an **Edit mode** toggle;
  - a learner switcher;
  - the final submission time;
  - the **final score with a pencil to override it**;
  - a **Feedback** button.

  The teacher can Run and Submit in that view.
- **Course Dashboard** (course admin menu) has these columns: progress, test
  score, average exercise score, completions, Run/Submit count, time programmed,
  enrolment dates and EPS. Only class learners are counted, so the author's own
  runs show 0.

## 6. How this compares with Cove

| Topic | Elice | Cove today |
| --- | --- | --- |
| Files per C/C++ exercise | Any tree; per-file read-only, hidden, open by default | One `main.c` / `main.cpp` |
| What compiles | A teacher-written bash script lists the files | Fixed argv, one file |
| Compiler profile | GCC 5.4. The script decides the flags (R1: `-std=c++11`, the template: none) | GCC 12, fixed: C `gnu11`, C++ `-O2 gnu++17` |
| `.c` file in a C++ exercise | Compiled as C++ by g++ | Not possible |
| Student adds a file | Allowed; not compiled unless the script includes it | Not possible |
| Compile per Submit | Once per case | Once per submission, cached by source |
| Compile error on Submit | Hidden; every case "Incorrect" | Shown, with diagnostics |
| Solution | Free rich text | Structured solution code (single file) |
| History | Every Run and Grade with a full file snapshot | Submissions with a single code string |
| Custom grader | Teacher-written C++/Python with EliceUtils | Not supported (`CUSTOM` deliberately absent) |
| Data files (`input.txt`) | Any file in the tree is in the working directory | "Author-supplied input files are not supported yet" |

Cove's single-file C/C++ behaviour is already equal or better on the shared
points: compile errors on Submit, compile caching, and hidden-case
protections. The gaps are all about **files**:

- several source and header files, with per-file flags;
- a build list;
- learner-created files;
- file snapshots in history and in teacher views;
- data files in the working directory.
