// lib/interview-report.js
import {
  classifyResponseQuality,
  getInterviewerGuidance,
} from './response-quality.js';

/**
 * 5대 핵심 가치 (Culture-Fit) 규준 평균 및 질문 DB
 */
export const CULTURE_FIT_DOMAINS = {
  '원칙중시': {
    key: '원칙중시',
    label: '원칙중시',
    normMean: 3.38,
    definition: '규정과 절차를 준수하고, 공정한 기준을 일관되게 적용하며, 투명하게 정보를 공유하는 성향',
    strengthQuestions: [
      '속도와 규정 준수가 충돌했던 상황에서 어떤 기준으로 판단했습니까? 본인이 실제로 한 행동과 결과를 설명해 주세요.',
      '조직 내 규정이나 절차에 모호한 부분이 발생했을 때, 어떻게 기준을 세우고 동료들과 공유했습니까?',
      '자신이나 팀의 성과에 불리할 수 있는 사실도 숨기지 않고 투명하게 공유하여 신뢰를 얻은 사례가 있습니까?',
    ],
    weaknessQuestions: [
      '일정이나 납기가 매우 촉박할 때 절차를 간소화하거나 예외를 적용했던 기준과 판단 근거는 무엇이었습니까?',
      '규정 준수로 인해 일의 진행 속도가 지나치게 늦어진다는 동료나 고객의 불만에 어떻게 대처했습니까?',
      '기존 규정이 현실과 맞지 않아 불합리하다고 느꼈을 때, 무단 생략하지 않고 합법적으로 개선을 건의한 적이 있습니까?',
    ],
    probePoints: ['규정 확인', '이해관계자 공유', '예외 근거', '사후 기록'],
  },
  '혁신성': {
    key: '혁신성',
    label: '혁신성',
    normMean: 3.12,
    definition: '기존 방식에 의문을 제기하고, 새로운 아이디어를 실험하며, 개선을 모색하는 성향',
    strengthQuestions: [
      '관행적으로 이어져 오던 비효율적 방식을 바꾸어 실질적인 성과 개선을 이끌어낸 사례를 말씀해 주세요.',
      '새로운 기술이나 외부의 우수 사례를 벤치마킹하여 자신의 업무에 성공적으로 접목했던 경험이 있습니까?',
      '새로운 아이디어를 시험하는 과정에서 실패했을 때, 원인을 분석하고 다음 시도로 연결한 경험을 설명해 주세요.',
    ],
    weaknessQuestions: [
      '새로운 방식을 시도하기보다 기존의 안정적인 방식을 고수하여 문제를 해결했던 사례가 있습니까?',
      '조직 내에서 새로운 아이디어나 변화를 제안받았을 때, 리스크를 검토하고 수용했던 경험을 설명해 주세요.',
      '업무 중 반복되는 비효율이나 불편을 발견했을 때, 이를 개선하기 위해 실제로 취한 행동은 무엇이었습니까?',
    ],
    probePoints: ['문제 정의', '작은 실험', '데이터 확인', '실패 후 수정'],
  },
  '고객중심': {
    key: '고객중심',
    label: '고객중심',
    normMean: 2.96,
    definition: '고객 및 이해관계자의 요구를 주도적으로 파악하고, 기대를 관리하며, 신뢰를 구축하는 성향',
    strengthQuestions: [
      '고객(또는 사내 유관부서)이 명확히 말하지 않은 숨은 요구사항까지 선제적으로 파악해 만족을 이끌어낸 사례가 있습니까?',
      '무리하거나 상충하는 고객의 요구사항을 설득력 있게 조율하여 장기적 신뢰 관계를 유지했던 경험을 설명해 주세요.',
      '고객 클레임이나 불만 상황에서 감정에 치우치지 않고 근본 원인을 해결해 낸 사례를 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '다른 구성원이나 고객과의 이해 차이를 조정하지 못해 협업이나 진행이 어려웠던 경험이 있다면 설명해 주세요.',
      '동료나 고객을 지원하려 했으나 준비 부족 또는 판단 미흡으로 실질적인 도움이 되지 못했던 경험을 말씀해 주세요.',
      '상대방의 입장을 충분히 고려하지 못해 오해나 갈등이 발생했던 사례와 그로부터 얻은 교훈은 무엇입니까?',
    ],
    probePoints: ['질문과 관찰', '기대관리', '장기적 신뢰', '결과 확인'],
  },
  '의사소통': {
    key: '의사소통',
    label: '의사소통',
    normMean: 3.47,
    definition: '상대의 관점을 경청하고, 사실과 의견을 구분하며, 상황에 맞게 전달 방식을 조정하는 성향',
    strengthQuestions: [
      '의견 차이가 극심한 상황에서 양측의 입장을 경청하고 사실관계를 명확히 하여 합의를 이끌어낸 경험이 있습니까?',
      '전문 지식이 부족한 상대방에게 복잡한 내용을 알기 쉽게 설명하여 성공적으로 의사결정을 유도한 사례를 설명해 주세요.',
      '상대방의 피드백이나 지적을 적극적으로 수용하여 업무 결과물의 완성도를 높였던 경험을 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '본인의 의도가 상대방에게 잘못 전달되어 오해가 생겼던 경험과 이를 수습하기 위해 어떤 노력을 했는지 말씀해 주세요.',
      '상대방의 의견에 동의하기 어려울 때 감정적 대립 없이 건설적인 반대 의견을 전달했던 사례가 있습니까?',
      '회의나 협의 중 본인의 발언 비중이 너무 크거나 작다고 느껴 전달 방식을 조정한 경험이 있습니까?',
    ],
    probePoints: ['경청', '사실과 의견 구분', '상대별 전달', '합의 확인'],
  },
  '도전정신': {
    key: '도전정신',
    label: '도전정신',
    normMean: 3.45,
    definition: '불확실한 상황에서도 주도적으로 행동하고, 우선순위를 정해 끝까지 완수하며 학습하는 성향',
    strengthQuestions: [
      '실패나 좌절 상황에서 빠르게 회복하여 새로운 방법으로 다시 도전해 끝내 성과를 낸 사례가 있습니까?',
      '위험 요인을 분석·관리하면서 난이도가 높은 어려운 프로젝트나 과제를 성공적으로 완수한 경험을 설명해 주세요.',
      '새로운 업무나 미지의 과제를 자발적으로 맡아 책임감을 갖고 주도적으로 추진했던 경험을 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '목표 달성이 불확실하거나 진행이 더딜 때, 중도 포기하지 않고 끝까지 동기부여를 유지했던 사례를 말씀해 주세요.',
      '본인의 역량을 뛰어넘는 어려운 과제를 맡았을 때, 주변의 도움을 요청하거나 해결책을 찾았던 과정은 어떠했습니까?',
      '예상치 못한 돌발 상황이 발생했을 때 우선순위를 재설정하여 차질 없이 대처했던 경험을 설명해 주세요.',
    ],
    probePoints: ['주도성', '우선순위', '도움 요청', '완결 책임', '학습'],
  },
};

