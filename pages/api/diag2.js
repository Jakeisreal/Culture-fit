// pages/api/diag2.js
import { getSheetsClient } from '../../lib/sheets';

export default async function handler(req, res) {
  try {
    const sheetEnv = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    const saRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACOUNT_JSON;

    if (!sheetEnv) {
      return res.status(200).json({ ok: false, where: 'env', message: 'SHEET_ID 미설정' });
    }

    const out = {
      ok: true,
      spreadsheetId: sheetEnv,
      hasServiceAccountJson: Boolean(saRaw),
      serviceAccountEmail: null,
      envKeysPresent: Object.keys(process.env).filter(k => /SHEET|SPREADSHEET|GOOGLE_SERVICE_ACCOUNT_JSON|GOOGLE_SERVICE_ACOUNT_JSON/.test(k)),
    };

    try {
      if (saRaw) {
        const parsed = JSON.parse(saRaw);
        out.serviceAccountEmail = parsed.client_email || null;
      }
    } catch (e) {
      out.serviceAccountEmail = '(파싱 실패)';
    }

    const sheets = getSheetsClient();
    const read = async (range) => {
      try {
        const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetEnv, range });
        const values = r.data.values || [];
        return { ok: true, rows: values.length, head: values[0] || [] };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    };

    const candidates = await read('Candidates!A:Z');
    const responses = await read('Responses!A:Z');
    const eventlogs = await read('EventLogs!A:Z');

    out.candidates = candidates;
    out.responses = responses;
    out.eventlogs = eventlogs;
    out.ok = candidates.ok && responses.ok && eventlogs.ok;

    return res.status(200).json(out);
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err) });
  }
}

