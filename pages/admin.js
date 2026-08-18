import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileText,
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
    { label: '검토 권고', value: data.summary.flagged, icon: AlertTriangle, tone: 'text-amber-700' },
  ];

  return (
    <main className="min-h-screen bg-gray-100 pb-12">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
          <div>
            <h1 className="text-xl font-bold text-gray-950">Culture-Fit 검사 운영 현황</h1>
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
        {/* 안내 배너 */}
        <div className="mb-6 rounded-md border border-teal-200 bg-teal-50 p-4 text-xs md:text-sm text-teal-950">
          <p className="font-semibold mb-1 flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-teal-700 flex-shrink-0" />
            핵심 가치 프로파일 및 면접 활용 원칙
          </p>
          <p className="text-teal-800 leading-relaxed">
            본 검사는 점수로 순위를 매기거나 지원자를 서열화하지 않습니다. 회사의 5대 핵심가치(원칙중시, 혁신성, 고객중심, 의사소통, 도전정신)와의 정합도를 확인하고 구조화 면접 질문을 구성하기 위한 보조자료로 활용됩니다. 각 지원자의 <strong>[면접 리포트]</strong>를 확인해 주세요.
          </p>
        </div>

        <section aria-label="응시 요약" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <article key={label} className="rounded-md border border-gray-200 bg-white p-4">
              <Icon className={`h-5 w-5 ${tone}`} />
              <p className="mt-4 text-sm text-gray-600">{label}</p>
              <p className="mt-1 text-3xl font-bold text-gray-950">{value}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold text-gray-950">최근 응시 현황</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">지원자</th>
                  <th className="px-4 py-3 font-semibold">버전</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">완료율</th>
                  <th className="px-4 py-3 font-semibold">응답 품질</th>
                  <th className="px-4 py-3 font-semibold">면접 리포트</th>
                  <th className="px-4 py-3 font-semibold">갱신 시각</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.recent.map((row) => {
                  const quality = row.responseQuality || {
                    tier: 'interpretable',
                    label: '해석 가능',
                    color: 'text-green-700',
                    bgColor: 'bg-green-50',
                  };
                  return (
                    <tr key={row.sessionId} className="hover:bg-gray-50 transition-colors">
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
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${quality.bgColor} ${quality.color}`}>
                          {quality.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {row.status === 'COMPLETED' ? (
                          <a
                            href={`/admin/report?sessionId=${encodeURIComponent(row.sessionId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            리포트 보기
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">응시 중</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {row.timestamp ? new Date(row.timestamp).toLocaleString('ko-KR') : '-'}
                      </td>
                    </tr>
                  );
                })}
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
