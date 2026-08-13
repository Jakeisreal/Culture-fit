import assert from 'node:assert/strict';
import {
  calculateAssessmentScore,
  getExpectedIMCAnswer,
  isCorrectIMCAnswer,
  isReverseItem,
  loadAssessmentItems,
  loadFullItems,
  normalizeAnswers,
} from '../lib/scoring.js';
import { createSessionToken, verifySessionToken } from '../lib/session-auth.js';
import { parseElapsedSeconds, parseKSTDate, validateTimeWindow } from '../lib/time.js';
import { withRetry } from '../lib/http.js';
import {
  arrangeQuestionsWithSpacing,
  insertConsistencyRepeats,
} from '../pages/api/init.js';
import { isRateLimited } from '../lib/rate-limit.js';
import { formatSeoulTimestamp } from '../lib/sheets.js';
import { isAdminRequest } from '../lib/admin-auth.js';
import {
  getAssessmentDefinition,
  getResponseHeaders,
  parseSessionNotes,
} from '../lib/assessment-versions.js';
import {
  selectAssessmentItems,
  summarizeSelection,
} from '../lib/item-selection.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('CWB와 reverse 문항을 역채점으로 분류한다', () => {
  assert.equal(isReverseItem({ domain: '역기능행동(CWB)', variable: 'CWB' }), true);
  assert.equal(isReverseItem({ variable: 'Integrity (overt)' }), true);
  assert.equal(isReverseItem({ variable: 'Social Desirability (rev)' }), true);
  assert.equal(isReverseItem({ reverse: true }), true);
  assert.equal(isReverseItem({ domain: '원칙중시' }), false);
});

test('IMC 지시문에서 기대 응답을 파싱한다', () => {
  assert.equal(getExpectedIMCAnswer({ text: "'매우 아니다'를 선택해 주세요." }), 1);
  assert.equal(getExpectedIMCAnswer({ text: "'보통이다'를 선택해 주세요." }), 3);
  assert.equal(getExpectedIMCAnswer({ text: "'매우 그렇다'를 선택하세요." }), 5);
});

test('조건형 IMC를 서울 요일과 금지 응답 기준으로 판정한다', () => {
  const mondayUtc = new Date('2026-08-02T15:00:00.000Z');
  const tuesdayUtc = new Date('2026-08-03T15:00:00.000Z');
  const conditional = { text: "월요일이면 아무 답이나, 아니라면 '매우 그렇다'를 선택해 주세요." };
  assert.equal(isCorrectIMCAnswer(conditional, 2, mondayUtc), true);
  assert.equal(isCorrectIMCAnswer(conditional, 2, tuesdayUtc), false);
  assert.equal(isCorrectIMCAnswer(conditional, 5, tuesdayUtc), true);
  assert.equal(isCorrectIMCAnswer({ text: "'매우 그렇다'를 선택하지 마세요." }, 4), true);
  assert.equal(isCorrectIMCAnswer({ text: "'매우 그렇다'를 선택하지 마세요." }, 5), false);
});

test('등록되지 않은 키와 1~5 범위 밖 응답을 제거한다', () => {
  const result = normalizeAnswers({ I001: 5, I002: 0, I003: 6, UNKNOWN: 3 });
  assert.deepEqual(result.answers, { I001: 5 });
  assert.deepEqual(result.invalidKeys.sort(), ['I002', 'I003', 'UNKNOWN']);
});

test('채점 결과에 역채점, 불완전 응답, 어뷰징 플래그를 반영한다', () => {
  const result = calculateAssessmentScore(
    { I001: 5, I002: 5, I171: 1, I251: 1, UNKNOWN: 9 },
    { timeSpent: 2, focusOutCount: 15 },
  );
  assert.equal(result.domainScores['원칙중시'].average, 5);
  assert.equal(result.domainScores['역기능행동(CWB)'].average, 5);
  assert.equal(result.imcPassed, false);
  assert.equal(result.imcFailedCount, 9);
  assert.ok(result.flags.includes('FAST_RESPONSE'));
  assert.ok(result.flags.includes('EXCESSIVE_FOCUS_OUT'));
  assert.ok(result.flags.includes('INVALID_ANSWERS_REMOVED'));
  assert.ok(result.flags.includes('INCOMPLETE_RESPONSE'));
});

