// pages/api/init.js
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { 
  getSheetsClient, 
  findCandidate, 
  updateCandidateStatus, 
  appendResponse 
} from '../../lib/sheets';

// 한글 이름 정규화 (공백, 대소문자 무시)
function normalizeName(name) {
  return String(name || '')
    .normalize('NFC')
    .replace(/\s+/g, '')
    .toLowerCase()
    .trim();
}

// 전화번호 정규화 (숫자만)
function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

// KST → UTC 변환
function parseKSTDate(dateStr) {
  if (!dateStr) return null;
  try {
    const str = String(dateStr).trim().replace(' ', 'T');
    const isoStr = /\d{2}:\d{2}:\d{2}$/.test(str) ? str : `${str}:00`;
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return null;
    // KST(UTC+9) → UTC 변환
    return new Date(date.getTime() - (9 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

// 시간 윈도우 검증
function validateTimeWindow(startAt, endAt) {
  const now = new Date();
  const start = parseKSTDate(startAt);
  const end = parseKSTDate(endAt);

  if (start && now < start) {
    return { 
      valid: false, 
      code: 'NOT_STARTED', 
      message: '응시 시간이 아직 시작되지 않았습니다.' 
    };
  }
  if (end && now > end) {
    return { 
      valid: false, 
      code: 'EXPIRED', 
      message: '응시 가능 기간이 지났습니다.' 
    };
  }
  return { valid: true };
}

// items_full.json 로드
function loadQuestions() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'items_full.json');
    if (!fs.existsSync(filePath)) {
      console.warn('items_full.json 파일을 찾을 수 없습니다.');
      return [];
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const items = JSON.parse(raw || '[]');

    return (Array.isArray(items) ? items : [])
      .slice(0, 300)
      .map((item, index) => {
        const text = item.text || item.item_text || item.question || `문항 ${index + 1}`;
        return {
          id: `q${index + 1}`,
          text: String(text),
          reverse: Boolean(item.reverse || item.is_imc),
          domain: item.domain || null,
          subdomain: item.subdomain || null,
          variable: item.var || item.variable || null,
        };
      });
  } catch (error) {
    console.error('문항 로드 실패:', error);
    return [];
  }
}

// 세션 복구
async function restoreSession(sheets, spreadsheetId, sessionId) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Responses!A:F'
    });
    const rows = response.data.values || [];
    const sessionRow = rows.find(row => row[0] === sessionId);
    
    if (!sessionRow) {
      throw new Error('유효하지 않은 세션입니다.');
    }
    
    return {
      sessionId,
      name: sessionRow[1] || '',
      email: sessionRow[2] || '',
      phone: sessionRow[3] || '',
      status: sessionRow[5] || 'STARTED'
    };
  } catch (error) {
    throw new Error('세션 복구에 실패했습니다.');
  }
}

// 중복 응시 체크
async function checkDuplicateResponse(sheets, spreadsheetId, email) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Responses!A:F'
    });
    const rows = response.data.values || [];
    let hasCompleted = false;
    let lastStartedAt = null;

    for (let i = 1; i < rows.length; i++) {
      const [sid, name, em, phone, timestamp, status] = rows[i];
      const rowEmail = String(em || '').trim().toLowerCase();
      const targetEmail = String(email || '').trim().toLowerCase();

      if (rowEmail === targetEmail) {
        if (String(status || '').toUpperCase() === 'COMPLETED') {
          hasCompleted = true;
        }
        if (String(status || '').toUpperCase() === 'STARTED') {
          const time = Date.parse(timestamp);
          if (!isNaN(time) && (!lastStartedAt || time > lastStartedAt)) {
            lastStartedAt = time;
          }
        }
      }
    }
    return { hasCompleted, lastStartedAt };
  } catch (error) {
    console.warn('중복 체크 실패:', error);
    return { hasCompleted: false, lastStartedAt: null };
  }
}

