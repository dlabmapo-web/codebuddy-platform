import type {
  AcademyRole,
  GuardianRelationship,
} from "../../../src/generated/prisma/enums.js";

import { algorithmsIntro, pythonFoundations, type DemoCourse } from "./curriculum.js";

/**
 * The two demo academies, their people, and who teaches whom.
 *
 * Written out by hand rather than generated from a loop because the point of
 * this dataset is that it reads like a real business: two campuses of different
 * sizes, teachers with uneven class loads, and students who appear in more than
 * one class. A generated roster produces suspiciously round numbers, and the
 * first question anybody asks about a demo is whether the data is real.
 *
 * Every account signs in with `demoPassword`. `.test` is reserved by RFC 2606,
 * so no address here can collide with, or deliver mail to, a real inbox.
 */

export const demoPassword = "CoveDemo2026!";

/** Backdated so the overview charts have history to draw on day one. */
export const demoFoundedAt = new Date("2026-03-02T00:00:00.000Z");

export type DemoPerson = {
  /** Stable across runs; every derived UUID hangs off it. */
  key: string;
  email: string;
  username: string;
  displayName: string;
  role: AcademyRole;
  /** Staff only. */
  academyTitle?: string;
  bio?: string;
  specialties?: readonly string[];
  /** Students only. */
  studentNumber?: string;
  schoolName?: string;
  schoolGrade?: string;
  guardianName?: string;
  guardianRelationship?: GuardianRelationship;
  guardianPhone?: string;
  codingInterests?: readonly string[];
  learningGoal?: string;
  /** Weeks after the academy opened that this member joined. */
  joinedWeek: number;
};

export type DemoClass = {
  key: string;
  name: string;
  description: string;
  teacherKey: string;
  courseKeys: readonly string[];
  studentKeys: readonly string[];
};

export type DemoAcademy = {
  key: string;
  name: string;
  slug: string;
  addressLine1: string;
  locality: string;
  region: string;
  postalCode: string;
  contactPhone: string;
  contactEmail: string;
  /** An existing real account promoted to MANAGER here, matched by email. */
  ownerEmail: string;
  staff: readonly DemoPerson[];
  students: readonly DemoPerson[];
  courses: readonly DemoCourse[];
  classes: readonly DemoClass[];
};

const interests = [
  ["게임 만들기", "웹사이트"],
  ["로봇", "인공지능"],
  ["애니메이션", "게임 만들기"],
  ["데이터 분석"],
  ["앱 개발", "게임 만들기"],
  ["인공지능", "웹사이트"],
] as const;

const schools = [
  ["서울망원초등학교", "5학년"],
  ["서울성산초등학교", "6학년"],
  ["숭문중학교", "1학년"],
  ["서울도화초등학교", "6학년"],
  ["광성중학교", "2학년"],
  ["서울연남초등학교", "5학년"],
] as const;

const gangnamSchools = [
  ["서울대치초등학교", "6학년"],
  ["대청중학교", "1학년"],
  ["서울논현초등학교", "5학년"],
  ["역삼중학교", "2학년"],
  ["서울도곡초등학교", "6학년"],
  ["단대부속중학교", "1학년"],
] as const;

function student(
  index: number,
  key: string,
  displayName: string,
  guardianName: string,
  campus: "mapo" | "gangnam",
): DemoPerson {
  const table = campus === "mapo" ? schools : gangnamSchools;
  const [schoolName, schoolGrade] = table[index % table.length];
  const prefix = campus === "mapo" ? "M" : "G";
  return {
    key,
    email: `${key}@dlab.test`,
    username: key,
    displayName,
    role: "STUDENT",
    studentNumber: `${prefix}${String(index + 1).padStart(3, "0")}`,
    schoolName,
    schoolGrade,
    guardianName,
    guardianRelationship: index % 2 === 0 ? "MOTHER" : "FATHER",
    guardianPhone: `010-${String(2000 + index * 7).slice(0, 4)}-${String(3100 + index * 13).slice(0, 4)}`,
    codingInterests: interests[index % interests.length],
    learningGoal:
      index % 3 === 0
        ? "내가 만든 게임을 친구들과 같이 해보고 싶어요."
        : index % 3 === 1
          ? "정보올림피아드에 나가보는 것이 목표입니다."
          : "학교 방과후 수업을 따라갈 수 있을 만큼 배우고 싶어요.",
    // Spread across the term so the growth chart has a slope rather than a step.
    joinedWeek: Math.min(20, Math.floor(index * 1.4)),
  };
}

