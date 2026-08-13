// lib/scoring.js
import {
  getAssessmentDefinition,
  LEGACY_ASSESSMENT_VERSION,
  normalizeAssessmentVersion,
} from './assessment-versions.js';

/**
 * items_full.json 문항 데이터 로드 헬퍼
 */
export function loadFullItems() {
  try {
    return getAssessmentDefinition(LEGACY_ASSESSMENT_VERSION).items;
  } catch (err) {
    console.error('Scoring: 문항 로드 실패:', err);
    return [];
  }
}

export function loadAssessmentItems(version) {
  try {
    return getAssessmentDefinition(version).items;
  } catch (err) {
    console.error('Scoring: 버전 문항 로드 실패:', err);
    return [];
  }
}

/**
 * IMC(주의집중) 문항의 정답 값을 판별하는 함수
 */
export function getExpectedIMCAnswer(item) {
  if (item.expected && !isNaN(Number(item.expected))) {
    return Number(item.expected);
  }
  const text = item.text || '';
  if (text.includes('매우 아니다') || text.includes('가장 왼쪽')) return 1;
  if (text.includes('아니다')) return 2;
  if (text.includes('보통이다')) return 3;
  if (text.includes('그렇다') && !text.includes('매우 그렇다')) return 4;
  if (text.includes('매우 그렇다')) return 5;
  return null;
}

export function isCorrectIMCAnswer(item, rawValue, now = new Date()) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1 || value > 5) return false;

  const text = String(item?.text || '');
  if (text.includes('월요일이면 아무 답이나')) {
    const seoulDay = new Date(now.getTime() + (9 * 60 * 60 * 1000)).getUTCDay();
    return seoulDay === 1 || value === 5;
  }
  if (text.includes('선택하지 마세요')) return value !== 5;

  const expectedValue = getExpectedIMCAnswer(item);
  return expectedValue != null && value === expectedValue;
}

/**
 * 문항 역채점 여부 확인 (역기능행동 CWB 또는 reverse 속성)
 */
export function isReverseItem(item) {
  if (item?.scoring_key === 'reverse') return true;
  if (item?.scoring_key === 'direct' || item?.scoring_key === 'imc') return false;
  if (Boolean(item.reverse || item.is_reverse)) return true;
  const domain = String(item.domain || '');
  const variable = String(item.variable || item.var || '');
  const reverseVariables = new Set([
    'CWB',
    'Integrity (overt)',
    'Social Desirability (rev)',
  ]);
  if (domain.includes('역기능행동') || domain.includes('CWB') || reverseVariables.has(variable)) {
    return true;
  }
  return false;
}

export function normalizeAnswers(answers = {}, items = loadFullItems()) {
  const itemMap = new Map(items.map((item) => [item.item_id, item]));
  const normalized = {};
  const invalidKeys = [];

  for (const [itemId, rawValue] of Object.entries(answers || {})) {
    const value = Number(rawValue);
    if (!itemMap.has(itemId) || !Number.isInteger(value) || value < 1 || value > 5) {
      invalidKeys.push(itemId);
      continue;
    }
    normalized[itemId] = value;
  }

  return { answers: normalized, invalidKeys };
}

/**
 * 응답 데이터(answers) 및 메타정보(timeSpent, focusOutCount 등)를 바탕으로
 * 종합 점수, 요인(Domain)별 점수, IMC 통과 여부 및 의심 플래그를 계산합니다.
 */
