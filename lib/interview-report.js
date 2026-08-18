// lib/interview-report.js
import {
  classifyResponseQuality,
  getInterviewerGuidance,
} from './response-quality.js';

export const DOMAIN_DEFINITIONS = {
  '원칙중시': {
    label: '원칙중시',
    definition: '규정과 절차를 준수하고, 공정한 기준을 일관되게 적용하며, 투명하게 정보를 공유하는 행동 성향',
    interviewQuestion: '속도와 규정 준수가 충돌했던 상황에서 어떤 기준으로 판단했습니까? 본인이 실제로 한 행동과 결과를 설명해 주세요.',
    probePoints: ['규정 확인', '이해관계자 공유', '예외 근거', '사후 기록'],
  },
  '혁신성': {
    label: '혁신성',
    definition: '기존 방식에 의문을 제기하고, 새로운 아이디어를 실험하며, 실패에서 학습하는 행동 성향',
    interviewQuestion: '기존 방식을 바꿔 문제를 개선했던 경험이 있습니까? 무엇을 시험했고 실패 가능성을 어떻게 관리했습니까?',
    probePoints: ['문제 정의', '작은 실험', '데이터 확인', '실패 후 수정'],
  },
  '고객중심': {
    label: '고객중심',
    definition: '고객 또는 이해관계자의 요구를 주도적으로 파악하고, 기대를 관리하며, 장기적 신뢰를 구축하는 행동 성향',
    interviewQuestion: '고객 또는 과제 수혜자의 요구가 불분명했던 상황에서 진짜 필요를 어떻게 확인했습니까?',
    probePoints: ['질문과 관찰', '기대관리', '장기적 신뢰', '결과 확인'],
  },
  '의사소통': {
    label: '의사소통',
    definition: '상대의 관점을 경청하고, 사실과 의견을 구분하며, 상황에 맞게 전달 방식을 조정하는 행동 성향',
    interviewQuestion: '의견이 다른 사람과 결론을 만들어야 했던 사례에서 무엇을 듣고, 어떻게 전달 방식을 바꿨습니까?',
    probePoints: ['경청', '사실과 의견 구분', '상대별 전달', '합의 확인'],
  },
  '도전정신': {
    label: '도전정신',
    definition: '불확실한 상황에서 주도적으로 행동하고, 우선순위를 정해 끝까지 완수하며, 과정에서 학습하는 행동 성향',
    interviewQuestion: '경험이 부족하거나 불확실한 과제를 끝까지 수행한 사례에서 첫 행동과 중간 수정 과정을 설명해 주세요.',
    probePoints: ['주도성', '우선순위', '도움 요청', '완결 책임', '학습'],
  },
};

export const SUPPLEMENTARY_DEFINITIONS = {
  '조직시민성(OCB)': {
    label: '조직시민성(OCB)',
    definition: '공식적인 직무 책임을 넘어 동료를 돕고 조직 발전을 위해 자발적으로 기여하는 행동 성향',
    interviewQuestion: '자신의 직무 범위를 벗어나 팀이나 동료의 성공을 위해 자발적으로 기여했던 경험이 있습니까? 당시 동기와 결과를 설명해 주세요.',
    probePoints: ['자발적 기여', '동료 지원', '조직 이익 우선', '협력 태도'],
    supplementary: true,
  },
  '역기능행동(CWB)': {
    label: '역기능행동(CWB)',
    definition: '조직의 생산성과 건전성을 저해할 수 있는 행동 성향 (역채점 지표로 점수가 높을수록 바람직함)',
    interviewQuestion: '업무 환경에서 큰 스트레스나 불합리한 상황을 겪었을 때 감정과 행동을 어떻게 조절하고 대처했습니까?',
    probePoints: ['갈등 관리', '감정 조절', '규칙 준수', '직무 몰입'],
    supplementary: true,
  },
  '정직성/무결성': {
    label: '정직성/무결성',
    definition: '자신의 이익보다 원칙과 도덕적 기준을 우선하며, 실수를 솔직하게 인정하고 윤리적으로 행동하는 성향',
    interviewQuestion: '본인에게 불리하거나 실수를 숨길 수 있는 상황에서도 정직하게 사실을 밝히고 책임을 다했던 사례가 있습니까?',
    probePoints: ['윤리적 판단', '솔직한 보고', '이해상충 관리', '책임 인정'],
    supplementary: true,
  },
};

