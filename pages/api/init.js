// pages/api/init.js
import { randomUUID } from 'crypto';
import { 
  getSheetsClient, 
  findCandidate, 
  findResponseBySessionId,
  updateCandidateStatus, 
  appendResponse 
} from '../../lib/sheets.js';
import { getClientIp, withRetry } from '../../lib/http.js';
import { hasValidSession, setSessionCookie } from '../../lib/session-auth.js';
import { parseElapsedSeconds, validateTimeWindow } from '../../lib/time.js';
import { notifyCriticalError } from '../../lib/alerts.js';
import { isRateLimited } from '../../lib/rate-limit.js';
import {
  getAssessmentDefinition,
  getConfiguredAssessmentVersion,
  getResponseSheetName,
  getResponseSheetNames,
  parseSessionNotes,
} from '../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../lib/item-selection.js';

// 한글 이름 정규화 (공백, 대소문자 무시)
function normalizeName(name) {
  return String(name || '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

// 전화번호 정규화 (숫자만)
function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// KST → UTC 변환
// items_full.json load helpers
const MIN_CULTURE_FIT_GAP = 4;

function createSeededRandom(seed) {
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

const shuffleArray = (array, random = Math.random) => {
  const copied = Array.isArray(array) ? [...array] : [];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
};

export function arrangeQuestionsWithSpacing(items, random = Math.random) {
  if (!Array.isArray(items) || items.length <= 1) return items || [];

  const getGroupKey = (item) => String(item?.domain || item?.subdomain || item?.variable || 'DEFAULT');
  const isCultureFitVariable = (value) => String(value || '').toLowerCase() === 'culture-fit';

  const total = items.length;
  const domainGroups = items.reduce((acc, item) => {
    const key = getGroupKey(item);
    if (!acc[key]) {
      acc[key] = { items: [], isCultureFit: false };
    }
    acc[key].items.push(item);
    acc[key].isCultureFit = acc[key].isCultureFit || isCultureFitVariable(item.variable);
    return acc;
  }, {});

  const groupEntries = Object.entries(domainGroups).map(([key, group]) => ({
    key,
    items: shuffleArray(group.items, random),
    releaseStep: 0,
    minGap: group.isCultureFit ? MIN_CULTURE_FIT_GAP : 0,
    isCultureFit: group.isCultureFit,
  }));

  if (groupEntries.length <= 1) {
    return shuffleArray(groupEntries[0]?.items || items, random);
  }

  const maxGroupSize = Math.max(...groupEntries.map((entry) => entry.items.length));
  const diversityGap = Math.floor(groupEntries.length / 2);
  const densityGap = Math.max(0, Math.floor(total / maxGroupSize) - 1);
  const spacingGap = Math.max(2, Math.min(5, Math.max(diversityGap, densityGap)));

  const available = [...groupEntries];
  const cooling = [];
  const arranged = [];

  for (let step = 0; arranged.length < total; step += 1) {
    for (let i = cooling.length - 1; i >= 0; i -= 1) {
      if (cooling[i].releaseStep <= step) {
        available.push(cooling.splice(i, 1)[0]);
      }
    }

    if (available.length === 0) {
      if (cooling.length === 0) break;
      cooling.sort((a, b) => a.releaseStep - b.releaseStep);
      const next = cooling.shift();
      next.releaseStep = step;
      available.push(next);
    }

    available.sort((a, b) => b.items.length - a.items.length);
    const maxRemaining = available[0].items.length;
    let candidatePool = available.filter((entry) => entry.items.length === maxRemaining);

    const lastItem = arranged[arranged.length - 1];
    const lastWasCultureFit = isCultureFitVariable(lastItem?.variable);
    const lastDomainKey = lastWasCultureFit ? getGroupKey(lastItem) : null;

    if (lastDomainKey) {
      const filtered = candidatePool.filter((entry) => !(entry.isCultureFit && entry.key === lastDomainKey));
      if (filtered.length > 0) {
        candidatePool = filtered;
      }
    }

    const chosen = candidatePool[Math.floor(random() * candidatePool.length)];
    const chosenIndex = available.indexOf(chosen);
    available.splice(chosenIndex, 1);

    arranged.push(chosen.items.shift());

    if (chosen.items.length > 0) {
      const enforcedGap = Math.max(spacingGap, chosen.minGap || 0);
      chosen.releaseStep = step + enforcedGap;
      cooling.push(chosen);
    }
  }

  if (arranged.length < total) {
    const leftovers = available.concat(cooling).flatMap((entry) => entry.items);
    if (leftovers.length > 0) {
      return arranged.concat(shuffleArray(leftovers, random));
    }
  }

  return arranged;
}

export function insertConsistencyRepeats(arrangedItems, repeatItems) {
  const arranged = Array.isArray(arrangedItems) ? [...arrangedItems] : [];
  const repeats = Array.isArray(repeatItems) ? [...repeatItems] : [];
  if (arranged.length === 0 || repeats.length === 0) return arranged.concat(repeats);

  const insertionBuckets = new Map();
  const occupiedTargets = new Set();
  repeats.forEach((repeat) => {
    const anchorIndex = arranged.findIndex(
      (item) => item.consistency_pair_id === repeat.consistency_pair_id
        && item.consistency_role === 'anchor',
    );
    if (anchorIndex < 0) return;

    let targetIndex = (
      anchorIndex
      + Math.floor(arranged.length / 2)
    ) % arranged.length;
    while (occupiedTargets.has(targetIndex)) {
      targetIndex = (targetIndex + 1) % arranged.length;
    }
    occupiedTargets.add(targetIndex);
    if (!insertionBuckets.has(targetIndex)) insertionBuckets.set(targetIndex, []);
    insertionBuckets.get(targetIndex).push(repeat);
  });

  return arranged.flatMap((item, index) => [
    item,
    ...(insertionBuckets.get(index) || []),
  ]);
}


function loadQuestions(seed, assessmentVersion, administeredItemIds = []) {
  try {
    const definition = getAssessmentDefinition(assessmentVersion);
    const items = resolveSessionItems(
      definition.items,
      assessmentVersion,
      seed,
      administeredItemIds,
    );
    // 원본 아이디/변수 유지 후 셔플(같은 variable 연속 방지 시도)
    // Base normalization + advanced shuffle for better domain spacing
    const normalized = items.map((item, index) => ({
      item_id: item.item_id || `I${String(index + 1).padStart(3, '0')}`,
      text: String(item.text || item.item_text || item.question || `문항 ${index + 1}`),
      reverse: Boolean(item.reverse || item.is_reverse),
      domain: item.domain || null,
      subdomain: item.subdomain || null,
      variable: item.var || item.variable || null,
      response_scale: item.response_scale || 'agreement',
      score_group: item.score_group || null,
      consistency_pair_id: item.consistency_pair_id || null,
      consistency_role: item.consistency_role || null,
    }));
    const repeats = normalized.filter((item) => item.score_group === 'consistency');
    const scoredItems = normalized.filter((item) => item.score_group !== 'consistency');
    const arranged = arrangeQuestionsWithSpacing(scoredItems, createSeededRandom(seed));
    const shuffled = insertConsistencyRepeats(arranged, repeats);
    return {
      administeredItemIds: items.map((item) => item.item_id),
      questions: shuffled.map((it) => ({
        id: it.item_id,
        text: it.text,
        responseScale: it.response_scale || 'agreement',
      })),
    };
  } catch (error) {
    console.error('문항 로드 실패:', error);
    return { administeredItemIds: [], questions: [] };
  }
}

// 세션 복구
async function restoreSession(sheets, spreadsheetId, sessionId) {
  try {
    const record = await findResponseBySessionId(sessionId);
    if (!record) {
      throw new Error('유효하지 않은 세션입니다.');
    }

    const sessionNotes = parseSessionNotes(record.notes);
    let savedAnswers = {};
    let draftVersion = 0;
    if (sessionNotes?.answers && typeof sessionNotes.answers === 'object') {
      savedAnswers = sessionNotes.answers;
      draftVersion = Number(sessionNotes.draftVersion) || 0;
    } else {
      const validItemIds = new Set(
        getAssessmentDefinition(sessionNotes.assessmentVersion).items.map(
          (item) => item.item_id,
        ),
      );
      savedAnswers = Object.fromEntries(
        Object.entries(sessionNotes).filter(([key, value]) => (
          validItemIds.has(key) && Number.isInteger(Number(value))
        )),
      );
    }
    
    return {
      sessionId,
      name: record.name || '',
      email: record.email || '',
      phone: record.phone || '',
      status: record.status || 'STARTED',
      focusOutCount: record.focusOutCount ? Number(record.focusOutCount) : 0,
      timeSpent: parseElapsedSeconds(record.timeSpent),
      savedAnswers,
      draftVersion,
      assessmentVersion: sessionNotes.assessmentVersion,
      administeredItemIds: sessionNotes.administeredItemIds || [],
    };
  } catch (error) {
    throw new Error('세션 복구에 실패했습니다.');
  }
}

// 중복 응시 체크
async function checkDuplicateResponse(sheets, spreadsheetId, email, assessmentVersion) {
  let hasCompleted = false;
  let lastStartedAt = null;
  let lastSessionId = null;

  const targetSheetName = getResponseSheetName(assessmentVersion);
  for (const sheetName of getResponseSheetNames().filter(
    (name) => name === targetSheetName,
  )) {
    let rows = [];
    try {
      const response = await withRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:F`
      }));
      rows = response.data.values || [];
    } catch (error) {
      if (sheetName === 'Responses') throw error;
      continue;
    }
    for (let i = 1; i < rows.length; i++) {
      const [sid, name, em, phone, timestamp, status] = rows[i];
      const rowEmail = String(em || '').trim().toLowerCase();
      const targetEmail = String(email || '').trim().toLowerCase();

      if (rowEmail === targetEmail) {
        if (String(status || '').toUpperCase() === 'COMPLETED') {
          hasCompleted = true;
        }
        if (['STARTED', 'IN_PROGRESS'].includes(String(status || '').toUpperCase())) {
          const time = Date.parse(timestamp);
          if (!isNaN(time) && (!lastStartedAt || time > lastStartedAt)) {
            lastStartedAt = time;
            lastSessionId = sid;
          }
        }
      }
    }
  }
  return { hasCompleted, lastStartedAt, lastSessionId };
}

// ============= 메인 핸들러 =============
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'POST 메서드만 허용됩니다.' 
    });
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(`init:${clientIp}`, 10, 60000)) {
    return res.status(429).json({
      success: false,
      message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
    });
  }

  try {
    const { name, email, phone, sessionId } = req.body || {};
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return res.status(500).json({
        success: false,
        message: '시스템 설정 오류입니다. 관리자에게 문의하세요.'
      });
    }

    // ===== 세션 복구 =====
    if (sessionId) {
      try {
        if (!hasValidSession(req, sessionId)) {
          return res.status(401).json({
            success: false,
            message: '세션 인증이 만료되었습니다. 지원자 정보를 다시 입력해 주세요.',
          });
        }
        const session = await restoreSession(sheets, spreadsheetId, sessionId);
        if (String(session.status).toUpperCase() === 'COMPLETED') {
          setSessionCookie(res, session.sessionId);
          return res.status(200).json({
            success: true,
            sessionId: session.sessionId,
            completed: true,
            message: '이미 제출이 완료되었습니다.',
          });
        }
        const definition = getAssessmentDefinition(session.assessmentVersion);
        const loaded = loadQuestions(
          session.sessionId,
          session.assessmentVersion,
          session.administeredItemIds,
        );
        const questions = loaded.questions;
        
        if (questions.length === 0) {
          return res.status(500).json({
            success: false,
            message: '문항 데이터를 불러올 수 없습니다.'
          });
        }
        
        setSessionCookie(res, session.sessionId);
        return res.status(200).json({
          success: true,
          sessionId: session.sessionId,
          questions,
          savedAnswers: session.savedAnswers || {},
          focusOutCount: session.focusOutCount || 0,
          timeSpent: session.timeSpent || 0,
          draftVersion: session.draftVersion || 0,
          assessmentVersion: session.assessmentVersion,
          administeredItemIds: loaded.administeredItemIds,
          timeLimitSeconds: definition.timeLimitSeconds,
          authData: { name: session.name, email: session.email, phone: session.phone },
          message: '세션이 복구되었습니다.'
        });
      } catch (error) {
        return res.status(200).json({
          success: false,
          message: error.message || '세션 복구에 실패했습니다.'
        });
      }
    }


    // ===== 새 세션 생성 =====
    
    // 1. 필수 정보 검증
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(200).json({ 
        success: false, 
        message: '이름, 이메일, 전화번호를 모두 입력해주세요.' 
      });
    }

    // 2. 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(200).json({ 
        success: false, 
        message: '올바른 이메일 형식을 입력해주세요.' 
      });
    }

    // 3. 후보자 확인
    let candidate;
    try {
      candidate = await findCandidate(email);
      
      if (!candidate) {
        return res.status(200).json({ 
          success: false, 
          message: '입력한 정보와 등록 정보가 일치하지 않습니다.'
        });
      }

      // 이름 검증
      if (normalizeName(candidate.name) !== normalizeName(name)) {
        return res.status(200).json({ 
          success: false, 
          message: '입력한 정보와 등록 정보가 일치하지 않습니다.'
        });
      }

      // 전화번호 검증
      if (normalizePhone(candidate.phone) !== normalizePhone(phone)) {
        return res.status(200).json({ 
          success: false, 
          message: '입력한 정보와 등록 정보가 일치하지 않습니다.'
        });
      }

      // 허용 여부 검증
      if (String(candidate.allow).toLowerCase() !== 'true') {
        return res.status(200).json({ 
          success: false, 
          message: '응시 허용 대상이 아닙니다.\n담당자에게 문의하세요.' 
        });
      }

      // 시간 윈도우 검증
      const timeCheck = validateTimeWindow(candidate.start_at, candidate.end_at);
      if (!timeCheck.valid) {
        return res.status(200).json({ 
          success: false, 
          message: timeCheck.message, 
          code: timeCheck.code 
        });
      }

      // 이미 완료한 경우
      if (String(candidate.status).toUpperCase() === 'COMPLETED') {
        return res.status(200).json({ 
          success: false, 
          message: '이미 검사를 완료하셨습니다.\n재응시는 담당자에게 문의하세요.' 
        });
      }

    } catch (error) {
      console.error('후보자 확인 오류:', error);
      return res.status(200).json({ 
        success: false, 
        message: '후보자 정보 확인 중 오류가 발생했습니다.' 
      });
    }

    // 4. 중복 응시 체크 (24시간 제한)
    const assessmentVersion = getConfiguredAssessmentVersion();
    const duplicateCheck = await checkDuplicateResponse(
      sheets,
      spreadsheetId,
      email,
      assessmentVersion,
    );
    
    if (duplicateCheck.hasCompleted) {
      return res.status(200).json({ 
        success: false, 
        message: '이미 검사를 완료하셨습니다.' 
      });
    }
    
    if (duplicateCheck.lastStartedAt) {
      const hoursSinceStart = (Date.now() - duplicateCheck.lastStartedAt) / (1000 * 60 * 60);
      if (hoursSinceStart < 6 && duplicateCheck.lastSessionId) {
        const session = await restoreSession(sheets, spreadsheetId, duplicateCheck.lastSessionId);
        const definition = getAssessmentDefinition(session.assessmentVersion);
        const loaded = loadQuestions(
          session.sessionId,
          session.assessmentVersion,
          session.administeredItemIds,
        );
        const questions = loaded.questions;
        setSessionCookie(res, session.sessionId);
        return res.status(200).json({
          success: true,
          sessionId: session.sessionId,
          questions,
          savedAnswers: session.savedAnswers || {},
          focusOutCount: session.focusOutCount || 0,
          timeSpent: session.timeSpent || 0,
          draftVersion: session.draftVersion || 0,
          assessmentVersion: session.assessmentVersion,
          administeredItemIds: loaded.administeredItemIds,
          timeLimitSeconds: definition.timeLimitSeconds,
          authData: { name: session.name, email: session.email, phone: session.phone },
          restored: true,
          message: '진행 중인 검사를 복구했습니다.',
        });
      }
    }

    const newSessionId = randomUUID().replace(/-/g, '');
    const assessmentDefinition = getAssessmentDefinition(assessmentVersion);

    // 5. 문항 로드
    const loaded = loadQuestions(newSessionId, assessmentVersion);
    const questions = loaded.questions;
    if (questions.length === 0) {
      return res.status(500).json({
        success: false,
        message: '문항 데이터를 불러올 수 없습니다.\n관리자에게 문의하세요.'
      });
    }

    // 6. 세션 생성 & 초기 데이터 저장
    const startedAt = new Date().toISOString();

    try {
      await appendResponse({
        sessionId: newSessionId, 
        name, 
        email, 
        phone, 
        timestamp: startedAt, 
        status: 'STARTED',
        assessmentVersion,
        notes: JSON.stringify({
          assessmentVersion,
          administeredItemIds: loaded.administeredItemIds,
        }),
      });
      await updateCandidateStatus(email, 'STARTED', startedAt);
    } catch (error) {
      console.error('세션 초기 저장 실패:', error);
      await notifyCriticalError('session-init', error);
      return res.status(503).json({
        success: false,
        message: '검사 세션을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    // 7. 성공 응답
    setSessionCookie(res, newSessionId);
    return res.status(200).json({
      success: true,
      sessionId: newSessionId,
      questions,
      assessmentVersion,
      administeredItemIds: loaded.administeredItemIds,
      timeLimitSeconds: assessmentDefinition.timeLimitSeconds,
      window: { 
        start_at: candidate.start_at, 
        end_at: candidate.end_at 
      },
      message: '검사가 시작되었습니다.'
    });

  } catch (error) {
    console.error('Init API 오류:', error);
    await notifyCriticalError('init-api', error);
    return res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.' 
    });
  }
}
