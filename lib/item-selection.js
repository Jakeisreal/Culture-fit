import { BANK_ASSESSMENT_VERSION } from './assessment-versions.js';

export const V2_ADMINISTERED_ITEM_COUNT = 230;

const CORE_DOMAINS = ['원칙중시', '혁신성', '고객중심', '의사소통', '도전정신'];
const DOMAIN_QUOTAS = {
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
};

export function createSeededRandom(seed) {
  let state = Array.from(String(seed || 'culture-fit')).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleItems(items, random) {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copied[index], copied[swapIndex]] = [copied[swapIndex], copied[index]];
  }
  return copied;
}

function selectDomainItems(items, domain, quota, random) {
  const candidates = items.filter(
    (item) => item.domain === domain && item.score_group !== 'consistency',
  );
  const required = CORE_DOMAINS.includes(domain)
    ? candidates.filter((item) => item.consistency_role === 'anchor')
    : [];
  if (required.length > quota) {
    throw new Error(`${domain} 필수 일관성 원문항이 선별 수보다 많습니다.`);
  }
  const requiredIds = new Set(required.map((item) => item.item_id));
  const optional = candidates.filter((item) => !requiredIds.has(item.item_id));
  if (required.length + optional.length < quota) {
    throw new Error(`${domain} 문항은행이 선별 수 ${quota}보다 작습니다.`);
  }
  return required.concat(shuffleItems(optional, random).slice(0, quota - required.length));
}

export function selectAssessmentItems(items, assessmentVersion, seed) {
  if (assessmentVersion !== BANK_ASSESSMENT_VERSION) return [...items];
  const random = createSeededRandom(`selection:${seed}`);
  const selected = [];

  for (const [domain, quota] of Object.entries(DOMAIN_QUOTAS)) {
    selected.push(...selectDomainItems(items, domain, quota, random));
  }
  selected.push(...items.filter((item) => item.score_group === 'consistency'));
  selected.push(...items.filter((item) => item.score_group === 'imc'));

  const uniqueIds = new Set(selected.map((item) => item.item_id));
  if (selected.length !== V2_ADMINISTERED_ITEM_COUNT || uniqueIds.size !== selected.length) {
    throw new Error(
      `V2 선별 결과가 올바르지 않습니다: ${selected.length}/${uniqueIds.size}`,
    );
  }
  return selected;
}

export function resolveSessionItems(
  bankItems,
  assessmentVersion,
  sessionId,
  administeredItemIds = [],
) {
  if (Array.isArray(administeredItemIds) && administeredItemIds.length > 0) {
    const itemMap = new Map(bankItems.map((item) => [item.item_id, item]));
    const restored = administeredItemIds.map((itemId) => itemMap.get(itemId)).filter(Boolean);
    if (restored.length === administeredItemIds.length) return restored;
  }
  return selectAssessmentItems(bankItems, assessmentVersion, sessionId);
}

export function summarizeSelection(items) {
  return items.reduce((summary, item) => {
    const key = item.score_group === 'core' ? item.domain : item.domain;
    summary[key] = (summary[key] || 0) + 1;
    return summary;
  }, {});
}
