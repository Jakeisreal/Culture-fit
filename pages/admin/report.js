import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Printer, ShieldCheck, AlertTriangle } from 'lucide-react';
import Head from 'next/head';

export default function AdminReportPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');

  const [inputToken, setInputToken] = useState('');

  const loadReport = useCallback(async (adminToken, sessionId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/report?sessionId=${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || '리포트 조회에 실패했습니다.');
      localStorage.setItem('culture_fit_admin_token', adminToken);
      sessionStorage.setItem('culture_fit_admin_token', adminToken);
      setToken(adminToken);
      setData(body.report);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedToken =
        localStorage.getItem('culture_fit_admin_token') ||
        sessionStorage.getItem('culture_fit_admin_token') ||
        '';
      setToken(savedToken);
      
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('sessionId');
      
      if (!sessionId) {
        setError('유효하지 않은 접근입니다 (sessionId 누락).');
        setLoading(false);
        return;
      }

      if (savedToken) {
        loadReport(savedToken, sessionId);
      } else {
        setLoading(false);
      }
    }
  }, [loadReport]);

  const handleManualAuth = (e) => {
    e.preventDefault();
    if (!inputToken) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');
    if (!sessionId) {
      setError('sessionId가 누락되었습니다.');
      return;
    }
    loadReport(inputToken, sessionId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">리포트를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!token && !data) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleManualAuth}
          className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-7 shadow-sm"
        >
          <ShieldCheck className="h-9 w-9 text-teal-700 mb-4" />
          <h1 className="text-2xl font-bold text-gray-950">면접 리포트 인증</h1>
          <p className="mt-2 text-sm text-gray-600">리포트 열람을 위해 관리자 토큰을 입력해 주세요.</p>
          <label htmlFor="report-admin-token" className="mt-6 block text-sm font-semibold text-gray-700">
            관리자 토큰
          </label>
          <input
            id="report-admin-token"
            type="password"
            autoComplete="current-password"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            placeholder="관리자 토큰 입력"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={!inputToken}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            리포트 열람
          </button>
          <div className="mt-4 text-center">
            <a href="/admin" className="text-xs text-gray-500 hover:text-teal-700 inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> 관리자 대시보드로 이동
            </a>
          </div>
        </form>
      </main>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-100 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center text-red-700 mb-4">
            <AlertTriangle className="mr-2" />
            <h1 className="text-xl font-bold">리포트 조회 실패</h1>
          </div>
          <p className="text-gray-700 text-sm mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setToken('');
                setError('');
              }}
              className="flex-1 rounded-md bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              토큰 다시 입력
            </button>
            <a
              href="/admin"
              className="flex-1 inline-flex items-center justify-center rounded-md border border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 목록으로
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { basicInfo, quality, domains = [] } = data;

  const qualityColorClass = 
    quality?.color === 'red' ? 'bg-red-50 border-red-200 text-red-800' :
    quality?.color === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-800' :
    'bg-green-50 border-green-200 text-green-800';

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white text-gray-900">
      <Head>
        <title>면접관용 결과 리포트 - {basicInfo?.name}</title>
      </Head>

      <style jsx global>{`
        @media print {
          @page { margin: 1.5cm; size: A4 portrait; }
          body { -webkit-print-color-adjust: exact; font-family: serif; }
          .no-print { display: none !important; }
          .page-break-before { page-break-before: always; }
          .page-break-inside-avoid { page-break-inside: avoid; }
        }
      `}</style>

      {/* Top Navigation / Actions */}
      <div className="max-w-4xl mx-auto px-4 py-4 no-print flex items-center justify-between">
        <a href="/admin" className="inline-flex items-center text-gray-600 hover:text-teal-700">
          <ArrowLeft className="w-4 h-4 mr-1" />
          관리자 홈
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-4 py-2 bg-teal-700 text-white rounded-md hover:bg-teal-800"
        >
          <Printer className="w-4 h-4 mr-2" />
          인쇄하기
        </button>
      </div>

      <main className="max-w-4xl mx-auto bg-white p-8 md:p-12 print:p-0 shadow-sm print:shadow-none border border-gray-200 print:border-none rounded-lg print:rounded-none">
        
        {/* Header */}
        <header className="border-b-2 border-gray-900 pb-6 mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">면접관용 결과 리포트</h1>
            <p className="text-gray-500 mt-2 text-sm flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1 inline" /> Culture-Fit Assessment
            </p>
          </div>
        </header>

        {/* Basic Info */}
        <section className="mb-8 grid grid-cols-2 gap-4 text-sm border p-4 rounded-md page-break-inside-avoid">
          <div>
            <span className="text-gray-500 block mb-1">지원자 성명</span>
            <span className="font-bold text-lg">{basicInfo?.name || '알 수 없음'}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-1">식별자 (이메일)</span>
            <span className="font-medium">{basicInfo?.email?.replace(/(.{2})(.*)(@.*)/, '$1***$3') || '-'}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-1">응시 일시</span>
            <span className="font-medium">{basicInfo?.timestamp ? new Date(basicInfo.timestamp).toLocaleString('ko-KR') : '-'}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-1">평가 버전</span>
            <span className="font-medium">{basicInfo?.assessmentVersion || '-'}</span>
          </div>
        </section>

        {/* Quality Assessment */}
        {quality && (
          <section className={`mb-10 p-5 rounded-md border ${qualityColorClass} page-break-inside-avoid`}>
            <div className="flex items-start">
              {quality.color === 'red' ? (
                <AlertTriangle className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" />
              ) : quality.color === 'amber' ? (
                <AlertTriangle className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <h3 className="font-bold text-lg mb-1">응답 신뢰도: {quality.tierLabel}</h3>
                <p className="text-sm leading-relaxed opacity-90 whitespace-pre-line">{quality.guidanceText}</p>
              </div>
            </div>
          </section>
        )}

        {/* Domains */}
        <section className="mb-12">
          <h2 className="text-xl font-bold mb-6 border-b pb-2">핵심 가치 프로파일 및 면접 질문</h2>
          
          {domains.map((domain, idx) => {
            const avg = Number(domain.average) || 1;
            const barWidth = Math.max(0, Math.min(100, ((avg - 1) / 4) * 100));

            return (
              <article key={idx} className="mb-10 page-break-inside-avoid">
                <div className="flex justify-between items-baseline mb-2">
                  <h3 className="text-lg font-bold text-teal-800">{domain.domainName}</h3>
                  <span className="text-sm font-semibold bg-gray-100 px-2 py-1 rounded">
                    Score: {avg.toFixed(1)} / 5.0
                  </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-4">{domain.definition}</p>
                
                {/* Chart */}
                <div className="w-full bg-gray-200 h-2 rounded-full mb-4 overflow-hidden">
                  <div className="bg-teal-600 h-full rounded-full" style={{ width: `${barWidth}%` }} />
                </div>
                
                <p className="text-sm font-medium mb-4 leading-relaxed bg-gray-50 p-3 rounded">
                  {domain.interpretation}
                </p>

                {domain.interviewQuestion && (
                  <div className="mt-4 border-l-4 border-teal-600 pl-4 py-2 mb-4">
                    <p className="font-bold text-gray-900 mb-2">Q. {domain.interviewQuestion}</p>
                    {domain.probePoints && domain.probePoints.length > 0 && (
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 ml-2">
                        {domain.probePoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                
                {domain.noExperienceNote && (
                  <p className="text-sm text-amber-700 italic mt-2 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1 inline" />
                    {domain.noExperienceNote}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        {/* Behavior Rating Scale Table */}
        <section className="mb-12 page-break-before">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">행동 평가 척도 (BARS) 가이드</h2>
          <table className="w-full text-sm border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 p-2 text-center w-16">평정</th>
                <th className="border border-gray-300 p-2 text-center w-24">수준</th>
                <th className="border border-gray-300 p-2 text-left">행동 지표 설명</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 text-center font-bold">5</td>
                <td className="border border-gray-300 p-2 text-center text-green-700">매우 우수</td>
                <td className="border border-gray-300 p-2">핵심가치를 주도적으로 실천하며, 타인에게 긍정적인 영향력을 미치는 구체적 사례가 명확함</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 text-center font-bold">4</td>
                <td className="border border-gray-300 p-2 text-center text-teal-700">우수</td>
                <td className="border border-gray-300 p-2">핵심가치의 중요성을 이해하고, 실제 상황에서 일관되게 행동으로 옮긴 경험이 있음</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 text-center font-bold">3</td>
                <td className="border border-gray-300 p-2 text-center text-gray-700">보통</td>
                <td className="border border-gray-300 p-2">일반적인 상황에서는 핵심가치에 부합하게 행동하나, 도전적 상황에서의 실천 경험은 다소 부족함</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 text-center font-bold">2</td>
                <td className="border border-gray-300 p-2 text-center text-amber-600">미흡</td>
                <td className="border border-gray-300 p-2">핵심가치에 대한 이해가 제한적이며, 구체적인 실천 사례를 제시하지 못함</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 text-center font-bold">1</td>
                <td className="border border-gray-300 p-2 text-center text-red-600">매우 미흡</td>
                <td className="border border-gray-300 p-2">핵심가치에 반하는 행동 사례가 발견되거나, 조직 적응에 심각한 우려가 예상됨</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Interviewer Notes Template */}
        <section className="mb-8 page-break-inside-avoid">
          <h2 className="text-xl font-bold mb-4 border-b pb-2">면접관 종합 의견</h2>
          <div className="border border-gray-300 rounded p-4 h-48 flex items-start text-gray-400 text-sm">
            (이곳에 지원자에 대한 종합적인 면접 의견을 작성해 주세요)
          </div>
          
          <div className="mt-4 flex justify-end items-center space-x-4">
            <span className="text-sm font-bold">최종 평가:</span>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-1"><div className="w-4 h-4 border border-gray-400 rounded-sm"></div><span className="text-sm">합격</span></label>
              <label className="flex items-center space-x-1"><div className="w-4 h-4 border border-gray-400 rounded-sm"></div><span className="text-sm">보류</span></label>
              <label className="flex items-center space-x-1"><div className="w-4 h-4 border border-gray-400 rounded-sm"></div><span className="text-sm">불합격</span></label>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <span className="text-sm mr-4">면접관 성명:</span>
            <div className="w-48 border-b border-gray-400"></div>
            <span className="text-sm ml-2">(서명)</span>
          </div>
        </section>

        {/* Disclaimers */}
        <footer className="mt-12 pt-4 border-t text-xs text-gray-500 text-center print:text-left page-break-inside-avoid">
          <p>※ 본 리포트는 인성검사(Culture-Fit) 결과를 기반으로 면접관의 구조화된 질문을 돕기 위해 생성되었습니다.</p>
          <p>※ 검사 결과는 참고 자료로만 활용하시고, 실제 면접을 통한 심층 검증을 권장합니다.</p>
          <p>※ 본 자료에는 지원자의 민감한 개인정보가 포함되어 있으므로, 취급 및 파기에 각별히 주의하시기 바랍니다.</p>
        </footer>

      </main>

      {/* Bottom Actions */}
      <div className="max-w-4xl mx-auto px-4 py-8 no-print flex justify-center">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-6 py-3 bg-teal-700 text-white font-bold rounded-md hover:bg-teal-800 shadow-sm"
        >
          <Printer className="w-5 h-5 mr-2" />
          면접용 리포트 인쇄
        </button>
      </div>
    </div>
  );
}
