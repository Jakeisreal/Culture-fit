import fs from 'node:fs';
import path from 'node:path';

export const LEGACY_ASSESSMENT_VERSION = 'v1';
export const BANK_ASSESSMENT_VERSION = 'v2-bank-pilot';
export const DEFAULT_ASSESSMENT_VERSION = BANK_ASSESSMENT_VERSION;

const DEFINITIONS = {
  v1: {
    version: 'v1',
    label: 'Culture Fit V1',
    itemFile: 'items_full.json',
    responseSheet: 'Responses',
    timeLimitSeconds: 25 * 60,
  },
  'v2-pilot': {
    version: 'v2-pilot',
    label: 'Culture Fit V2 Pilot',
    itemFile: 'items_v2_192.json',
    responseSheet: 'Responses_V2',
    timeLimitSeconds: 25 * 60,
  },
  'v2-bank-pilot': {
    version: 'v2-bank-pilot',
    label: 'Culture Fit V2 Bank Pilot',
    itemFile: 'items_v2.json',
    responseSheet: 'Responses_V2_Bank',
    timeLimitSeconds: 25 * 60,
  },
};

const itemCache = new Map();

export function normalizeAssessmentVersion(value, fallback = DEFAULT_ASSESSMENT_VERSION) {
  const normalized = String(value || '').trim().toLowerCase();
  if (DEFINITIONS[normalized]) return normalized;
  return DEFINITIONS[fallback] ? fallback : DEFAULT_ASSESSMENT_VERSION;
}

export function getConfiguredAssessmentVersion() {
  return normalizeAssessmentVersion(process.env.ASSESSMENT_VERSION);
}

export function getAssessmentDefinition(version = getConfiguredAssessmentVersion()) {
  const normalized = normalizeAssessmentVersion(version);
  const definition = DEFINITIONS[normalized];
  if (!itemCache.has(normalized)) {
    const filePath = path.join(process.cwd(), 'data', definition.itemFile);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`${definition.itemFile} 문항 데이터가 비어 있습니다.`);
    }
    itemCache.set(normalized, parsed);
  }
  return {
    ...definition,
    items: itemCache.get(normalized),
  };
}

export function parseSessionNotes(notes, fallbackVersion = LEGACY_ASSESSMENT_VERSION) {
  let parsed = {};
  try {
    parsed = typeof notes === 'string' ? JSON.parse(notes || '{}') : (notes || {});
  } catch {}
  return {
    ...parsed,
    assessmentVersion: normalizeAssessmentVersion(
      parsed.assessmentVersion,
      fallbackVersion,
    ),
  };
}

export function getResponseSheetNames() {
  return Object.values(DEFINITIONS).map((definition) => definition.responseSheet);
}

export function getResponseSheetName(version) {
  return getAssessmentDefinition(version).responseSheet;
}

export function getResponseHeaders(version) {
  const definition = getAssessmentDefinition(version);
  return [
    'Session ID',
    'Name',
    'Email',
    'Phone',
    'Timestamp',
    'Status',
    'Time Spent',
    'Completion',
    'Focus Out Count',
    'Forced Submit',
    'Pattern Warning',
    'Notes',
    'Score',
    ...definition.items.map((item) => item.item_id),
  ];
}

export function clearAssessmentCache() {
  itemCache.clear();
}
