// Elice-inspired manual-review examples in the regular localhost:3000 app.
// Uses the existing development academy/accounts and never overwrites saved work.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../dist/src/database/prisma.service.js';

const api = resolve(import.meta.dirname, '..');
const parse = async path => { try { return dotenv.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; } };
const env = {...await parse(resolve(api, '.env')), ...await parse(resolve(api, '.env.local'))};
if (env.NODE_ENV === 'production' || new URL(env.SUPABASE_URL).hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') {
  throw Error('Only the configured Cove development Supabase project is allowed');
}
const academyId = '20000000-0000-4000-8000-000000000001';
const managerId = '30000000-0000-4000-8000-000000000002';
const teacherMembershipId = '40000000-0000-4000-8000-000000000004';
const studentMembershipId = '40000000-0000-4000-8000-000000000005';
const courseId = 'c1120000-0000-4000-8000-000000000001';
const moduleId = 'c1120000-0000-4000-8000-000000000010';
const lectureId = 'c1120000-0000-4000-8000-000000000020';
const classId = 'c1120000-0000-4000-8000-000000000040';
const reference = 'https://dlab.elice.io/courses/765886/lectures/all';
const problems = [
  {
    id: 'c1120000-0000-4000-8000-000000000031',
    title: '⭐ Mission 1 · 컴퓨터와 가위바위보 (먼저 2승)',
    maximum: 10000, included: false, difficulty: 'EASY',
    description: `<h2>컴퓨터와 가위바위보 대결</h2>
<p>매 판 컴퓨터가 가위, 바위, 보 중 하나를 고르는 게임을 만드세요. 나와 컴퓨터 중 먼저 두 번 이기면 게임을 끝냅니다. 아래 시작 코드는 세 판만 실행됩니다. 반복 조건과 승패 판정을 완성해 보세요.</p>
<h3>완성할 기능</h3><ol><li><code>while</code>문을 사용해 어느 한쪽이 2승할 때까지 반복합니다.</li><li><code>random.choice()</code>로 컴퓨터의 선택을 정합니다.</li><li>선택한 값과 판정 결과(승리/패배/무승부)를 출력하고 승수를 갱신합니다. 무승부는 승수를 바꾸지 않습니다.</li><li>잘못 입력하면 안내하고 다시 입력받습니다.</li><li>마지막에 최종 승자와 두 사람의 승수를 출력합니다.</li></ol>
<h3>직접 확인하기</h3><ul><li>같은 선택이면 승수가 유지되나요?</li><li>어느 한쪽이 2승하면 추가 입력 없이 종료되나요?</li><li>잘못된 입력 후에도 게임을 계속할 수 있나요?</li></ul>
<p>선생님은 실행 결과와 함께 반복 조건, 승패 판정, 입력 처리와 코드의 읽기 쉬움을 확인합니다.</p>
<p><strong>수동 채점 · 100점 만점 · 성적 제외</strong></p>`,
    inputFormat: '각 판마다 가위, 바위, 보 중 하나를 입력합니다.',
    outputFormat: '매 판 두 사람의 선택, 판정 결과, 승수를 출력합니다. 종료 시 최종 승자를 출력합니다. 문구는 자유롭게 작성하세요.',
    starterCode: `import random\n\nchoices = ["가위", "바위", "보"]\nplayer_wins = 0\ncomputer_wins = 0\n\n# TODO: 먼저 2승할 때까지 반복하도록 바꾸세요.\nfor round_number in range(3):\n    player = input("가위, 바위, 보: ")\n    computer = random.choice(choices)\n    print("나:", player, "컴퓨터:", computer)\n    # TODO: 입력 검사, 승패 판정, 승수 갱신을 작성하세요.\n\nprint("게임 종료! 나:", player_wins, "컴퓨터:", computer_wins)\n`,
    solution: `import random\n\nchoices = ["가위", "바위", "보"]\nplayer_wins = computer_wins = 0\nwhile player_wins < 2 and computer_wins < 2:\n    player = input("가위, 바위, 보: ").strip()\n    if player not in choices:\n        print("가위, 바위, 보 중 하나를 입력하세요.")\n        continue\n    computer = random.choice(choices)\n    print("나:", player, "컴퓨터:", computer)\n    if player == computer:\n        print("무승부")\n    elif (player, computer) in [("가위", "보"), ("바위", "가위"), ("보", "바위")]:\n        player_wins += 1\n        print("승리")\n    else:\n        computer_wins += 1\n        print("패배")\n    print("현재 승수:", player_wins, computer_wins)\nprint("최종 승자:", "나" if player_wins == 2 else "컴퓨터")\nprint("최종 승수:", player_wins, computer_wins)\n`,
    hint: '반복을 계속하려면 두 사람 모두 아직 2승에 도달하지 않아야 합니다.',
  },
  {
    id: 'c1120000-0000-4000-8000-000000000032',
    title: '⭐ Mission 2 · 다섯 번 안에 숫자 맞히기',
    maximum: 10000, included: true, difficulty: 'EASY',
    description: `<h2>숫자 탐정 게임</h2><p>컴퓨터가 1부터 30 사이의 정수를 정합니다. 사용자는 최대 다섯 번 추측할 수 있습니다. 반복문과 조건문으로 힌트를 제공하는 게임을 완성하세요.</p>
<h3>완성할 기능</h3><ol><li><code>random.randint(1, 30)</code>으로 정답을 만듭니다.</li><li>정답보다 작은 수이면 “더 큰 수”, 큰 수이면 “더 작은 수”라는 힌트를 출력합니다.</li><li>정답을 맞히면 몇 번 만에 맞혔는지 출력하고 즉시 종료합니다.</li><li>다섯 번 모두 틀리면 정답을 알려 주고 종료합니다.</li><li>숫자가 아닌 입력이나 범위 밖 입력은 안내만 하고 기회를 차감하지 않습니다.</li></ol>
<h3>직접 확인하기</h3><p>테스트하는 동안 정답을 <code>17</code>로 고정해 10 → 20 → 17을 입력해 보세요. 마지막에는 다시 무작위 정답을 사용하도록 복원하세요. 잘못된 입력도 함께 확인합니다.</p>
<p>선생님은 종료 조건, 시도 횟수, 힌트 방향과 예외 처리를 확인합니다.</p><p><strong>수동 채점 · 100점 만점 · 성적 포함</strong></p>`,
    inputFormat: '1부터 30 사이의 정수 한 개를 반복 입력합니다.',
    outputFormat: '큰 수/작은 수 힌트와 남은 기회를 출력합니다. 성공 또는 기회 소진 시 결과를 출력합니다. 출력 문구는 자유입니다.',
    starterCode: `import random\n\nanswer = random.randint(1, 30)\nattempts = 0\n\n# TODO: 최대 5번까지 추측하고, 맞히면 바로 종료하세요.\ntext = input("1부터 30 사이의 숫자: ")\nprint("입력한 값:", text)\n# TODO: 입력 검사와 힌트를 작성하세요.\n`,
    solution: `import random\n\nanswer = random.randint(1, 30)\nattempts = 0\nwhile attempts < 5:\n    text = input("1부터 30 사이의 숫자: ").strip()\n    if not text.isdecimal() or not 1 <= int(text) <= 30:\n        print("1부터 30 사이의 정수를 입력하세요.")\n        continue\n    guess = int(text)\n    attempts += 1\n    if guess == answer:\n        print(attempts, "번 만에 성공!")\n        break\n    print("더 큰 수" if guess < answer else "더 작은 수")\n    print("남은 기회:", 5 - attempts)\nelse:\n    print("기회가 끝났습니다. 정답:", answer)\n`,
    hint: '입력이 유효한 것을 확인한 뒤에만 시도 횟수를 늘리세요. 정답이면 break로 반복을 끝낼 수 있습니다.',
  },
  {
    id: 'c1120000-0000-4000-8000-000000000033',
    title: '⭐ Mission 3 · 딕셔너리로 만드는 나만의 단어 퀴즈',
    maximum: 5000, included: true, difficulty: 'MEDIUM',
    description: `<h2>내 단어장으로 퀴즈 만들기</h2><p>단어와 뜻을 딕셔너리에 저장하고, 함수를 이용해 대화형 단어 퀴즈를 만드세요. 화면에 보이는 문구와 단어는 자유롭게 정해도 됩니다.</p>
<h3>완성할 기능</h3><ol><li>영어 단어와 한국어 뜻을 세 쌍 이상 딕셔너리에 저장합니다.</li><li><code>run_quiz(words)</code> 함수를 작성해 모든 단어를 한 번씩 질문합니다.</li><li>답을 입력받아 정답 여부를 안내하고, 오답이면 올바른 뜻을 알려 줍니다.</li><li>함수는 맞힌 개수를 반환합니다. 함수 밖에서 맞힌 개수와 전체 문항 수를 출력합니다.</li><li>앞뒤 공백을 제거하고 입력을 비교합니다.</li></ol>
<h3>직접 확인하기</h3><ul><li>모두 정답 / 일부 오답 / 모두 오답일 때 결과가 맞나요?</li><li>단어를 한 개 더 추가해도 반복문을 고치지 않고 동작하나요?</li><li>빈 답과 앞뒤 공백을 넣은 답은 어떻게 처리되나요?</li></ul>
<p>선생님은 딕셔너리 활용, 함수의 매개변수/반환값, 정답 개수 계산과 코드 구성을 확인합니다.</p><p><strong>수동 채점 · 50점 만점 · 성적 포함</strong></p>`,
    inputFormat: '화면에 표시된 영어 단어의 한국어 뜻을 입력합니다.',
    outputFormat: '각 답의 정답 여부, 필요한 경우 올바른 뜻, 마지막에 맞힌 개수/전체 문항 수를 출력합니다.',
    starterCode: `words = {"apple": "사과", "moon": "달", "school": "학교"}\n\ndef run_quiz(words):\n    correct = 0\n    for word, meaning in words.items():\n        answer = input(word + "의 뜻은? ")\n        # TODO: 답을 비교하고 안내한 뒤 correct를 갱신하세요.\n    return correct\n\n# TODO: 함수를 호출하고 최종 결과를 출력하세요.\nprint("단어 수:", len(words))\n`,
    solution: `words = {"apple": "사과", "moon": "달", "school": "학교"}\n\ndef run_quiz(words):\n    correct = 0\n    for word, meaning in words.items():\n        answer = input(word + "의 뜻은? ").strip()\n        if answer == meaning:\n            correct += 1\n            print("정답입니다!")\n        else:\n            print("오답입니다. 정답:", meaning)\n    return correct\n\nscore = run_quiz(words)\nprint("맞힌 개수:", score, "/", len(words))\n`,
    hint: 'items()로 단어와 뜻을 함께 가져오고, 함수가 반환한 값을 함수 밖의 변수에 저장해 보세요.',
  },
];
const db = new PrismaService(new ConfigService({...env, DATABASE_POOL_MAX: 2}));
try {
  const [academy, members, existing, group] = await Promise.all([
    db.academy.findFirst({where:{id:academyId,slug:'development-academy',status:'ACTIVE'},select:{id:true}}),
    db.academyMembership.findMany({where:{academyId,status:'ACTIVE',id:{in:[teacherMembershipId,studentMembershipId,'40000000-0000-4000-8000-000000000002']},user:{status:'ACTIVE'}},select:{id:true,role:true}}),
    db.course.findUnique({where:{id:courseId},select:{academyId:true}}),
    db.class.findUnique({where:{id:classId},select:{academyId:true}}),
  ]);
  if (!academy || members.length !== 3 || members.find(m=>m.id===teacherMembershipId)?.role !== 'TEACHER' || members.find(m=>m.id===studentMembershipId)?.role !== 'STUDENT') throw Error('Expected active development academy, manager, teacher and student');
  if (existing && existing.academyId !== academyId || group && group.academyId !== academyId) throw Error('Demo IDs belong to another academy');
  await db.$transaction(async tx => {
    if (!existing) await tx.course.create({data:{id:courseId,academyId,createdByUserId:managerId,
      title:'파이썬 미션 · 수동 채점 체험',language:'PYTHON',isVisible:true,
      description:`Elice 파이썬 과정의 반복문·딕셔너리·함수 주제에서 착안한 Cove용 연습 문제입니다. 원문 복제가 아닌 별도 예제이며, 제출 후 선생님이 점수와 피드백을 등록합니다. 참고 과정: ${reference}`,
      modules:{create:{id:moduleId,externalKey:'manual-demo-missions',title:'대화형 파이썬 미션',position:1,isVisible:true,
        lectures:{create:{id:lectureId,externalKey:'manual-demo-review',title:'선생님과 함께 확인하는 3가지 미션',position:1,isVisible:true,
          materials:{create:problems.map((p,index)=>({id:p.id,title:p.title,type:'PROGRAMMING_EXERCISE',position:index+1,isVisible:true,isRequired:true,
            programmingExercise:{create:{externalKey:`manual-demo-${index+1}`,language:'PYTHON',difficulty:p.difficulty,
              description:p.description,inputFormat:p.inputFormat,outputFormat:p.outputFormat,constraints:'문구와 변수 이름은 자유입니다. 요구한 동작과 코드 구조를 선생님이 확인합니다.',
              starterCode:p.starterCode,solutionCode:p.solution,solutions:{create:{position:1,title:'참고 구현 (선생님용)',code:p.solution}},
              hints:{create:{position:1,content:p.hint}},submissionPolicy:'MANUAL_REVIEW',manualMaximumHundredths:p.maximum,manualIncludeInScore:p.included,
              gradingRevision:1,timeLimitMs:2000,memoryLimitMb:256}}}))}}}}}}});
    if (!group) await tx.class.create({data:{id:classId,academyId,name:'수동 채점 체험반',createdByUserId:managerId,teacherMembershipId,status:'ACTIVE'}});
    await tx.classCourse.createMany({data:[{classId,courseId,assignedByUserId:managerId}],skipDuplicates:true});
    await tx.classEnrollment.createMany({data:[{classId,membershipId:studentMembershipId,enrolledByUserId:managerId}],skipDuplicates:true});
  },{timeout:20000});
  const saved = await db.programmingExercise.findMany({where:{materialId:{in:problems.map(p=>p.id)}},select:{materialId:true,submissionPolicy:true,manualMaximumHundredths:true,manualIncludeInScore:true}});
  if (saved.length !== problems.length || saved.some(p=>p.submissionPolicy !== 'MANUAL_REVIEW')) throw Error('Demo verification failed');
  console.log(existing ? 'Existing demo preserved; no saved questions or submissions overwritten.' : 'Created three manual-review programming exercises.');
  console.log(`Course: http://localhost:3000/academy/development-academy/learn/courses/${courseId}?classId=${classId}`);
  console.log(`Teacher history: http://localhost:3000/academy/development-academy/teach/classes/${classId}/progress?view=students`);
  console.log(JSON.stringify({classId,courseId,exercises:problems.map(p=>({title:p.title,maximum:p.maximum/100,included:p.included,url:`http://localhost:3000/academy/development-academy/learn/exercises/${p.id}?classId=${classId}`}))},null,2));
} catch (error) { console.error(error.message?.split('\n').filter(Boolean).slice(-2).join('\n')); process.exitCode=1; }
finally { await db.$disconnect(); }