const mapoStudents: readonly DemoPerson[] = [
  student(0, "seojun-kim", "김서준", "김현우", "mapo"),
  student(1, "haeun-lee", "이하은", "이정민", "mapo"),
  student(2, "doyun-park", "박도윤", "박성호", "mapo"),
  student(3, "jiwoo-choi", "최지우", "최영수", "mapo"),
  student(4, "yejun-jung", "정예준", "정미경", "mapo"),
  student(5, "suah-kang", "강수아", "강동혁", "mapo"),
  student(6, "minjun-cho", "조민준", "조은영", "mapo"),
  student(7, "chaeeun-yoon", "윤채은", "윤상철", "mapo"),
  student(8, "gunwoo-im", "임건우", "임지영", "mapo"),
  student(9, "jimin-han", "한지민", "한태식", "mapo"),
  student(10, "siwoo-oh", "오시우", "오혜진", "mapo"),
  student(11, "arin-shin", "신아린", "신경민", "mapo"),
  student(12, "junho-bae", "배준호", "배기훈", "mapo"),
  student(13, "yujin-song", "송유진", "송하영", "mapo"),
  student(14, "taeoh-kwon", "권태오", "권민석", "mapo"),
  student(15, "nayoon-hong", "홍나윤", "홍승표", "mapo"),
  student(16, "jiho-moon", "문지호", "문선주", "mapo"),
  student(17, "yerin-seo", "서예린", "서동진", "mapo"),
];

const gangnamStudents: readonly DemoPerson[] = [
  student(0, "woojin-jang", "장우진", "장인수", "gangnam"),
  student(1, "soyul-nam", "남소율", "남기범", "gangnam"),
  student(2, "hyunwoo-baek", "백현우", "백종수", "gangnam"),
  student(3, "dain-yoo", "유다인", "유선경", "gangnam"),
  student(4, "junseo-noh", "노준서", "노형준", "gangnam"),
  student(5, "gaeun-sim", "심가은", "심재웅", "gangnam"),
  student(6, "minjae-pyo", "표민재", "표은정", "gangnam"),
  student(7, "seoah-koo", "구서아", "구본식", "gangnam"),
  student(8, "dohyun-chun", "천도현", "천유리", "gangnam"),
  student(9, "yuna-ma", "마유나", "마정호", "gangnam"),
  student(10, "eunsung-ha", "하은성", "하수민", "gangnam"),
  student(11, "yeeun-jin", "진예은", "진광호", "gangnam"),
  student(12, "suho-myung", "명수호", "명자영", "gangnam"),
  student(13, "ria-ahn", "안리아", "안대현", "gangnam"),
];

export const mapoAcademy: DemoAcademy = {
  key: "mapo",
  name: "Mapo D Lab Coding Academy",
  slug: "mapo-dlab",
  addressLine1: "서울특별시 마포구 월드컵북로 396",
  locality: "마포구",
  region: "서울특별시",
  postalCode: "03925",
  contactPhone: "02-336-1234",
  contactEmail: "mapo@dlab.test",
  ownerEmail: "dlabmapo@gmail.com",
  staff: [
    {
      key: "jihoon-park",
      email: "jihoon-park@dlab.test",
      username: "jihoon-park",
      displayName: "박지훈",
      role: "MANAGER",
      academyTitle: "원장",
      bio: "10년째 초·중등 코딩 교육을 해왔습니다. 학생이 스스로 답을 찾는 수업을 지향합니다.",
      specialties: ["학원 운영", "학부모 상담"],
      joinedWeek: 0,
    },
    {
      key: "subin-choi",
      email: "subin-choi@dlab.test",
      username: "subin-choi",
      displayName: "최수빈",
      role: "TEAM_LEAD",
      academyTitle: "교육과정 팀장",
      bio: "커리큘럼을 설계하고 문제를 출제합니다.",
      specialties: ["커리큘럼 설계", "문제 출제"],
      joinedWeek: 0,
    },
    {
      key: "minseo-kim",
      email: "minseo-kim@dlab.test",
      username: "minseo-kim",
      displayName: "김민서",
      role: "TEACHER",
      academyTitle: "선임 강사",
      bio: "처음 코딩을 배우는 학생들과 가장 오래 일했습니다.",
      specialties: ["파이썬 기초", "초등 교육"],
      joinedWeek: 0,
    },
    {
      key: "dohyun-lee",
      email: "dohyun-lee@dlab.test",
      username: "dohyun-lee",
      displayName: "이도현",
      role: "TEACHER",
      academyTitle: "강사",
      bio: "학생의 오답을 같이 읽는 시간을 가장 중요하게 생각합니다.",
      specialties: ["파이썬 기초", "디버깅"],
      joinedWeek: 2,
    },
    {
      key: "haneul-jung",
      email: "haneul-jung@dlab.test",
      username: "haneul-jung",
      displayName: "정하늘",
      role: "TEACHER",
      academyTitle: "알고리즘 강사",
      bio: "정보올림피아드 준비반을 맡고 있습니다.",
      specialties: ["알고리즘", "대회 준비"],
      joinedWeek: 5,
    },
  ],
  students: mapoStudents,
  courses: [pythonFoundations, algorithmsIntro],
  classes: [
    {
      key: "mapo-python-a",
      name: "파이썬 기초 A반",
      description: "월·수·금 17:00 — 처음 시작하는 학생을 위한 반입니다.",
      teacherKey: "minseo-kim",
      courseKeys: ["python-foundations"],
      studentKeys: mapoStudents.slice(0, 7).map((s) => s.key),
    },
    {
      key: "mapo-python-b",
      name: "파이썬 기초 B반",
      description: "화·목 19:00 — 학교 수업을 마치고 오는 학생을 위한 반입니다.",
      teacherKey: "dohyun-lee",
      courseKeys: ["python-foundations"],
      studentKeys: mapoStudents.slice(7, 13).map((s) => s.key),
    },
    {
      key: "mapo-algo",
      name: "알고리즘 심화반",
      description: "토 10:00 — 기초 과정을 마친 학생을 위한 심화 반입니다.",
      teacherKey: "haneul-jung",
      courseKeys: ["algorithms-intro"],
      // The two strongest A반 students sit here as well, so the demo has a
      // student who legitimately appears in two rosters.
      studentKeys: [
        ...mapoStudents.slice(13).map((s) => s.key),
        "seojun-kim",
        "haeun-lee",
      ],
    },
  ],
};

