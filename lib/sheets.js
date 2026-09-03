// lib/sheets.js
import { google } from 'googleapis';
import { withRetry } from './http.js';
import {
  getAssessmentDefinition,
  getResponseHeaders,
  getResponseSheetNames,
  LEGACY_ASSESSMENT_VERSION,
  normalizeAssessmentVersion,
  parseSessionNotes,
} from './assessment-versions.js';

let sheetsClient = null;

export function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACOUNT_JSON;
    if (!raw) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 환경변수가 설정되지 않았습니다.');
    }
    
    const serviceAccount = JSON.parse(raw);
    
    // private_key newline 수정
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('서비스 계정 정보가 올바르지 않습니다.');
    }

    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (error) {
    console.error('Google Sheets 인증 실패:', error);
    throw new Error('Google Sheets 연결에 실패했습니다.');
  }
}

const SEOUL_TIMEZONE = 'Asia/Seoul';
const SEOUL_OFFSET = '+09:00';
const seoulFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});


function requireSheetId() {
  const sheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
  if (!sheetId) throw new Error('SHEET_ID 환경변수가 설정되지 않았습니다.');
  return sheetId;
}

export function formatSeoulTimestamp(value) {
  let date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    date = new Date();
  }
  const parts = seoulFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  const year = parts.year || '1970';
  const month = parts.month || '01';
  const day = parts.day || '01';
  const hour = parts.hour || '00';
  const minute = parts.minute || '00';
  const second = parts.second || '00';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${SEOUL_OFFSET}`;
}


// 헤더 매핑 유틸리티
function createHeaderMap(headers) {
  return headers.reduce((map, header, index) => {
    const key = String(header || '').trim().toLowerCase();
    if (key) map[key] = index;
    return map;
  }, {});
}

function getCell(row, headerMap, key, defaultValue = null) {
  const index = headerMap[key];
  return (typeof index === 'number' && row[index] != null) ? row[index] : defaultValue;
}

async function ensureResponseSheet(assessmentVersion) {
  const version = normalizeAssessmentVersion(assessmentVersion);
  const definition = getAssessmentDefinition(version);
  if (version === LEGACY_ASSESSMENT_VERSION) return definition.responseSheet;

  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  const metadata = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  }));
  const exists = (metadata.data.sheets || []).some(
    (sheet) => sheet.properties?.title === definition.responseSheet,
  );
  if (!exists) {
    try {
      await withRetry(() => sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: definition.responseSheet } },
          }],
        },
      }));
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('already exists')) throw error;
    }
  }
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${definition.responseSheet}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [getResponseHeaders(version)] },
  }));
  return definition.responseSheet;
}

// 응답 추가
export async function appendResponse(data) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  const timestamp = formatSeoulTimestamp(data.timestamp);
  const assessmentVersion = normalizeAssessmentVersion(
    data.assessmentVersion,
    LEGACY_ASSESSMENT_VERSION,
  );
  const responseSheet = await ensureResponseSheet(assessmentVersion);
  
  const values = [
    data.sessionId || '',
    data.name || '',
    data.email || '',
    data.phone || '',
    timestamp,
    data.status || 'STARTED',
    data.timeSpent || '',
    data.completionRate || '',
    data.focusOutCount || 0,
    data.isForced || 'NO',
    data.suspicious || '',
    data.notes || '',
    data.score || '',
    ...(data.answers || [])
  ];

  await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${responseSheet}'!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  }));
}

// 후보자 찾기
export async function findCandidate(email) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  
  const response = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Candidates!A:Z'
  }));

  const rows = response.data.values || [];
  if (rows.length === 0) return null;

  const headerMap = createHeaderMap(rows[0]);
  const normalizedEmail = String(email || '').trim().toLowerCase();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const candidateEmail = String(getCell(row, headerMap, 'email', '') || '').trim().toLowerCase();
    
    if (candidateEmail === normalizedEmail) {
      return {
        name: getCell(row, headerMap, 'name', ''),
        email: getCell(row, headerMap, 'email', ''),
        phone: getCell(row, headerMap, 'phone', ''),
        allow: getCell(row, headerMap, 'allow', ''),
        start_at: getCell(row, headerMap, 'start_at', ''),
        end_at: getCell(row, headerMap, 'end_at', ''),
        status: getCell(row, headerMap, 'status', ''),
        invited_at: getCell(row, headerMap, 'invited_at', ''),
        started_at: getCell(row, headerMap, 'started_at', ''),
        completed_at: getCell(row, headerMap, 'completed_at', ''),
        rowIndex: i + 1,
        _headerMap: headerMap
      };
    }
  }

  return null;
}

// 후보자 상태 업데이트
export async function updateCandidateStatus(email, status, timestamp = null) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  
  const candidate = await findCandidate(email);
  if (!candidate) return false;

  const now = timestamp || new Date().toISOString();
  const updates = {};
  const headerMap = candidate._headerMap;

  // 상태별 업데이트 필드 결정
  if (headerMap['status'] !== undefined) {
    updates[headerMap['status']] = String(status).toUpperCase();
  }

  if (status.toUpperCase() === 'STARTED' && headerMap['started_at'] !== undefined) {
    updates[headerMap['started_at']] = now;
  }

  if (status.toUpperCase() === 'COMPLETED' && headerMap['completed_at'] !== undefined) {
    updates[headerMap['completed_at']] = now;
  }

  if (Object.keys(updates).length === 0) return true;

  const colToLetter = (n) => {
    let result = '';
    n = n + 1;
    while (n > 0) {
      const mod = (n - 1) % 26;
      result = String.fromCharCode(65 + mod) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };

  const data = Object.entries(updates).map(([columnIndex, value]) => ({
    range: `Candidates!${colToLetter(Number(columnIndex))}${candidate.rowIndex}`,
    values: [[value]],
  }));

  await withRetry(() => sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  }));

  return true;
}

// 이벤트 로그 기록
export async function logEvent(sessionId, eventType, data, timestamp) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  const normalizedTimestamp = formatSeoulTimestamp(timestamp);

  await withRetry(() => sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'EventLogs!A:D',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        normalizedTimestamp,
        sessionId || '',
        eventType || '',
        typeof data === 'string' ? data : JSON.stringify(data || {})
      ]]
    }
  }));
}

// 세션 ID로 응답 레코드 찾기
export async function findResponseBySessionId(sessionId) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  for (const sheetName of [...getResponseSheetNames()].reverse()) {
    let rows = [];
    try {
      const response = await withRetry(() => sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'`
      }));
      rows = response.data.values || [];
    } catch (error) {
      if (sheetName === 'Responses') throw error;
      continue;
    }
    if (rows.length === 0) continue;
    const headerRow = rows[0] || [];
    const rowIndex = rows.findIndex(row => row[0] === sessionId);
    if (rowIndex < 0) continue;

    const row = rows[rowIndex];
    return {
      rowIndex: rowIndex + 1,
      sheetName,
      sessionId: row[0],
      name: row[1],
      email: row[2],
      phone: row[3],
      startedAt: row[4],
      status: row[5],
      timeSpent: row[6],
      completionRate: row[7],
      focusOutCount: row[8],
      isForced: row[9],
      suspicious: row[10],
      notes: row[11],
      score: row[12],
      rawRow: row,
      headerRow,
    };
  }
  return null;
}