/**
 * 팀 핏 (Team-Fit) 4대 하위 영역 규준 평균 및 질문 DB
 */
export const TEAM_FIT_DOMAINS = {
  '상호협력': {
    key: '상호협력',
    label: '상호 협력 및 지원',
    normMean: 3.42,
    definition: '내 일에만 머무르지 않고 마감에 쫓기는 동료를 돕고 지식과 노하우를 적극 공유하는 성향',
    strengthQuestions: [
      '자신의 업무가 완료된 후, 마감에 쫓기거나 어려움을 겪는 동료를 자발적으로 도와 팀의 납기를 맞춘 사례를 설명해 주세요.',
      '자신만의 유용한 업무 팁이나 정보를 팀원들에게 체계적으로 전파하여 팀 전체의 생산성을 높인 경험이 있습니까?',
      '담당 업무가 아님에도 팀 전체의 완결성을 위해 궂은일을 기꺼이 도맡아 처리했던 경험을 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '동료의 지원 요청을 받았으나 본인의 업무 일정과 충돌했을 때 우선순위를 어떻게 조율했습니까?',
      '개인 업무에 집중하느라 주변 팀원의 어려움을 뒤늦게 인지했던 경험과 이를 통해 배운 점은 무엇입니까?',
      '혼자 해결하는 것이 더 빠르다고 느꼈지만 동료와 함께 협력하여 완수한 사례가 있다면 설명해 주세요.',
    ],
    probePoints: ['자발적 지원', '지식 공유', '역할 유연성', '동료 배려'],
  },
  '소통·피드백': {
    key: '소통·피드백',
    label: '피드백 수용 및 열린 소통',
    normMean: 3.35,
    definition: '자신의 실수를 숨기지 않고 투명하게 공유하며, 타인의 건설적 피드백을 방어적이지 않게 수용하는 성향',
    strengthQuestions: [
      '업무 중 발생한 본인의 실수나 예기치 못한 이슈를 팀에 즉시 공유하여 조기에 해결했던 사례를 설명해 주세요.',
      '자신의 작업 방식에 대해 동료나 상사로부터 날카로운 피드백을 받았을 때, 이를 긍정적으로 수용해 개선한 경험이 있습니까?',
      '업무 진행 상태와 주요 변동 사항을 팀원들에게 선제적으로 공유하여 불필요한 혼선을 줄인 사례를 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '본인의 신념이나 방식에 대해 반대 피드백을 받았을 때, 방어적인 태도를 극복하고 타협점을 찾았던 경험을 말씀해 주세요.',
      '문제가 발생했을 때 스스로 해결하려다 공유 시기를 놓쳤던 경험이 있다면 당시 상황과 반성한 점을 설명해 주세요.',
      '업무 스타일이 매우 다른 동료와 소통하면서 오해를 풀고 신뢰를 쌓아간 과정을 말씀해 주세요.',
    ],
    probePoints: ['투명한 공유', '피드백 수용성', '방어기제 극복', '지속적 소통'],
  },
  '공동목표': {
    key: '공동목표',
    label: '공동 목표 몰입 및 책임감',
    normMean: 3.50,
    definition: '개인의 돋보임보다 팀의 성공을 우선시하며, 팀이 합의한 규칙과 마감 기한을 철저히 지키는 성향',
    strengthQuestions: [
      '개인의 성과나 편의를 일부 양보하더라도 팀 전체의 목표 달성을 위해 헌신했던 구체적 사례를 설명해 주세요.',
      '팀에서 약속한 규칙이나 일정에 차질이 생기지 않도록 끝까지 강한 책임감으로 역할을 완수한 경험이 있습니까?',
      '팀 프로젝트 완료 후 동료들의 노고와 기여를 공식적으로 인정하고 격려하여 팀워크를 강화한 사례를 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '팀의 목표와 본인 개인의 목표나 선호가 일치하지 않았을 때, 이를 어떻게 조화시키고 몰입했습니까?',
      '팀 과제에서 무임승차하거나 소극적인 팀원이 있었을 때, 팀 분위기를 해치지 않고 역할을 이끌어낸 경험이 있습니까?',
      '마감 기한을 지키기 어려운 돌발 변수가 발생했을 때 팀 목표에 영향을 주지 않기 위해 어떤 조치를 취했습니까?',
    ],
    probePoints: ['팀 우선주의', '마감 책임감', '동료 인정', '공동 몰입'],
  },
  '갈등조율': {
    key: '갈등조율',
    label: '갈등 조율 및 적응성',
    normMean: 3.28,
    definition: '팀 내 의견 충돌 시 타협점을 모색하고, 새로운 팀 환경이나 결정된 방향에 신속히 적응하는 성향',
    strengthQuestions: [
      '팀원 간에 심각한 의견 대립이 발생했을 때, 양측의 요구를 충족하는 제3의 대안을 제시해 갈등을 해결한 사례를 설명해 주세요.',
      '자신의 의견과 다르게 팀의 의사결정이 내려졌을 때, 이에 승복하고 결과 완성을 위해 성실히 협조했던 경험이 있습니까?',
      '새로운 팀이나 낯선 환경에 배치되었을 때, 팀의 문화와 일하는 방식을 빠르게 익혀 조기에 적응한 사례를 말씀해 주세요.',
    ],
    weaknessQuestions: [
      '나와 성향이나 가치관이 맞지 않는 동료와 장기간 함께 일해야 했을 때 업무적 관계를 어떻게 유지했습니까?',
      '의견 충돌 상황에서 감정적으로 대립하지 않고 사실 기반으로 합의점을 찾았던 구체적 과정을 설명해 주세요.',
      '팀의 일하는 방식이나 룰이 급작스럽게 변경되었을 때 유연하게 적응하고 성과를 낸 사례가 있습니까?',
    ],
    probePoints: ['타협안 도출', '결정 승복', '환경 적응력', '성향 차이 포용'],
  },
};

