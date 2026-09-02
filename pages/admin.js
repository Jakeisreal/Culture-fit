import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import Head from 'next/head';

const statusLabel = {
  NOT_STARTED: '미응시',
  STARTED: '응시 중',
  IN_PROGRESS: '응시 중',
  COMPLETED: '완료',
};

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterWarningOnly, setFilterWarningOnly] = useState(false);
  const [showRecentLog, setShowRecentLog] = useState(false);

  const loadStatus = useCallback(async (adminToken) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/status', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.message || '현황 조회에 실패했습니다.');
      localStorage.setItem('culture_fit_admin_token', adminToken);
      sessionStorage.setItem('culture_fit_admin_token', adminToken);
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedToken =
      localStorage.getItem('culture_fit_admin_token') ||
      sessionStorage.getItem('culture_fit_admin_token');
    if (!savedToken) return;
    setToken(savedToken);
    loadStatus(savedToken);
  }, [loadStatus]);

  if (!data) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Head>
          <title>채용 관리자 인증 - Culture-Fit</title>
        </Head>
        <form
          className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-7 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            loadStatus(token);
          }}
        >
          <ShieldCheck className="h-9 w-9 text-teal-700 mb-4" />
          <h1 className="text-2xl font-bold text-gray-950">채용 관리자 대시보드</h1>
          <p className="mt-2 text-sm text-gray-600">진단 결과 및 현황 조회를 위해 관리자 토큰을 입력해 주세요.</p>
          <label htmlFor="admin-token" className="mt-6 block text-sm font-semibold text-gray-700">
            관리자 토큰
          </label>
          <input
            id="admin-token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="관리자 인증 토큰 입력"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2.5 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 text-sm"
          />
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors text-sm"
          >
            {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            대시보드 로그인
          </button>
        </form>
      </main>
    );
  }

  const completedList = data.completedCandidates || [];
  const filteredCompleted = completedList.filter((candidate) => {
    const matchesKeyword =
      !searchKeyword.trim() ||
      candidate.name?.toLowerCase().includes(searchKeyword.toLowerCase().trim()) ||
      candidate.email?.toLowerCase().includes(searchKeyword.toLowerCase().trim());
    const matchesWarning = !filterWarningOnly || candidate.hasAuthenticityWarning;
    return matchesKeyword && matchesWarning;
  });

  const metrics = [
    { label: '전체 대상자', value: data.summary.totalCandidates, icon: Users, tone: 'text-gray-700', bg: 'bg-gray-50' },
    { label: '응시 진행 중', value: data.summary.inProgress, icon: RefreshCw, tone: 'text-blue-700', bg: 'bg-blue-50' },
    { label: '응시 완료', value: data.summary.completed, icon: CheckCircle, tone: 'text-teal-700', bg: 'bg-teal-50', highlight: true },
    { label: '신뢰도 주의 감지', value: data.summary.flagged, icon: AlertTriangle, tone: 'text-amber-700', bg: 'bg-amber-50' },
  ];

  return (
    <main className="min-h-screen bg-slate-100 pb-16 font-sans text-slate-900">
      <Head>
        <title>Culture-Fit & Team-Fit 채용 관리자 대시보드</title>
      </Head>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 md:px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-xs">
              CF
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-950 flex items-center gap-2">
                컬쳐핏 & 팀핏 진단 관리자 대시보드
              </h1>
              <p className="text-xs text-slate-500">
                마지막 갱신: {new Date(data.generatedAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadStatus(token)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 space-y-6">

        {/* 요약 메트릭 카드 */}
        <section aria-label="요약 지표" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, tone, bg, highlight }) => (
            <article
              key={label}
              className={`rounded-xl border p-4 bg-white shadow-xs flex items-center justify-between ${
                highlight ? 'border-teal-300 ring-2 ring-teal-100' : 'border-slate-200'
              }`}
            >
              <div>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-black ${highlight ? 'text-teal-800' : 'text-slate-900'}`}>
                  {value}<span className="text-sm font-normal text-slate-400 ml-0.5">명</span>
                </p>
              </div>
              <div className={`p-2.5 rounded-xl ${bg}`}>
                <Icon className={`h-5 w-5 ${tone}`} />
              </div>
            </article>
          ))}
        </section>

        {/* 안내 배너 */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950 flex items-start gap-3 shadow-xs">
          <Info className="h-4 w-4 text-blue-700 flex-shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold">💡 인사담당자 진단 수치 활용 가이드:</span>
            <span className="ml-1 text-blue-900">
              아래 표는 <strong>현재까지 응시를 완료한 전체 지원자들의 역량 점수 및 응답 진정성 세부 수치 비교표</strong>입니다.
              바람직성(SDS ≥4.2), 인상관리(IM ≥4.0), 자기기만(SDE ≥4.2), 역기능(CWB &lt;2.8), 주의력 실패(IMC &gt;0) 등 이상 기준치 초과 시
              자동으로 <strong>'주의'</strong>가 표시됩니다. 지원자 우측의 <strong>[진단 리포트]</strong>를 클릭하면 개별 1페이지 진단 보고서로 바로 이동합니다.
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* [메인 제1섹션] 응시 완료자 상세 수치 비교 테이블         */}
        {/* ======================================================== */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>📋 응시 완료자 상세 수치 비교표</span>
                <span className="bg-teal-100 text-teal-800 text-xs font-extrabold px-2 py-0.5 rounded-full">
                  총 {completedList.length}명 완료
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                지원자별 컬쳐핏·팀핏 역량 점수와 8대 응답 진정성 수치를 한눈에 비교합니다.
              </p>
            </div>

            {/* 필터 및 검색 */}
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="이름 또는 이메일 검색"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600 outline-none w-48 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => setFilterWarningOnly(!filterWarningOnly)}
                className={`px-3 py-1.5 text-xs rounded-lg border font-semibold transition-all ${
                  filterWarningOnly
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {filterWarningOnly ? '✓ 주의 대상만 보기' : '주의 대상 필터'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
              <thead>
                {/* 상단 그룹 헤더 */}
                <tr className="bg-slate-100 text-slate-600 text-[11px] border-b border-slate-200">
                  <th colSpan="3" className="px-3 py-2 text-center font-bold border-r border-slate-200">기본 정보</th>
                  <th colSpan="2" className="px-3 py-2 text-center font-bold border-r border-slate-200 bg-blue-50/60 text-blue-900">종합 결과</th>
                  <th colSpan="2" className="px-3 py-2 text-center font-bold border-r border-slate-200 bg-teal-50/60 text-teal-900">컬쳐핏 & 팀핏 강/약점</th>
                  <th colSpan="7" className="px-3 py-2 text-center font-bold border-r border-slate-200 bg-amber-50/60 text-amber-900">
                    🔍 응답 진정성 검증 수치 (8대 지표 비교)
                  </th>
                  <th className="px-3 py-2 text-center font-bold">리포트</th>
                </tr>
                {/* 세부 컬럼 헤더 */}
                <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                  <th className="px-3 py-2.5">성명</th>
                  <th className="px-3 py-2.5">이메일</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">응시일시 (소요)</th>
                  
                  {/* 종합 */}
                  <th className="px-3 py-2.5 text-center">종합 점수</th>
                  <th className="px-3 py-2.5 text-center border-r border-slate-200">등급 / 백분위</th>
                  
                  {/* 강약점 */}
                  <th className="px-3 py-2.5">컬쳐핏 (강/약)</th>
                  <th className="px-3 py-2.5 border-r border-slate-200">팀 핏 (강/약)</th>

                  {/* 진정성 수치들 */}
                  <th className="px-2.5 py-2.5 text-center" title="사회적 바람직성 평균 (≥4.2 주의)">바람직성(SDS)</th>
                  <th className="px-2.5 py-2.5 text-center" title="인상관리 평균 (≥4.0 주의)">인상관리(IM)</th>
                  <th className="px-2.5 py-2.5 text-center" title="자기기만 평균 (≥4.2 주의)">자기기만(SDE)</th>
                  <th className="px-2.5 py-2.5 text-center" title="역기능행동 평균 (<2.8 위험)">역기능(CWB)</th>
                  <th className="px-2.5 py-2.5 text-center" title="주의력검사(IMC) 실패 건수">IMC실패</th>
                  <th className="px-2.5 py-2.5 text-center" title="중복문항 불일치(≥2.5) 쌍 수">중복불일치</th>
                  <th className="px-2.5 py-2.5 text-center border-r border-slate-200">신뢰도 판정</th>

                  {/* 액션 */}
                  <th className="px-3 py-2.5 text-center">리포트 열람</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompleted.map((c) => {
                  const isSdsHigh = c.sdsAvg != null && c.sdsAvg >= 4.2;
                  const isImHigh = c.imAvg != null && c.imAvg >= 4.0;
                  const isSdeHigh = c.sdeAvg != null && c.sdeAvg >= 4.2;
                  const isCwbLow = c.cwbAvg != null && c.cwbAvg < 2.8;
                  const isImcFail = c.imcFailedCount > 0;
                  const isRepeatFail = c.repeatDiffPairs >= 4;

                  return (
                    <tr key={c.sessionId} className="hover:bg-slate-50/80 transition-colors">
                      {/* 성명 */}
                      <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {c.name || '-'}
                      </td>
                      {/* 이메일 */}
                      <td className="px-3 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        {c.email || '-'}
                      </td>
                      {/* 응시일시 & 소요시간 */}
                      <td className="px-3 py-3 text-slate-500 text-[11px] border-r border-slate-200 whitespace-nowrap">
                        <div>{c.timestamp ? new Date(c.timestamp).toLocaleDateString('ko-KR') : '-'}</div>
                        <div className="text-[10px] text-slate-400">
                          {c.timestamp ? new Date(c.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''}
                          {c.timeSpentMinutes ? ` (${c.timeSpentMinutes}분)` : ''}
                        </div>
                      </td>

                      {/* 종합점수 */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <span className="font-extrabold text-blue-900 text-sm">
                          {c.totalAverage != null ? c.totalAverage.toFixed(1) : (c.totalScore ? (c.totalScore / 20).toFixed(1) : '-')}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-0.5">/ 5.0</span>
                      </td>

                      {/* 등급 / 백분위 */}
                      <td className="px-3 py-3 text-center border-r border-slate-200 whitespace-nowrap">
                        <span className="font-bold text-slate-800 text-xs">{c.grade}등급</span>
                        <span className="text-[10px] text-slate-500 ml-1">({c.percentile})</span>
                      </td>

                      {/* 컬쳐핏 강약점 */}
                      <td className="px-3 py-3 whitespace-nowrap text-[11px]">
                        <span className="text-teal-700 font-semibold">{c.cultureStrength}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-rose-600 font-semibold">{c.cultureWeakness}</span>
                      </td>

                      {/* 팀핏 강약점 */}
                      <td className="px-3 py-3 border-r border-slate-200 whitespace-nowrap text-[11px]">
                        <span className="text-teal-700 font-semibold">{c.teamStrength}</span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-rose-600 font-semibold">{c.teamWeakness}</span>
                      </td>

                      {/* 바람직성 (SDS) */}
                      <td className={`px-2.5 py-3 text-center font-mono text-xs whitespace-nowrap ${isSdsHigh ? 'bg-amber-50 font-bold text-rose-700' : 'text-slate-700'}`}>
                        {c.sdsAvg != null ? c.sdsAvg.toFixed(2) : '-'}
                      </td>

                      {/* 인상관리 (IM) */}
                      <td className={`px-2.5 py-3 text-center font-mono text-xs whitespace-nowrap ${isImHigh ? 'bg-amber-50 font-bold text-rose-700' : 'text-slate-700'}`}>
                        {c.imAvg != null ? c.imAvg.toFixed(2) : '-'}
                      </td>

                      {/* 자기기만 (SDE) */}
                      <td className={`px-2.5 py-3 text-center font-mono text-xs whitespace-nowrap ${isSdeHigh ? 'bg-amber-50 font-bold text-rose-700' : 'text-slate-700'}`}>
                        {c.sdeAvg != null ? c.sdeAvg.toFixed(2) : '-'}
                      </td>

                      {/* 역기능 (CWB) */}
                      <td className={`px-2.5 py-3 text-center font-mono text-xs whitespace-nowrap ${isCwbLow ? 'bg-rose-50 font-bold text-rose-700' : 'text-slate-700'}`}>
                        {c.cwbAvg != null ? c.cwbAvg.toFixed(2) : '-'}
                      </td>

                      {/* IMC 실패 */}
                      <td className={`px-2.5 py-3 text-center whitespace-nowrap text-xs ${isImcFail ? 'bg-rose-50 font-bold text-rose-700' : 'text-slate-500'}`}>
                        {c.imcFailedCount > 0 ? `${c.imcFailedCount}건 실패` : '0'}
                      </td>

                      {/* 중복 불일치 */}
                      <td className={`px-2.5 py-3 text-center whitespace-nowrap text-xs ${isRepeatFail ? 'bg-amber-50 font-bold text-rose-700' : 'text-slate-500'}`}>
                        {c.repeatDiffPairs > 0 ? `${c.repeatDiffPairs}쌍` : '0'}
                      </td>

                      {/* 신뢰도 판정 뱃지 */}
                      <td className="px-2.5 py-3 text-center border-r border-slate-200 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            c.qualityTier === 'interpretable'
                              ? 'bg-green-100 text-green-800'
                              : c.qualityTier === 'caution'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.qualityLabel || '해석 가능'}
                        </span>
                      </td>

                      {/* 리포트 열람 버튼 */}
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <a
                          href={`/admin/report?sessionId=${encodeURIComponent(c.sessionId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-all shadow-2xs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          진단 리포트
                          <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                        </a>
                      </td>
                    </tr>
                  );
                })}

                {filteredCompleted.length === 0 && (
                  <tr>
                    <td colSpan="15" className="px-4 py-12 text-center text-slate-500">
                      {searchKeyword || filterWarningOnly
                        ? '검색 조건에 일치하는 응시 완료자가 없습니다.'
                        : '아직 응시를 완료한 지원자가 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ======================================================== */}
        {/* [하단 보조섹션] 전체 응시자 현황 (진행중 / 미응시 로그)   */}
        {/* ======================================================== */}
        <section className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRecentLog(!showRecentLog)}
            className="w-full border-b border-slate-200 p-4 bg-slate-50/50 flex items-center justify-between hover:bg-slate-100/60 transition-colors text-left"
          >
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>전체 응시 현황 로그 (최근 세션 기록)</span>
                <span className="text-xs font-normal text-slate-500">
                  - 진행 중이거나 복구된 세션 로그를 확인합니다.
                </span>
              </h3>
            </div>
            <div className="text-slate-400 flex items-center gap-1 text-xs">
              <span>{showRecentLog ? '접기' : '펼치기'}</span>
              {showRecentLog ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          {showRecentLog && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">지원자</th>
                    <th className="px-4 py-2.5">버전</th>
                    <th className="px-4 py-2.5">상태</th>
                    <th className="px-4 py-2.5">문항 완료율</th>
                    <th className="px-4 py-2.5">품질 판정</th>
                    <th className="px-4 py-2.5">최근 갱신 시각</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent.map((row) => {
                    const quality = row.responseQuality || {
                      label: '해석 가능',
                      color: 'text-green-700',
                      bgColor: 'bg-green-50',
                    };
                    return (
                      <tr key={row.sessionId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <p className="font-bold text-slate-900">{row.name || '-'}</p>
                          <p className="text-[11px] text-slate-500 font-mono">{row.email}</p>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-teal-700 text-xs">
                          {row.assessmentVersion === 'v2-bank-pilot'
                            ? 'V2 Bank'
                            : row.assessmentVersion === 'v2-pilot' ? 'V2 Pilot' : 'V1'}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'COMPLETED'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {statusLabel[row.status] || row.status || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700">{row.completionRate || '-'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${quality.bgColor} ${quality.color}`}>
                            {quality.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 text-[11px]">
                          {row.timestamp ? new Date(row.timestamp).toLocaleString('ko-KR') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                  {data.recent.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                        응시 기록이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