export function calculateAssessmentScore(answers = {}, meta = {}) {
  const assessmentVersion = normalizeAssessmentVersion(
    meta.assessmentVersion,
    LEGACY_ASSESSMENT_VERSION,
  );
  const items = Array.isArray(meta.items)
    ? meta.items
    : loadAssessmentItems(assessmentVersion);
  if (!items || items.length === 0) {
    return {
      totalScore: 0,
      completionRate: '0/0',
      domainScores: {},
      imcPassed: true,
      imcFailedCount: 0,
      flags: [],
      scoreSummaryText: '문항 데이터 없음',
    };
  }

  const normalized = normalizeAnswers(answers, items);
  answers = normalized.answers;

  let totalScoredPoints = 0;
  let totalMaxPoints = 0;
  const domainTotals = {}; // { [domain]: { sum: 0, count: 0 } }

  let imcTotal = 0;
  let imcAnsweredCount = 0;
  let imcPassedCount = 0;
  let imcFailedCount = 0;

  let answeredCount = 0;

  for (const item of items) {
    const itemId = item.item_id;
    const rawVal = answers[itemId];

    // IMC(주의력검사) 문항 처리
    if (item.is_imc) {
      imcTotal++;
      if (rawVal != null && rawVal !== '') {
        imcAnsweredCount++;
        if (isCorrectIMCAnswer(item, rawVal, meta.now || new Date())) {
          imcPassedCount++;
        } else {
          imcFailedCount++;
        }
      } else {
        imcFailedCount++;
      }
      continue; // IMC 문항은 컬쳐핏 총점 합산에서 제외
    }

    if (rawVal == null || rawVal === '' || isNaN(Number(rawVal))) {
      continue;
    }

    answeredCount++;
    const numVal = Number(rawVal);

    // 1~5점 점수 환산 (Reverse 문항 처리)
    const reverse = isReverseItem(item);
    const scoredVal = reverse ? (6 - numVal) : numVal;
    if (item.score_group === 'consistency') {
      continue;
    }

    // 반응왜곡(faking) 도메인이 아닌 핵심 역량만 총점에 반영
    const domain = item.domain || '기타';
    const isDistortionDomain = domain.includes('반응왜곡');
    const includeInTotal = item.score_group
      ? item.score_group === 'core'
      : !isDistortionDomain;

    if (includeInTotal) {
      totalScoredPoints += scoredVal;
      totalMaxPoints += 5;
    }

    if (!domainTotals[domain]) {
      domainTotals[domain] = { sum: 0, count: 0 };
    }
    domainTotals[domain].sum += scoredVal;
    domainTotals[domain].count += 1;
  }

  // Likert 1~5를 0~100으로 선형 환산 (1=0, 3=50, 5=100)
  const totalScoredCount = totalMaxPoints / 5;
  const totalScorePercent = totalScoredCount > 0
    ? Math.round(((totalScoredPoints - totalScoredCount) / (totalScoredCount * 4)) * 100)
    : 0;
  const totalAverage = totalScoredCount > 0
    ? Number((totalScoredPoints / totalScoredCount).toFixed(2))
    : 0;

  // 도메인별 점수 및 백분율
  const domainScores = {};
  let distortionSum = 0;
  let distortionCount = 0;

  for (const [dom, data] of Object.entries(domainTotals)) {
    if (data.count > 0) {
      const avg = Number((data.sum / data.count).toFixed(2));
      const pct = Math.round(((data.sum - data.count) / (data.count * 4)) * 100);
      domainScores[dom] = { average: avg, scorePercent: pct, count: data.count };

      if (dom.includes('반응왜곡')) {
        distortionSum += data.sum;
        distortionCount += data.count * 5;
      }
    }
  }

  // 의심 패턴 검출
  const flags = [];
  const timeSpent = meta.timeSpent || 0;
  const focusOutCount = meta.focusOutCount || 0;

  if (answeredCount > 0) {
    const avgTimePerQuestion = timeSpent / answeredCount;
    if (avgTimePerQuestion < 1.5) {
      flags.push('FAST_RESPONSE');
    }

    const values = Object.values(answers).map(Number).filter(n => !isNaN(n));
    if (values.length > 0) {
      const counts = values.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
      const maxCount = Math.max(...Object.values(counts));
      if (maxCount / values.length > 0.8) {
        flags.push('UNIFORM_RESPONSE');
      }
    }
  }

  if (focusOutCount > 10) {
    flags.push('EXCESSIVE_FOCUS_OUT');
  }

  if (imcFailedCount > 0) {
    flags.push(`IMC_FAILED_${imcFailedCount}`);
  }

  if (normalized.invalidKeys.length > 0) {
    flags.push('INVALID_ANSWERS_REMOVED');
  }

  const consistencyPairs = new Map();
  for (const item of items) {
    if (!item.consistency_pair_id) continue;
    if (!consistencyPairs.has(item.consistency_pair_id)) {
      consistencyPairs.set(item.consistency_pair_id, {});
    }
    const pair = consistencyPairs.get(item.consistency_pair_id);
    pair[item.consistency_role || 'anchor'] = {
      itemId: item.item_id,
      value: answers[item.item_id],
    };
  }
  const consistencyDetails = [...consistencyPairs.entries()]
    .map(([pairId, pair]) => {
      const anchorValue = Number(pair.anchor?.value);
      const repeatValue = Number(pair.repeat?.value);
      const answered = Number.isInteger(anchorValue) && Number.isInteger(repeatValue);
      return {
        pairId,
        anchorItemId: pair.anchor?.itemId || null,
        repeatItemId: pair.repeat?.itemId || null,
        answered,
        absoluteDifference: answered ? Math.abs(anchorValue - repeatValue) : null,
        exactMatch: answered ? anchorValue === repeatValue : null,
      };
    });
  const answeredConsistencyPairs = consistencyDetails.filter((pair) => pair.answered);
  const largeDifferencePairs = answeredConsistencyPairs.filter(
    (pair) => pair.absoluteDifference >= 2,
  ).length;
  const reviewThreshold = Math.max(
    2,
    Math.ceil(answeredConsistencyPairs.length * 0.4),
  );
  const consistency = {
    totalPairs: consistencyDetails.length,
    answeredPairs: answeredConsistencyPairs.length,
    exactMatchCount: answeredConsistencyPairs.filter((pair) => pair.exactMatch).length,
    exactAgreementRate: answeredConsistencyPairs.length > 0
      ? answeredConsistencyPairs.filter((pair) => pair.exactMatch).length / answeredConsistencyPairs.length
      : null,
    meanAbsoluteDifference: answeredConsistencyPairs.length > 0
      ? answeredConsistencyPairs.reduce((sum, pair) => sum + pair.absoluteDifference, 0)
        / answeredConsistencyPairs.length
      : null,
    largeDifferencePairs,
    reviewThreshold,
    details: consistencyDetails,
  };
  if (
    answeredConsistencyPairs.length >= 3
    && largeDifferencePairs >= reviewThreshold
  ) {
    flags.push('RESPONSE_INCONSISTENCY_REVIEW');
  }

  const completionCount = answeredCount + imcAnsweredCount;
  if (completionCount < items.length) {
    flags.push('INCOMPLETE_RESPONSE');
  }

  // 반응왜곡(사회적 바람직성/인상관리) 과도 점수 체크 (예: 90% 초과 시 Faking 의심)
  if (distortionCount > 0) {
    const distortionRate = (distortionSum / distortionCount) * 100;
    if (distortionRate >= 90) {
      flags.push('HIGH_RESPONSE_DISTORTION');
    }
  }

  const scoreSummaryText = `총점: ${totalScorePercent}점 / 100점 (응시 ${answeredCount}/${items.length - imcTotal}, ${assessmentVersion})`;

  return {
    assessmentVersion,
    totalScore: totalScorePercent,
    totalAverage,
    rawScoredPoints: totalScoredPoints,
    maxPossiblePoints: totalMaxPoints,
    domainScores,
    imcPassed: imcFailedCount === 0,
    imcFailedCount,
    consistency,
    answeredCount: completionCount,
    totalItems: items.length,
    normalizedAnswers: answers,
    invalidAnswerKeys: normalized.invalidKeys,
    flags,
    scoreSummaryText,
  };
}
