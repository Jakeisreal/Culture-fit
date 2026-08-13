// pages/api/log.js
import { logEvent } from '../../lib/sheets.js';
import { hasValidSession } from '../../lib/session-auth.js';
import { isRateLimited } from '../../lib/rate-limit.js';

const ALLOWED_EVENT_TYPES = new Set([
  'context_menu_blocked',
  'copy_blocked',
  'cut_blocked',
  'shortcut_blocked',
  'devtools_key_blocked',
  'tab_hidden',
  'window_blur',
  'page_unload',
]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'POST 메서드만 허용됩니다.' 
    });
  }

  try {
    const { sessionId, eventType, data, timestamp } = req.body || {};

    if (!sessionId || !eventType) {
      return res.status(200).json({
        success: false,
        message: 'sessionId와 eventType은 필수입니다.'
      });
    }

    if (!hasValidSession(req, sessionId)) {
      return res.status(401).json({ success: false, message: '유효하지 않은 세션입니다.' });
    }
    if (isRateLimited(`log:${sessionId}`, 120, 60000)) {
      return res.status(429).json({ success: false, message: '로그 요청이 너무 많습니다.' });
    }

    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ success: false, message: '허용되지 않은 이벤트 유형입니다.' });
    }

    const serializedData = JSON.stringify(data || {});
    if (serializedData.length > 2000) {
      return res.status(413).json({ success: false, message: '이벤트 데이터가 너무 큽니다.' });
    }

    await logEvent(
      sessionId,
      eventType,
      data,
      new Date().toISOString()
    );

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Log API 오류:', error);
    return res.status(200).json({
      success: false,
      message: '로그 기록 실패'
    });
  }
}
