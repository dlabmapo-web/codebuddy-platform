import http from 'k6/http';
import { check, sleep } from 'k6';

const homeUrl = __ENV.HOME_URL || 'https://coveedu.com';
const studioUrl = __ENV.STUDIO_URL || 'https://cs.coveedu.com';
const apiUrl = __ENV.API_URL || 'https://api.coveedu.com';
const authenticatedPath = __ENV.AUTHENTICATED_PATH || '';
const authenticatedCookie = __ENV.AUTHENTICATED_COOKIE || '';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{surface:api}': ['p(95)<750'],
    'http_req_duration{surface:page}': ['p(95)<1500'],
  },
};

export default function () {
  const responses = http.batch([
    ['GET', `${homeUrl}/`, null, { tags: { surface: 'page' } }],
    ['GET', `${studioUrl}/login`, null, { tags: { surface: 'page' } }],
    ['GET', `${apiUrl}/api/health/ready`, null, { tags: { surface: 'api' } }],
  ]);

  for (const response of responses) {
    check(response, { 'public endpoint succeeds': (result) => result.status >= 200 && result.status < 400 });
  }

  if (authenticatedPath && authenticatedCookie) {
    const response = http.get(`${studioUrl}${authenticatedPath}`, {
      headers: { Cookie: authenticatedCookie },
      redirects: 0,
      tags: { surface: 'page' },
    });
    check(response, { 'authenticated read succeeds': (result) => result.status === 200 });
  }

  sleep(1);
}
