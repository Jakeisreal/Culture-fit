import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Clock, Menu, X, ChevronLeft, ChevronRight, Send } from 'lucide-react';

// ============= 유틸리티 함수 =============
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

// ============= 커스텀 훅 =============
const useTimer = (initialTime, onExpire) => {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!isRunning || timeLeft <= 0) {
      if (timeLeft <= 0 && onExpire) onExpire();
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, isRunning, onExpire]);

  return { timeLeft, isRunning, start: () => setIsRunning(true), stop: () => setIsRunning(false) };
};

const useAntiCheat = (onEvent) => {
  useEffect(() => {
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
    };

    Object.entries(handlers).forEach(([event, handler]) => {
      if (event === 'visibilitychange' || event === 'blur') {
        const target = event === 'blur' ? window : document;
        target.addEventListener(event, handler);
      } else {
        document.addEventListener(event, handler);
      }
    });

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        if (event === 'visibilitychange' || event === 'blur') {
          const target = event === 'blur' ? window : document;
          target.removeEventListener(event, handler);
        } else {
          document.removeEventListener(event, handler);
        }
      });
    };
  }, [onEvent]);
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
    <div className={`flex items-start gap-3 p-4 rounded-xl border ${styles[type]} animate-in fade-in slide-in-from-top-2 duration-300`}>
      {icons[type]}
      <div className="flex-1 text-sm whitespace-pre-line">{children}</div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-50 hover:opacity-100 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const Button = ({ variant = 'primary', size = 'md', loading, disabled, children, ...props }) => {
  const baseStyles = 'font-semibold rounded-xl transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:shadow-lg hover:scale-105 active:scale-100 disabled:opacity-50 disabled:hover:scale-100',
    secondary: 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100',
    ghost: 'text-gray-600 hover:bg-gray-100 active:bg-gray-200',
  };
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
        <span className="text-sm font-bold text-purple-600">{percentage.toFixed(1)}%</span>
      </div>
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {current} / {total} 문항 완료
      </div>
    </div>
  );
};