export const BEHAVIOR_RATING_SCALE = [
  { score: 1, description: '구체적인 사례가 없거나 타인의 행동만 설명한다. 본인의 판단과 결과가 확인되지 않는다.' },
  { score: 2, description: '사례는 있으나 본인 역할, 판단 근거 또는 결과가 불명확하다.' },
  { score: 3, description: '상황, 본인의 행동과 결과가 구체적이며 기본적인 회고가 있다.' },
  { score: 4, description: '상충하는 기준을 인식하고 근거를 바탕으로 행동했으며 결과를 확인했다.' },
  { score: 5, description: '상충 기준을 체계적으로 판단하고 행동·결과·학습·다른 상황으로의 재적용까지 설명한다.' },
];

export const INTERVIEWER_NOTES_TEMPLATE = [
  '검사에서 도출된 행동 가설',
  '지원자가 제시한 구체적 사례',
  '본인의 역할과 행동',
  '결과 및 학습',
  '면접관 행동평점 (1~5점)',
  '검사 가설 확인 / 반박 / 판단 유보',
  '추가 확인 필요사항',
];

export const REPORT_DISCLAIMERS = [
  '본 검사 결과는 면접 질문 생성과 행동 가설 확인을 위한 보조자료입니다.',
  '검사 점수만으로 합격·불합격을 판단하지 마십시오.',
  '면접에서 확인한 행동 증거가 검사 결과와 다를 경우 면접 증거를 우선하십시오.',
  '신입 지원자의 경우 학교, 팀 프로젝트, 동아리, 봉사, 아르바이트, 군 복무 등의 사례를 동일하게 인정하십시오.',
  '근소한 점수 차이로 지원자를 순위화하지 마십시오.',
];

const FLAG_CAVEATS = {
  FAST_RESPONSE: '응답 시간이 문항당 평균 1.5초 미만으로 매우 빠릅니다. 문항을 충분히 숙지하지 않고 응답했을 가능성이 있습니다.',
  UNIFORM_RESPONSE: '특정 척도 번호에 80% 이상 편중된 응답 패턴이 감지되었습니다.',
  EXCESSIVE_FOCUS_OUT: '검사 중 화면 이탈(Focus Out) 횟수가 10회를 초과했습니다.',
  RESPONSE_INCONSISTENCY_REVIEW: '동일/유사 문항 간 응답 차이가 커 응답 일관성에 대한 추가 확인이 필요합니다.',
  HIGH_RESPONSE_DISTORTION: '사회적 바람직성/인상관리 척도 점수가 높아 자신을 긍정적으로 포장(Faking)했을 가능성이 있습니다.',
  INCOMPLETE_RESPONSE: '미응답 문항이 존재하여 검사가 부분적으로만 완료되었습니다.',
  INVALID_ANSWERS_REMOVED: '유효 범위를 벗어난 비정상 응답 값이 정제되었습니다.',
};

export function maskIdentifier(email) {
  if (!email || typeof email !== 'string') return '-';
  const trimmed = email.trim();
  if (!trimmed) return '-';
  return `${trimmed.slice(0, 3)}***`;
}

export function getDomainInterpretation(average) {
  const avg = Number(average);
  if (isNaN(avg) || average == null) {
    return '추가 확인이 필요한 행동 가설입니다.';
  }
  if (avg >= 4.0) {
    return '이 영역에서 높은 행동 경향을 보고했습니다. 면접에서 구체적 사례를 확인하십시오.';
  }
  if (avg >= 3.0) {
    return '이 영역에서 보통 수준의 행동 경향을 보고했습니다. 추가 확인이 필요한 행동 가설입니다.';
  }
  return '이 영역에서 상대적으로 낮은 행동 경향을 보고했습니다. 면접에서 관련 경험과 맥락을 탐색하십시오.';
}

export function formatCaveats(flags = []) {
  const flagList = Array.isArray(flags)
    ? flags
    : flags instanceof Set
      ? Array.from(flags)
      : typeof flags === 'string'
        ? [flags]
        : [];

  const caveats = [];
  for (const flag of flagList) {
    if (!flag || typeof flag !== 'string') continue;
    if (FLAG_CAVEATS[flag]) {
      caveats.push(FLAG_CAVEATS[flag]);
      continue;
    }
    const imcMatch = flag.match(/^IMC_FAILED_(\d+)$/);
    if (imcMatch) {
      const count = parseInt(imcMatch[1], 10);
      caveats.push(`주의력 확인(IMC) 문항 중 ${count}건에서 지시와 다른 응답이 확인되었습니다.`);
      continue;
    }
    caveats.push(`응답 이상 신호 감지: ${flag}`);
  }
  return caveats;
}

