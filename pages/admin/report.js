import { useEffect, useState } from 'react';
import Head from 'next/head';
import {
  Printer,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function AdminReportPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [showAuthPanel, setShowAuthPanel] = useState(false);

  useEffect(() => {
    const savedToken =
      sessionStorage.getItem('culture_fit_admin_token') ||
      localStorage.getItem('culture_fit_admin_token');

    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');

    if (!sessionId) {
      setError('세션 ID가 지정되지 않았습니다.');
      setLoading(false);
      return;
    }

    async function fetchReport() {
      try {
        const res = await fetch(`/api/admin/report?sessionId=${encodeURIComponent(sessionId)}`, {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.message || '리포트를 불러올 수 없습니다.');
        }
        setData(json.report);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, []);

  const handleManualLogin = (e) => {
    e.preventDefault();
    if (!token) return;
    sessionStorage.setItem('culture_fit_admin_token', token);
    localStorage.setItem('culture_fit_admin_token', token);
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-blue-800 animate-spin mb-3" />
        <p className="text-slate-600 font-medium text-sm">진단 보고서를 생성하는 중입니다...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-100 p-8 flex items-center justify-center">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center text-blue-900 mb-4">
            <ShieldCheck className="mr-2" />
            <h1 className="text-xl font-bold">관리자 인증 필요</h1>
          </div>
          <p className="text-slate-600 text-sm mb-6">
            리포트 열람 권한이 필요합니다. 관리자 토큰을 입력해 주세요.
          </p>
          <form onSubmit={handleManualLogin} className="space-y-4">
            <input
              type="password"
              placeholder="관리자 인증 토큰"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-blue-700"
            />
            <button
              type="submit"
              className="w-full py-2 bg-blue-800 text-white font-semibold rounded-md hover:bg-blue-900 text-sm transition-colors"
            >
              인증 후 리포트 보기
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
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
    qualityAssessment,
    authenticityChecks = [],
    cautionReasons = [],
    hasAuthenticityWarning,
  } = data;

  const cultureProfiles = cultureFit?.profiles || [];
  const teamProfiles = teamFit?.profiles || [];

  // 응답 속도가 너무 빠른 경우(FAST_RESPONSE)를 제외한 진정성 검증 이상 사유 추출
  const effectiveCautionReasons = cautionReasons && cautionReasons.length > 0
    ? cautionReasons
    : authenticityChecks
        .filter((c) => c.isWarning && c.id !== 'fast_response')
        .map((c) => `${c.label}: ${c.description}`);

  const hasWarning = hasAuthenticityWarning !== undefined
    ? Boolean(hasAuthenticityWarning)
    : effectiveCautionReasons.length > 0;
  const isCohort = performanceMetrics?.isCohortBased;
  const benchmarkLabel = isCohort ? '응시자평균' : '전체평균';
  const cohortBadgeText = isCohort
    ? `응시자 집단 비교 (N=${performanceMetrics?.cohortCount || '-'}명)`
    : '표준 규준 비교';

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white text-slate-900 font-sans py-5 print:py-0">
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
            font-size: 11pt;
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
            width: 100% !important;
          }
        }
      `}</style>

      {/* Top Action Bar (No Print) */}
      <div className="max-w-4xl mx-auto px-4 pb-3 no-print flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <a href="/admin" className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-blue-700">
          <ArrowLeft className="w-4 h-4 mr-1" /> 관리자 대시보드로 돌아가기
        </a>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAuthPanel(!showAuthPanel)}
            className={`inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-md border shadow-sm transition-all ${
              showAuthPanel
                ? 'bg-slate-800 text-white border-slate-800'
                : hasWarning
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {showAuthPanel ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
            <span>응답 진정성 검증 (담당자용)</span>
            {hasWarning && !showAuthPanel && (
              <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-extrabold animate-pulse">
                주의
              </span>
            )}
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center px-4 py-2 bg-blue-800 hover:bg-blue-900 text-white text-xs font-bold rounded-md shadow-sm transition-all"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" /> PDF 저장 / 인쇄하기
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-4">

        {/* ==================== 채용담당자 전용: 응답 진정성 검증 패널 (No Print) ==================== */}
        {showAuthPanel && (
          <div className="no-print bg-slate-900 text-white p-5 rounded-xl shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-sm tracking-wide text-white">
                  채용담당자 전용: 응답 진정성 및 신뢰도 검증 결과
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                ※ 인쇄 시 이 패널은 출력물에 포함되지 않습니다.
              </span>
            </div>

            {/* 신뢰도 요약 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800/80 border border-slate-700 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block mb-1">종합 신뢰도 등급</span>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-extrabold ${
                    qualityAssessment?.tier === 'interpretable'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : qualityAssessment?.tier === 'caution'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  }`}>
                    {qualityAssessment?.label || '해석 가능'}
                  </span>
                </div>
              </div>

              <div className="sm:col-span-2 bg-slate-800/80 border border-slate-700 rounded-lg p-3">
                <span className="text-[11px] text-slate-400 block mb-1">면접관 해석 지침</span>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {qualityAssessment?.guidance}
                </p>
              </div>
            </div>

            {/* 8대 응답 진정성 검사 지표 그리드 */}
            <div>
              <span className="text-[11px] text-slate-400 font-bold block mb-2">
                8대 응답 진정성 세부 검증 지표:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {authenticityChecks.map((chk) => (
                  <div
                    key={chk.id}
                    className={`p-2.5 rounded-lg border transition-all ${
                      chk.isWarning
                        ? 'bg-rose-950/40 border-rose-800/80 text-rose-100'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs truncate mr-1">{chk.label}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold flex-shrink-0 ${
                        chk.isWarning
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-700 text-teal-300'
                      }`}>
                        {chk.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {chk.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* 주의 플래그 목록 */}
            {qualityAssessment?.caveats && qualityAssessment.caveats.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <span className="text-[11px] text-amber-300 font-bold block mb-1">
                  감지된 주의 플래그 목록:
                </span>
                <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-0.5">
                  {qualityAssessment.caveats.map((cav, idx) => (
                    <li key={idx}>{cav}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        
        {/* ==================== 1 PAGE 진단 보고서 (면접관 제공용 인쇄물) ==================== */}
        <div className="page-container bg-white p-7 md:p-8 rounded-xl shadow-md border border-slate-200 print:rounded-none print:p-0">
          
          {/* Main Title & 본문 우측 진정성 주의 배너/아이콘 */}
          <div className="pb-2.5 border-b-2 border-blue-900 flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-blue-950">
                컬쳐핏 & 팀핏 종합 진단 보고서
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">Culture-Fit & Team-Fit Comprehensive Diagnosis Report</p>
            </div>

            {/* 진정성 검증 상 정상이 아닌 경우: 본문 우측에 단일 아이콘 뱃지 표기 */}
            {hasWarning && (
              <div className="flex items-center gap-1.5 sm:justify-end pb-0.5">
                <div className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-amber-900 px-3 py-1.5 rounded-md text-xs font-bold shadow-2xs">
                  <Eye className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
                  <span className="tracking-tight">검사 응답 의심</span>
                  <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-extrabold shadow-2xs">
                    주의
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Top Info Cards (기본 정보 vs 성과지표) */}
          <div className="grid grid-cols-2 gap-3.5 mt-3.5">
            {/* 기본 정보 */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-blue-900 text-white font-bold text-xs px-3.5 py-1.5 flex items-center justify-between">
                <span>기본 정보</span>
                <span className="text-[10.5px] font-normal opacity-85">{basicInfo?.assessmentVersion || 'v2'}</span>
              </div>
              <div className="p-3 space-y-1.5 text-xs md:text-[12.5px]">
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-medium">성명</span>
                  <span className="font-extrabold text-slate-950 text-base">{basicInfo?.name}</span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-medium">종합점수</span>
                  <span className="font-black text-blue-800 text-lg">
                    {performanceMetrics?.totalAverage?.toFixed(1) || '3.2'}점
                    <span className="text-[11px] text-slate-400 font-normal ml-0.5">/ 5.0</span>
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 font-medium">식별정보 (이메일)</span>
                  <span className="font-semibold text-slate-700">{basicInfo?.email?.replace(/(.{2})(.*)(@.*)/, '$1***$3') || '-'}</span>
                </div>
              </div>
            </div>

            {/* 성과지표 */}
            <div className="border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-blue-900 text-white font-bold text-xs px-3.5 py-1.5 flex items-center justify-between">
                <span>성과지표</span>
                <span className="text-[10.5px] font-semibold text-blue-100">{cohortBadgeText}</span>
              </div>
              <div className="p-3 space-y-1.5 text-xs md:text-[12.5px]">
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-medium">종합 등급</span>
                  <span className="font-black text-blue-900 text-base">
                    {performanceMetrics?.grade}등급
                  </span>
                </div>
                <div className="flex justify-between items-baseline border-b border-slate-100 pb-1">
                  <span className="text-slate-500 font-medium">컬쳐 강점 / 약점</span>
                  <span className="font-bold">
                    <span className="text-teal-700">{performanceMetrics?.cultureStrength}</span>
                    <span className="text-slate-300 mx-1">/</span>
                    <span className="text-rose-700">{performanceMetrics?.cultureWeakness}</span>
                  </span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-500 font-medium">팀핏 강점 / 약점</span>
                  <span className="font-bold">
                    <span className="text-teal-700">{performanceMetrics?.teamStrength}</span>
                    <span className="text-slate-300 mx-1">/</span>
                    <span className="text-rose-700">{performanceMetrics?.teamWeakness}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Middle: Horizontal Layout (좌측: 컬쳐핏 프로파일 | 우측: 팀핏 프로파일) */}
          <div className="grid grid-cols-2 gap-3.5 mt-3.5 items-start">
            
            {/* 좌측: 컬쳐핏 (Culture-Fit) */}
            <div className="border border-slate-300 rounded-lg overflow-hidden flex flex-col">
              <div className="bg-blue-900 text-white font-bold text-xs px-3.5 py-1.5 flex items-center justify-between">
                <span>영역별 컬쳐핏 프로파일 (5대 핵심가치)</span>
                <div className="flex items-center gap-2 text-[10.5px] text-blue-200 font-normal">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-0.5 bg-slate-300 border border-slate-300 border-dashed inline-block"></span>
                    {benchmarkLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-1 bg-blue-400 inline-block rounded-xs"></span>
                    개인점수
                  </span>
                </div>
              </div>
              
              {/* 레이더 차트 (220px로 확대하여 시원하게 표시) */}
              <div className="p-2 bg-slate-50/60 flex justify-center items-center border-b border-slate-200">
                <RadarChart
                  items={cultureProfiles.map((p) => ({
                    label: p.label,
                    value: p.score || 3,
                    norm: p.normMean || 3.3,
                  }))}
                  size={220}
                />
              </div>

              {/* 수준 분류표 */}
              <div className="p-0">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px]">
                      <th className="py-1.5 px-2.5 text-left font-bold">영역</th>
                      <th className="py-1.5 px-2 font-bold">점수</th>
                      <th className="py-1.5 px-2 font-bold">수준</th>
                      <th className="py-1.5 px-2 font-bold">평균대비</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs md:text-[12px]">
                    {cultureProfiles.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 text-left font-bold text-slate-800">{p.label}</td>
                        <td className="py-1.5 px-2 font-extrabold text-blue-900">{p.score != null ? p.score.toFixed(2) : '-'}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            p.level === 'High' ? 'bg-green-100 text-green-800' :
                            p.level === 'Low' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {p.level}
                          </span>
                        </td>
                        <td className={`py-1.5 px-2 font-bold text-[11px] ${
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
              <div className="bg-teal-800 text-white font-bold text-xs px-3.5 py-1.5 flex items-center justify-between">
                <span>영역별 팀핏 프로파일 (Team-Fit)</span>
                <div className="flex items-center gap-2 text-[10.5px] text-teal-200 font-normal">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-0.5 bg-slate-300 border border-slate-300 border-dashed inline-block"></span>
                    {benchmarkLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-1 bg-teal-300 inline-block rounded-xs"></span>
                    개인점수
                  </span>
                </div>
              </div>

              {/* 레이더 차트 (220px로 확대) */}
              <div className="p-2 bg-slate-50/60 flex justify-center items-center border-b border-slate-200">
                <RadarChart
                  items={teamProfiles.map((p) => ({
                    label: p.label.length > 7 ? p.label.slice(0, 6) + '..' : p.label,
                    value: p.score || 3,
                    norm: p.normMean || 3.3,
                  }))}
                  color="#0d9488"
                  size={220}
                />
              </div>

              {/* 수준 분류표 */}
              <div className="p-0">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px]">
                      <th className="py-1.5 px-2.5 text-left font-bold">하위 영역</th>
                      <th className="py-1.5 px-2 font-bold">점수</th>
                      <th className="py-1.5 px-2 font-bold">수준</th>
                      <th className="py-1.5 px-2 font-bold">평균대비</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs md:text-[12px]">
                    {teamProfiles.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 text-left font-bold text-slate-800">{p.label}</td>
                        <td className="py-1.5 px-2 font-extrabold text-teal-800">{p.score != null ? p.score.toFixed(2) : '-'}</td>
                        <td className="py-1.5 px-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            p.level === 'High' ? 'bg-green-100 text-green-800' :
                            p.level === 'Low' ? 'bg-rose-100 text-rose-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {p.level}
                          </span>
                        </td>
                        <td className={`py-1.5 px-2 font-bold text-[11px] ${
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
          <div className="mt-3.5 border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-blue-900 text-white font-bold text-xs px-3.5 py-1.5">
              예상 도출 질문 (Culture-Fit & Team-Fit 심층 면접 질문)
            </div>
            <div className="p-3 bg-white space-y-2.5">
              
              {/* 컬쳐핏 강점 vs 약점 질문 */}
              <div>
                <div className="text-[11.5px] font-bold text-slate-700 mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-blue-700 rounded-full inline-block"></span>
                  컬쳐핏 검증 질문
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* 강점 영역 */}
                  <div className="border border-teal-200 bg-teal-50/40 rounded-lg p-2.5">
                    <div className="font-bold text-teal-950 mb-1 flex items-center justify-between border-b border-teal-200 pb-0.5 text-[11px]">
                      <span>강점 영역: {cultureFit?.strength?.domain}</span>
                      <span className="text-[10px] bg-teal-200 text-teal-800 px-1.5 py-0.2 rounded font-bold">Score: {cultureFit?.strength?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-800 leading-snug text-[11px]">
                      {cultureFit?.strength?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>

                  {/* 약점 영역 */}
                  <div className="border border-rose-200 bg-rose-50/40 rounded-lg p-2.5">
                    <div className="font-bold text-rose-950 mb-1 flex items-center justify-between border-b border-rose-200 pb-0.5 text-[11px]">
                      <span>약점 영역: {cultureFit?.weakness?.domain}</span>
                      <span className="text-[10px] bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded font-bold">Score: {cultureFit?.weakness?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-800 leading-snug text-[11px]">
                      {cultureFit?.weakness?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* 팀핏 강점 vs 약점 질문 */}
              <div>
                <div className="text-[11.5px] font-bold text-slate-700 mb-1 uppercase tracking-wide flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-teal-700 rounded-full inline-block"></span>
                  팀핏 (Team-Fit) 검증 질문
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {/* 팀 강점 영역 */}
                  <div className="border border-teal-200 bg-teal-50/40 rounded-lg p-2.5">
                    <div className="font-bold text-teal-950 mb-1 flex items-center justify-between border-b border-teal-200 pb-0.5 text-[11px]">
                      <span>팀 강점: {teamFit?.strength?.domain}</span>
                      <span className="text-[10px] bg-teal-200 text-teal-800 px-1.5 py-0.2 rounded font-bold">Score: {teamFit?.strength?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-800 leading-snug text-[11px]">
                      {teamFit?.strength?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>

                  {/* 팀 약점 영역 */}
                  <div className="border border-rose-200 bg-rose-50/40 rounded-lg p-2.5">
                    <div className="font-bold text-rose-950 mb-1 flex items-center justify-between border-b border-rose-200 pb-0.5 text-[11px]">
                      <span>팀 약점: {teamFit?.weakness?.domain}</span>
                      <span className="text-[10px] bg-rose-200 text-rose-800 px-1.5 py-0.2 rounded font-bold">Score: {teamFit?.weakness?.score?.toFixed(2)}</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-800 leading-snug text-[11px]">
                      {teamFit?.weakness?.questions?.slice(0, 3).map((q, i) => (
                        <li key={i} className="pl-0.5">{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* 주의 아이콘 뱃지를 표기한 경우: 예상 도출 질문 하단에 뱃지가 표기된 이유 기술 */}
              {hasWarning && effectiveCautionReasons.length > 0 && (
                <div className="mt-2.5 border border-amber-300 bg-amber-50/80 rounded-lg p-2.5 text-amber-950">
                  <div className="flex items-center justify-between border-b border-amber-200/80 pb-1 mb-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-[11.5px] text-amber-900">
                      <Eye className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
                      <span>[검사 응답 의심] 뱃지 표기 사유</span>
                    </div>
                    <span className="text-[10px] bg-amber-500 text-white font-extrabold px-1.5 py-0.2 rounded-full">
                      주의 사유 {effectiveCautionReasons.length}건
                    </span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900 leading-snug">
                    {effectiveCautionReasons.map((reason, idx) => (
                      <li key={idx} className="pl-0.5 font-medium">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[10px] text-slate-400">
            <span>※ 본 보고서는 면접 시 행동 검증을 돕기 위한 보조자료이며, 점수만으로 당락을 결정하지 않습니다.</span>
            <span>Report Generated: {new Date().toLocaleDateString('ko-KR')} | Candidate: {basicInfo?.name}</span>
          </div>

        </div>

      </div>
    </div>
  );
}

function RadarChart({ items = [], color = '#2563eb', size = 220 }) {
  if (!items || items.length < 3) return null;

  const N = items.length;
  const center = size / 2;
  const radius = center - 35;

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
      const ratio = Math.max(0.1, Math.min(1.0, (item.norm || 3.0) / 5.0));
      const { x, y } = getCoordinates(i, ratio);
      return `${x},${y}`;
    })
    .join(' ');

  const userPoints = items
    .map((item, i) => {
      const ratio = Math.max(0.1, Math.min(1.0, (item.value || 3.0) / 5.0));
      const { x, y } = getCoordinates(i, ratio);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={size} height={size} className="overflow-visible select-none">
      {/* Background Grids */}
      {gridPolygons.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill={idx === gridPolygons.length - 1 ? '#ffffff' : 'none'}
          stroke="#e2e8f0"
          strokeWidth="1"
        />
      ))}

      {/* Axis Lines */}
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

      {/* Norm Benchmark Polygon (전체/응시자 평균 점선) */}
      <polygon
        points={normPoints}
        fill="none"
        stroke="#94a3b8"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />

      {/* User Candidate Polygon (지원자 점수) */}
      <polygon
        points={userPoints}
        fill={color}
        fillOpacity="0.25"
        stroke={color}
        strokeWidth="2.5"
      />

      {/* User Points Dots */}
      {items.map((item, i) => {
        const ratio = Math.max(0.1, Math.min(1.0, (item.value || 3.0) / 5.0));
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

      {/* Labels */}
      {items.map((item, i) => {
        const { x, y } = getCoordinates(i, 1.22);
        return (
          <text
            key={i}
            x={x}
            y={y + 3}
            textAnchor="middle"
            className="text-[11px] font-bold fill-slate-700 tracking-tight"
          >
            {item.label}
          </text>
        );
      })}
    </svg>
  );
}
