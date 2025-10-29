// pages/api/submit.js
import { 
  findCandidate, 
  updateCandidateStatus, 
  getSheetsClient 
} from '../../lib/sheets';

function formatTimeSpent(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function detectSuspiciousPattern(answers, timeSpent, focusOutCount) {
  const totalQuestions = 300;
  const answeredCount = Object.keys(answers).length;
  const avgTimePerQuestion = timeSpent / answeredCount;
  
  const flags = [];

  // 너무 빠른 응답 (문항당 2초 미만)
  if (avgTimePerQuestion < 2) {
    flags.push('FAST_RESPONSE');
  }

  // 동일 응답 비율이 80% 이상
  const values = Object.values(answers);
  const valueCounts = values.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});
  const maxCount = Math.max(...Object.values(valueCounts));
  if (maxCount / answeredCount > 0.8) {
    flags.push('UNIFORM_RESPONSE');
  }

  // 과도한 포커스 이탈
  if (focusOutCount > 10) {
    flags.push('EXCESSIVE_FOCUS_OUT');
  }

  return flags;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'POST 메서드만 허용됩니다.'
    });
  }

  try {
    const { 
      sessionId, 
      authData, 
      answers, 
      focusOutCount = 0, 
      timeSpent = 0, 
      isForced = false 
    } = req.body || {};

    if (!sessionId || !authData || !authData.email) {
      return res.status(200).json({
        success: false,
        message: '필수 정보가 누락되었습니다.'
      });
    }

    // 마감 시간 재확인
    try {
      const candidate = await findCandidate(authData.email);
      if (candidate && candidate.end_at) {
        const endAt = new Date(candidate.end_at);
        if (new Date() > endAt) {
          return res.status(200).json({
            success: false,
            message: '마감 시간이 지나 제출할 수 없습니다.'
          });
        }
      }
    } catch (error) {
      console.warn('마감 시간 확인 실패:', error);
    }

    const totalQuestions = 300;
    const answeredCount = Object.keys(answers || {}).length;
    const completionRate = `${answeredCount}/${totalQuestions}`;
    const timeSpentFormatted = formatTimeSpent(Math.max(0, timeSpent));

    // 의심스러운 패턴 감지
    const suspiciousFlags = detectSuspiciousPattern(answers, timeSpent, focusOutCount);
    const suspicious = suspiciousFlags.length > 0 ? suspiciousFlags.join(', ') : '';

    // 응답 데이터를 순서대로 배열로 변환
    const orderedAnswers = [];
    for (let i = 1; i <= totalQuestions; i++) {
      const key = `q${i}`;
      orderedAnswers.push(answers && answers[key] != null ? answers[key] : '');
    }

    const sheets = getSheetsClient();
    const spreadsheetId = process.env.SHEET_ID || process.env.SPREADSHEET_ID;

    try {
      // Responses 시트 업데이트
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Responses!A:A'
      });

      const rows = response.data.values || [];
      const rowIndex = rows.findIndex(row => row[0] === sessionId);

      if (rowIndex >= 0) {
        // 기존 행 업데이트
        const updateData = [
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
          '', // notes
          '', // score (채점 후 업데이트)
          ...orderedAnswers
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Responses!A${rowIndex + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [updateData] }
        });
      } else {
        // 새 행 추가
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Responses!A:A',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [[
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
            ]]
          }
        });
      }

      // Candidates 상태 업데이트
      await updateCandidateStatus(authData.email, 'COMPLETED');

    } catch (sheetError) {
      console.error('시트 저장 실패:', sheetError);
      return res.status(200).json({
        success: false,
        message: '데이터 저장 중 오류가 발생했습니다.\n담당자에게 문의하세요.',
        sessionId
      });
    }

    return res.status(200).json({
      success: true,
      message: '제출이 완료되었습니다.',
      sessionId,
      analysis: {
        completionRate,
        timeSpent: timeSpentFormatted,
        focusOutCount,
        suspiciousFlags: suspiciousFlags.length > 0 ? suspiciousFlags : null
      }
    });

  } catch (error) {
    console.error('Submit API 오류:', error);
    return res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
}
