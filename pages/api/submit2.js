import {
  findCandidate,
  findResponseBySessionId,
  getSessionTelemetry,
  getSheetsClient,
  updateCandidateStatus,
} from '../../lib/sheets.js';
import { calculateAssessmentScore } from '../../lib/scoring.js';
import { withRetry } from '../../lib/http.js';
import { hasValidSession } from '../../lib/session-auth.js';
import { parseElapsedSeconds, parseKSTDate, validateTimeWindow } from '../../lib/time.js';
import { notifyCriticalError } from '../../lib/alerts.js';
import { isRateLimited } from '../../lib/rate-limit.js';
import {
  getAssessmentDefinition,
  LEGACY_ASSESSMENT_VERSION,
  parseSessionNotes,
} from '../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../lib/item-selection.js';

function formatTimeSpent(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getOrderedItemIds(items, assessmentVersion) {
  const ids = items.map(
    (item, index) => item.item_id || `I${String(index + 1).padStart(3, '0')}`,
  );
  if (assessmentVersion === LEGACY_ASSESSMENT_VERSION) {
    return ids.sort(
      (a, b) => Number(String(a).replace(/\D/g, '')) - Number(String(b).replace(/\D/g, '')),
    );
  }
  return ids;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 메서드만 사용할 수 있습니다.' });
  }

  try {
    const { sessionId, answers, focusOutCount = 0 } = req.body || {};
    if (!sessionId || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: '필수 정보가 누락되었습니다.' });
    }
    if (!hasValidSession(req, sessionId)) {
      return res.status(401).json({ success: false, message: '유효하지 않은 세션입니다.' });
    }
    if (isRateLimited(`submit:${sessionId}`, 10, 60000)) {
      return res.status(429).json({ success: false, message: '제출 요청이 너무 많습니다.' });
    }

    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ success: false, message: '시스템 설정 오류입니다.' });
    }

    const sessionRecord = await findResponseBySessionId(sessionId);
    if (!sessionRecord) {
      return res.status(404).json({ success: false, message: '응시 세션을 찾을 수 없습니다.' });
    }
    if (String(sessionRecord.status).toUpperCase() === 'COMPLETED') {
      try {
        await updateCandidateStatus(sessionRecord.email, 'COMPLETED');
      } catch (error) {
        console.warn('완료 상태 재조정 실패:', error);
      }
      return res.status(200).json({ success: true, message: '이미 제출이 완료되었습니다.', sessionId });
    }
    const sessionNotes = parseSessionNotes(sessionRecord.notes);
    const assessmentVersion = sessionNotes.assessmentVersion;
    const assessmentDefinition = getAssessmentDefinition(assessmentVersion);
    const selectedItems = resolveSessionItems(
      assessmentDefinition.items,
      assessmentVersion,
      sessionId,
      sessionNotes.administeredItemIds,
    );
    const timeLimitSeconds = assessmentDefinition.timeLimitSeconds;

    const startedAt = Date.parse(sessionRecord.startedAt);
    const candidate = await findCandidate(sessionRecord.email);
    if (!candidate) {
      return res.status(403).json({ success: false, message: '지원자 정보를 확인할 수 없습니다.' });
    }
    const timeWindow = validateTimeWindow(candidate.start_at, candidate.end_at);
    if (!timeWindow.valid) {
      const endAt = parseKSTDate(candidate.end_at);
      const withinCompletionGrace = (
        timeWindow.code === 'EXPIRED' &&
        endAt &&
        Number.isFinite(startedAt) &&
        startedAt <= endAt.getTime() &&
        Date.now() <= endAt.getTime() + timeLimitSeconds
      );
      if (!withinCompletionGrace) {
        return res.status(403).json({ success: false, message: timeWindow.message });
      }
    }

    const verifiedTimeSpent = Number.isFinite(startedAt)
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : parseElapsedSeconds(sessionRecord.timeSpent);

    let telemetry = { focusOutCount: 0, eventTypes: {} };
    try {
      telemetry = await getSessionTelemetry(sessionId);
    } catch (error) {
      console.warn('서버 텔레메트리 조회 실패:', error);
    }
    const verifiedFocusOutCount = Math.max(
      telemetry.focusOutCount,
      Number(sessionRecord.focusOutCount) || 0,
      Math.max(0, Math.min(10000, Number(focusOutCount) || 0)),
    );

    const bankItemIds = getOrderedItemIds(
      assessmentDefinition.items,
      assessmentVersion,
    );
    const totalQuestions = selectedItems.length;
    const scoreResult = calculateAssessmentScore(answers, {
      timeSpent: verifiedTimeSpent,
      focusOutCount: verifiedFocusOutCount,
      assessmentVersion,
      items: selectedItems,
    });
    const isForced = verifiedTimeSpent >= timeLimitSeconds;

    if (scoreResult.answeredCount < totalQuestions && !isForced) {
      return res.status(400).json({
        success: false,
        message: `미응답 문항 ${totalQuestions - scoreResult.answeredCount}개를 완료해 주세요.`,
      });
    }

    const completionRate = `${scoreResult.answeredCount}/${totalQuestions}`;
    const suspiciousFlags = scoreResult.flags || [];
    const orderedAnswers = bankItemIds.map(
      (id) => scoreResult.normalizedAnswers[id] ?? '',
    );
    const notesJson = JSON.stringify({
      assessmentVersion,
      administeredItemIds: selectedItems.map((item) => item.item_id),
      domainScores: scoreResult.domainScores,
      imcPassed: scoreResult.imcPassed,
      imcFailedCount: scoreResult.imcFailedCount,
      consistency: scoreResult.consistency,
      flags: suspiciousFlags,
      telemetry: telemetry.eventTypes,
    });
    const row = [
      sessionId,
      sessionRecord.name || '',
      sessionRecord.email || '',
      sessionRecord.phone || '',
      new Date().toISOString(),
      'COMPLETED',
      formatTimeSpent(verifiedTimeSpent),
      completionRate,
      verifiedFocusOutCount,
      isForced ? 'YES' : 'NO',
      suspiciousFlags.join(', '),
      notesJson,
      scoreResult.scoreSummaryText,
      ...orderedAnswers,
    ];

    const sheets = getSheetsClient();
    try {
      await withRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${sessionRecord.sheetName}'!A${sessionRecord.rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values: [row] },
      }));
      await updateCandidateStatus(sessionRecord.email, 'COMPLETED');
    } catch (error) {
      console.error('제출 저장 실패:', error);
      await notifyCriticalError('submission-save', error, { sessionId });
      return res.status(503).json({
        success: false,
        message: '데이터 저장에 실패했습니다. 응답은 기기에 보관되어 있으니 다시 시도해 주세요.',
        sessionId,
      });
    }

    return res.status(200).json({
      success: true,
      message: '제출이 완료되었습니다.',
      sessionId,
    });
  } catch (error) {
    console.error('Submit API 오류:', error);
    await notifyCriticalError('submit-api', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}
