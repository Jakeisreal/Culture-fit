# 🎯 하네스 엔지니어링(Harness Engineering) 기반 Culture-Fit 검사 패키지 검토 보고서

본 보고서는 현재 구축된 **Next.js + Google Sheets 기반 Culture-Fit 온라인 검사 패키지**의 구조를 하네스 엔지니어링(Harness Engineering) 프레임워크 6대 구성 요소에 근거하여 정밀 검토하고, 시스템의 안정성·무결성·보안성·평가 정확도를 높이기 위한 핵심 보완점과 개선 로드맵을 정리한 문서입니다.

---

## 1. 하네스 엔지니어링(Harness Engineering) 정의 및 검토 프레임워크

평가/검사 시스템에서의 **하네스 엔지니어링**이란, 사용자 응시 프론트엔드 외부에서 **안전성(Security), 데이터 무결성(Integrity), 자동 채점 및 신뢰성(Scoring Engine), 관찰 가능성(Observability), 장애 복구력(Resilience), 자동화 테스트(Testability)**를 차질 없이 지탱하도록 구축하는 비즈니스 제어 프레임워크 설계를 의미합니다.

| 하네스 영역 | 주 역할 | 본 패키지 현황 |
| :--- | :--- | :--- |
| **① 채점 & 평가 하네스** | 문항 셔플, 역채점, IMC 검증, 도메인별 점수 산출 | ⚠️ 문항 셔플 존재하나 **자동 채점/역채점/점수 기록 로직 완전 누락** |
| **② 데이터 무결성 & 복구 하네스** | 실시간 임시저장, 트랜잭션, 시트 API 분목 처리 | ⚠️ Google Sheets 단일 의존, 동시성 병목 및 중간 응답 복구 미비 |
| **③ 텔레메트리 & 부정방지 하네스** | 부정행위 감지, 포커스 트래킹, 클라이언트 변조 방지 | ⚠️ 어뷰징 감지 로직 존재하나 **클라이언트 제출값 위변조 가능** |
| **④ 접근 제어 & 보안 하네스** | Candidate 화이트리스트, 시간 윈도우, Rate Limiting | ⚠️ 기본 인증 지원되나 **Session Token/Rate Limit 부재** |
| **⑤ 관찰 가능성 & 진단 하네스** | 진단 API, 시스템 헬스체크, 실시간 모니터링 알림 | 🟢 `/api/diag2` 제공 중, **실시간 장애 알림/대시보드 부재** |
| **⑥ 자동화 테스트 하네스** | CI/CD, 단위 테스트, Mocking 기반 E2E 검증 | 🚨 **테스트 하네스 완전 부재** (`jest`, `playwright` 등 없음) |

---

## 2. 6대 하네스 영역별 정밀 검토 및 보완점

### 1) 🧮 채점 & 평가 엔진 하네스 (Evaluation & Scoring Engine Harness)
* **현황 분석**:
  - `pages/api/init.js`의 `arrangeQuestionsWithSpacing` 로직을 통해 동일 도메인/변수 문항이 연속 배치되는 편향을 방지하는 문항 셔플링 하네스는 잘 구현되어 있음.
* **핵심 보완점**:
  1. **자동 채점(Scoring) 로직 완전 부재**:
     - `pages/api/submit2.js`에서 제출 데이터를 처리할 때 Responses 시트의 `score` 필드(97번 열)에 빈 문자열(`''`)만 삽입되고 있습니다.
     - **보완 방향**: 문항별 점수(1~5점 Likert)를 역채점(`reverse`) 반영하여 환산한 뒤, `Culture-Fit` 총점 및 세부 요인(원칙중시, 주도성, 협업 등)별 평균/표준화 점수(T-Score 또는 백분위)를 자동 계산하여 시트에 저장하는 채점 엔진 구축 필요.
  2. **역채점(`reverse` / `is_imc`) 자동 처리 무효화**:
     - `items_full.json`에 `reverse` 정보가 명시되어 있으나 제출 시 1~5점 원점수가 그대로 기록됩니다.
     - **보완 방향**: `item.reverse === true` 인 문항은 `(6 - raw_score)` 로 자동 변환 계산하는 평가 하네스 연동.
  3. **IMC (Instruction Manipulation Check, 주의집중문항) 검증 부재**:
     - "이 문항은 4번 '그렇다'를 선택해 주세요" 형태의 IMC 문항이 제대로 처리되었는지에 대한 지침 검증 및 신뢰도 점수(Inconsistency Index) 산출 로직이 없습니다.

