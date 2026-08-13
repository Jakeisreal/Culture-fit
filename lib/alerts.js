export async function notifyCriticalError(area, error, context = {}) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([key]) => !/email|phone|name|answer|token|secret/i.test(key)),
  );
  const message = [
    `[Culture-Fit] ${area} 오류`,
    String(error?.message || error || 'Unknown error').slice(0, 500),
    Object.keys(safeContext).length ? JSON.stringify(safeContext).slice(0, 1000) : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch (alertError) {
    console.warn('장애 알림 전송 실패:', alertError);
    return false;
  }
}
