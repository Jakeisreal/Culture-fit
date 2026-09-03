import { getSheetsClient } from '../../../lib/sheets.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { withRetry } from '../../../lib/http.js';
import { formatQualityForAdmin, classifyResponseQuality } from '../../../lib/response-quality.js';
import { getAssessmentDefinition, parseSessionNotes } from '../../../lib/assessment-versions.js';
import { resolveSessionItems } from '../../../lib/item-selection.js';
import { calculateAssessmentScore } from '../../../lib/scoring.js';
import { generateInterviewReport } from '../../../lib/interview-report.js';

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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'GET 메서드만 사용할 수 있습니다.' });
  }

  try {
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ ok: false, message: 'SHEET_ID가 설정되지 않았습니다.' });
    }

    const sheets = getSheetsClient();
    const read = (range) => withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId, range }));
    const readOptional = async (range) => {
      try {
        return await read(range);
      } catch (err) {
        console.warn(`시트 범위 읽기 실패 (${range}):`, err.message);
        return { data: { values: [] } };
      }
    };

    // 시트 이름 자체를 넘겨 실제 존재하는 모든 열/행을 안전하게 조회
    const [candidateResult, responseV1Result, responseV2Result, responseV2BankResult] = await Promise.all([
      readOptional('Candidates'),
      readOptional('Responses'),
      readOptional("'Responses_V2'"),
      readOptional("'Responses_V2_Bank'"),
    ]);

    const candidateRows = candidateResult.data.values || [];
    const candidateHeaders = createHeaderMap(candidateRows[0]);

    const candidates = candidateRows.slice(1).map((row) => ({
      name: String(getCell(row, candidateHeaders, 'name', 0)),
      email: String(getCell(row, candidateHeaders, 'email', 1)),
      status: String(getCell(row, candidateHeaders, 'status', 6)).trim().toUpperCase(),
      allowed: String(getCell(row, candidateHeaders, 'allow', 3)).trim().toLowerCase() === 'true',
    }));

    const parseResponses = (rows, defaultVersion) => {
      if (!Array.isArray(rows) || rows.length <= 1) return [];
      const responseHeaders = createHeaderMap(rows[0]);

      return rows.slice(1).map((row) => {
        const rawFlags = getCell(row, responseHeaders, 'suspicious', 10);
        const flags = String(rawFlags || '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        const completionRateStr = getCell(row, responseHeaders, 'completionrate', 7);
        const [answeredStr, totalStr] = String(completionRateStr || '').split('/');
        const answeredCount = parseInt(answeredStr, 10) || 0;
        const totalItems = parseInt(totalStr, 10) || 0;
        const quality = formatQualityForAdmin(flags, answeredCount, totalItems);

        const sessionId = String(getCell(row, responseHeaders, 'sessionid', 0) || '').trim();
        const name = String(getCell(row, responseHeaders, 'name', 1) || '').trim();
        const email = String(getCell(row, responseHeaders, 'email', 2) || '').trim();
        const phone = String(getCell(row, responseHeaders, 'phone', 3) || '').trim();
        const timestamp = String(getCell(row, responseHeaders, 'timestamp', 4) || '').trim();
        const statusRaw = String(getCell(row, responseHeaders, 'status', 5) || '').trim().toUpperCase();
        const timeSpentRaw = getCell(row, responseHeaders, 'timespent', 6);
        const focusOutCountRaw = getCell(row, responseHeaders, 'focusoutcount', 8);
        const notesRaw = getCell(row, responseHeaders, 'notes', 11);
        const scoreRaw = getCell(row, responseHeaders, 'score', 12);

        return {
          sessionId,
          name,
          email,
          phone,
          timestamp,
          status: statusRaw,
          timeSpent: timeSpentRaw,
          focusOutCount: Number(focusOutCountRaw) || 0,
          completionRate: completionRateStr,
          suspicious: rawFlags,
          responseQuality: quality,
          score: scoreRaw,
          assessmentVersion: defaultVersion,
          notes: notesRaw,
          rawRow: row,
        };
      }).filter((row) => row.sessionId || row.email || row.name);
    };

    const allResponses = [
      ...parseResponses(responseV2BankResult.data.values || [], 'v2-bank-pilot'),
      ...parseResponses(responseV2Result.data.values || [], 'v2-pilot'),
      ...parseResponses(responseV1Result.data.values || [], 'v1'),
    ];

    // 응시자 목록 추출 (COMPLETED 완료자 + IN_PROGRESS 임시저장 답안 보유자)
    const completedCandidates = [];
    for (const record of allResponses) {
      const isCompleted = ['COMPLETED', '완료', 'DONE', 'SUBMITTED'].includes(record.status);
      const isInProgress = ['IN_PROGRESS', 'STARTED'].includes(record.status);
      
      // 완전히 아무것도 안 푼 미응시는 제외하되, COMPLETED이거나 IN_PROGRESS(임시저장/소요시간 있음)인 경우 포함
      if (!isCompleted && !isInProgress) continue;

      try {
        const sessionNotes = parseSessionNotes(record.notes, record.assessmentVersion);
        const assessmentVersion = sessionNotes.assessmentVersion || record.assessmentVersion || 'v2-bank-pilot';
        const definition = getAssessmentDefinition(assessmentVersion);

        const sessionItems = resolveSessionItems(
          definition.items,
          assessmentVersion,
          record.sessionId,
          sessionNotes.administeredItemIds
        );

        // 답안 추출 (rawRow 또는 notes.answers)
        const rawRow = record.rawRow || [];
        let answers = {};
        for (let i = 0; i < definition.items.length; i++) {
          const itemId = definition.items[i].item_id;
          const colIndex = 13 + i;
          const cellVal = rawRow[colIndex];
          if (cellVal !== undefined && cellVal !== '') {
            answers[itemId] = cellVal === 'N/E' ? 0 : cellVal;
          }
        }

        if (Object.keys(answers).length === 0 && sessionNotes.answers && typeof sessionNotes.answers === 'object') {
          answers = { ...sessionNotes.answers };
        }

        // 응답 답안 수가 0개이고 소요시간도 없으면(단순 접속 후 즉시 나감) 제외
        const answerCount = Object.keys(answers).length;
        if (!isCompleted && answerCount === 0 && (!record.timeSpent || record.timeSpent === '0')) {
          continue;
        }

        // 시간 파싱 (초)
        let verifiedTimeSpent = 0;
        if (typeof record.timeSpent === 'string' && record.timeSpent.includes(':')) {
          const parts = record.timeSpent.split(':').map(Number);
          verifiedTimeSpent = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
        } else if (Number(record.timeSpent)) {
          verifiedTimeSpent = Number(record.timeSpent);
        }

        const meta = {
          assessmentVersion,
          items: sessionItems,
          timeSpent: verifiedTimeSpent,
          focusOutCount: record.focusOutCount,
          now: record.timestamp ? new Date(record.timestamp) : new Date(),
        };

        const scoreResult = calculateAssessmentScore(answers, meta);
        const quality = classifyResponseQuality(
          scoreResult.flags,
          scoreResult.completionRate,
          scoreResult.answeredCount,
          scoreResult.totalItems
        );
        const report = generateInterviewReport(
          {
            sessionId: record.sessionId,
            name: record.name,
            email: record.email,
            startedAt: record.timestamp,
            status: record.status,
            assessmentVersion,
          },
          scoreResult,
          quality
        );

        const domainScores = scoreResult.domainScores || {};
        const sdsAvg = domainScores['반응왜곡(사회적바람직성)']?.average ?? null;
        const imAvg = domainScores['반응왜곡(인상관리)']?.average ?? null;
        const sdeAvg = domainScores['반응왜곡(자기기만)']?.average ?? null;
        const cwbAvg = domainScores['역기능행동(CWB)']?.average ?? null;

        const hasWarning =
          (sdsAvg != null && sdsAvg >= 4.2) ||
          (imAvg != null && imAvg >= 4.0) ||
          (sdeAvg != null && sdeAvg >= 4.2) ||
          (cwbAvg != null && cwbAvg < 2.8) ||
          scoreResult.imcFailedCount > 0 ||
          (scoreResult.consistency?.largeDifferencePairs || 0) >= 4 ||
          quality.tier !== 'interpretable';

        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
          status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
          completionRate: isCompleted ? '250/250' : `${scoreResult.answeredCount}/250 (임시저장)`,
          timeSpentMinutes: Math.round(verifiedTimeSpent / 60),
          totalScore: report.performanceMetrics?.totalScorePercent ?? Math.round(Number(record.score) || 0),
          totalAverage: report.performanceMetrics?.totalAverage ?? null,
          grade: report.performanceMetrics?.grade ?? '-',
          percentile: report.performanceMetrics?.percentile ?? '-',
          cultureStrength: report.cultureFit?.strength?.domain ?? '-',
          cultureWeakness: report.cultureFit?.weakness?.domain ?? '-',
          teamStrength: report.teamFit?.strength?.domain ?? '-',
          teamWeakness: report.teamFit?.weakness?.domain ?? '-',
          sdsAvg: typeof sdsAvg === 'number' ? Number(sdsAvg.toFixed(2)) : null,
          imAvg: typeof imAvg === 'number' ? Number(imAvg.toFixed(2)) : null,
          sdeAvg: typeof sdeAvg === 'number' ? Number(sdeAvg.toFixed(2)) : null,
          cwbAvg: typeof cwbAvg === 'number' ? Number(cwbAvg.toFixed(2)) : null,
          imcFailedCount: scoreResult.imcFailedCount || 0,
          repeatDiffPairs: scoreResult.consistency?.largeDifferencePairs || 0,
          qualityTier: quality.tier,
          qualityLabel: quality.label,
          hasAuthenticityWarning: hasWarning,
        });
      } catch (calcError) {
        console.error('응시자 세부 계산 오류:', record.name, calcError);
        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
          status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
          completionRate: record.completionRate || (isCompleted ? '250/250' : '진행중'),
          timeSpentMinutes: 0,
          totalScore: null,
          totalAverage: null,
          grade: '-',
          percentile: '-',
          cultureStrength: '-',
          cultureWeakness: '-',
          teamStrength: '-',
          teamWeakness: '-',
          sdsAvg: null,
          imAvg: null,
          sdeAvg: null,
          cwbAvg: null,
          imcFailedCount: 0,
          repeatDiffPairs: 0,
          qualityTier: 'interpretable',
          qualityLabel: '해석 가능',
          hasAuthenticityWarning: false,
        });
      }
    }

    // 동일 이메일이 여러 개 있는 경우 최신 세션 우선 유지
    const candidateMap = new Map();
    for (const c of completedCandidates) {
      const key = String(c.email || c.sessionId).toLowerCase();
      const prev = candidateMap.get(key);
      if (!prev) {
        candidateMap.set(key, c);
      } else {
        // COMPLETED 우선, 둘 다 같으면 최신 시각 우선
        if (c.status === 'COMPLETED' && prev.status !== 'COMPLETED') {
          candidateMap.set(key, c);
        } else if (c.status === prev.status && (Date.parse(c.timestamp) || 0) > (Date.parse(prev.timestamp) || 0)) {
          candidateMap.set(key, c);
        }
      }
    }
    const finalCandidates = [...candidateMap.values()];

    // 최신 응시일시 기준 정렬
    finalCandidates.sort(
      (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
    );

    const recent = [...allResponses]
      .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
      .slice(0, 30)
      .map(({ rawRow, notes, ...rest }) => rest);

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCandidates: candidates.length,
        allowedCandidates: candidates.filter((candidate) => candidate.allowed).length,
        inProgress: finalCandidates.filter((response) => response.status === 'IN_PROGRESS').length,
        completed: finalCandidates.filter((response) => response.status === 'COMPLETED').length,
        flagged: finalCandidates.filter((c) => c.hasAuthenticityWarning).length,
      },
      completedCandidates: finalCandidates,
      recent,
    });
  } catch (error) {
    console.error('관리자 현황 조회 실패:', error);
    return res.status(503).json({ ok: false, message: '현황 데이터를 불러오지 못했습니다: ' + error.message });
  }
}
