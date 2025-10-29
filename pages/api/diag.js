// pages/api/diag.js
import { getSheetsClient } from '../../lib/sheets'; // 경로가 ../../lib/sheets 일 수도 있습니다. 현재 프로젝트 구조에 맞춰 조정하세요.

export default async function handler(req, res) {
  try {
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(200).json({ ok: false, where: 'env', message: 'SHEET_ID 환경변수가 없습니다.' });
    }

    const sheets = getSheetsClient();
    // 탭 3개를 순서대로 점검
    const read = async (range) => {
      try {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const values = r.data.values || [];
        return { ok: true, rows: values.length, head: values[0] || [] };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    };

    const candidates = await read('Candidates!A:Z');
    const responses = await read('Responses!A:Z');
    const eventlogs = await read('EventLogs!A:Z');

    return res.status(200).json({
      ok: candidates.ok && responses.ok && eventlogs.ok,
      spreadsheetId,
      candidates,
      responses,
      eventlogs,
      serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email
        : '(환경변수 없음)',
    });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err) });
  }
}
