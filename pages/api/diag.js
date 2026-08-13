import { getSheetsClient } from '../../lib/sheets.js';
import { requireAdmin } from '../../lib/admin-auth.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  try {
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(200).json({ ok: false, where: 'env', message: 'SHEET_ID 환경변수가 없습니다.' });
    }

    const sheets = getSheetsClient();
    const read = async (range) => {
      try {
        const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const values = result.data.values || [];
        return { ok: true, rows: values.length, head: values[0] || [] };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    };

    const candidates = await read('Candidates!A:Z');
    const responses = await read('Responses!A:Z');
    const responsesV2 = await read("'Responses_V2'!A:Z");
    const responsesV2Bank = await read("'Responses_V2_Bank'!A:Z");
    const eventlogs = await read('EventLogs!A:Z');
    return res.status(200).json({
      ok: candidates.ok && responses.ok && eventlogs.ok,
      candidates,
      responses,
      responsesV2,
      responsesV2Bank,
      eventlogs,
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: String(error) });
  }
}
