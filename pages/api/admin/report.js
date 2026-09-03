import { findResponseBySessionId } from '../../../lib/sheets.js';
import { getAssessmentDefinition, parseSessionNotes } from '../../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../../lib/item-selection.js';
import { calculateAssessmentScore } from '../../../lib/scoring.js';
import { classifyResponseQuality } from '../../../lib/response-quality.js';
import { generateInterviewReport } from '../../../lib/interview-report.js';
import { requireAdmin } from '../../../lib/admin-auth.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'GET 메서드만 지원합니다.' });
  }

  const { sessionId } = req.query;
  if (!sessionId) {
    return res.status(400).json({ ok: false, message: 'sessionId 파라미터가 필요합니다.' });
  }

  try {
    const record = await findResponseBySessionId(sessionId);
    if (!record) {
      return res.status(404).json({ ok: false, message: '응시 기록을 찾을 수 없습니다.' });
    }

    const sessionNotes = parseSessionNotes(record.notes);
    const assessmentVersion = sessionNotes.assessmentVersion || record.assessmentVersion || 'v2-bank-pilot';
    const definition = getAssessmentDefinition(assessmentVersion);
    
    const sessionItems = resolveSessionItems(
      definition.items,
      assessmentVersion,
      sessionId,
      sessionNotes.administeredItemIds
    );

    const rawRow = record.rawRow || [];
    let answers = {};
    
    // 1. rawRow의 13열 이후에서 답안 추출
    for (let i = 0; i < definition.items.length; i++) {
      const itemId = definition.items[i].item_id;
      const colIndex = 13 + i;
      const cellVal = rawRow[colIndex];
      if (cellVal !== undefined && cellVal !== '') {
        answers[itemId] = cellVal === 'N/E' ? 0 : cellVal;
      }
    }

    // 2. IN_PROGRESS 세션이거나 rawRow에 답안이 없는 경우 notes의 answers(임시저장 답안)에서 보강
    if (Object.keys(answers).length === 0 && sessionNotes.answers && typeof sessionNotes.answers === 'object') {
      answers = { ...sessionNotes.answers };
    }

    const meta = {
      assessmentVersion,
      items: sessionItems,
      timeSpent: Number(record.timeSpent) || 0,
      focusOutCount: Number(record.focusOutCount) || 0,
      now: record.startedAt ? new Date(record.startedAt) : new Date()
    };

    const scoreResult = calculateAssessmentScore(answers, meta);
    const sessionRecord = {
      sessionId: record.sessionId,
      name: record.name,
      email: record.email,
      startedAt: record.startedAt || record.rawRow[4],
      status: record.status,
      assessmentVersion,
    };
    const quality = classifyResponseQuality(
      scoreResult.flags,
      scoreResult.completionRate,
      scoreResult.answeredCount,
      scoreResult.totalItems,
    );
    const reportData = generateInterviewReport(sessionRecord, scoreResult, quality);

    return res.status(200).json({
      ok: true,
      report: reportData,
    });
  } catch (error) {
    console.error('리포트 조회 실패:', error);
    return res.status(500).json({ ok: false, message: '리포트 생성 중 오류가 발생했습니다: ' + error.message });
  }
}
