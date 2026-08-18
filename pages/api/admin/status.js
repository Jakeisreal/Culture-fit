import { getSheetsClient } from '../../../lib/sheets.js';
import { requireAdmin } from '../../../lib/admin-auth.js';
import { withRetry } from '../../../lib/http.js';
import { formatQualityForAdmin } from '../../../lib/response-quality.js';

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
      read('Responses!A:M'),
      readOptional("'Responses_V2'!A:M"),
      readOptional("'Responses_V2_Bank'!A:M"),
    ]);
    const candidateRows = candidateResult.data.values || [];
    const candidateHeaders = createHeaderMap(candidateRows[0]);

    const candidates = candidateRows.slice(1).map((row) => ({
      status: String(getCell(row, candidateHeaders, 'status', 6)).toUpperCase(),
      allowed: String(getCell(row, candidateHeaders, 'allow', 3)).toLowerCase() === 'true',
    }));
    const parseResponses = (rows, assessmentVersion) => {
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

        return {
          sessionId: getCell(row, responseHeaders, 'sessionid', 0),
          name: getCell(row, responseHeaders, 'name', 1),
          email: getCell(row, responseHeaders, 'email', 2),
          timestamp: getCell(row, responseHeaders, 'timestamp', 4),
          status: String(getCell(row, responseHeaders, 'status', 5)).toUpperCase(),
          completionRate: completionRateStr,
          suspicious: rawFlags,
          responseQuality: quality,
          score: getCell(row, responseHeaders, 'score', 12),
          assessmentVersion,
        };
      }).filter((row) => row.sessionId);
    };
    const responses = [
      ...parseResponses(responseV1Result.data.values || [], 'v1'),
      ...parseResponses(responseV2Result.data.values || [], 'v2-pilot'),
      ...parseResponses(responseV2BankResult.data.values || [], 'v2-bank-pilot'),
    ];

    const recent = [...responses]
      .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0))
      .slice(0, 30);
    const latestByCandidate = new Map();
    for (const response of responses) {
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
        completed: latestResponses.filter((response) => response.status === 'COMPLETED').length,
        flagged: latestResponses.filter((response) => Boolean(response.suspicious)).length,
      },
      recent,
    });
  } catch (error) {
    console.error('관리자 현황 조회 실패:', error);
    return res.status(503).json({ ok: false, message: '현황 데이터를 불러오지 못했습니다.' });
  }
}
