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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-600 font-medium">리포트를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!token && !data) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleManualAuth}
          className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-7 shadow-sm"
        >
          <ShieldCheck className="h-9 w-9 text-blue-800 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900">면접 리포트 인증</h1>
          <p className="mt-2 text-sm text-slate-600">리포트 열람을 위해 관리자 토큰을 입력해 주세요.</p>
          <label htmlFor="report-admin-token" className="mt-6 block text-sm font-semibold text-slate-700">
            관리자 토큰
          </label>
          <input
            id="report-admin-token"
            type="password"
            autoComplete="current-password"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            placeholder="관리자 토큰 입력"
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
          {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
          <button
            type="submit"
            disabled={!inputToken}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-800 px-4 py-3 font-semibold text-white hover:bg-blue-900 disabled:opacity-50"
          >
            리포트 열람
          </button>
          <div className="mt-4 text-center">
            <a href="/admin" className="text-xs text-slate-500 hover:text-blue-800 inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> 관리자 대시보드로 이동
            </a>
          </div>
        </form>
      </main>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-100 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center text-rose-700 mb-4">
            <AlertTriangle className="mr-2" />
            <h1 className="text-xl font-bold">리포트 조회 실패</h1>
          </div>
          <p className="text-slate-700 text-sm mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setToken('');
                setError('');
              }}
              className="flex-1 rounded-md bg-blue-800 py-2.5 text-sm font-semibold text-white hover:bg-blue-900"
            >
              토큰 다시 입력
            </button>
            <a
              href="/admin"
              className="flex-1 inline-flex items-center justify-center rounded-md border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> 목록으로
            </a>
          </div>
        </div>
      </div>
    );
  }

  const {
    basicInfo,
    performanceMetrics,
    cultureFit,
    teamFit,
  } = data;

  const cultureProfiles = cultureFit?.profiles || [];
  const teamProfiles = teamFit?.profiles || [];

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 font-sans py-6 print:py-0">
      <Head>
        <title>컬쳐핏·팀핏 종합 진단 보고서 - {basicInfo?.name}</title>
      </Head>

      <style jsx global>{`
        @media print {
          @page {
            margin: 0.6cm 0.8cm;
            size: A4 portrait;
          }
          body {
            -webkit-print-color-adjust: exact;
            background-color: white !important;
          }
          .no-print {
            display: none !important;
          }
          .page-container {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
          }
        }
      `}</style>

      {/* Top Action Bar (No Print) */}
      <div className="max-w-4xl mx-auto px-4 pb-4 no-print flex items-center justify-between">
        <a href="/admin" className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-blue-700">
          <ArrowLeft className="w-4 h-4 mr-1" /> 관리자 대시보드로 돌아가기
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white text-sm font-bold rounded-md shadow-sm transition-all"
        >
          <Printer className="w-4 h-4 mr-2" /> PDF 저장 / 인쇄하기
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        
        {/* ==================== 1 PAGE 진단 보고서 ==================== */}
        <div className="page-container bg-white p-7 md:p-9 rounded-xl shadow-md border border-slate-200 print:rounded-none print:p-0">
          
          {/* Main Title */}
          <div className="text-center pb-3 border-b-2 border-blue-900">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-blue-900">
              컬쳐핏 & 팀핏 종합 진단 보고서
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">Culture-Fit & Team-Fit Comprehensive Diagnosis Report</p>
          </div>

          {/* Top Info Cards (기본 정보 vs 성과지표) */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {/* 기본 정보 */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-blue-900 text-white font-bold text-xs px-3 py-1 flex items-center justify-between">
                <span>기본 정보</span>
                <span className="text-[10px] font-normal opacity-80">{basicInfo?.assessmentVersion || 'v2'}</span>
              </div>
              <div className="p-2.5 space-y-1 text-xs">
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-0.5">
                  <span className="text-slate-500">성명</span>
                  <span className="font-bold text-slate-900 text-sm">{basicInfo?.name}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-0.5">
                  <span className="text-slate-500">종합점수</span>
                  <span className="font-extrabold text-blue-700 text-base">{performanceMetrics?.totalAverage?.toFixed(1) || '3.2'}점 <span className="text-[10px] text-slate-400 font-normal">/ 5.0</span></span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">식별정보 (이메일)</span>
                  <span className="font-medium text-slate-700">{basicInfo?.email?.replace(/(.{2})(.*)(@.*)/, '$1***$3') || '-'}</span>
                </div>
              </div>
            </div>

            {/* 성과지표 */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-blue-900 text-white font-bold text-xs px-3 py-1 flex items-center justify-between">
                <span>성과지표</span>
                <span className="text-[10px] font-normal opacity-80">Norm Comparison</span>
              </div>
              <div className="p-2.5 space-y-1 text-xs">
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-0.5">
                  <span className="text-slate-500">백분위 / 등급</span>
                  <span className="font-bold text-slate-900">{performanceMetrics?.percentile} ({performanceMetrics?.grade}등급)</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-0.5">
                  <span className="text-slate-500">컬쳐 강점 / 약점</span>
                  <span className="font-bold">
                    <span className="text-teal-700">{performanceMetrics?.cultureStrength}</span> / <span className="text-rose-700">{performanceMetrics?.cultureWeakness}</span>
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500">팀핏 강점 / 약점</span>
                  <span className="font-bold">
                    <span className="text-teal-700">{performanceMetrics?.teamStrength}</span> / <span className="text-rose-700">{performanceMetrics?.teamWeakness}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle: Horizontal Layout (좌측: 컬쳐핏 프로파일 | 우측: 팀핏 프로파일) */}
          <div className="grid grid-cols-2 gap-4 mt-4 items-start">
            
            {/* 좌측: 컬쳐핏 (Culture-Fit) */}
            <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col">
              <div className="bg-blue-900 text-white font-bold text-xs px-3 py-1 flex items-center justify-between">
                <span>영역별 컬쳐핏 프로파일 (5대 핵심가치)</span>
                <div className="flex items-center gap-2 text-[10px] text-blue-200 font-normal">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-0.5 bg-slate-300 border border-slate-300 border-dashed inline-block"></span>전체평균</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-1 bg-blue-400 inline-block rounded-sm"></span>개인점수</span>
                </div>
              </div>
              
              {/* 레이더 차트 */}
              <div className="p-2.5 bg-slate-50/50 flex justify-center items-center border-b border-slate-200">
                <RadarChart
                  items={cultureProfiles.map((p) => ({
                    label: p.label,
                    value: p.score || 3,
                    norm: p.normMean || 3.3,
                  }))}
                  size={195}
                />
              </div>

              {/* 수준 분류표 */}
              <div className="p-0">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[10.5px]">
                      <th className="py-1 px-2 text-left font-semibold">영역</th>
                      <th className="py-1 px-2 font-semibold">점수</th>
                      <th className="py-1 px-2 font-semibold">수준</th>
                      <th className="py-1 px-2 font-semibold">평균대비</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cultureProfiles.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1 px-2 text-left font-medium text-slate-800 text-[11px]">{p.label}</td>
                        <td className="py-1 px-2 font-bold text-blue-900 text-[11px]">{p.score != null ? p.score.toFixed(2) : '-'}</td>
                        <td className="py-1 px-2">
                          <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                            p.level === 'High' ? 'bg-green-100 text-green-800' :
                            p.level === 'Low' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {p.level}
                          </span>
                        </td>
                        <td className={`py-1 px-2 font-semibold text-[10.5px] ${
                          p.diff > 0 ? 'text-teal-700' : p.diff < 0 ? 'text-rose-600' : 'text-slate-600'
                        }`}>
                          {p.diffText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 우측: 팀 핏 (Team-Fit) */}
            <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col">
              <div className="bg-teal-800 text-white font-bold text-xs px-3 py-1 flex items-center justify-between">
                <span>영역별 팀핏 프로파일 (Team-Fit)</span>
                <div className="flex items-center gap-2 text-[10px] text-teal-200 font-normal">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-0.5 bg-slate-300 border border-slate-300 border-dashed inline-block"></span>전체평균</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-1 bg-teal-300 inline-block rounded-sm"></span>개인점수</span>
                </div>
              </div>

              {/* 레이더 차트 */}
              <div className="p-2.5 bg-slate-50/50 flex justify-center items-center border-b border-slate-200">
                <RadarChart
                  items={teamProfiles.map((p) => ({
                    label: p.label.length > 7 ? p.label.slice(0, 6) + '..' : p.label,
                    value: p.score || 3,
                    norm: p.normMean || 3.3,
                  }))}
                  color="#0d9488"
                  size={195}
                />
              </div>

              {/* 수준 분류표 */}
              <div className="p-0">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[10.5px]">
                      <th className="py-1 px-2 text-left font-semibold">하위 영역</th>
                      <th className="py-1 px-2 font-semibold">점수</th>
                      <th className="py-1 px-2 font-semibold">수준</th>
                      <th className="py-1 px-2 font-semibold">평균대비</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamProfiles.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1 px-2 text-left font-medium text-slate-800 text-[11px]">{p.label}</td>
                        <td className="py-1 px-2 font-bold text-teal-800 text-[11px]">{p.score != null ? p.score.toFixed(2) : '-'}</td>
                        <td className="py-1 px-2">
                          <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                            p.level === 'High' ? 'bg-green-100 text-green-800' :
                            p.level === 'Low' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {p.level}
                          </span>
                        </td>
                        <td className={`py-1 px-2 font-semibold text-[10.5px] ${
                          p.diff > 0 ? 'text-teal-700' : p.diff < 0 ? 'text-rose-600' : 'text-slate-600'
                        }`}>
                          {p.diffText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Bottom: 예상 도출 질문 (Culture-Fit & Team-Fit 검증 질문) */}
          <div className="mt-4 border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-blue-900 text-white font-bold text-xs px-3 py-1">
              예상 도출 질문 (Culture-Fit & Team-Fit 심층 면접 질문)
            </div>
            <div className="p-3 bg-white space-y-3">
              
              {/* 컬쳐핏 강점 vs 약점 질문 */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-blue-700 rounded-full inline-block"></span>
                  컬쳐핏 검증 질문
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* 강점 영역 */}
                  <div className="border border-teal-200 bg-teal-50/40 rounded-lg p-2">
                    <div className="font-bold text-teal-900 mb-1 flex items-center justify-between border-b border-teal-200 pb-0.5 text-[10.5px]">
                      <span>강점 영역: {cultureFit?.strength?.domain}</span>
                      <span className="text-[9.5px] bg-teal-200 text-teal-800 px-1.5 py-0.2 rounded font-semibold">Score: {cultureFit?.strength?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-700 leading-relaxed text-[10px]">
                      {cultureFit?.strength?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>

                  {/* 약점 영역 */}
                  <div className="border border-rose-200 bg-rose-50/40 rounded-lg p-2">
                    <div className="font-bold text-rose-900 mb-1 flex items-center justify-between border-b border-rose-200 pb-0.5 text-[10.5px]">
                      <span>약점 영역: {cultureFit?.weakness?.domain}</span>
                      <span className="text-[9.5px] bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded font-semibold">Score: {cultureFit?.weakness?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-700 leading-relaxed text-[10px]">
                      {cultureFit?.weakness?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* 팀핏 강점 vs 약점 질문 */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-teal-700 rounded-full inline-block"></span>
                  팀핏 (Team-Fit) 검증 질문
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* 팀 강점 영역 */}
                  <div className="border border-teal-200 bg-teal-50/40 rounded-lg p-2">
                    <div className="font-bold text-teal-900 mb-1 flex items-center justify-between border-b border-teal-200 pb-0.5 text-[10.5px]">
                      <span>팀 강점: {teamFit?.strength?.domain}</span>
                      <span className="text-[9.5px] bg-teal-200 text-teal-800 px-1.5 py-0.2 rounded font-semibold">Score: {teamFit?.strength?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-700 leading-relaxed text-[10px]">
                      {teamFit?.strength?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>

                  {/* 팀 약점 영역 */}
                  <div className="border border-rose-200 bg-rose-50/40 rounded-lg p-2">
                    <div className="font-bold text-rose-900 mb-1 flex items-center justify-between border-b border-rose-200 pb-0.5 text-[10.5px]">
                      <span>팀 약점: {teamFit?.weakness?.domain}</span>
                      <span className="text-[9.5px] bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded font-semibold">Score: {teamFit?.weakness?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-700 leading-relaxed text-[10px]">
                      {teamFit?.weakness?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[9.5px] text-slate-400">
            <span>※ 본 보고서는 면접 시 행동 검증을 돕기 위한 보조자료이며, 점수만으로 당락을 결정하지 않습니다.</span>
            <span>Report Generated: {new Date().toLocaleDateString('ko-KR')} | Candidate: {basicInfo?.name}</span>
          </div>

        </div>

      </div>
    </div>
  );
}

function RadarChart({ items = [], color = '#2563eb', size = 195 }) {
  if (!items || items.length < 3) return null;

  const N = items.length;
  const center = size / 2;
  const radius = center - 32;

  const getCoordinates = (index, valueRatio) => {
    const angle = (Math.PI * 2 / N) * index - Math.PI / 2;
    const r = radius * valueRatio;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const gridPolygons = gridLevels.map((lvl) => {
    return Array.from({ length: N })
      .map((_, i) => {
        const { x, y } = getCoordinates(i, lvl);
        return `${x},${y}`;
      })
      .join(' ');
  });

  const normPoints = items
    .map((item, i) => {
      const ratio = Math.max(0.1, Math.min(1.0, (item.norm - 1) / 4));
      const { x, y } = getCoordinates(i, ratio);
      return `${x},${y}`;
    })
    .join(' ');

  const scorePoints = items
    .map((item, i) => {
      const ratio = Math.max(0.1, Math.min(1.0, (item.value - 1) / 4));
      const { x, y } = getCoordinates(i, ratio);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {gridPolygons.map((polyStr, idx) => (
          <polygon
            key={idx}
            points={polyStr}
            fill={idx === gridPolygons.length - 1 ? '#f8fafc' : 'none'}
            stroke="#cbd5e1"
            strokeWidth={idx === gridPolygons.length - 1 ? '1.5' : '1'}
          />
        ))}

        {Array.from({ length: N }).map((_, i) => {
          const { x, y } = getCoordinates(i, 1.0);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
          );
        })}

        <polygon
          points={normPoints}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        <polygon
          points={scorePoints}
          fill={color}
          fillOpacity="0.18"
          stroke={color}
          strokeWidth="2.5"
        />

        {items.map((item, i) => {
          const ratio = Math.max(0.1, Math.min(1.0, (item.value - 1) / 4));
          const { x, y } = getCoordinates(i, ratio);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3.5"
              fill={color}
              stroke="#ffffff"
              strokeWidth="1.5"
            />
          );
        })}

        {items.map((item, i) => {
          const angle = (Math.PI * 2 / N) * i - Math.PI / 2;
          const labelRadius = radius + 17;
          const lx = center + labelRadius * Math.cos(angle);
          const ly = center + labelRadius * Math.sin(angle);

          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontWeight="bold"
              fill="#1e293b"
            >
              {item.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
