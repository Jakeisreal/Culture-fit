import { getSheetsClient } from '../../../lib/sheets.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { withRetry } from '../../../lib/http.js';
import { formatQualityForAdmin, classifyResponseQuality } from '../../../lib/response-quality.js';
import { parseSessionNotes } from '../../../lib/assessment-versions.js';

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

    // A:ZZ 대신 시트 이름 자체를 넘겨 시트의 실제 존재하는 모든 열/행을 안전하게 조회
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

    // 응시 완료자(COMPLETED 또는 완료) 목록 추출 및 수치 계산
    const completedCandidates = [];
    for (const record of allResponses) {
      const isCompleted = ['COMPLETED', '완료', 'DONE', 'SUBMITTED'].includes(record.status);
      if (!isCompleted) continue;

      try {
        let domainScores = {};
        let imcFailedCount = 0;
        let repeatDiffPairs = 0;
        let parsedFlags = [];

        // 1. notes 컬럼의 JSON에서 계산된 지표 우선 추출 (가장 빠르고 정확함)
        if (record.notes) {
          try {
            const parsedNotes = typeof record.notes === 'string' ? JSON.parse(record.notes) : record.notes;
            if (parsedNotes && typeof parsedNotes === 'object') {
              if (parsedNotes.domainScores) domainScores = parsedNotes.domainScores;
              if (parsedNotes.imcFailedCount != null) imcFailedCount = Number(parsedNotes.imcFailedCount);
              if (parsedNotes.consistency?.largeDifferencePairs != null) {
                repeatDiffPairs = Number(parsedNotes.consistency.largeDifferencePairs);
              }
              if (Array.isArray(parsedNotes.flags)) parsedFlags = parsedNotes.flags;
            }
          } catch (e) {
            // ignore json parse error
          }
        }

        // 2. 점수 및 도메인 수치 도출
        const sdsAvg = domainScores['반응왜곡(사회적바람직성)']?.average ?? null;
        const imAvg = domainScores['반응왜곡(인상관리)']?.average ?? null;
        const sdeAvg = domainScores['반응왜곡(자기기만)']?.average ?? null;
        const cwbAvg = domainScores['역기능행동(CWB)']?.average ?? null;

        // 컬쳐 5대 영역 평균
        const cultureKeys = ['원칙중시', '혁신성', '고객중심', '의사소통', '도전정신'];
        let cultureSum = 0;
        let cultureCount = 0;
        let cultureMax = { domain: '도전정신', score: -1 };
        let cultureMin = { domain: '고객중심', score: 999 };

        cultureKeys.forEach((k) => {
          const val = domainScores[k]?.average;
          if (typeof val === 'number') {
            cultureSum += val;
            cultureCount += 1;
            if (val > cultureMax.score) cultureMax = { domain: k, score: val };
            if (val < cultureMin.score) cultureMin = { domain: k, score: val };
          }
        });

        // 팀핏 4대 영역
        const teamKeys = [
          '상호 협력 및 지원',
          '피드백 수용 및 열린 소통',
          '공동 목표 몰입 및 책임감',
          '갈등 조율 및 적응성',
        ];
        let teamMax = { domain: '공동 목표 몰입', score: -1 };
        let teamMin = { domain: '갈등 조율', score: 999 };
        teamKeys.forEach((k) => {
          const val = domainScores[k]?.average;
          if (typeof val === 'number') {
            if (val > teamMax.score) teamMax = { domain: k.slice(0, 5), score: val };
            if (val < teamMin.score) teamMin = { domain: k.slice(0, 5), score: val };
          }
        });

        // 종합 평균 및 백분위 산출
        let totalAvg = cultureCount > 0 ? cultureSum / cultureCount : null;
        let totalScore100 = totalAvg ? Math.round((totalAvg / 5) * 100) : null;
        
        // score 열에서 숫자 추출 시도 (예: "총점: 78점 / 100점")
        if (!totalScore100 && record.score) {
          const match = String(record.score).match(/(\d+(?:\.\d+)?)\s*점/);
          if (match) {
            totalScore100 = Math.round(Number(match[1]));
            totalAvg = Number((totalScore100 / 20).toFixed(2));
          }
        }

        let grade = 'B+';
        let percentile = '65%';
        if (totalAvg >= 4.2) { grade = 'S'; percentile = '96%'; }
        else if (totalAvg >= 3.8) { grade = 'A'; percentile = '85%'; }
        else if (totalAvg >= 3.4) { grade = 'B+'; percentile = '65%'; }
        else if (totalAvg >= 3.0) { grade = 'B'; percentile = '48%'; }
        else if (totalAvg) { grade = 'C'; percentile = '25%'; }

        // 소요시간 (분)
        let timeMinutes = 0;
        if (typeof record.timeSpent === 'string' && record.timeSpent.includes(':')) {
          const parts = record.timeSpent.split(':').map(Number);
          timeMinutes = parts.length === 3 ? parts[0] * 60 + parts[1] : Math.round(parts[0]);
        } else if (Number(record.timeSpent)) {
          timeMinutes = Math.round(Number(record.timeSpent) / 60);
        }

        const quality = classifyResponseQuality(
          parsedFlags.length > 0 ? parsedFlags : (record.suspicious ? String(record.suspicious).split(',') : []),
          1.0,
          250,
          250
        );

        const hasWarning =
          (sdsAvg != null && sdsAvg >= 4.2) ||
          (imAvg != null && imAvg >= 4.0) ||
          (sdeAvg != null && sdeAvg >= 4.2) ||
          (cwbAvg != null && cwbAvg < 2.8) ||
          imcFailedCount > 0 ||
          repeatDiffPairs >= 4 ||
          quality.tier !== 'interpretable';

        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
          timeSpentMinutes: timeMinutes,
          totalScore: totalScore100,
          totalAverage: totalAvg,
          grade,
          percentile,
          cultureStrength: cultureMax.score >= 0 ? cultureMax.domain : '도전정신',
          cultureWeakness: cultureMin.score < 900 ? cultureMin.domain : '고객중심',
          teamStrength: teamMax.score >= 0 ? teamMax.domain : '공동 목표',
          teamWeakness: teamMin.score < 900 ? teamMin.domain : '갈등 조율',
          sdsAvg: typeof sdsAvg === 'number' ? Number(sdsAvg.toFixed(2)) : null,
          imAvg: typeof imAvg === 'number' ? Number(imAvg.toFixed(2)) : null,
          sdeAvg: typeof sdeAvg === 'number' ? Number(sdeAvg.toFixed(2)) : null,
          cwbAvg: typeof cwbAvg === 'number' ? Number(cwbAvg.toFixed(2)) : null,
          imcFailedCount,
          repeatDiffPairs,
          qualityTier: quality.tier,
          qualityLabel: quality.label,
          hasAuthenticityWarning: hasWarning,
        });
      } catch (err) {
        console.error('완료자 행 처리 예외:', record.name, err);
        completedCandidates.push({
          sessionId: record.sessionId,
          name: record.name,
          email: record.email,
          timestamp: record.timestamp,
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
    return res.status(503).json({ ok: false, message: '현황 데이터를 불러오지 못했습니다: ' + error.message });
  }
}