---

### 2) 🛡️ 데이터 무결성 및 장애 복구 하네스 (Data Integrity & Resilience Harness)
* **현황 분석**:
  - `lib/sheets.js`를 이용해 Google Sheets API v4와 통신하며, 후보자 조회 및 결과 작성을 수행함.
* **핵심 보완점**:
  1. **Google Sheets API Rate Limit 및 Race Condition (동시성 병목)**:
     - Google Sheets API는 읽기/쓰기 쿼터 제한(사용자당 분당 60회/300회)이 존재합니다. 여러 응시자가 동시 제출 시 API HTTP 429(Too Many Requests) 에러로 인해 데이터 저장이 실패할 위험이 높습니다.
     - **보완 방향**: 제출 데이터를 일차적으로 파일 기반 SQLite/Redis 또는 Vercel KV/Upstash 큐에 즉시 비동기 저장하고, 백그라운드 래칫(Queue Worker)을 통해 Google Sheets로 전송하는 **2-Phase Commit 저장 하네스** 도입.
  2. **중간 응답(State Recovery) 복구 미완성**:
     - 현재 `localStorage`에 임시 저장은 일부 작동하나, 브라우저가 강제 종료되거나 다른 기기에서 접속을 재개할 경우 서버/시트에서 이전에 작성 중이던 문항 답안을 불러오지 못합니다.
     - **보완 방향**: 문항 이동 시마다 `/api/save-draft` 엔드포인트를 통해 주기적으로 작성 답안 델타(Delta)를 저장하여 기기 변경 시에도 복구 가능하도록 보완.

---

### 3) 👁️ 텔레메트리 & 부정방지 하네스 (Anti-Cheat & Telemetry Harness)
* **현황 분석**:
  - `useAntiCheat` 훅으로 우클릭, 복사, F12, 포커스 이탈(`blur`, `visibilitychange`)을 감지해 `/api/log`로 기록하고, `detectSuspiciousPattern`을 통해 불성실 응답을 검출함.
* **핵심 보완점**:
  1. **클라이언트 제출 데이터 변조 위험**:
     - `submit2.js`에 전달되는 `timeSpent`(총 소요시간), `focusOutCount`(포커스 이탈 횟수)를 클라이언트가 스스로 계산하여 API 요청 바디로 전송하고 있습니다.
     - **보완 방향**: 서버의 `EventLogs` 시트 기록 또는 세션 시작 시각(`started_at`)과 현재 시각의 서버 타임스탬프 차이로 `timeSpent`를 검증하고, 서버 검증 값을 최종 채점에 반영하도록 변경.
  2. **페이지 이탈 시 로그 전송 유실**:
     - 브라우저 탭을 닫거나 이동할 때 비동기 `fetch` 요청은 취소될 가능성이 높습니다.
     - **보완 방향**: `navigator.sendBeacon()` API를 활용해 이탈 시점에도 텔레메트리 이벤트 로그가 유실되지 않도록 하네스 강화.

---

### 4) 🔐 접근 제어 및 보안 하네스 (Access Control & Security Harness)
* **현황 분석**:
  - Candidates 시트에 등록된 이메일, 이름, 전화번호 3중 매칭 및 KST 기준 시간 윈도우(`start_at`, `end_at`) 검증 수행.
* **핵심 보완점**:
  1. **API Rate Limiting (무차별 대입 공격 방지) 미비**:
     - `/api/init` 라우트에 IP 기반 요청 제한이 없어 무작위 이메일 대조를 통한 응시 대상자 개인정보 유출 시도가 가능합니다.
     - **보완 방향**: Next.js API Routes에 IP/Subnet 기반 Rate Limiter (예: 1분당 최대 10회 제한) 적용.
  2. **세션 토큰 보안 강화 (Session Hijacking 방지)**:
     - 현재 `sessionId`가 URL 쿼리 파라미터(`?sessionId=...`)로 노출되며 단순 UUID입니다.
     - **보완 방향**: `HttpOnly`, `SameSite=Strict` 옵션이 적용된 암호화 쿠키(JWT 토큰)를 사용하여 세션 탈취 방지.

