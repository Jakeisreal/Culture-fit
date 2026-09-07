import { findResponseBySessionId, getSheetsClient } from '../../../lib/sheets.js';
import { getAssessmentDefinition, parseSessionNotes } from '../../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../../lib/item-selection.js';
import { calculateAssessmentScore } from '../../../lib/scoring.js';
import { classifyResponseQuality } from '../../../lib/response-quality.js';
import { generateInterviewReport } from '../../../lib/interview-report.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { withRetry } from '../../../lib/http.js';

function createHeaderMap(headers = []) {
  return headers.reduce((map, header, index) => {
    map[String(header || '').trim().toLowerCase()] = index;
    return map;
  }, {});
}

function getCell(row, headerMap, key, fallbackIndex) {
  const index = headerMap[key] ?? fallbackIndex;
  return row[index] ?? '';
}

/**
 * 시트의 모든 응시자 데이터를 바탕으로 실제 응시자 집단 통계(평균 및 백분위)를 계산
 */
async function computeCohortStats(spreadsheetId, currentCandidateAvg, currentSessionId) {
  try {
    const sheets = getSheetsClient();
    const readOptional = async (range) => {
      try {
        return await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range }));
      } catch {
        return { data: { values: [] } };
      }
    };

    const [v2BankRes, v2Res, v1Res] = await Promise.all([
      readOptional("'Responses_V2_Bank'"),
      readOptional("'Responses_V2'"),
      readOptional('Responses'),
    ]);

    const allRows = [
      ...(v2BankRes.data.values || []),
      ...(v2Res.data.values || []).slice(1),
      ...(v1Res.data.values || []).slice(1),
    ];

    if (allRows.length <= 1) return null;

    const headers = createHeaderMap(allRows[0]);
    const candidatesData = [];

    for (const row of allRows.slice(1)) {
      const sid = String(getCell(row, headers, 'sessionid', 0) || '').trim();
      const status = String(getCell(row, headers, 'status', 5) || '').trim().toUpperCase();
      const notesRaw = getCell(row, headers, 'notes', 11);
      const isCompleted = ['COMPLETED', '완료', 'DONE', 'SUBMITTED'].includes(status);
      const isInProgress = ['IN_PROGRESS', 'STARTED'].includes(status);

      if (!isCompleted && !isInProgress) continue;

      let domainScores = {};
      if (notesRaw) {
        try {
          const parsed = typeof notesRaw === 'string' ? JSON.parse(notesRaw) : notesRaw;
          if (parsed && parsed.domainScores) domainScores = parsed.domainScores;
        } catch {}
      }

      // 컬쳐 5대 영역
      const cultureKeys = ['원칙중시', '혁신성', '고객중심', '의사소통', '도전정신'];
      const cScores = {};
      let cSum = 0;
      let cCount = 0;
      for (const k of cultureKeys) {
        const val = domainScores[k]?.average;
        if (typeof val === 'number') {
          cScores[k] = val;
          cSum += val;
          cCount += 1;
        }
      }

      // 팀핏 4대 영역
      const teamMap = {
        '상호협력': ['상호 협력 및 지원', '상호협력'],
        '소통·피드백': ['피드백 수용 및 열린 소통', '소통·피드백', '피드백 수용'],
        '공동목표': ['공동 목표 몰입 및 책임감', '공동목표'],
        '갈등조율': ['갈등 조율 및 적응성', '갈등조율', '갈등 조율'],
      };
      const tScores = {};
      for (const [targetKey, aliases] of Object.entries(teamMap)) {
        for (const alias of aliases) {
          const val = domainScores[alias]?.average;
          if (typeof val === 'number') {
            tScores[targetKey] = val;
            break;
          }
        }
      }

      const totalAvg = cCount > 0 ? Number((cSum / cCount).toFixed(2)) : null;

      if (cCount >= 3 || isCompleted) {
        candidatesData.push({
          sessionId: sid,
          cScores,
          tScores,
          totalAvg: totalAvg || currentCandidateAvg || 3.3,
        });
      }
    }

    if (candidatesData.length === 0) return null;

    // 현재 지원자가 목록에 없으면 추가
    if (currentSessionId && !candidatesData.some((c) => c.sessionId === currentSessionId)) {
      candidatesData.push({
        sessionId: currentSessionId,
        cScores: {},
        tScores: {},
        totalAvg: currentCandidateAvg || 3.3,
      });
    }

    const cohortCount = candidatesData.length;

    // 1. 컬쳐 5대 영역 실제 평균 집계
    const cultureNormMeans = {};
    for (const k of ['원칙중시', '혁신성', '고객중심', '의사소통', '도전정신']) {
      const vals = candidatesData.map((c) => c.cScores[k]).filter((v) => typeof v === 'number');
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        cultureNormMeans[k] = Number((sum / vals.length).toFixed(2));
      }
    }

    // 2. 팀핏 4대 영역 실제 평균 집계
    const teamNormMeans = {};
    for (const k of ['상호협력', '소통·피드백', '공동목표', '갈등조율']) {
      const vals = candidatesData.map((c) => c.tScores[k]).filter((v) => typeof v === 'number');
      if (vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        teamNormMeans[k] = Number((sum / vals.length).toFixed(2));
      }
    }

    // 3. 실제 응시자 내 석차(Rank), 상위 누적 비율(Top Percent) 및 상대 등급(Grade) 산출
    const sortedAvgs = candidatesData.map((c) => c.totalAvg).sort((a, b) => b - a); // 내림차순 (1위가 첫 번째)
    const myScore = currentCandidateAvg || 3.3;

    // 자신보다 점수가 높은 응시자 수 (더 높은 점수 = 상위 석차)
    const betterCount = sortedAvgs.filter((s) => s > myScore).length;
    const sameCount = sortedAvgs.filter((s) => s === myScore).length;
    
    // 실제 석차 (동점자 감안 1위 ~ N위)
    const rank = betterCount + 1;
    
    // 상위 누적 퍼센트 (Top %: 1위에 가까울수록 숫자가 작음. 예: 1위 -> 상위 7%)
    const topPercent = Math.max(1, Math.min(99, Math.round(((betterCount + sameCount * 0.5) / cohortCount) * 100)));
    
    // 통계적 백분위수 (Percentile: 100 - 상위%)
    const percentile = 100 - topPercent;

    // 상대 등급 매핑 (상위 누적 기준: S 상위 10%, A 상위 30%, B+ 상위 50%, B 상위 70%, C+ 상위 90%, C 하위 10%)
    let grade = 'B';
    if (topPercent <= 10) grade = 'S';
    else if (topPercent <= 30) grade = 'A';
    else if (topPercent <= 50) grade = 'B+';
    else if (topPercent <= 70) grade = 'B';
    else if (topPercent <= 90) grade = 'C+';
    else grade = 'C';

    return {
      cohortCount,
      cultureNormMeans,
      teamNormMeans,
      rank,
      topPercent,
      percentile,
      grade,
    };
  } catch (err) {
    console.warn('응시자 집단 통계 집계 실패:', err);
    return null;
  }
}

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

    // 실제 응시자 집단 기반 통계(실제 평균 및 실제 백분위) 계산
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    const currentCandidateAvg = scoreResult.totalAverage;
    const cohortStats = spreadsheetId ? await computeCohortStats(spreadsheetId, currentCandidateAvg, record.sessionId) : null;

    const reportData = generateInterviewReport(sessionRecord, scoreResult, quality, cohortStats);

    return res.status(200).json({
      ok: true,
      report: reportData,
    });
  } catch (error) {
    console.error('리포트 조회 실패:', error);
    return res.status(500).json({ ok: false, message: '리포트 생성 중 오류가 발생했습니다: ' + error.message });
  }
}
