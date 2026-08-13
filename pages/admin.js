import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

const statusLabel = {
  STARTED: '시작',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
};

export default function AdminDashboard() {
  const [token, setToken] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async (adminToken) => {
    if (!adminToken) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || '현황 조회에 실패했습니다.');
      sessionStorage.setItem('culture_fit_admin_token', adminToken);
      setData(body);
    } catch (loadError) {
      setData(null);
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('culture_fit_admin_token') || '';
    if (savedToken) {
      setToken(savedToken);
      loadStatus(savedToken);
    }
  }, [loadStatus]);

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-7 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            loadStatus(token);
          }}
        >
          <ShieldCheck className="h-9 w-9 text-teal-700 mb-5" />
          <h1 className="text-2xl font-bold text-gray-950">운영 현황</h1>
          <p className="mt-2 text-sm text-gray-600">관리자 토큰으로 인증해 주세요.</p>
          <label htmlFor="admin-token" className="mt-6 block text-sm font-semibold text-gray-700">
            관리자 토큰
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            인증
          </button>
        </form>
      </main>
    );
  }

  const metrics = [
    { label: '전체 지원자', value: data.summary.totalCandidates, icon: Users, tone: 'text-gray-700' },
    { label: '진행 중', value: data.summary.inProgress, icon: RefreshCw, tone: 'text-blue-700' },
    { label: '완료', value: data.summary.completed, icon: CheckCircle, tone: 'text-green-700' },
    { label: '검토 필요', value: data.summary.flagged, icon: AlertTriangle, tone: 'text-amber-700' },
  ];

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <h1 className="text-xl font-bold text-gray-950">Culture-Fit 운영 현황</h1>
            <p className="text-xs text-gray-500">
              {new Date(data.generatedAt).toLocaleString('ko-KR')} 기준
            </p>
          </div>
          <button
            type="button"
            aria-label="현황 새로고침"
            title="현황 새로고침"
            onClick={() => loadStatus(token)}
            className="rounded-md border border-gray-300 p-2 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <section aria-label="응시 요약" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-md border border-gray-200 bg-white p-4">
              <Icon className={`h-5 w-5 ${tone}`} />
              <p className="mt-4 text-sm text-gray-600">{label}</p>
              <p className="mt-1 text-3xl font-bold text-gray-950">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-md border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-950">최근 응시</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">지원자</th>
                  <th className="px-4 py-3 font-semibold">버전</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">완료율</th>
                  <th className="px-4 py-3 font-semibold">점수</th>
                  <th className="px-4 py-3 font-semibold">이상 신호</th>
                  <th className="px-4 py-3 font-semibold">갱신 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent.map((row) => (
                  <tr key={row.sessionId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{row.name || '-'}</p>
                      <p className="text-xs text-gray-500">{row.email}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-teal-700">
                      {row.assessmentVersion === 'v2-bank-pilot'
                        ? 'V2 Bank Pilot'
                        : row.assessmentVersion === 'v2-pilot' ? 'V2 Pilot' : 'V1'}
                    </td>
                    <td className="px-4 py-3">{statusLabel[row.status] || row.status || '-'}</td>
                    <td className="px-4 py-3">{row.completionRate || '-'}</td>
                    <td className="px-4 py-3">{row.score || '-'}</td>
                    <td className="px-4 py-3 text-amber-800">{row.suspicious || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.timestamp ? new Date(row.timestamp).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
                {data.recent.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-4 py-10 text-center text-gray-500">응시 기록이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
