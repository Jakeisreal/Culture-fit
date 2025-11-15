// lib/sheets.js
import { google } from 'googleapis';

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

const SHEET_ID = process.env.SHEET_ID || process.env.SPREADSHEET_ID;
const SEOUL_TIMEZONE = 'Asia/Seoul';
const SEOUL_OFFSET = '+09:00';
const seoulFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SEOUL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});


function requireSheetId() {
  if (!SHEET_ID) throw new Error('SHEET_ID 환경변수가 설정되지 않았습니다.');
  return SHEET_ID;
}

function formatSeoulTimestamp(value) {
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

// 응답 추가
export async function appendResponse(data) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  
  const values = [
    data.sessionId || '',
    data.name || '',
    data.email || '',
    data.phone || '',
    data.timestamp || new Date().toISOString(),
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

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Responses!A:A',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });
}

// 후보자 찾기
export async function findCandidate(email) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Candidates!A:Z'
  });

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

  // 업데이트할 범위 계산
  const indices = Object.keys(updates).map(Number).sort((a, b) => a - b);
  const minCol = indices[0];
  const maxCol = indices[indices.length - 1];

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

  const range = `Candidates!${colToLetter(minCol)}${candidate.rowIndex}:${colToLetter(maxCol)}${candidate.rowIndex}`;
  
  // 행 데이터 생성
  const rowData = [];
  for (let i = minCol; i <= maxCol; i++) {
    rowData.push(updates[i] !== undefined ? updates[i] : '');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [rowData] }
  });

  return true;
}

// 이벤트 로그 기록
export async function logEvent(sessionId, eventType, data, timestamp) {
  const sheets = getSheetsClient();
  const spreadsheetId = requireSheetId();
  const normalizedTimestamp = formatSeoulTimestamp(timestamp);

  await sheets.spreadsheets.values.append({
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
  });
}
