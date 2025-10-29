// pages/api/envcheck.js
export default function handler(req, res) {
  const keys = Object.keys(process.env).filter(
    (k) => k.includes('SHEET') || k.includes('SPREADSHEET')
  );

  res.status(200).json({
    vercelEnv: process.env.VERCEL_ENV,  // 'production' | 'preview' | 'development'
    has_SHEET_ID: Boolean(process.env.SHEET_ID),
    has_BOM_variation: Boolean(process.env['\uFEFFSHEET_ID']),
    has_SPREADSHEET_ID: Boolean(process.env.SPREADSHEET_ID),
    has_GOOGLE_SERVICE_ACCOUNT_JSON: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    has_GOOGLE_SERVICE_ACOUNT_JSON: Boolean(process.env.GOOGLE_SERVICE_ACOUNT_JSON),
    keysVisible: keys,
    SHEET_ID_sample: (process.env.SHEET_ID || '').slice(0, 8),
  });
}