---

### 5) 📊 관찰 가능성 및 진단 하네스 (Observability & Diagnostics Harness)
* **현황 분석**:
  - `/api/diag`, `/api/diag2` 헬스체크 엔드포인트를 제공하여 Vercel 배포 후 Google Sheets 접근 권한 및 탭 상태를 원클릭으로 검증 가능함.
* **핵심 보완점**:
  1. **실시간 모니터링 & 알림 하네스 추가**:
     - 제출 실패나 Google Sheets API 키 만료/권한 오류 발생 시 관리자에게 즉시 알려주는 Slack Webhook 또는 이메일 Alert 하네스가 없음.
     - **보완 방향**: critical error 발생 시 Slack Webhook 전송 로직 추가.
  2. **채용 담당자 전용 현황 대시보드 부재**:
     - 구글 시트를 직접 열어보지 않고도 실시간 응시 상태(완료, 진행 중, 이상징후 감지 수치)를 한눈에 볼 수 있는 관리자 요약 페이지 구축 권장.

---

### 6) 🧪 자동화 테스트 하네스 (Testing & QA Harness)
* **현황 분석**:
  - 현재 프로젝트에는 Unit test, Integration test, E2E test 설정이 전혀 존재하지 않음.
* **핵심 보완점**:
  1. **Jest / Vitest 기반 단위 테스트 구축**:
     - 문항 셔플 알고리즘(`arrangeQuestionsWithSpacing`), 이상응답 검출 알고리즘(`detectSuspiciousPattern`), 시간 윈도우 계산(`validateTimeWindow`) 등의 로직에 대한 단원 테스트 추가.
  2. **Mock Sheets API 서비스 구축**:
     - 실제 구글 시트를 호출하지 않고 로컬 환경에서 검사 전체 흐름(시작 -> 응답 -> 제출 -> 결과 저장)을 검증할 수 있는 Mock Service Worker (MSW) 하네스 제공.

---

## 3. 종합 보완 우선순위 (Action Item Roadmap)

| 우선순위 | 영역 | 보완 작업 내용 | 난이도 | 예상 효과 |
| :---: | :--- | :--- | :---: | :--- |
| **P0 (즉시)** | 채점 엔진 | 역채점(`reverse`) 적용 및 도메인/총점 자동 산출 채점 함수 구현 (`submit2.js`) | 보통 | 검사 완료 시 즉시 결과 데이터 활용 가능 |
| **P0 (즉시)** | 보안/텔레메트리 | `timeSpent` 및 `focusOutCount` 서버 측 검증 하네스 추가 | 쉬움 | 클라이언트 데이터 조작 어뷰징 완전 차단 |
| **P1 (단기)** | 데이터 무결성 | 로컬스토리지 + 서버 델타 임시 저장 API (`/api/save-draft`) 구현 | 보통 | 새로고침 및 네트워크 끊김 시 100% 세션 복구 |
| **P1 (단기)** | 데이터 무결성 | Google Sheets 전송 실패 대비 로컬/파일 백업 및 재시도 큐 구축 | 보통 | 동시 제출 시 데이터 분실 0% 달성 |
| **P2 (중기)** | 보안 | API Rate Limiting 설정 & HttpOnly 쿠키 세션 도입 | 보통 | 무차별 대입 및 세션 탈취 보안 강화 |
| **P2 (중기)** | 테스트 | 문항 셔플 및 이상 감지 로직 단위 테스트 (Jest) 작성 | 쉬움 | 코드 변경 시 시스템 안정성 지속 담보 |

---
*보고서 작성 일시: 2026년 7월 29일*
*검토 기준: 하네스 엔지니어링 6대 표준 프레임워크 (Engineering Harness Standards v2.0)*
