import { requireAdmin } from '../../lib/admin-auth.js';

export default function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV,
    hasSheetId: Boolean(process.env.SHEET_ID || process.env.SPREADSHEET_ID),
    hasServiceAccountJson: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    hasSessionSecret: Boolean(process.env.SESSION_SECRET),
    hasDiagnosticsToken: Boolean(process.env.DIAGNOSTICS_TOKEN),
  });
}