// ============= 메인 핸들러 =============
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'POST 메서드만 허용됩니다.' 
    });
  }

  try {
    const { name, email, phone, sessionId } = req.body || {};
    const sheets = getSheetsClient();
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return res.status(500).json({
        success: false,
        message: '시스템 설정 오류입니다. 관리자에게 문의하세요.'
      });
    }

    // ===== 세션 복구 =====
    if (sessionId) {
      try {
        const session = await restoreSession(sheets, spreadsheetId, sessionId);
        const questions = loadQuestions();
        
        if (questions.length === 0) {
          return res.status(500).json({
            success: false,
            message: '문항 데이터를 불러올 수 없습니다.'
          });
        }
        
        return res.status(200).json({
          success: true,
          sessionId: session.sessionId,
          questions,
          message: '세션이 복구되었습니다.'
        });
      } catch (error) {
        return res.status(200).json({
          success: false,
          message: error.message || '세션 복구에 실패했습니다.'
        });
      }
    }

    // ===== 새 세션 생성 =====
    
    // 1. 필수 정보 검증
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return res.status(200).json({ 
        success: false, 
        message: '이름, 이메일, 전화번호를 모두 입력해주세요.' 
      });
    }

    // 2. 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(200).json({ 
        success: false, 
        message: '올바른 이메일 형식을 입력해주세요.' 
      });
    }

    // 3. 후보자 확인
    let candidate;
    try {
      candidate = await findCandidate(email);
      
      if (!candidate) {
        return res.status(200).json({ 
          success: false, 
          message: '등록되지 않은 이메일입니다.\n담당자에게 문의하세요.' 
        });
      }

      // 이름 검증
      if (normalizeName(candidate.name) !== normalizeName(name)) {
        return res.status(200).json({ 
          success: false, 
          message: `등록된 이름(${candidate.name})과 일치하지 않습니다.` 
        });
      }

      // 전화번호 검증
      if (normalizePhone(candidate.phone) !== normalizePhone(phone)) {
        return res.status(200).json({ 
          success: false, 
          message: `등록된 전화번호(${candidate.phone})와 일치하지 않습니다.` 
        });
      }

      // 허용 여부 검증
      if (String(candidate.allow).toLowerCase() !== 'true') {
        return res.status(200).json({ 
          success: false, 
          message: '응시 허용 대상이 아닙니다.\n담당자에게 문의하세요.' 
        });
      }

      // 시간 윈도우 검증
      const timeCheck = validateTimeWindow(candidate.start_at, candidate.end_at);
      if (!timeCheck.valid) {
        return res.status(200).json({ 
          success: false, 
          message: timeCheck.message, 
          code: timeCheck.code 
        });
      }

      // 이미 완료한 경우
      if (String(candidate.status).toUpperCase() === 'COMPLETED') {
        return res.status(200).json({ 
          success: false, 
          message: '이미 검사를 완료하셨습니다.\n재응시는 담당자에게 문의하세요.' 
        });
      }

    } catch (error) {
      console.error('후보자 확인 오류:', error);
      return res.status(200).json({ 
        success: false, 
        message: '후보자 정보 확인 중 오류가 발생했습니다.' 
      });
    }

    // 4. 중복 응시 체크 (24시간 제한)
    const duplicateCheck = await checkDuplicateResponse(sheets, spreadsheetId, email);
    
    if (duplicateCheck.hasCompleted) {
      return res.status(200).json({ 
        success: false, 
        message: '이미 검사를 완료하셨습니다.' 
      });
    }
    
    if (duplicateCheck.lastStartedAt) {
      const hoursSinceStart = (Date.now() - duplicateCheck.lastStartedAt) / (1000 * 60 * 60);
      if (hoursSinceStart < 24) {
        return res.status(200).json({ 
          success: false, 
          message: '이미 검사를 진행 중입니다.\n24시간 이내 재시작은 불가능합니다.' 
        });
      }
    }

    // 5. 문항 로드
    const questions = loadQuestions();
    if (questions.length === 0) {
      return res.status(500).json({
        success: false,
        message: '문항 데이터를 불러올 수 없습니다.\n관리자에게 문의하세요.'
      });
    }

    // 6. 세션 생성 & 초기 데이터 저장
    const newSessionId = uuidv4().replace(/-/g, '');
    const startedAt = new Date().toISOString();

    try {
      await updateCandidateStatus(email, 'STARTED', startedAt);
      await appendResponse({ 
        sessionId: newSessionId, 
        name, 
        email, 
        phone, 
        timestamp: startedAt, 
        status: 'STARTED' 
      });
    } catch (error) {
      console.warn('상태 업데이트 실패:', error);
      // 계속 진행 (비필수 작업)
    }

    // 7. 성공 응답
    return res.status(200).json({
      success: true,
      sessionId: newSessionId,
      questions,
      window: { 
        start_at: candidate.start_at, 
        end_at: candidate.end_at 
      },
      message: '검사가 시작되었습니다.'
    });

  } catch (error) {
    console.error('Init API 오류:', error);
    return res.status(500).json({ 
      success: false, 
      message: '서버 오류가 발생했습니다.\n잠시 후 다시 시도해주세요.' 
    });
  }
}