/**
 * 하위 호환용 도메인 정의 매핑
 */
export const DOMAIN_DEFINITIONS = {
  '원칙중시': {
    label: '원칙중시',
    definition: CULTURE_FIT_DOMAINS['원칙중시'].definition,
    interviewQuestion: CULTURE_FIT_DOMAINS['원칙중시'].strengthQuestions[0],
    probePoints: CULTURE_FIT_DOMAINS['원칙중시'].probePoints,
  },
  '혁신성': {
    label: '혁신성',
    definition: CULTURE_FIT_DOMAINS['혁신성'].definition,
    interviewQuestion: CULTURE_FIT_DOMAINS['혁신성'].strengthQuestions[0],
    probePoints: CULTURE_FIT_DOMAINS['혁신성'].probePoints,
  },
  '고객중심': {
    label: '고객중심',
    definition: CULTURE_FIT_DOMAINS['고객중심'].definition,
    interviewQuestion: CULTURE_FIT_DOMAINS['고객중심'].strengthQuestions[0],
    probePoints: CULTURE_FIT_DOMAINS['고객중심'].probePoints,
  },
  '의사소통': {
    label: '의사소통',
    definition: CULTURE_FIT_DOMAINS['의사소통'].definition,
    interviewQuestion: CULTURE_FIT_DOMAINS['의사소통'].strengthQuestions[0],
    probePoints: CULTURE_FIT_DOMAINS['의사소통'].probePoints,
  },
  '도전정신': {
    label: '도전정신',
    definition: CULTURE_FIT_DOMAINS['도전정신'].definition,
    interviewQuestion: CULTURE_FIT_DOMAINS['도전정신'].strengthQuestions[0],
    probePoints: CULTURE_FIT_DOMAINS['도전정신'].probePoints,
  },
};