export const gangnamAcademy: DemoAcademy = {
  key: "gangnam",
  name: "Gangnam DLab Academy",
  slug: "gangnam-dlab",
  addressLine1: "서울특별시 강남구 테헤란로 152",
  locality: "강남구",
  region: "서울특별시",
  postalCode: "06236",
  contactPhone: "02-555-7788",
  contactEmail: "gangnam@dlab.test",
  ownerEmail: "jurabek0304@naver.com",
  staff: [
    {
      key: "seoyeon-han",
      email: "seoyeon-han@dlab.test",
      username: "seoyeon-han",
      displayName: "한서연",
      role: "MANAGER",
      academyTitle: "원장",
      bio: "강남 캠퍼스를 총괄합니다.",
      specialties: ["학원 운영", "입시 상담"],
      joinedWeek: 6,
    },
    {
      key: "jiwon-oh",
      email: "jiwon-oh@dlab.test",
      username: "jiwon-oh",
      displayName: "오지원",
      role: "TEAM_LEAD",
      academyTitle: "교육과정 팀장",
      bio: "마포 캠퍼스의 커리큘럼을 강남 학생에 맞게 조정합니다.",
      specialties: ["커리큘럼 설계", "평가 설계"],
      joinedWeek: 6,
    },
    {
      key: "taeyoon-kang",
      email: "taeyoon-kang@dlab.test",
      username: "taeyoon-kang",
      displayName: "강태윤",
      role: "TEACHER",
      academyTitle: "선임 강사",
      bio: "주말 집중반을 맡고 있습니다.",
      specialties: ["파이썬 기초", "중등 교육"],
      joinedWeek: 7,
    },
    {
      key: "chaewon-yoon",
      email: "chaewon-yoon@dlab.test",
      username: "chaewon-yoon",
      displayName: "윤채원",
      role: "TEACHER",
      academyTitle: "알고리즘 강사",
      bio: "자료구조와 알고리즘을 가르칩니다.",
      specialties: ["알고리즘", "자료구조"],
      joinedWeek: 9,
    },
  ],
  students: gangnamStudents,
  courses: [pythonFoundations, algorithmsIntro],
  classes: [
    {
      key: "gangnam-python",
      name: "파이썬 기초 주말반",
      description: "토 14:00 — 주말에 모여 한 주 분량을 함께 진행합니다.",
      teacherKey: "taeyoon-kang",
      courseKeys: ["python-foundations"],
      studentKeys: gangnamStudents.slice(0, 8).map((s) => s.key),
    },
    {
      key: "gangnam-algo",
      name: "알고리즘 집중반",
      description: "월·목 18:00 — 대회 준비를 함께 하는 반입니다.",
      teacherKey: "chaewon-yoon",
      courseKeys: ["algorithms-intro"],
      studentKeys: [
        ...gangnamStudents.slice(8).map((s) => s.key),
        "woojin-jang",
        "soyul-nam",
      ],
    },
  ],
};

export const demoAcademies = [mapoAcademy, gangnamAcademy] as const;

/**
 * Accounts that already exist and must survive the reset.
 *
 * Their Supabase Auth identities are never touched — these are real people who
 * own their own passwords, and a seed that reset them would lock somebody out
 * of their own account to make a demo look tidy.
 */
export const preservedEmails = [
  "dlabmapo@gmail.com",
  "jurabek0304@naver.com",
  "samiev.jurabek@bk.ru",
  "test@gmail.com",
] as const;
