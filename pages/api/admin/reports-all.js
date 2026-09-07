import { getSheetsClient } from '../../../lib/sheets.js';
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

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'GET 메서드만 지원합니다.' });
  }

  try {
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ ok: false, message: 'SHEET_ID가 설정되지 않았습니다.' });
    }

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

    const parseRows = (rows, defaultVersion) => {
      if (!Array.isArray(rows) || rows.length <= 1) return [];
      const headers = createHeaderMap(rows[0]);
      return rows.slice(1).map((row) => ({
        sessionId: String(getCell(row, headers, 'sessionid', 0) || '').trim(),
        name: String(getCell(row, headers, 'name', 1) || '').trim(),
        email: String(getCell(row, headers, 'email', 2) || '').trim(),
        phone: String(getCell(row, headers, 'phone', 3) || '').trim(),
        timestamp: String(getCell(row, headers, 'timestamp', 4) || '').trim(),
        status: String(getCell(row, headers, 'status', 5) || '').trim().toUpperCase(),
        timeSpent: getCell(row, headers, 'timespent', 6),
        focusOutCount: Number(getCell(row, headers, 'focusoutcount', 8)) || 0,
        notes: getCell(row, headers, 'notes', 11),
        score: getCell(row, headers, 'score', 12),
        assessmentVersion: defaultVersion,
        rawRow: row,
      })).filter((r) => r.sessionId || r.email || r.name);
    };

    const allRecords = [
      ...parseRows(v2BankRes.data.values || [], 'v2-bank-pilot'),
      ...parseRows(v2Res.data.values || [], 'v2-pilot'),
      ...parseRows(v1Res.data.values || [], 'v1'),
    ];

    // 최신순 정렬 후 동일 이메일 중복 제거
    allRecords.sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));

    const validRecords = [];
    const seenEmails = new Set();

    for (const record of allRecords) {
      const isCompleted = ['COMPLETED', '완료', 'DONE', 'SUBMITTED'].includes(record.status);
      const isInProgress = ['IN_PROGRESS', 'STARTED'].includes(record.status);
      if (!isCompleted && !isInProgress) continue;

      const key = (record.email || record.sessionId).toLowerCase();
      if (seenEmails.has(key)) continue;
      seenEmails.add(key);

      validRecords.push(record);
    }

    if (validRecords.length === 0) {
      return res.status(200).json({ ok: true, reports: [] });
    }

    // 1단계: 각 지원자별 채점 및 점수 추출
    const processedCandidates = [];
    for (const record of validRecords) {
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

        // 문항을 하나도 안 푼 접속 이력은 제외
        if (Object.keys(answers).length === 0 && (!record.timeSpent || record.timeSpent === '0')) {
          continue;
        }

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

        processedCandidates.push({
          record,
          scoreResult,
          quality,
          totalAvg: scoreResult.totalAverage || 3.3,
        });
      } catch (err) {
        console.warn('일괄 리포트 개별 채점 예외:', record.name, err);
      }
    }

    const cohortCount = processedCandidates.length;

    // 2단계: 전체 응시자 집단 통계 집계
    const cultureNormMeans = {};
    for (const k of ['원칙중시', '혁신성', '고객중심', '의사소통', '도전정신']) {
      const vals = processedCandidates.map((c) => c.scoreResult.domainScores?.[k]?.average).filter((v) => typeof v === 'number');
      if (vals.length > 0) {
        cultureNormMeans[k] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      }
    }

    const teamMap = {
      '상호협력': ['상호 협력 및 지원', '상호협력'],
      '소통·피드백': ['피드백 수용 및 열린 소통', '소통·피드백', '피드백 수용'],
      '공동목표': ['공동 목표 몰입 및 책임감', '공동목표'],
      '갈등조율': ['갈등 조율 및 적응성', '갈등조율', '갈등 조율'],
    };
    const teamNormMeans = {};
    for (const [targetKey, aliases] of Object.entries(teamMap)) {
      const vals = processedCandidates.map((c) => {
        const ds = c.scoreResult.domainScores || {};
        for (const alias of aliases) {
          if (typeof ds[alias]?.average === 'number') return ds[alias].average;
        }
        return null;
      }).filter((v) => typeof v === 'number');
      if (vals.length > 0) {
        teamNormMeans[targetKey] = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      }
    }

    // 종합점수 내림차순 정렬
    const sortedAvgs = processedCandidates.map((c) => c.totalAvg).sort((a, b) => b - a);

    // 3단계: 최종 리포트 데이터 생성
    const reports = processedCandidates.map(({ record, scoreResult, quality, totalAvg }) => {
      const betterCount = sortedAvgs.filter((s) => s > totalAvg).length;
      const sameCount = sortedAvgs.filter((s) => s === totalAvg).length;
      const rank = betterCount + 1;
      const topPercent = Math.max(1, Math.min(99, Math.round(((betterCount + sameCount * 0.5) / cohortCount) * 100)));
      const percentile = 100 - topPercent;

      let grade = 'B';
      if (topPercent <= 10) grade = 'S';
      else if (topPercent <= 30) grade = 'A';
      else if (topPercent <= 50) grade = 'B+';
      else if (topPercent <= 70) grade = 'B';
      else if (topPercent <= 90) grade = 'C+';
      else grade = 'C';

      const cohortStats = {
        cohortCount,
        cultureNormMeans,
        teamNormMeans,
        rank,
        topPercent,
        percentile,
        grade,
      };

      const sessionRecord = {
        sessionId: record.sessionId,
        name: record.name,
        email: record.email,
        startedAt: record.timestamp,
        status: record.status,
        assessmentVersion: record.assessmentVersion,
      };

      return generateInterviewReport(sessionRecord, scoreResult, quality, cohortStats);
    });

    return res.status(200).json({
      ok: true,
      cohortCount,
      reports,
    });
  } catch (error) {
    console.error('전체 리포트 일괄 조회 실패:', error);
    return res.status(500).json({ ok: false, message: '전체 리포트를 불러오지 못했습니다: ' + error.message });
  }
}