export const SUPPLEMENTARY_DEFINITIONS = {
  '팀적합도(Team-Fit)': {
    label: '팀적합도(Team-Fit)',
    definition: '팀의 공동 목표를 위해 동료와 적극 협력하고, 피드백을 수용하며, 갈등을 원만히 조율하여 팀에 신속히 적응하는 성향',
    interviewQuestion: TEAM_FIT_DOMAINS['상호협력'].strengthQuestions[0],
    probePoints: ['상호 협력 및 지원', '피드백 수용', '팀 목표 우선순위', '갈등 조율 및 적응'],
    supplementary: true,
  },
  '조직시민성(OCB)': {
    label: '조직시민성(OCB)',
    definition: '공식적인 직무 책임을 넘어 동료를 돕고 조직 발전을 위해 자발적으로 기여하는 행동 성향',
    interviewQuestion: '자신의 직무 범위를 벗어나 팀이나 동료의 성공을 위해 자발적으로 기여했던 경험이 있습니까?',
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

export const INTERVIEWER_NOTES_TEMPLATE = [
  '검사에서 도출된 행동 가설',
  '지원자가 제시한 구체적 사례',
  '본인의 역할과 행동',
  '결과 및 학습',
  '면접관 행동평점 (1~5점)',
  '검사 가설 확인 / 반박 / 판단 유보',
  '추가 확인 필요사항',
];

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

const FLAG_CAVEATS = {
  FAST_RESPONSE: '응답 시간이 문항당 평균 1.5초 미만으로 매우 빠릅니다. 문항을 충분히 숙지하지 않고 응답했을 가능성이 있습니다.',
  UNIFORM_RESPONSE: '특정 척도 번호에 80% 이상 편중된 응답 패턴이 감지되었습니다.',
  EXCESSIVE_FOCUS_OUT: '검사 중 화면 이탈(Focus Out) 횟수가 10회를 초과했습니다.',
  RESPONSE_INCONSISTENCY_REVIEW: '동일/유사 문항 간 응답 차이가 커 응답 일관성에 대한 추가 확인이 필요합니다.',
  HIGH_RESPONSE_DISTORTION: '사회적 바람직성/인상관리 척도 점수가 높아 자신을 긍정적으로 포장(Faking)했을 가능성이 있습니다.',
  INCOMPLETE_RESPONSE: '미응답 문항이 존재하여 검사가 부분적으로만 완료되었습니다.',
  INVALID_ANSWERS_REMOVED: '유효 범위를 벗어난 비정상 응답 값이 정제되었습니다.',
};

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

/**
 * 3단계 수준 판별 헬퍼 (High / Mid / Low)
 */
export function getScoreLevel(score, normMean) {
  if (score == null || isNaN(score)) return '-';
  const diff = score - normMean;
  if (diff >= 0.25 || score >= 3.8) return 'High';
  if (diff <= -0.25 || score < 2.9) return 'Low';
  return 'Mid';
}

/**
 * 5단계 행동평정척도 (BARS)
 */
export const BEHAVIOR_RATING_SCALE = [
  { score: 1, description: '구체적인 사례가 없거나 타인의 행동만 설명한다. 본인의 판단과 결과가 확인되지 않는다.' },
  { score: 2, description: '사례는 있으나 본인 역할, 판단 근거 또는 결과가 불명확하다.' },
  { score: 3, description: '상황, 본인의 행동과 결과가 구체적이며 기본적인 회고가 있다.' },
  { score: 4, description: '상충하는 기준을 인식하고 근거를 바탕으로 행동했으며 결과를 확인했다.' },
  { score: 5, description: '상충 기준을 체계적으로 판단하고 행동·결과·학습·다른 상황으로의 재적용까지 설명한다.' },
];

export const REPORT_DISCLAIMERS = [
  '본 검사 결과는 면접 질문 생성과 행동 가설 확인을 위한 보조자료입니다.',
  '검사 점수만으로 합격·불합격을 판단하지 마십시오.',
  '면접에서 확인한 행동 증거가 검사 결과와 다를 경우 면접 증거를 우선하십시오.',
  '신입 지원자의 경우 학교, 팀 프로젝트, 동아리, 봉사, 아르바이트, 군 복무 등의 사례를 동일하게 인정하십시오.',
  '근소한 점수 차이로 지원자를 서열화하거나 줄세우지 마십시오.',
];

export function maskIdentifier(email) {
  if (!email || typeof email !== 'string') return '-';
  const trimmed = email.trim();
  if (!trimmed) return '-';
  return `${trimmed.slice(0, 3)}***`;
}

/**
 * 8대 응답 진정성 검사 (Authenticity Checks) 판정
 */
export function evaluateAuthenticity(scoreResult = {}) {
  const flags = scoreResult.flags || [];
  const domainScores = scoreResult.domainScores || {};
  const consistency = scoreResult.consistency || {};
  const imcFailedCount = Number(scoreResult.imcFailedCount) || 0;

  // 1. 전 영역 극단값 패턴 (거의 모든 문항을 1 또는 5로만 응답)
  const isExtremePattern = flags.includes('UNIFORM_RESPONSE') || flags.includes('FAST_RESPONSE_EXTREME');

  // 2. 역문항 응답 불일치 (정방향-역방향 문항 간 일관성 훼손)
  const isReverseInconsistent = flags.includes('REVERSE_INCONSISTENCY') || flags.includes('RESPONSE_INCONSISTENCY_REVIEW');

  // 3. 중복문항 불일치 (≥2.5점 차이 발생)
  const largeDiffCount = Number(consistency.largeDifferencePairs) || 0;
  const isRepeatInconsistent = largeDiffCount >= 4 || flags.includes('RESPONSE_INCONSISTENCY_REVIEW');

  // 4. 사회적 바람직성 과다
  const sdsAvg = domainScores['반응왜곡(사회적바람직성)']?.average;
  const isSdsExcessive = (sdsAvg != null && sdsAvg >= 4.2) || flags.includes('HIGH_RESPONSE_DISTORTION');

  // 5. 인상관리(IM) 과다
  const imAvg = domainScores['반응왜곡(인상관리)']?.average;
  const isImExcessive = (imAvg != null && imAvg >= 4.0);

  // 6. 자기기만(SDE) 과다
  const sdeAvg = domainScores['반응왜곡(자기기만)']?.average;
  const isSdeExcessive = (sdeAvg != null && sdeAvg >= 4.2);

  // 7. 역기능행동(CWB) 징후 (CWB 역채점 환산 점수가 2.8 미만으로 낮음 = 실제 비도덕/일탈 행동 빈도 높음)
  const cwbAvg = domainScores['역기능행동(CWB)']?.average;
  const isCwbRisk = cwbAvg != null && cwbAvg < 2.8;

  // 8. 주의력검사(IMC) 실패
  const isImcFailed = imcFailedCount > 0;

  return [
    {
      id: 'extreme_pattern',
      label: '전 영역 극단값 패턴',
      status: isExtremePattern ? '주의' : '정상',
      isWarning: isExtremePattern,
      description: '거의 모든 문항을 1 또는 5로만 응답한 경우, 신뢰도 저하 가능성을 알립니다.',
    },
    {
      id: 'reverse_inconsistency',
      label: '역문항 응답 불일치',
      status: isReverseInconsistent ? '주의' : '정상',
      isWarning: isReverseInconsistent,
      description: '정방향·역방향 문항 간 일관성이 크게 어긋나면 응답 주의가 필요합니다.',
    },
    {
      id: 'repeat_inconsistency',
      label: '중복문항 불일치(≥2.5점)',
      status: isRepeatInconsistent ? '주의' : '정상',
      isWarning: isRepeatInconsistent,
      description: '동일 문장/유사 문항에 상반된 응답을 한 경우입니다.',
    },
    {
      id: 'social_desirability',
      label: '사회적 바람직성 과다',
      status: isSdsExcessive ? '주의' : '정상',
      isWarning: isSdsExcessive,
      description: '자신을 지나치게 긍정적으로 보이려는 경향이 의심됩니다.',
    },
    {
      id: 'impression_management',
      label: '인상관리 과다',
      status: isImExcessive ? '주의' : '정상',
      isWarning: isImExcessive,
      description: '타인에게 좋은 인상을 주려는 의도가 과다하게 나타난 경우입니다.',
    },
    {
      id: 'self_deception',
      label: '자기기만 과다',
      status: isSdeExcessive ? '주의' : '정상',
      isWarning: isSdeExcessive,
      description: '본인도 인식하지 못한 채 과도하게 긍정적으로 응답하는 경향입니다.',
    },
    {
      id: 'cwb_risk',
      label: '역기능행동(CWB) 징후',
      status: isCwbRisk ? '주의' : '정상',
      isWarning: isCwbRisk,
      description: '조직에 부정적인 행동을 시사하는 문항에서 높은 점수를 보였습니다.',
    },
    {
      id: 'imc_failed',
      label: '주의력검사(IMC) 실패',
      status: isImcFailed ? `실패 (${imcFailedCount}건)` : '정상',
      isWarning: isImcFailed,
      description: '안내문을 읽고 지정된 번호를 선택하는 지시를 위반한 경우입니다.',
    },
  ];
}

/**
 * 종합 면접 리포트 데이터 생성 함수
 */
export function generateInterviewReport(sessionRecord = {}, scoreResult = {}, responseQuality = null) {
  let actualSessionRecord = sessionRecord || {};
  let actualScoreResult = scoreResult || {};
  let actualResponseQuality = responseQuality || null;

  if (sessionRecord && (sessionRecord.domainScores !== undefined || sessionRecord.totalScore !== undefined)) {
    actualScoreResult = sessionRecord;
    actualResponseQuality = scoreResult;
    actualSessionRecord = responseQuality || {};
  }

  // Response Quality 산출
  let quality = actualResponseQuality;
  if (!quality || !quality.tier) {
    const flags = actualScoreResult?.flags || [];
    const answeredCount = actualScoreResult?.answeredCount;
    const totalItems = actualScoreResult?.totalItems;
    const completionRate = actualScoreResult?.completionRate;
    quality = classifyResponseQuality(flags, completionRate, answeredCount, totalItems);
  }

  const guidance = quality.guidance || getInterviewerGuidance(quality.tier);
  const domainScores = actualScoreResult?.domainScores || {};
  const facetScores = actualScoreResult?.facetScores || {};

  // 1. 컬쳐핏 5대 영역 프로파일 구축
  const cultureFitProfiles = Object.values(CULTURE_FIT_DOMAINS).map((def) => {
    const scoreData = domainScores[def.key] || {};
    const average = typeof scoreData.average === 'number'
      ? scoreData.average
      : (scoreData.average != null && !isNaN(Number(scoreData.average)) ? Number(scoreData.average) : null);

    const normMean = def.normMean;
    const diff = average != null ? Number((average - normMean).toFixed(2)) : 0;
    const level = getScoreLevel(average, normMean);

    return {
      domainName: def.key,
      label: def.label,
      score: average,
      normMean,
      diff,
      diffText: diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2),
      level,
      definition: def.definition,
      strengthQuestions: def.strengthQuestions,
      weaknessQuestions: def.weaknessQuestions,
      probePoints: def.probePoints,
    };
  });

  // 2. 컬쳐핏 강점 & 약점 영역 도출
  const scoredCulture = cultureFitProfiles.filter((p) => p.score != null);
  const sortedCulture = [...scoredCulture].sort((a, b) => (b.score - b.normMean) - (a.score - a.normMean));
  const cultureStrength = sortedCulture[0] || cultureFitProfiles[0];
  const cultureWeakness = sortedCulture[sortedCulture.length - 1] || cultureFitProfiles[cultureFitProfiles.length - 1];

  // 3. 팀핏 4대 하위 영역 프로파일 구축
  const teamFitProfiles = Object.entries(TEAM_FIT_DOMAINS).map(([facetKey, def]) => {
    const fKey = `팀적합도(Team-Fit)::${facetKey}`;
    const fData = facetScores[fKey];
    let average = fData?.average;

    if (average == null) {
      const tfDomain = domainScores['팀적합도(Team-Fit)'];
      if (tfDomain && typeof tfDomain.average === 'number') {
        average = tfDomain.average;
      }
    }

    const normMean = def.normMean;
    const diff = average != null ? Number((average - normMean).toFixed(2)) : 0;
    const level = getScoreLevel(average, normMean);

    return {
      domainName: def.label,
      facetKey,
      label: def.label,
      score: average != null ? average : 3.4,
      normMean,
      diff,
      diffText: diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2),
      level,
      definition: def.definition,
      strengthQuestions: def.strengthQuestions,
      weaknessQuestions: def.weaknessQuestions,
      probePoints: def.probePoints,
    };
  });

  // 4. 팀핏 강점 & 약점 영역 도출
  const sortedTeam = [...teamFitProfiles].sort((a, b) => (b.score - b.normMean) - (a.score - a.normMean));
  const teamStrength = sortedTeam[0] || teamFitProfiles[0];
  const teamWeakness = sortedTeam[sortedTeam.length - 1] || teamFitProfiles[teamFitProfiles.length - 1];

  // 5. 8대 응답 진정성 검사 결과 생성
  const authenticityChecks = evaluateAuthenticity(actualScoreResult);

  // 6. 종합 점수 및 성과 지표 산출
  const totalAvg = actualScoreResult.totalAverage || (actualScoreResult.totalScore ? Number((1 + (actualScoreResult.totalScore / 100) * 4).toFixed(2)) : 3.2);
  const totalScore100 = actualScoreResult.totalScore || Math.round(((totalAvg - 1) / 4) * 100);

  // 가상 백분위 및 등급 (규준 기준 환산)
  let grade = 'B';
  let percentile = 50;
  if (totalAvg >= 4.2) { grade = 'S'; percentile = 95; }
  else if (totalAvg >= 3.8) { grade = 'A'; percentile = 82; }
  else if (totalAvg >= 3.5) { grade = 'B+'; percentile = 65; }
  else if (totalAvg >= 3.2) { grade = 'B'; percentile = 48; }
  else if (totalAvg >= 2.9) { grade = 'C+'; percentile = 35; }
  else if (totalAvg >= 2.5) { grade = 'C'; percentile = 20; }
  else { grade = 'D'; percentile = 8; }

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

  const performanceMetrics = {
    totalAverage: totalAvg,
    totalScorePercent: totalScore100,
    percentile: `${percentile}%`,
    grade,
    cultureStrength: cultureStrength?.label || '도전정신',
    cultureWeakness: cultureWeakness?.label || '고객중심',
    teamStrength: teamStrength?.label || '공동 목표 몰입 및 책임감',
    teamWeakness: teamWeakness?.label || '갈등 조율 및 적응성',
  };

  return {
    generatedAt: new Date().toISOString(),
    candidate,
    performanceMetrics,
    qualityAssessment: {
      tier: quality.tier,
      label: quality.label,
      guidance,
      caveats: formatCaveats(actualScoreResult?.flags || []),
      color: quality.color || (quality.tier === 'retest_recommended' ? 'red' : quality.tier === 'caution' ? 'amber' : 'green'),
    },
    // Culture-Fit 프로파일 & 강약점
    cultureFit: {
      profiles: cultureFitProfiles,
      strength: {
        domain: cultureStrength.label,
        score: cultureStrength.score,
        questions: cultureStrength.strengthQuestions || [],
      },
      weakness: {
        domain: cultureWeakness.label,
        score: cultureWeakness.score,
        questions: cultureWeakness.weaknessQuestions || [],
      },
    },
    // Team-Fit 프로파일 & 강약점
    teamFit: {
      profiles: teamFitProfiles,
      strength: {
        domain: teamStrength.label,
        score: teamStrength.score,
        questions: teamStrength.strengthQuestions || [],
      },
      weakness: {
        domain: teamWeakness.label,
        score: teamWeakness.score,
        questions: teamWeakness.weaknessQuestions || [],
      },
    },
    // 8대 응답 진정성 검사
    authenticityChecks,
    behaviorRatingScale: BEHAVIOR_RATING_SCALE,
    disclaimers: REPORT_DISCLAIMERS,
    // 하위 호환용 필드
    domainProfiles: cultureFitProfiles.map((p) => ({
      domain: p.domainName,
      definition: p.definition,
      score: { average: p.score, percentile: null },
      interpretation: getDomainInterpretation(p.score),
      interviewQuestion: p.strengthQuestions[0],
      probePoints: p.probePoints,
      noExperienceNote: false,
    })),
    supplementaryScales: Object.entries(SUPPLEMENTARY_DEFINITIONS).map(([domainKey, def]) => {
      const scoreData = domainScores[domainKey] || domainScores[def.label] || {};
      const average = typeof scoreData.average === 'number'
        ? scoreData.average
        : (scoreData.average != null && !isNaN(Number(scoreData.average)) ? Number(scoreData.average) : null);

      return {
        domain: domainKey,
        definition: def.definition,
        score: { average, percentile: null },
        interpretation: getDomainInterpretation(average),
        interviewQuestion: def.interviewQuestion,
        probePoints: Array.isArray(def.probePoints) ? [...def.probePoints] : [],
        noExperienceNote: Boolean(scoreData.noExperienceNote || scoreData.hasNoExperience || false),
        supplementary: true,
      };
    }),
    interviewerNotes: {
      template: [...INTERVIEWER_NOTES_TEMPLATE],
    },
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
    domains: cultureFitProfiles.map((p) => ({
      domainName: p.label,
      average: p.score,
      definition: p.definition,
      normMean: p.normMean,
      diffText: p.diffText,
      level: p.level,
      interviewQuestion: p.strengthQuestions[0],
      probePoints: p.probePoints,
    })),
  };
}
