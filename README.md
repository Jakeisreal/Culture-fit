# 🎯 Culture-Fit 온라인 검사 시스템

Next.js + Google Sheets 기반 조직문화 적합도 평가 플랫폼

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Jakeisreal/Culture-fit)

## ✨ 주요 기능

### 보안 기능
- 🔐 화이트리스트 기반 접근 제어
- ⏰ 시간 윈도우 검증 (KST)
- 🛡️ 안티치트 (복사/F12/탭전환 차단)
- 📊 의심 패턴 자동 감지
- 🔍 포커스 이탈 추적

### UX 기능
- 📱 반응형 디자인 (모바일/태블릿/데스크톱)
- ⚡ 실시간 진행률 표시
- 💾 자동 저장 및 세션 복구
- 🎨 현대적인 UI/UX
- ♿ 웹 접근성 지원

## 🚀 빠른 시작

### 1. 저장소 클론

```bash
git clone https://github.com/Jakeisreal/Culture-fit.git
cd Culture-fit
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

`.env.local` 파일 생성:

```bash
cp .env.local.example .env.local
```

그리고 다음 값들을 설정:

```env
SHEET_ID=your_google_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

### 4. Google Sheets 준비

#### 4-1. 스프레드시트 생성
새 Google Sheets를 생성하고 다음 3개 시트를 만드세요:

**Candidates** (후보자 관리)
```
| email | name | phone | allow | start_at | end_at | status | invited_at | started_at | completed_at |
```

**Responses** (응답 데이터)
```
| sessionId | name | email | phone | timestamp | status | timeSpent | completionRate | focusOutCount | isForced | suspicious | notes | score | q1 | q2 | ... | q300 |
```

**EventLogs** (이벤트 로그)
```
| timestamp | sessionId | eventType | data |
```

#### 4-2. Service Account 설정

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성
3. "APIs & Services" > "Credentials" 이동
4. "Create Credentials" > "Service Account" 선택
5. JSON 키 다운로드
6. 스프레드시트에 Service Account 이메일을 **편집자**로 공유

### 5. 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

### 6. 테스트 데이터 추가

Candidates 시트에 테스트 데이터 추가:

```
hong@test.com | 홍길동 | 01012345678 | true | 2025-10-27 09:00:00 | 2025-12-31 23:59:59 | | | |
```

## 📦 Vercel 배포

### 1. Vercel 계정 연결

```bash
npm i -g vercel
vercel login
```

### 2. 환경변수 설정

```bash
vercel env add SHEET_ID
vercel env add GOOGLE_SERVICE_ACCOUNT_JSON
```

### 3. 배포

```bash
vercel --prod
```

## 🔧 설정 가이드

### 시간 윈도우 설정 (KST)

Candidates 시트의 `start_at`, `end_at` 컬럼:

- 형식: `YYYY-MM-DD HH:MM:SS`
- 예시: `2025-10-27 14:00:00`
- 시간대: KST (한국 표준시)
- 빈 값: 제한 없음

### 검사 시간 제한 변경

`pages/index.js`:

```javascript
const timeLimit = 30 * 60; // 30분 (초 단위)
```

### 의심 패턴 임계값 조정

`pages/api/submit.js`:

```javascript
function detectSuspiciousPattern(answers, timeSpent, focusOutCount) {
  // 문항당 최소 시간 (초)
  if (avgTimePerQuestion < 2) {
    flags.push('FAST_RESPONSE');
  }
  
  // 동일 응답 비율 (0.8 = 80%)
  if (maxCount / answeredCount > 0.8) {
    flags.push('UNIFORM_RESPONSE');
  }
  
  // 최대 포커스 이탈 횟수
  if (focusOutCount > 10) {
    flags.push('EXCESSIVE_FOCUS_OUT');
  }
}
```

## 📊 API 엔드포인트

### POST /api/init
새 세션 시작

```json
{
  "name": "홍길동",
  "email": "hong@test.com",
  "phone": "01012345678"
}
```

### POST /api/submit
응답 제출

```json
{
  "sessionId": "abc123...",
  "authData": { "name": "...", "email": "...", "phone": "..." },
  "answers": { "q1": 5, "q2": 3, ... },
  "focusOutCount": 2,
  "timeSpent": 1234,
  "isForced": false
}
```

### POST /api/log
이벤트 로깅

```json
{
  "sessionId": "abc123...",
  "eventType": "tab_hidden",
  "data": {},
  "timestamp": "2025-10-27T12:34:56.789Z"
}
```

### GET /api/diag
시스템 진단 (디버깅용)

## 🐛 트러블슈팅

### "Google Sheets 인증 실패"

1. Service Account JSON이 올바른지 확인
2. `private_key`에 `\n`이 포함되어 있는지 확인
3. 스프레드시트에 Service Account 이메일이 공유되었는지 확인

### "Candidates header missing email"

Candidates 시트 첫 번째 행에 다음 컬럼이 있는지 확인:
- email
- name
- phone
- allow
- start_at
- end_at
- status

### "SHEET_ID 미설정"

`.env.local` 파일에 `SHEET_ID`가 설정되어 있는지 확인

### items_full.json 한글 깨짐

파일을 UTF-8 인코딩으로 저장:
1. VSCode에서 파일 열기
2. 우측 하단 인코딩 클릭
3. "Save with Encoding" > "UTF-8" 선택

## 📈 데이터 분석

### Google Sheets 수식 예제

**완료율:**
```excel
=COUNTIF(F2:F, "COMPLETED") / COUNTA(A2:A)
```

**평균 소요 시간:**
```excel
=AVERAGE(G2:G)
```

**의심 패턴 감지:**
```excel
=COUNTIF(K2:K, "*FAST_RESPONSE*")
```

## 🔒 보안 체크리스트

- [ ] `.env.local` 파일이 `.gitignore`에 포함됨
- [ ] Service Account Key가 코드에 하드코딩되지 않음
- [ ] 스프레드시트 공유 권한이 Service Account로만 제한됨
- [ ] Vercel 환경변수가 암호화 저장됨
- [ ] HTTPS 사용 (Vercel 자동)

## 📚 기술 스택

- **Frontend**: Next.js 14, React 18
- **UI**: Tailwind CSS, Lucide Icons
- **Backend**: Next.js API Routes
- **Database**: Google Sheets (googleapis)
- **Deployment**: Vercel
- **Language**: JavaScript

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

## 📧 문의

프로젝트 이슈: [GitHub Issues](https://github.com/Jakeisreal/Culture-fit/issues)

## 🙏 감사의 글

이 프로젝트는 다음 오픈소스 프로젝트들을 사용합니다:
- [Next.js](https://nextjs.org/)
- [Google APIs](https://github.com/googleapis/google-api-nodejs-client)
- [Lucide Icons](https://lucide.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

⭐ 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요!
### GET /api/diag2
Vercel 환경에서 `SHEET_ID`, Service Account JSON 존재 여부/이메일, 그리고 `Candidates/Responses/EventLogs` 3개 시트 읽기 결과를 한 번에 확인할 수 있는 확장 진단 엔드포인트입니다. 배포 직후 `/api/diag2` 응답의 `ok: true` 인지 확인해 주세요.
