import { getSheetsClient } from '../../lib/sheets.js';
import { requireAdmin } from '../../lib/admin-auth.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  try {
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
    const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!spreadsheetId) {
      return res.status(200).json({ ok: false, where: 'env', message: 'SHEET_ID 미설정' });
    }

    const sheets = getSheetsClient();
    const read = async (range) => {
      try {
        const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        return { ok: true, rows: (result.data.values || []).length };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    };

    const [candidates, responses, responsesV2, responsesV2Bank, eventlogs] = await Promise.all([
      read('Candidates!A:Z'),
      read('Responses!A:Z'),
      read("'Responses_V2'!A:Z"),
      read("'Responses_V2_Bank'!A:Z"),
      read('EventLogs!A:Z'),
    ]);
    const { calculateAssessmentScore } = await import('../../lib/scoring.js');
    const scoringEngineReady = calculateAssessmentScore({ I001: 5 }, { timeSpent: 10 }).totalScore >= 0;

    return res.status(200).json({
      ok: candidates.ok && responses.ok && eventlogs.ok && scoringEngineReady,
      hasServiceAccountJson: Boolean(serviceAccountRaw),
      candidates,
      responses,
      responsesV2,
      responsesV2Bank,
      eventlogs,
      scoringEngineReady,
    });
  } catch (error) {
    return res.status(200).json({ ok: false, error: String(error) });
  }
}
