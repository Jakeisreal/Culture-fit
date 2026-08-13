import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Clock, LoaderCircle, Menu, X } from 'lucide-react';

// ============= 공통 설정 =============
const API_BASE = '/api';

const fetcher = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!data.success && data.success !== undefined) {
    throw new Error(data.message || '요청 처리 중 오류가 발생했습니다.');
  }
  return data;
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 휴대폰 번호 자동 하이픈 포맷팅
const formatKoreanPhone = (value) => {
  const digits = String(value || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
};

// ============= 타이머 훅 (단조 시계 기반) =============
const useTimer = (initialTime, onExpire) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const onExpireRef = useRef(onExpire);
  const startRef = useRef(null);
  const intervalRef = useRef(null);
  const limitRef = useRef(initialTime);

  useEffect(() => {
    limitRef.current = initialTime;
  }, [initialTime]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const update = useCallback((nowMs) => {
    if (startRef.current == null) return;
    const elapsed = Math.floor((nowMs - startRef.current) / 1000);
    const left = Math.max(0, limitRef.current - elapsed);
    setTimeLeft((prev) => (prev !== left ? left : prev));
    if (left <= 0) {
      setIsRunning(false);
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (onExpireRef.current) onExpireRef.current();
    }
  }, []);

  const start = useCallback((elapsedOverride = null, limitOverride = null) => {
    const effectiveLimit = Number.isFinite(limitOverride)
      ? Math.max(1, limitOverride)
      : limitRef.current;
    limitRef.current = effectiveLimit;
    const alreadyElapsed = Number.isFinite(elapsedOverride)
      ? Math.max(0, Math.min(effectiveLimit, elapsedOverride))
      : Math.max(0, effectiveLimit - timeLeft);
    setTimeLeft(Math.max(0, effectiveLimit - alreadyElapsed));
    startRef.current = performance.now() - alreadyElapsed * 1000;
    setIsRunning(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    update(performance.now());
    intervalRef.current = setInterval(() => update(performance.now()), 250);
  }, [timeLeft, update]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  return { timeLeft, isRunning, start, stop };
};

const useAntiCheat = (onEvent, enabled) => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handlers = {
      contextmenu: (e) => { e.preventDefault(); onEvent('context_menu_blocked'); },
      copy: (e) => { e.preventDefault(); onEvent('copy_blocked'); },
      cut: (e) => { e.preventDefault(); onEvent('cut_blocked'); },
      selectstart: (e) => { e.preventDefault(); },
      dragstart: (e) => { e.preventDefault(); },
      keydown: (e) => {
        if ((e.ctrlKey || e.metaKey) && ['c', 'x', 's', 'p', 'u', 'a'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          onEvent('shortcut_blocked', e.key);
        }
        if ([123, 44].includes(e.keyCode)) {
          e.preventDefault();
          onEvent('devtools_key_blocked', e.keyCode);
        }
      },
      visibilitychange: () => {
        if (document.hidden) onEvent('tab_hidden');
      },
      blur: () => onEvent('window_blur'),
      beforeunload: () => onEvent('page_unload'),
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      if (event === 'visibilitychange' || event === 'blur' || event === 'beforeunload') {
        const target = event === 'visibilitychange' ? document : window;
        target.addEventListener(event, handler);
      } else {
        document.addEventListener(event, handler);
      }
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        if (event === 'visibilitychange' || event === 'blur' || event === 'beforeunload') {
          const target = event === 'visibilitychange' ? document : window;
          target.removeEventListener(event, handler);
        } else {
          document.removeEventListener(event, handler);
        }
      });
    };
  }, [onEvent, enabled]);
};

