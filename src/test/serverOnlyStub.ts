// `server-only`는 Next 빌드에서만 해석되는 가드 모듈이라 Vitest에서는 찾을 수 없다.
// 서버 전용 모듈을 단위 테스트하기 위해 vitest.config.mts에서 이 빈 모듈로 치환한다.
export {};
