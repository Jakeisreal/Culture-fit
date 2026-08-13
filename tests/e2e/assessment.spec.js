import { expect, test } from '@playwright/test';

const questions = [
  { id: 'V2-PR-01', text: '규정과 절차를 일관되게 지킨다.', responseScale: 'agreement' },
  { id: 'V2-CWB-01', text: '최근 12개월 동안 업무를 의도적으로 늦춘 적이 있다.', responseScale: 'frequency_12m' },
  { id: 'V2-OCB-01', text: '동료의 업무를 자발적으로 도운 적이 있다.', responseScale: 'frequency_12m' },
];

test('지원자가 인증부터 제출까지 완료할 수 있다', async ({ page }) => {
  await page.route('**/api/init', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        sessionId: 'test-session',
        questions,
        assessmentVersion: 'v2-bank-pilot',
        timeLimitSeconds: 1500,
        message: '검사가 시작되었습니다.',
      }),
    });
  });
  await page.route('**/api/save-draft', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }));
  await page.route('**/api/log', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }));
  await page.route('**/api/submit2', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Culture-Fit 검사' })).toBeVisible();
  await page.getByRole('button', { name: '검사 시작하기' }).click();

  await page.getByLabel('이름').fill('홍길동');
  await page.getByLabel('이메일').fill('hong@example.com');
  await page.getByLabel('전화번호').fill('01012345678');
  await page.getByRole('button', { name: '검사 시작', exact: true }).click();

  await expect(page.getByRole('heading', { name: '검사 유의사항' })).toBeVisible();
  await expect(page.getByText('25분')).toBeVisible();
  await page.getByRole('button', { name: '시작', exact: true }).click();
  await expect(page.getByText(questions[0].text)).toBeVisible();

  for (let index = 0; index < questions.length; index += 1) {
    await page.getByRole('button', { name: `${index + 3}점` }).click();
    if (index < questions.length - 1) {
      await expect(page.getByText(questions[index + 1].text)).toBeVisible();
      if (index === 0) await expect(page.getByText('6회 이상')).toBeVisible();
    }
  }
  await page.getByRole('button', { name: '제출하기' }).click();

  await expect(page.getByRole('heading', { name: '제출 완료!' })).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('관리자가 토큰으로 운영 현황을 확인할 수 있다', async ({ page }) => {
  await page.route('**/api/admin/status', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer admin-test-token');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        generatedAt: '2026-07-30T00:00:00.000Z',
        summary: {
          totalCandidates: 12,
          allowedCandidates: 10,
          inProgress: 3,
          completed: 7,
          flagged: 1,
        },
        recent: [{
          sessionId: 'session-1',
          name: '홍길동',
          email: 'hong@example.com',
          status: 'COMPLETED',
          completionRate: '230/230',
          assessmentVersion: 'v2-bank-pilot',
          suspicious: '',
          score: '총점: 80점 / 100점',
          timestamp: '2026-07-30T00:00:00.000Z',
        }],
      }),
    });
  });

  await page.goto('/admin');
  await page.getByLabel('관리자 토큰').fill('admin-test-token');
  await page.getByRole('button', { name: '인증' }).click();
  await expect(page.getByRole('heading', { name: 'Culture-Fit 운영 현황' })).toBeVisible();
  await expect(page.getByText('홍길동')).toBeVisible();
  await expect(page.getByText('230/230')).toBeVisible();
  await expect(page.getByText('V2 Bank Pilot')).toBeVisible();
  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);
});