// ============= UI 컴포넌트 =============
const Alert = ({ type = 'error', children, onClose }) => {
  const styles = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  };

  const icons = {
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertCircle className="w-5 h-5" />,
    info: <AlertCircle className="w-5 h-5" />,
    success: <CheckCircle className="w-5 h-5" />,
  };

  return (
    <div className={`flex items-start gap-3 p-4 rounded-md border ${styles[type]} animate-in fade-in slide-in-from-top-2 duration-300`}>
      {icons[type]}
      <div className="flex-1 text-sm whitespace-pre-line">{children}</div>
      {onClose && (
        <button type="button" aria-label="알림 닫기" onClick={onClose} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const Button = ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }) => {
  const baseStyles = 'font-semibold rounded-md transition-colors duration-200 inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-50';
  const variants = {
    primary: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800 active:bg-teal-900',
    secondary: 'bg-white text-gray-700 border border-gray-300 shadow-sm hover:bg-gray-50 active:bg-gray-100',
    ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  };
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          처리 중...
        </>
      ) : children}
    </button>
  );
};

const ProgressBar = ({ current, total, className = '' }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-gray-700">진행률</span>
        <span className="text-sm font-bold text-teal-700">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-600 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {current} / {total} 문항 완료
      </div>
    </div>
  );
};

