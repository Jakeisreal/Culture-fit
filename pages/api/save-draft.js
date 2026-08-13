// pages/api/save-draft.js
import { findResponseBySessionId, updateResponseDraft } from '../../lib/sheets.js';
import { normalizeAnswers } from '../../lib/scoring.js';
import { hasValidSession } from '../../lib/session-auth.js';
import { isRateLimited } from '../../lib/rate-limit.js';
import {
  getAssessmentDefinition,
  parseSessionNotes,
} from '../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../lib/item-selection.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 메서드만 허용됩니다.' });
  }

  try {
    const {
      sessionId,
      answers,
      focusOutCount = 0,
      timeSpent = 0,
      draftVersion = 0,
    } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'sessionId는 필수입니다.' });
    }

    if (!hasValidSession(req, sessionId)) {
      return res.status(401).json({ success: false, message: '유효하지 않은 세션입니다.' });
    }
    if (isRateLimited(`draft:${sessionId}`, 30, 60000)) {
      return res.status(429).json({ success: false, message: '임시 저장 요청이 너무 많습니다.' });
    }

    const record = await findResponseBySessionId(sessionId);
    if (!record || String(record.status).toUpperCase() === 'COMPLETED') {
      return res.status(409).json({ success: false, message: '저장할 수 없는 세션입니다.' });
    }

    const sessionNotes = parseSessionNotes(record.notes);
    const assessmentVersion = sessionNotes.assessmentVersion;
    const selectedItems = resolveSessionItems(
      getAssessmentDefinition(assessmentVersion).items,
      assessmentVersion,
      sessionId,
      sessionNotes.administeredItemIds,
    );
    const savedDraftVersion = Number(sessionNotes.draftVersion) || 0;
    const safeDraftVersion = Math.max(0, Number(draftVersion) || 0);
    if (safeDraftVersion <= savedDraftVersion) {
      return res.status(200).json({ success: true, stale: true, message: '최신 임시 저장이 이미 반영되었습니다.' });
    }

    const normalized = normalizeAnswers(
      answers,
      selectedItems,
    );
    const startedAt = Date.parse(record.startedAt);
    const verifiedTimeSpent = Number.isFinite(startedAt)
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : Math.max(0, Number(timeSpent) || 0);
    const safeFocusOutCount = Math.max(0, Math.min(10000, Number(focusOutCount) || 0));

    const ok = await updateResponseDraft(
      sessionId,
      normalized.answers,
      safeFocusOutCount,
      verifiedTimeSpent,
      safeDraftVersion,
      assessmentVersion,
    );
    if (!ok) {
      return res.status(200).json({ success: false, message: '세션을 찾을 수 없거나 임시 저장에 실패했습니다.' });
    }

    return res.status(200).json({ success: true, message: '임시 저장 완료' });
  } catch (error) {
    console.error('Save Draft API 오류:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}