export function generateInterviewReport(sessionRecord = {}, scoreResult = {}, responseQuality = null) {
  // Support flexible argument order if first arg is scoreResult
  let actualSessionRecord = sessionRecord || {};
  let actualScoreResult = scoreResult || {};
  let actualResponseQuality = responseQuality || null;

  if (sessionRecord && (sessionRecord.domainScores !== undefined || sessionRecord.totalScore !== undefined)) {
    actualScoreResult = sessionRecord;
    actualResponseQuality = scoreResult;
    actualSessionRecord = responseQuality || {};
  }

  // Resolve response quality if not fully provided
  let quality = actualResponseQuality;
  if (!quality || !quality.tier) {
    const flags = actualScoreResult?.flags || [];
    const answeredCount = actualScoreResult?.answeredCount;
    const totalItems = actualScoreResult?.totalItems;
    const completionRate = actualScoreResult?.completionRate;
    quality = classifyResponseQuality(flags, completionRate, answeredCount, totalItems);
  }

  const guidance = quality.guidance || getInterviewerGuidance(quality.tier);
  const caveats = formatCaveats(actualScoreResult?.flags || []);

  const domainScores = actualScoreResult?.domainScores || {};

  // Build core domain profiles
  const domainProfiles = Object.entries(DOMAIN_DEFINITIONS).map(([domainKey, def]) => {
    const scoreData = domainScores[domainKey] || {};
    const average = typeof scoreData.average === 'number'
      ? scoreData.average
      : (scoreData.average != null && !isNaN(Number(scoreData.average)) ? Number(scoreData.average) : null);

    return {
      domain: domainKey,
      definition: def.definition,
      score: {
        average,
        percentile: null, // percentile null until norms established
      },
      interpretation: getDomainInterpretation(average),
      interviewQuestion: def.interviewQuestion,
      probePoints: Array.isArray(def.probePoints) ? [...def.probePoints] : [],
      noExperienceNote: Boolean(scoreData.noExperienceNote || scoreData.hasNoExperience || false),
    };
  });

  // Build supplementary scales (OCB, CWB, Integrity)
  const supplementaryScales = Object.entries(SUPPLEMENTARY_DEFINITIONS).map(([domainKey, def]) => {
    const scoreData = domainScores[domainKey] || domainScores[def.label] || {};
    const average = typeof scoreData.average === 'number'
      ? scoreData.average
      : (scoreData.average != null && !isNaN(Number(scoreData.average)) ? Number(scoreData.average) : null);

    return {
      domain: domainKey,
      definition: def.definition,
      score: {
        average,
        percentile: null,
      },
      interpretation: getDomainInterpretation(average),
      interviewQuestion: def.interviewQuestion,
      probePoints: Array.isArray(def.probePoints) ? [...def.probePoints] : [],
      noExperienceNote: Boolean(scoreData.noExperienceNote || scoreData.hasNoExperience || false),
      supplementary: true,
    };
  });

  const candidate = {
    name: actualSessionRecord.name || '알 수 없음',
    identifier: maskIdentifier(actualSessionRecord.email),
    assessmentDate: actualSessionRecord.startedAt
      || actualSessionRecord.timestamp
      || actualSessionRecord.assessmentDate
      || new Date().toISOString(),
    assessmentVersion: actualSessionRecord.assessmentVersion
      || actualScoreResult.assessmentVersion
      || 'v2-bank-pilot',
  };

  const qualityAssessment = {
    tier: quality.tier,
    label: quality.label,
    guidance,
    caveats,
  };

  return {
    generatedAt: new Date().toISOString(),
    candidate,
    qualityAssessment,
    domainProfiles,
    supplementaryScales,
    behaviorRatingScale: BEHAVIOR_RATING_SCALE,
    interviewerNotes: {
      template: [...INTERVIEWER_NOTES_TEMPLATE],
    },
    disclaimers: [...REPORT_DISCLAIMERS],
    // Backwards compatibility helpers for admin views
    basicInfo: {
      sessionId: actualSessionRecord.sessionId || '',
      name: candidate.name,
      email: actualSessionRecord.email || '',
      timestamp: candidate.assessmentDate,
      assessmentVersion: candidate.assessmentVersion,
    },
    quality: {
      tier: quality.tier,
      tierLabel: quality.label,
      guidanceText: guidance,
      color: quality.color || (quality.tier === 'retest_recommended' ? 'red' : quality.tier === 'caution' ? 'amber' : 'green'),
    },
    domains: domainProfiles.map((dp) => ({
      domainName: dp.domain,
      average: dp.score.average,
      definition: dp.definition,
      interpretation: dp.interpretation,
      interviewQuestion: dp.interviewQuestion,
      probePoints: dp.probePoints,
      noExperienceNote: dp.noExperienceNote,
    })),
  };
}