test('KST 시각을 실행 서버의 로컬 타임존과 무관하게 해석한다', () => {
  assert.equal(parseKSTDate('2026-07-30 09:00:00').toISOString(), '2026-07-30T00:00:00.000Z');
  assert.equal(parseKSTDate('2026-07-30T00:00:00Z').toISOString(), '2026-07-30T00:00:00.000Z');
  assert.equal(
    validateTimeWindow(
      '2026-07-30 09:00:00',
      '2026-07-30 10:00:00',
      new Date('2026-07-30T00:30:00Z'),
    ).valid,
    true,
  );
  assert.equal(parseElapsedSeconds('01:02:03'), 3723);
});

test('세션 토큰의 서명, 세션 ID, 만료를 검증한다', () => {
  const now = Date.parse('2026-07-30T00:00:00Z');
  const token = createSessionToken('session-a', now);
  assert.equal(verifySessionToken(token, 'session-a', now), true);
  assert.equal(verifySessionToken(token, 'session-b', now), false);
  assert.equal(verifySessionToken(`${token}x`, 'session-a', now), false);
  assert.equal(verifySessionToken(token, 'session-a', now + (7 * 60 * 60 * 1000)), false);
});

test('일시적인 Sheets 오류만 지수 백오프로 재시도한다', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error('rate limited');
      error.response = { status: 429 };
      throw error;
    }
    return 'ok';
  }, { attempts: 3, baseDelayMs: 1 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('같은 난수 시퀀스에서는 문항 배치가 재현된다', () => {
  const items = [
    { item_id: 'I001', domain: 'A', variable: 'Culture-Fit' },
    { item_id: 'I002', domain: 'A', variable: 'Culture-Fit' },
    { item_id: 'I003', domain: 'B', variable: 'Culture-Fit' },
    { item_id: 'I004', domain: 'B', variable: 'Culture-Fit' },
    { item_id: 'I005', domain: 'C', variable: 'Other' },
  ];
  const randomFactory = () => {
    const values = [0.2, 0.8, 0.4, 0.6, 0.1, 0.9];
    let index = 0;
    return () => values[(index += 1) % values.length];
  };
  const first = arrangeQuestionsWithSpacing(items, randomFactory()).map((item) => item.item_id);
  const second = arrangeQuestionsWithSpacing(items, randomFactory()).map((item) => item.item_id);
  assert.deepEqual(first, second);
  assert.deepEqual([...first].sort(), items.map((item) => item.item_id).sort());
});

test('요청 제한은 윈도우 안의 초과 요청만 차단한다', () => {
  const key = `test-${Date.now()}`;
  assert.equal(isRateLimited(key, 2, 1000, 1000), false);
  assert.equal(isRateLimited(key, 2, 1000, 1100), false);
  assert.equal(isRateLimited(key, 2, 1000, 1200), true);
  assert.equal(isRateLimited(key, 2, 1000, 2101), false);
});

test('300개 전체 응답의 완료율과 IMC 통과를 정확히 계산한다', () => {
  const answers = {};
  for (const item of loadFullItems()) {
    if (!item.is_imc) {
      answers[item.item_id] = 3;
    } else if (item.text.includes('선택하지 마세요')) {
      answers[item.item_id] = 4;
    } else {
      answers[item.item_id] = getExpectedIMCAnswer(item) || 5;
    }
  }
  const result = calculateAssessmentScore(answers, {
    timeSpent: 1500,
    focusOutCount: 0,
    now: new Date('2026-08-03T15:00:00Z'),
  });
  assert.equal(result.answeredCount, 300);
  assert.equal(result.imcPassed, true);
  assert.equal(result.flags.includes('INCOMPLETE_RESPONSE'), false);
});

test('KST 자정 타임스탬프를 24시간제로 저장한다', () => {
  assert.equal(
    formatSeoulTimestamp('2026-08-03T15:00:00.000Z'),
    '2026-08-04T00:00:00+09:00',
  );
});

test('관리자 API는 설정된 Bearer 토큰만 허용한다', () => {
  const previousToken = process.env.DIAGNOSTICS_TOKEN;
  process.env.DIAGNOSTICS_TOKEN = 'admin-secret';
  try {
    assert.equal(isAdminRequest({ headers: {} }), false);
    assert.equal(isAdminRequest({ headers: { authorization: 'Bearer wrong' } }), false);
    assert.equal(isAdminRequest({ headers: { authorization: 'Bearer admin-secret' } }), true);
  } finally {
    if (previousToken === undefined) delete process.env.DIAGNOSTICS_TOKEN;
    else process.env.DIAGNOSTICS_TOKEN = previousToken;
  }
});

test('정·역방향 사회적 바람직성 응답을 같은 왜곡 방향으로 환산한다', () => {
  const answers = {};
  for (let index = 201; index <= 215; index += 1) {
    answers[`I${index}`] = 5;
  }
  for (let index = 216; index <= 230; index += 1) {
    answers[`I${index}`] = 1;
  }
  const result = calculateAssessmentScore(answers, { timeSpent: 300 });
  assert.equal(result.domainScores['반응왜곡(사회적바람직성)'].average, 5);
  assert.ok(result.flags.includes('HIGH_RESPONSE_DISTORTION'));
});

test('Likert 중립값을 50점으로 환산한다', () => {
  const result = calculateAssessmentScore({ I001: 3, I002: 3 }, { timeSpent: 30 });
  assert.equal(result.totalAverage, 3);
  assert.equal(result.totalScore, 50);
  assert.equal(result.domainScores['원칙중시'].scorePercent, 50);
});

test('V2는 300문항 은행 구성과 명시적 채점 메타데이터를 충족한다', () => {
  const items = loadAssessmentItems('v2-bank-pilot');
  assert.equal(items.length, 300);
  assert.equal(items.filter((item) => item.score_group === 'core').length, 200);
  assert.equal(items.filter((item) => item.score_group === 'supplemental').length, 40);
  assert.equal(items.filter((item) => item.score_group === 'response_quality').length, 45);
  assert.equal(items.filter((item) => item.is_imc).length, 5);
  assert.equal(items.filter((item) => item.score_group === 'consistency').length, 10);
  assert.equal(new Set(items.map((item) => item.item_id)).size, 300);
  assert.ok(items.every((item) => ['direct', 'reverse', 'imc'].includes(item.scoring_key)));
  assert.ok(items.every((item) => item.facet && item.response_scale && item.version === 'v2-bank-pilot'));

  const normalizedTexts = items.map(
    (item) => item.text.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase(),
  );
  assert.equal(new Set(normalizedTexts).size, 290);
  assert.equal(items.filter((item) => item.consistency_role === 'anchor').length, 10);
  assert.equal(items.filter((item) => item.consistency_role === 'repeat').length, 10);
});

test('V2 총점은 선별된 핵심 150문항만 반영하고 보조척도는 별도로 산출한다', () => {
  const items = selectAssessmentItems(
    getAssessmentDefinition('v2-bank-pilot').items,
    'v2-bank-pilot',
    'score-test-session',
  );
  const answers = {};
  for (const item of items) {
    if (item.is_imc) answers[item.item_id] = item.expected;
    else if (item.score_group === 'core') answers[item.item_id] = 3;
    else if (item.score_group === 'consistency') answers[item.item_id] = 3;
    else answers[item.item_id] = item.scoring_key === 'reverse' ? 1 : 5;
  }
  const result = calculateAssessmentScore(answers, {
    assessmentVersion: 'v2-bank-pilot',
    timeSpent: 900,
    now: new Date('2026-07-30T00:00:00Z'),
    items,
  });
  assert.equal(result.assessmentVersion, 'v2-bank-pilot');
  assert.equal(result.totalScore, 50);
  assert.equal(result.answeredCount, 230);
  assert.equal(result.imcPassed, true);
  assert.equal(result.consistency.exactAgreementRate, 1);
  assert.equal(result.domainScores['조직시민성(OCB)'].average, 5);
  assert.equal(result.flags.includes('INCOMPLETE_RESPONSE'), false);
});

test('V2 저장 헤더와 레거시 세션 버전 판별을 분리한다', () => {
  const headers = getResponseHeaders('v2-bank-pilot');
  assert.equal(headers.length, 313);
  assert.equal(headers[13], 'V2-PR-01');
  assert.equal(getAssessmentDefinition('v2-bank-pilot').responseSheet, 'Responses_V2_Bank');
  assert.equal(getAssessmentDefinition('v2-pilot').items.length, 192);
  assert.equal(getAssessmentDefinition('v2-pilot').responseSheet, 'Responses_V2');
  assert.equal(getResponseHeaders('v2-pilot').length, 205);
  assert.equal(parseSessionNotes('').assessmentVersion, 'v1');
  assert.equal(
    parseSessionNotes(JSON.stringify({ assessmentVersion: 'v2-pilot', draftVersion: 2 })).assessmentVersion,
    'v2-pilot',
  );
});

test('V2 일관성 반복문항은 원문항에서 충분히 떨어져 배치된다', () => {
  const items = selectAssessmentItems(
    getAssessmentDefinition('v2-bank-pilot').items,
    'v2-bank-pilot',
    'spacing-test-session',
  );
  const mainItems = items.filter((item) => item.score_group !== 'consistency');
  const repeats = items.filter((item) => item.score_group === 'consistency');
  const arranged = insertConsistencyRepeats(mainItems, repeats);
  assert.equal(arranged.length, 230);
  for (const repeat of repeats) {
    const anchorIndex = arranged.findIndex(
      (item) => item.consistency_pair_id === repeat.consistency_pair_id
        && item.consistency_role === 'anchor',
    );
    const repeatIndex = arranged.findIndex((item) => item.item_id === repeat.item_id);
    assert.ok(Math.abs(anchorIndex - repeatIndex) >= 80);
  }
});

test('V2 일관성은 2점 이상 차이가 전체 쌍의 40%일 때 검토 신호를 만든다', () => {
  const items = selectAssessmentItems(
    getAssessmentDefinition('v2-bank-pilot').items,
    'v2-bank-pilot',
    'consistency-test-session',
  );
  const answers = Object.fromEntries(items.map((item) => [
    item.item_id,
    item.is_imc ? item.expected : 3,
  ]));
  const repeats = items.filter((item) => item.consistency_role === 'repeat');
  answers[repeats[0].item_id] = 5;
  answers[repeats[1].item_id] = 5;
  answers[repeats[2].item_id] = 5;
  answers[repeats[3].item_id] = 5;
  const result = calculateAssessmentScore(answers, {
    assessmentVersion: 'v2-bank-pilot',
    timeSpent: 1200,
    items,
  });
  assert.equal(result.consistency.largeDifferencePairs, 4);
  assert.equal(result.consistency.reviewThreshold, 4);
  assert.equal(result.consistency.exactMatchCount, 6);
  assert.ok(result.flags.includes('RESPONSE_INCONSISTENCY_REVIEW'));
});

test('V2 선별은 세션별로 재현되며 동일한 척도 할당을 유지한다', () => {
  const bank = getAssessmentDefinition('v2-bank-pilot').items;
  const first = selectAssessmentItems(bank, 'v2-bank-pilot', 'candidate-a');
  const repeated = selectAssessmentItems(bank, 'v2-bank-pilot', 'candidate-a');
  const second = selectAssessmentItems(bank, 'v2-bank-pilot', 'candidate-b');
  assert.equal(first.length, 230);
  assert.deepEqual(
    first.map((item) => item.item_id),
    repeated.map((item) => item.item_id),
  );
  assert.notDeepEqual(
    first.map((item) => item.item_id),
    second.map((item) => item.item_id),
  );
  assert.deepEqual(summarizeSelection(first), {
    원칙중시: 30,
    혁신성: 30,
    고객중심: 30,
    의사소통: 30,
    도전정신: 30,
    '조직시민성(OCB)': 10,
    '역기능행동(CWB)': 10,
    '정직성/무결성': 15,
    '반응왜곡(사회적바람직성)': 10,
    '반응왜곡(인상관리)': 10,
    '반응왜곡(자기기만)': 10,
    응답일관성: 10,
    '응답주의(주의력검사)': 5,
  });
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`\n${passed}/${tests.length} harness tests passed.`);
