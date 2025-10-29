// pages/api/submit2.js
import { findCandidate, updateCandidateStatus, getSheetsClient } from '../../lib/sheets';
import fs from 'fs';
import path from 'path';

function formatTimeSpent(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function detectSuspiciousPattern(answers, timeSpent, focusOutCount) {
  const answeredCount = Math.max(1, Object.keys(answers || {}).length);
  const avgTimePerQuestion = timeSpent / answeredCount;
  const flags = [];
  if (avgTimePerQuestion < 2) flags.push('FAST_RESPONSE');
  const values = Object.values(answers || {});
  const counts = values.reduce((a,v)=>{a[v]=(a[v]||0)+1;return a;},{});
  const maxCount = Math.max(...Object.values(counts), 0);
  if (answeredCount > 0 && maxCount / answeredCount > 0.8) flags.push('UNIFORM_RESPONSE');
  if (focusOutCount > 10) flags.push('EXCESSIVE_FOCUS_OUT');
  return flags;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'POST 메서드만 사용합니다' });
  }

  try {
    const { sessionId, authData, answers, focusOutCount = 0, timeSpent = 0, isForced = false } = req.body || {};
    if (!sessionId || !authData || !authData.email) {
      return res.status(200).json({ success: false, message: '필수 정보가 누락되었습니다' });
    }

    // 마감 시간 확인
    try {
      const candidate = await findCandidate(authData.email);
      if (candidate && candidate.end_at) {
        const endAt = new Date(candidate.end_at);
        if (new Date() > endAt) {
          return res.status(200).json({ success: false, message: '마감 시간을 지나 제출할 수 없습니다.' });
        }
      }
    } catch {}

    // items_full.json에서 item_id 순서(I001.. 정렬) 확보
    let itemIds = [];
    try {
      const filePath = path.join(process.cwd(), 'data', 'items_full.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const arr = JSON.parse(raw || '[]');
      itemIds = (Array.isArray(arr) ? arr : []).slice(0, 300).map((i, idx) => i.item_id || `I${String(idx + 1).padStart(3,'0')}`);
      itemIds.sort((a,b) => parseInt(String(a).replace(/\D/g,'')) - parseInt(String(b).replace(/\D/g,'')));
    } catch {}
    const totalQuestions = itemIds.length || 300;
    const answeredCount = Object.keys(answers || {}).length;
    const completionRate = `${answeredCount}/${totalQuestions}`;
    const timeSpentFormatted = formatTimeSpent(Math.max(0, timeSpent));

    const suspiciousFlags = detectSuspiciousPattern(answers, timeSpent, focusOutCount);
    const suspicious = suspiciousFlags.length > 0 ? suspiciousFlags.join(', ') : '';

    // 응답을 item_id 순으로 변환(폴백 포함)
    const orderedAnswers = [];
    if (itemIds.length > 0) {
      for (const id of itemIds) orderedAnswers.push(answers && answers[id] != null ? answers[id] : '');
    } else {
      for (let i = 1; i <= totalQuestions; i++) {
        const key = `q${i}`;
        orderedAnswers.push(answers && answers[key] != null ? answers[key] : '');
      }
    }

    const sheets = getSheetsClient();
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;

    try {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Responses!A:A' });
      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === sessionId);

      const base = [
        sessionId,
        authData.name || '',
        authData.email || '',
        authData.phone || '',
        new Date().toISOString(),
        'COMPLETED',
        timeSpentFormatted,
        completionRate,
        focusOutCount,
        isForced ? 'YES' : 'NO',
        suspicious,
        '',
        '',
        ...orderedAnswers
      ];

      if (rowIndex >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Responses!A${rowIndex + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [base] }
        });
      } else {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Responses!A:A',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [base] }
        });
      }

      await updateCandidateStatus(authData.email, 'COMPLETED');
    } catch (sheetError) {
      console.error('시트 업데이트 실패:', sheetError);
      return res.status(200).json({ success: false, message: '데이터 저장 중 오류가 발생했습니다.\n담당자에게 문의하세요', sessionId });
    }

    return res.status(200).json({ success: true, message: '제출이 완료되었습니다', sessionId, analysis: { completionRate, timeSpent: timeSpentFormatted, focusOutCount, suspiciousFlags: suspiciousFlags.length > 0 ? suspiciousFlags : null } });
  } catch (error) {
    console.error('Submit API 오류:', error);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

