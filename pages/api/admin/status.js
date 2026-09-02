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
      } catch {
        return { data: { values: [] } };
      }
    };

    const [candidateResult, responseV1Result, responseV2Result, responseV2BankResult] = await Promise.all([
      read('Candidates!A:Z'),
      read('Responses!A:ZZ'),
      readOptional("'Responses_V2'!A:ZZ"),
      readOptional("'Responses_V2_Bank'!A:ZZ"),
    ]);

    const candidateRows = candidateResult.data.values || [];
    const candidateHeaders = createHeaderMap(candidateRows[0]);

    const candidates = candidateRows.slice(1).map((row) => ({
      status: String(getCell(row, candidateHeaders, 'status', 6)).toUpperCase(),
      allowed: String(getCell(row, candidateHeaders, 'allow', 3)).toLowerCase() === 'true',
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

        const sessionId = getCell(row, responseHeaders, 'sessionid', 0);
        const name = getCell(row, responseHeaders, 'name', 1);
        const email = getCell(row, responseHeaders, 'email', 2);
        const phone = getCell(row, responseHeaders, 'phone', 3);
        const timestamp = getCell(row, responseHeaders, 'timestamp', 4);
        const status = String(getCell(row, responseHeaders, 'status', 5)).toUpperCase();
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
          status,
          timeSpent: Number(timeSpentRaw) || 0,
          focusOutCount: Number(focusOutCountRaw) || 0,
          completionRate: completionRateStr,
          suspicious: rawFlags,
          responseQuality: quality,
          score: scoreRaw,
          assessmentVersion: defaultVersion,
          notes: notesRaw,
          rawRow: row,
        };
      }).filter((row) => row.sessionId);
    };

    const allResponses = [
      ...parseResponses(responseV1Result.data.values || [], 'v1'),
      ...parseResponses(responseV2Result.data.values || [], 'v2-pilot'),
      ...parseResponses(responseV2BankResult.data.values || [], 'v2-bank-pilot'),
    ];

    // 응시 완료자(COMPLETED) 상세 수치 계산
    const completedCandidates = [];
    for (const record of allResponses) {
      if (record.status !== 'COMPLETED') continue;

      try {
        const sessionNotes = parseSessionNotes(record.notes, record.assessmentVersion);
        const assessmentVersion = sessionNotes.assessmentVersion || record.assessmentVersion;
        const definition = getAssessmentDefinition(assessmentVersion);

        const sessionItems = resolveSessionItems(
          definition.items,
          assessmentVersion,
          record.sessionId,
          sessionNotes.administeredItemIds
        );

        const rawRow = record.rawRow || [];
        const answers = {};
        for (let i = 0; i < definition.items.length; i++) {
          const itemId = definition.items[i].item_id;
          const colIndex = 13 + i;
          const cellVal = rawRow[colIndex];
          if (cellVal !== undefined && cellVal !== '') {
            answers[itemId] = cellVal === 'N/E' ? 0 : cellVal;
          }
        }

        const meta = {
          assessmentVersion,
          items: sessionItems,
          timeSpent: record.timeSpent,
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

        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
          timeSpentMinutes: Math.round((record.timeSpent || 0) / 60),
          totalScore: report.performanceMetrics?.totalScorePercent ?? Math.round(Number(record.score) || 0),
          totalAverage: report.performanceMetrics?.totalAverage ?? null,
          grade: report.performanceMetrics?.grade ?? '-',
          percentile: report.performanceMetrics?.percentile ?? '-',
          cultureStrength: report.cultureFit?.strength?.domain ?? '-',
          cultureWeakness: report.cultureFit?.weakness?.domain ?? '-',
          teamStrength: report.teamFit?.strength?.domain ?? '-',
          teamWeakness: report.teamFit?.weakness?.domain ?? '-',
          // 8대 응답 진정성 세부 수치
          sdsAvg: typeof sdsAvg === 'number' ? Number(sdsAvg.toFixed(2)) : null,
          imAvg: typeof imAvg === 'number' ? Number(imAvg.toFixed(2)) : null,
          sdeAvg: typeof sdeAvg === 'number' ? Number(sdeAvg.toFixed(2)) : null,
          cwbAvg: typeof cwbAvg === 'number' ? Number(cwbAvg.toFixed(2)) : null,
          imcFailedCount: scoreResult.imcFailedCount || 0,
          repeatDiffPairs: scoreResult.consistency?.largeDifferencePairs || 0,
          qualityTier: quality.tier,
          qualityLabel: quality.label,
          hasAuthenticityWarning:
            (sdsAvg != null && sdsAvg >= 4.2) ||
            (imAvg != null && imAvg >= 4.0) ||
            (sdeAvg != null && sdeAvg >= 4.2) ||
            (cwbAvg != null && cwbAvg < 2.8) ||
            scoreResult.imcFailedCount > 0 ||
            (scoreResult.consistency?.largeDifferencePairs || 0) >= 4 ||
            quality.tier !== 'interpretable',
          flags: scoreResult.flags || [],
        });
      } catch (calcError) {
        console.error('완료자 세부 계산 오류:', record.sessionId, calcError);
        // Fallback row
        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
          timeSpentMinutes: Math.round((record.timeSpent || 0) / 60),
          totalScore: Math.round(Number(record.score) || 0),
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
          qualityTier: record.responseQuality?.tier || 'interpretable',
          qualityLabel: record.responseQuality?.label || '해석 가능',
          hasAuthenticityWarning: false,
          flags: [],
        });
      }
    }

    // 최신 응시일시 기준 정렬
    completedCandidates.sort(
      (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0)
    );

    const recent = [...allResponses]
      .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
      .slice(0, 30)
      .map(({ rawRow, notes, ...rest }) => rest);

    const latestByCandidate = new Map();
    for (const response of allResponses) {
      const key = String(response.email || response.sessionId).toLowerCase();
      const previous = latestByCandidate.get(key);
      if (!previous || (Date.parse(response.timestamp) || 0) > (Date.parse(previous.timestamp) || 0)) {
        latestByCandidate.set(key, response);
      }
    }
    const latestResponses = [...latestByCandidate.values()];

    return res.status(200).json({
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCandidates: candidates.length,
        allowedCandidates: candidates.filter((candidate) => candidate.allowed).length,
        inProgress: latestResponses.filter((response) => ['STARTED', 'IN_PROGRESS'].includes(response.status)).length,
        completed: completedCandidates.length,
        flagged: completedCandidates.filter((c) => c.hasAuthenticityWarning).length,
      },
      completedCandidates,
      recent,
    });
  } catch (error) {
    console.error('관리자 현황 조회 실패:', error);
    return res.status(503).json({ ok: false, message: '현황 데이터를 불러오지 못했습니다.' });
  }
}