// ============= 메인 앱 컴포넌트 =============
export default function CultureFitApp() {
  const [stage, setStage] = useState('welcome'); // welcome, auth, test, submitted
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Auth data
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sessionId, setSessionId] = useState(null);
  
  // Test data
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [focusOutCount, setFocusOutCount] = useState(0);
  // Sidebar pagination (20 items per page)
  const PAGE_SIZE = 20;
  const [sidebarPage, setSidebarPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil((questions?.length || 0) / PAGE_SIZE));
  
  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const timeLimit = 30 * 60; // 30분
  
  const { timeLeft, start: startTimer, stop: stopTimer } = useTimer(timeLimit, () => handleSubmit(true));
  const questionScrollRef = useRef(null);

  // Anti-cheat logging
  const logEvent = useCallback(async (eventType, data = {}) => {
    if (!sessionId) return;
    try {
      await fetcher(`${API_BASE}/log`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          eventType,
          data,
          timestamp: new Date().toISOString(),
        }),
      });
      if (eventType.includes('blur') || eventType.includes('hidden')) {
        setFocusOutCount(prev => prev + 1);
      }
    } catch (err) {
      console.warn('로그 전송 실패:', err);
    }
  }, [sessionId]);

  useAntiCheat(logEvent);

  // URL에서 sessionId 복구
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('sessionId');
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
      setQuestions(data.questions || []);
      setStage('test');
      startTimer();
    } catch (err) {
      setError(err.message);
      setStage('auth');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      setError('모든 필드를 입력해주세요.');
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
      setStage('test');
      startTimer();
      
      // URL 업데이트
      window.history.pushState({}, '', `?sessionId=${data.sessionId}`);
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
        setCurrentIndex(currentIndex + 1);
      }
    }, 300);
  };

  const handleSubmit = async (forced = false) => {
    setLoading(true);
    stopTimer();

    try {
      const timeSpent = timeLimit - timeLeft;
      await fetcher(`${API_BASE}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          authData: { name, email, phone },
          answers,
          focusOutCount,
          timeSpent,
          isForced: forced,
        }),
      });
      setStage('submitted');
    } catch (err) {
      setError(err.message);
      startTimer();
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

  // Ensure current question shows at top without manual scroll
  useEffect(() => {
    if (questionScrollRef.current) {
      try { questionScrollRef.current.scrollTo({ top: 0 }); } catch {}
    }
  }, [currentIndex, stage]);

  // ============= 렌더링 =============
  if (stage === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl p-8 md:p-12 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-3">Culture-Fit 검사</h1>
            <p className="text-lg text-gray-600">조직 문화 적합도 온라인 평가</p>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 mb-8">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-purple-600" />
              안내사항
            </h3>
            <ul className="space-y-3 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-1">•</span>
                <span>검사는 약 <strong>30분</strong> 소요됩니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-1">•</span>
                <span>각 문항에 <strong>솔직하게</strong> 응답해 주세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-1">•</span>
                <span>한 번 제출하면 <strong>수정할 수 없습니다</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-1">•</span>
                <span>검사 중 <strong>다른 탭 이동</strong>이나 <strong>복사</strong>는 제한됩니다</span>
              </li>
            </ul>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={() => setStage('auth')}
          >
            검사 시작하기
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  if (stage === 'auth') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 animate-in fade-in slide-in-from-bottom duration-500">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">응시자 정보</h2>
          
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}

          <div className="space-y-4 mt-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                placeholder="홍길동"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                placeholder="hong@example.com"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">전화번호</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all outline-none"
                placeholder="010-1234-5678"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            size="lg"
            className="w-full mt-6"
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

  if (stage === 'submitted') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-12 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">제출 완료!</h1>
          <p className="text-gray-600 text-lg">
            검사를 완료해 주셔서 감사합니다.<br/>
            결과는 이메일로 발송됩니다.
          </p>
        </div>
      </div>
    );
  }

  // Test stage
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isLowTime = timeLeft < 300; // 5분 미만

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
                <p className="text-sm text-gray-600 mt-1">{name}</p>
              </>
            ) : (
              <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
                <Menu className="w-6 h-6" />
              </button>
            )}
          </div>

          {sidebarOpen && (
            <>
              {/* Timer */}
              <div className={`m-6 p-4 rounded-xl ${isLowTime ? 'bg-red-50 border-2 border-red-200' : 'bg-blue-50 border-2 border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className={`w-5 h-5 ${isLowTime ? 'text-red-600' : 'text-blue-600'}`} />
                  <span className="text-sm font-semibold text-gray-700">남은 시간</span>
                </div>
                <div className={`text-3xl font-bold ${isLowTime ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatTime(timeLeft)}
                </div>
                {isLowTime && <p className="text-xs text-red-600 mt-2">⚠️ 시간이 얼마 남지 않았습니다!</p>}
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
                                ${isCurrent ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
                                ${answered ? 'bg-gradient-to-br from-purple-500 to-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
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
                          <ChevronLeft className="w-4 h-4" /> 이전 20문항
                        </Button>
                        <span className="text-xs text-gray-500">{sidebarPage + 1} / {totalPages}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={sidebarPage >= totalPages - 1}
                          onClick={() => setSidebarPage((p) => Math.min(totalPages - 1, p + 1))}
                        >
                          다음 20문항 <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Collapse button */}
              <div className="p-4 border-t border-gray-200">
                <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(false)} className="w-full">
                  사이드바 숨기기
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
            <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
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

            <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
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
                      onClick={() => handleAnswer(value)}
                      className={`
                        aspect-square rounded-xl text-3xl font-bold transition-all
                        ${isSelected
                          ? 'bg-gradient-to-br from-purple-500 to-indigo-500 text-white scale-110 shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:scale-105'
                        }
                      `}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between text-sm text-gray-500 pt-4 border-t border-gray-100">
                <span>전혀 아니다</span>
                <span>매우 그렇다</span>
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-6 flex items-center gap-3 bg-white/70 backdrop-blur border border-gray-200 rounded-xl p-3">
              <Button
                variant="secondary"
                onClick={() => goToQuestion(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="flex-1"
              >
                <ChevronLeft className="w-5 h-5" />
                이전
              </Button>
              <Button
                onClick={() => {
                  if (!answers[currentQuestion?.id]) {
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
                {currentIndex < questions.length - 1 ? (
                  <>
                    다음
                    <ChevronRight className="w-5 h-5" />
                  </>
                ) : (
                  <>
                    제출하기
                    <Send className="w-5 h-5" />
                  </>
                )}
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
        .animate-in {
          animation-fill-mode: both;
        }
        .fade-in {
          animation-name: fade-in;
        }
        .slide-in-from-top-2 {
          animation-name: slide-in-from-top-2;
        }
        .slide-in-from-bottom {
          animation-name: slide-in-from-bottom;
        }
        .zoom-in {
          animation-name: zoom-in;
        }
        .duration-300 {
          animation-duration: 300ms;
        }
        .duration-500 {
          animation-duration: 500ms;
        }
      `}</style>
    </div>
  );
}
