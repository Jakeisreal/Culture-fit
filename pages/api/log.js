// pages/api/log.js
import { logEvent } from '../../lib/sheets';

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

    await logEvent(
      sessionId,
      eventType,
      data,
      timestamp || new Date().toISOString()
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
