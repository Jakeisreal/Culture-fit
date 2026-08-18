// lib/response-quality.js

export const QUALITY_TIERS = {
  INTERPRETABLE: 'interpretable',
  CAUTION: 'caution',
  RETEST_RECOMMENDED: 'retest_recommended',
};

const QUALITY_TIER_CONFIG = {
  [QUALITY_TIERS.INTERPRETABLE]: {
    tier: 'interpretable',
    label: '해석 가능',
    description: '응답 품질에 중대한 문제가 발견되지 않아 검사 결과를 안정적으로 해석할 수 있습니다.',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
  },
  [QUALITY_TIERS.CAUTION]: {
    tier: 'caution',
    label: '주의하여 해석',
    description: '일부 응답 패턴에 주의가 필요하며, 면접을 통한 추가 확인 및 교차검증이 권장됩니다.',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
  },
  [QUALITY_TIERS.RETEST_RECOMMENDED]: {
    tier: 'retest_recommended',
    label: '재검사 권고',
    description: '응답 완성도가 낮거나 품질 요건을 충족하지 못하여 재검사를 권장합니다.',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
  },
};

const INTERVIEWER_GUIDANCE = {
  [QUALITY_TIERS.INTERPRETABLE]:
    '응답 품질에 중대한 문제가 발견되지 않았습니다. 프로파일을 일반적으로 해석할 수 있습니다.',
  [QUALITY_TIERS.CAUTION]:
    '일부 응답 패턴에 주의가 필요합니다. 면접에서 해당 영역의 행동 사례를 추가로 확인하고 다른 채용 자료와 교차검증하시기 바랍니다.',
  [QUALITY_TIERS.RETEST_RECOMMENDED]:
    '응답이 미완료되었거나 응답 품질에 상당한 문제가 감지되었습니다. 기술적 문제나 편의제공 필요 여부를 확인한 후 재검사를 검토하시기 바랍니다.',
};

/**
 * 면접관을 위한 3단계 응답 품질 등급 분류 함수
 *
 * @param {string[]|Set<string>} [flags=[]] 의심/품질 플래그 목록
 * @param {number} [completionRate] 응답 완료율 (0~1 또는 0~100)
 * @param {number} [answeredCount] 응답한 문항 수
 * @param {number} [totalItems] 전체 문항 수
 * @returns {{ tier: string, label: string, description: string, color: string, bgColor: string }}
 */
export function classifyResponseQuality(flags = [], completionRate, answeredCount, totalItems) {
  const flagList = Array.isArray(flags)
    ? flags
    : flags instanceof Set
      ? Array.from(flags)
      : typeof flags === 'string'
        ? [flags]
        : [];

  let effectiveRate = null;
  if (answeredCount != null && totalItems != null && Number(totalItems) > 0) {
    effectiveRate = Number(answeredCount) / Number(totalItems);
  } else if (completionRate != null && !isNaN(Number(completionRate))) {
    const num = Number(completionRate);
    effectiveRate = num > 1 ? num / 100 : num;
  }

  const isLowCompletion = effectiveRate != null && effectiveRate < 0.8;

  let maxImcFailed = 0;
  for (const flag of flagList) {
    if (typeof flag === 'string') {
      const match = flag.match(/^IMC_FAILED_(\d+)$/);
      if (match) {
        const count = parseInt(match[1], 10);
        if (!isNaN(count) && count > maxImcFailed) {
          maxImcFailed = count;
        }
      }
    }
  }

  const hasInconsistency = flagList.includes('RESPONSE_INCONSISTENCY_REVIEW');
  const hasUniform = flagList.includes('UNIFORM_RESPONSE');
  const hasInconsistencyAndUniform = hasInconsistency && hasUniform;
  const hasImcFailed3OrHigher = maxImcFailed >= 3;

  // 1. 재검사 권고 (retest_recommended) 판정
  if (isLowCompletion || hasImcFailed3OrHigher || hasInconsistencyAndUniform) {
    return { ...QUALITY_TIER_CONFIG[QUALITY_TIERS.RETEST_RECOMMENDED] };
  }

  // 2. 주의하여 해석 (caution) 판정
  const hasImcFailed1Or2 = maxImcFailed === 1 || maxImcFailed === 2;
  const cautionFlags = new Set([
    'FAST_RESPONSE',
    'UNIFORM_RESPONSE',
    'EXCESSIVE_FOCUS_OUT',
    'HIGH_RESPONSE_DISTORTION',
    'RESPONSE_INCONSISTENCY_REVIEW',
  ]);
  const hasCautionFlag = flagList.some((flag) => cautionFlags.has(flag));

  if (hasCautionFlag || hasImcFailed1Or2) {
    return { ...QUALITY_TIER_CONFIG[QUALITY_TIERS.CAUTION] };
  }

  // 3. 해석 가능 (interpretable) 기본값
  return { ...QUALITY_TIER_CONFIG[QUALITY_TIERS.INTERPRETABLE] };
}

/**
 * 응답 품질 등급별 면접관 가이드 텍스트 반환
 *
 * @param {string} tier 'interpretable' | 'caution' | 'retest_recommended'
 * @returns {string}
 */
export function getInterviewerGuidance(tier) {
  const normalizedTier = String(tier || '').toLowerCase();
  return INTERVIEWER_GUIDANCE[normalizedTier] || INTERVIEWER_GUIDANCE[QUALITY_TIERS.INTERPRETABLE];
}

/**
 * 관리자/면접관 UI를 위한 응답 품질 요약 편의 함수
 *
 * @param {string[]|Set<string>} [flags=[]]
 * @param {number} [answeredCount]
 * @param {number} [totalItems]
 * @returns {{ tier: string, label: string, color: string, bgColor: string, guidance: string }}
 */
export function formatQualityForAdmin(flags, answeredCount, totalItems) {
  const quality = classifyResponseQuality(flags, undefined, answeredCount, totalItems);
  const guidance = getInterviewerGuidance(quality.tier);

  return {
    tier: quality.tier,
    label: quality.label,
    color: quality.color,
    bgColor: quality.bgColor,
    guidance,
  };
}