// 응답 임시 저장 (Draft Save)
export async function updateResponseDraft(
  sessionId,
  answersJSON,
  focusOutCount = 0,
  timeSpent = 0,
  draftVersion = 0,
  assessmentVersion = LEGACY_ASSESSMENT_VERSION,
) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();

  const record = await findResponseBySessionId(sessionId);
  if (!record) return false;
  const existingNotes = parseSessionNotes(record.notes);

  const notesContent = JSON.stringify({
    assessmentVersion: normalizeAssessmentVersion(
      assessmentVersion,
      LEGACY_ASSESSMENT_VERSION,
    ),
    administeredItemIds: existingNotes.administeredItemIds || [],
    draftVersion: Number(draftVersion) || 0,
    answers: typeof answersJSON === 'string' ? JSON.parse(answersJSON) : (answersJSON || {}),
  });

  // Responses 시트의 Status(F열), FocusOut(I열), Notes(L열) 업데이트
  await withRetry(() => sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${record.sheetName}'!F${record.rowIndex}:L${record.rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        'IN_PROGRESS',
        timeSpent ? String(timeSpent) : (record.timeSpent || ''),
        record.completionRate || '',
        focusOutCount != null ? Number(focusOutCount) : (record.focusOutCount || 0),
        record.isForced || 'NO',
        record.suspicious || '',
        notesContent
      ]]
    }
  }));

  return true;
}

export async function getSessionTelemetry(sessionId) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  const response = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'EventLogs!A:D',
  }));
  const rows = response.data.values || [];
  const focusEventTypes = new Set(['tab_hidden', 'window_blur']);
  let focusOutCount = 0;
  const eventTypes = {};

  for (const row of rows) {
    if (row[1] !== sessionId) continue;
    const eventType = String(row[2] || '');
    eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
    if (focusEventTypes.has(eventType)) focusOutCount += 1;
  }

  return { focusOutCount, eventTypes };
}