// ============= 메인 컴포넌트 =============
export default function CultureFitApp() {
  const [stage, setStage] = useState('welcome'); // welcome, auth, prestart, test, submitted
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Auth data
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [assessmentVersion, setAssessmentVersion] = useState('v2-bank-pilot');
  
  // Test data
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [focusOutCount, setFocusOutCount] = useState(0);
  const draftVersionRef = useRef(0);
  const saveQueueRef = useRef(Promise.resolve());
  // Sidebar pagination (20 items per page)
  const PAGE_SIZE = 20;
  const [sidebarPage, setSidebarPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil((questions?.length || 0) / PAGE_SIZE));
  
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [timeLimit, setTimeLimit] = useState(25 * 60);
  const { timeLeft, start: startTimer, stop: stopTimer } = useTimer(timeLimit, () => handleSubmit(true));
  const timeLeftRef = useRef(timeLimit);
  const questionScrollRef = useRef(null);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // Anti-cheat logging (sendBeacon 지원 추가)
  const logEvent = useCallback(async (eventType, data = {}) => {
    if (!sessionId) return;
    const payload = JSON.stringify({
      sessionId,
      eventType,
      data,
      timestamp: new Date().toISOString(),
    });

    if (eventType.includes('blur') || eventType.includes('hidden') || eventType.includes('unload')) {
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const queued = navigator.sendBeacon(`${API_BASE}/log`, blob);
        if (!queued) {
          fetch(`${API_BASE}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
        }
      } else {
        fetch(`${API_BASE}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
      }
      setFocusOutCount(prev => prev + 1);
      return;
    }

    try {
      await fetcher(`${API_BASE}/log`, {
        method: 'POST',
        body: payload,
      });
    } catch (err) {
      console.warn('로그 전송 실패:', err);
    }
  }, [sessionId]);

  useAntiCheat(logEvent, stage === 'test');

  // 동일 브라우저에서는 HttpOnly 쿠키와 로컬 세션 키로 복구
  useEffect(() => {
    const sid = localStorage.getItem('culture_fit_session');
    if (sid) {
      setSessionId(sid);
      handleRestoreSession(sid);
    }
  }, []);

  const handleRestoreSession = async (sid) => {
    setLoading(true);
    try {
      const data = await fetcher(`${API_BASE}/init`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: sid }),
      });
      if (data.completed) {
        localStorage.removeItem('culture_fit_session');
        localStorage.removeItem(`culture_fit_draft_${sid}`);
        setStage('submitted');
        return;
      }
      setQuestions(data.questions || []);
      const restoredLimit = Number(data.timeLimitSeconds) || timeLimit;
      setTimeLimit(restoredLimit);
      setAssessmentVersion(data.assessmentVersion || 'v1');

      if (data.authData) {
        if (data.authData.name) setName(data.authData.name);
        if (data.authData.email) setEmail(data.authData.email);
        if (data.authData.phone) setPhone(data.authData.phone);
      }

      // 저장된 임시 답안 복구 (로컬스토리지 + 서버 복구 데이터)
      let localDraft = {};
      try {
        const rawLocal = localStorage.getItem(`culture_fit_draft_${sid}`);
        if (rawLocal) localDraft = JSON.parse(rawLocal);
      } catch {}

      const mergedAnswers = { ...(data.savedAnswers || {}), ...localDraft };
      setAnswers(mergedAnswers);
      if (data.focusOutCount) setFocusOutCount(data.focusOutCount);
      draftVersionRef.current = Number(data.draftVersion) || 0;

      setStage('test');
      startTimer(Number(data.timeSpent) || 0, restoredLimit);
    } catch (err) {
      try { localStorage.removeItem('culture_fit_session'); } catch {}
      setError(err.message);
      setStage('auth');
    } finally {
      setLoading(false);
    }
  };

  // 자동 저장 (로컬스토리지 + 서버 /api/save-draft)
  const saveDraft = useCallback((currentAnswers, currentFocusOut) => {
    if (!sessionId) return;
    try {
      draftVersionRef.current += 1;
      localStorage.setItem(`culture_fit_draft_${sessionId}`, JSON.stringify(currentAnswers));
      const payload = {
        sessionId,
        answers: currentAnswers,
        focusOutCount: currentFocusOut,
        timeSpent: timeLimit - timeLeftRef.current,
        draftVersion: draftVersionRef.current,
      };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => fetch(`${API_BASE}/save-draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }))
        .then((response) => {
          if (!response.ok) throw new Error(`임시 저장 HTTP ${response.status}`);
        })
        .catch((error) => console.warn('임시 저장 요청 실패:', error));
    } catch (e) {
      console.warn('임시 저장 로컬 오류:', e);
    }
  }, [sessionId, timeLimit]);

  useEffect(() => {
    if (stage === 'test' && sessionId && Object.keys(answers).length > 0) {
      const t = setTimeout(() => {
        saveDraft(answers, focusOutCount);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [answers, focusOutCount, stage, sessionId, saveDraft]);

  const handleAuth = async () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('모든 필드를 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetcher(`${API_BASE}/init`, {
        method: 'POST',
        body: JSON.stringify({ name, email, phone }),
      });

      setSessionId(data.sessionId);
      setQuestions(data.questions || []);
      const receivedLimit = Number(data.timeLimitSeconds) || timeLimit;
      setTimeLimit(receivedLimit);
      setAssessmentVersion(data.assessmentVersion || 'v2-bank-pilot');
      localStorage.setItem('culture_fit_session', data.sessionId);

      if (data.restored) {
        setAnswers(data.savedAnswers || {});
        setFocusOutCount(Number(data.focusOutCount) || 0);
        draftVersionRef.current = Number(data.draftVersion) || 0;
        setStage('test');
        startTimer(Number(data.timeSpent) || 0, receivedLimit);
      } else {
        setStage('prestart');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (value) => {
    const question = questions[currentIndex];
    setAnswers(prev => ({
      ...prev,
      [question.id]: value,
    }));
    
    // Auto-advance
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        goToQuestion(currentIndex + 1);
      }
    }, 300);
  };

  const handleSubmit = async (forced = false) => {
    if (!forced) {
      const unanswered = questions.filter((q) => answers[q.id] == null);
      if (unanswered.length > 0) {
        const firstUnansweredIndex = questions.findIndex((q) => q.id === unanswered[0].id);
        if (firstUnansweredIndex >= 0) {
          goToQuestion(firstUnansweredIndex);
        }
        setError(`아직 ${unanswered.length}개 문항에 응답하지 않았습니다.`);
        return;
      }
    }

    setLoading(true);
    stopTimer();

    try {
      await saveQueueRef.current.catch(() => {});
      const timeSpent = timeLimit - timeLeft;
      await fetcher(`${API_BASE}/submit2`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          answers,
          focusOutCount,
          timeSpent,
          isForced: forced,
        }),
      });
      // 제출 성공 후 로컬 임시 저장 청소
      try { localStorage.removeItem(`culture_fit_draft_${sessionId}`); } catch {}
      try { localStorage.removeItem('culture_fit_session'); } catch {}
      setStage('submitted');
    } catch (err) {
      setError(err.message);
      startTimer(null, timeLimit);
    } finally {
      setLoading(false);
    }
  };


  const goToQuestion = (index) => {
    if (index >= 0 && index < questions.length) {
      setCurrentIndex(index);
      setError(null);
      setSidebarPage(Math.floor(index / PAGE_SIZE));
      if (questionScrollRef.current) {
        try { questionScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
      }
    }
  };

  // 현재 문항이 항상 상단에 보이도록
  useEffect(() => {
    if (questionScrollRef.current) {
      try { questionScrollRef.current.scrollTo({ top: 0 }); } catch {}
    }
  }, [currentIndex, stage]);

  // 에러 메시지 자동 숨김 (2.5초 뒤)
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2500);
    return () => clearTimeout(t);
  }, [error]);

  // ============= 환영 화면 =============
  if (stage === 'welcome') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-gray-200 shadow-sm p-7 md:p-10 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-teal-700 rounded-lg flex items-center justify-center mx-auto mb-5 shadow-sm">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">Culture-Fit 검사</h1>
            <p className="text-lg text-gray-600">조직 문화 적합도를 빠르고 정확하게 확인하세요.</p>
          </div>

          <div className="bg-teal-50 border border-teal-100 rounded-md p-5 mb-7">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-teal-700" />
              안내 사항
            </h3>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-teal-700 font-bold mt-1">•</span>
                <span>검사에는 약 <strong>25분</strong>이 소요됩니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-700 font-bold mt-1">•</span>
                <span>모든 문항에 <strong>정직하게</strong> 응답해 주세요.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-700 font-bold mt-1">•</span>
                <span>새 창/탭 이동 등 화면 이탈 이벤트는 검토를 위해 기록됩니다.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-700 font-bold mt-1">•</span>
                <span>응답은 자동 저장되며, 같은 브라우저 또는 본인 확인 후 이어서 응시할 수 있습니다.</span>
              </li>
            </ul>
          </div>

          <Button
            size="lg"
            className="w-full shadow-md hover:shadow-lg"
            onClick={() => setStage('auth')}
          >
            검사 시작하기
          </Button>
        </div>
      </div>
    );
  }

  // ============= 인증 화면 =============
  if (stage === 'auth') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 shadow-sm p-7 animate-in fade-in slide-in-from-bottom duration-500">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">기본 정보 입력</h2>
          
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          <div className="space-y-4 mt-6">
            <div>
              <label htmlFor="candidate-name" className="block text-sm font-semibold text-gray-700 mb-2">이름</label>
              <input
                id="candidate-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition-all outline-none"
                placeholder="홍길동"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="candidate-email" className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
              <input
                id="candidate-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition-all outline-none"
                placeholder="hong@example.com"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="candidate-phone" className="block text-sm font-semibold text-gray-700 mb-2">전화번호</label>
              <input
                id="candidate-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatKoreanPhone(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:border-teal-600 focus:ring-2 focus:ring-teal-100 transition-all outline-none"
                inputMode="numeric"
                pattern="[0-9-]*"
                maxLength={13}
                placeholder="010-1234-5678"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            size="lg"
            className="w-full mt-6 shadow-md hover:shadow-lg"
            onClick={handleAuth}
            loading={loading}
            disabled={loading}
          >
            검사 시작
          </Button>
        </div>
      </div>
    );
  }

  // ============= 시작 전 유의사항 화면 =============
  if (stage === 'prestart') {
    const total = questions.length || 300;
    const minutes = Math.round(timeLimit / 60);
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg border border-gray-200 shadow-sm p-7 md:p-10 animate-in fade-in zoom-in duration-500">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">검사 유의사항</h2>
          <ul className="space-y-3 text-gray-700 mb-6">
            <li className="flex items-start gap-3"><span className="mt-1">•</span> 총 문항 수는 <strong>{total}문항</strong>입니다.</li>
            <li className="flex items-start gap-3"><span className="mt-1">•</span> 예상 소요 시간은 <strong>{minutes}분</strong>입니다.</li>
            <li className="flex items-start gap-3"><span className="mt-1">•</span> 응답은 자동 저장되며 본인 확인 후 이어서 응시할 수 있습니다.</li>
            <li className="flex items-start gap-3"><span className="mt-1">•</span> 부정행위 방지(복사/붙여넣기, 새 탭 이동 등) 이벤트를 기록합니다.</li>
          </ul>
          <p className="text-gray-700 mb-6">안내 내용을 확인하셨다면 검사를 시작해 주세요.</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setStage('auth')}>이전으로</Button>
            <Button className="flex-1" onClick={() => { setStage('test'); startTimer(0, timeLimit); }}>시작</Button>
          </div>
        </div>
      </div>
    );
  }

  // ============= 제출 완료 화면 =============
  if (stage === 'submitted') {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-green-200 shadow-sm p-10 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">제출 완료!</h1>
          <p className="text-gray-600 text-lg">
            응시가 정상적으로 완료되었습니다.<br/>
            면접 준비 잘 하셔서 면접 당일에 뵙도록 하겠습니다.
          </p>
        </div>
      </div>
    );
  }

  // ============= 테스트 화면 =============
  const currentQuestion = questions[currentIndex];
  const responseScaleLabels = currentQuestion?.responseScale === 'frequency_12m'
    ? ['전혀 없음', '1회', '2~3회', '4~5회', '6회 이상']
    : ['매우 아니다', '아니다', '보통이다', '그렇다', '매우 그렇다'];
  const answeredCount = Object.keys(answers).length;
  const isLowTime = timeLeft < 300; // 5분 이하

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div
        className={`fixed lg:relative inset-y-0 left-0 z-50 bg-white border-r border-gray-200 transition-all duration-300 ${
          sidebarOpen ? 'w-80' : 'w-0 lg:w-16'
        }`}
      >
        <div className={`h-full flex flex-col ${sidebarOpen ? '' : 'items-center'}`}>
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            {sidebarOpen ? (
              <>
                <h2 className="text-xl font-bold text-gray-900">Culture-Fit</h2>
                <p className="text-xs font-semibold text-teal-700 mt-1">
                  {assessmentVersion === 'v2-bank-pilot'
                    ? 'V2 Bank Pilot'
                    : assessmentVersion === 'v2-pilot' ? 'V2 Pilot' : 'V1'}
                </p>
                <p className="text-sm text-gray-600 mt-1">{name}</p>
              </>
            ) : (
              <button type="button" aria-label="문항 목록 열기" onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-md">
                <Menu className="w-6 h-6" />
              </button>
            )}
          </div>

          {sidebarOpen && (
            <>
              {/* Timer */}
              <div className={`m-6 p-4 rounded-md ${isLowTime ? 'bg-red-50 border-2 border-red-200' : 'bg-blue-50 border-2 border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className={`w-5 h-5 ${isLowTime ? 'text-red-600' : 'text-blue-600'}`} />
                  <span className="text-sm font-semibold text-gray-700">남은 시간</span>
                </div>
                <div className={`text-3xl font-bold ${isLowTime ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatTime(timeLeft)}
                </div>
                {isLowTime && <p className="text-xs text-red-600 mt-2">남은 시간이 많지 않습니다.</p>}
              </div>

              {/* Progress */}
              <div className="px-6 mb-6">
                <ProgressBar current={answeredCount} total={questions.length} />
              </div>

              {/* Question Grid with pagination */}
              <div className="flex-1 px-6 overflow-y-auto">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">문항 목록</h3>
                {(() => {
                  const start = sidebarPage * PAGE_SIZE;
                  const end = Math.min(start + PAGE_SIZE, questions.length);
                  const slice = questions.slice(start, end);
                  return (
                    <>
                      <div className="grid grid-cols-6 gap-2">
                        {slice.map((q, i) => {
                          const idx = start + i;
                          const answered = answers[q.id] !== undefined;
                          const isCurrent = idx === currentIndex;
                          return (
                            <button
                              key={idx}
                              onClick={() => goToQuestion(idx)}
                              className={`
                                aspect-square rounded-lg text-sm font-semibold transition-all
                                ${isCurrent ? 'ring-2 ring-teal-600 ring-offset-2' : ''}
                                ${answered ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                              `}
                            >
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={sidebarPage === 0}
                          onClick={() => setSidebarPage((p) => Math.max(0, p - 1))}
                        >
                          이전 20문항
                        </Button>
                        <span className="text-xs text-gray-500">{sidebarPage + 1} / {totalPages}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={sidebarPage >= totalPages - 1}
                          onClick={() => setSidebarPage((p) => Math.min(totalPages - 1, p + 1))}
                        >
                          다음 20문항
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Collapse button */}
              <div className="p-4 border-t border-gray-200">
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="w-full">
                  사이드바 접기
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
          {!sidebarOpen && (
            <button type="button" aria-label="문항 목록 열기" onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-md">
              <Menu className="w-6 h-6" />
            </button>
          )}
          <div className="flex-1">
            <span className="text-sm font-semibold text-gray-900">
              문항 {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div className={`text-lg font-bold ${isLowTime ? 'text-red-600' : 'text-gray-600'}`}>
            {formatTime(timeLeft)}
          </div>
        </div>

        {/* Question area */}
        <div ref={questionScrollRef} className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
          <div className="max-w-3xl w-full animate-in fade-in slide-in-from-bottom duration-300">
            {error && (
              <Alert type="error" onClose={() => setError(null)} className="mb-6">
                {error}
              </Alert>
            )}

            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 md:p-10">
              <h3 className="text-2xl font-semibold text-gray-900 leading-relaxed mb-8">
                {currentQuestion?.text}
              </h3>

              {/* Answer options */}
              <div className="grid grid-cols-5 gap-3 mb-8">
                {[1, 2, 3, 4, 5].map((value) => {
                  const isSelected = answers[currentQuestion?.id] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value}점`}
                      aria-pressed={isSelected}
                      onClick={() => handleAnswer(value)}
                      className={`
                        min-h-20 rounded-md px-1 py-2 font-bold transition-all flex flex-col items-center justify-center
                        ${isSelected
                          ? 'bg-teal-700 text-white ring-2 ring-teal-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                        }
                      `}
                    >
                      <span className="text-2xl">{value}</span>
                      <span className="mt-1 text-[11px] leading-tight font-medium">
                        {responseScaleLabels[value - 1]}
                      </span>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Navigation */}
            <div className="mt-6 flex items-center gap-3 bg-white border border-gray-200 rounded-md p-3">
              <Button
                variant="secondary"
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="flex-1"
              >
                이전
              </Button>
              <Button
                onClick={() => {
                  if (answers[currentQuestion?.id] == null) {
                    setError('응답을 선택해 주세요.');
                    return;
                  }
                  if (currentIndex < questions.length - 1) {
                    goToQuestion(currentIndex + 1);
                  } else {
                    handleSubmit();
                  }
                }}
                loading={loading}
                disabled={loading}
                className="flex-1"
              >
                {currentIndex < questions.length - 1 ? '다음' : '제출하기'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in-from-top-2 {
          from { transform: translateY(-0.5rem); }
          to { transform: translateY(0); }
        }
        @keyframes slide-in-from-bottom {
          from { transform: translateY(1rem); }
          to { transform: translateY(0); }
        }
        @keyframes zoom-in {
          from { transform: scale(0.95); }
          to { transform: scale(1); }
        }
        .animate-in { animation-fill-mode: both; }
        .fade-in { animation-name: fade-in; }
        .slide-in-from-top-2 { animation-name: slide-in-from-top-2; }
        .slide-in-from-bottom { animation-name: slide-in-from-bottom; }
        .zoom-in { animation-name: zoom-in; }
        .duration-300 { animation-duration: 300ms; }
        .duration-500 { animation-duration: 500ms; }
      `}</style>
    </div>
  );
}
