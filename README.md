# Culture-Fit 검사

지원자의 조직문화 적합도(Culture Fit)를 온라인으로 검사하고, 응답과 운영 현황을 Google Sheets에 저장하는 웹 애플리케이션입니다.

운영 담당자가 Google Sheets에 지원자를 미리 등록하면 지원자는 이름, 이메일, 휴대폰 번호로 본인 확인 후 검사에 참여합니다. 현재 기본 운영 버전은 전체 300문항 중 지원자별로 230문항을 구성해 출제하는 `v2-bank-pilot`입니다.

## 1. 프로그램이 하는 일

- 지원자 정보와 응시 가능 기간을 확인합니다.
- 지원자별 검사 문항을 구성하고 25분 동안 검사를 진행합니다.
- 응답을 브라우저와 Google Sheets에 자동으로 임시 저장합니다.
- 제한시간이 끝나면 작성한 답안을 자동 제출합니다.
- 검사 결과, 주의집중 여부, 일관성 및 화면 이탈 기록을 Google Sheets에 저장합니다.
- 관리자는 `/admin` 화면에서 전체 지원자와 최근 응시 현황을 확인할 수 있습니다.

이 애플리케이션에는 별도의 회원가입 기능이 없습니다. 응시 전에 운영 담당자가 `Candidates` 시트에 지원자를 등록해야 합니다.

## 2. 지원자와 관리자의 사용 흐름

### 지원자

1. 운영 담당자로부터 검사 주소와 응시 가능 시간을 안내받습니다.
2. 첫 화면에서 이름, 이메일, 휴대폰 번호를 입력합니다.
3. 입력값이 `Candidates` 시트의 등록 정보와 일치하면 유의사항을 확인하고 검사를 시작합니다.
4. 25분 동안 모든 문항에 응답합니다.
5. 마지막 문항에서 `제출하기`를 누릅니다. 제한시간이 끝난 경우에는 작성된 답안이 자동 제출됩니다.

응답은 자동 저장됩니다. 같은 브라우저로 다시 접속하거나, 검사 시작 후 6시간 안에 본인 확인을 다시 하면 진행 중인 검사를 이어서 볼 수 있습니다.

검사 중 새 탭 이동, 창 이탈, 복사 시도 등은 검토용 이벤트로 기록됩니다. 기록 자체가 자동 탈락을 의미하지는 않습니다.

### 운영 담당자

1. Google Sheets의 `Candidates` 탭에 지원자를 등록합니다.
2. `allow` 값을 `true`로 설정하고 필요한 경우 응시 시작·종료 시각을 입력합니다.
3. 지원자에게 서비스 주소와 응시 가능 시간을 전달합니다.
4. `/admin`에 접속해 `.env.local`의 `DIAGNOSTICS_TOKEN` 값을 입력합니다.
5. 응시 상태와 검토 필요 신호를 확인하고, 상세 응답은 Google Sheets에서 확인합니다.

## 3. 10분 빠른 시작

### 준비물

- Node.js 20.9 이상
- npm(Node.js 설치 시 함께 설치됨)
- Google 계정
- Google Sheets API를 사용할 수 있는 서비스 계정

버전 확인:

```powershell
node --version
npm --version
```

### 실행 순서

PowerShell 기준:

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

macOS 또는 Linux 기준:

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

실행 전에 아래의 Google Sheets 준비와 환경 변수 설정을 완료해야 합니다. 실행 후 브라우저에서 다음 주소를 엽니다.

- 지원자 화면: `http://localhost:3000`
- 관리자 화면: `http://localhost:3000/admin`

개발 서버를 종료하려면 터미널에서 `Ctrl+C`를 누릅니다.

## 4. Google Sheets 준비

### 4.1 서비스 계정 준비

1. Google Cloud 프로젝트를 준비합니다.
2. 해당 프로젝트에서 Google Sheets API를 활성화합니다.
3. 서비스 계정을 만들고 JSON 형식의 키를 발급받습니다.
4. 새 Google 스프레드시트를 만듭니다.
5. 스프레드시트의 `공유` 메뉴에서 서비스 계정의 `client_email`을 **편집자**로 추가합니다.

서비스 계정에 편집 권한이 없으면 지원자 조회, 응답 저장 및 응답 탭 생성이 실패합니다. 발급받은 JSON 키는 외부에 공유하거나 저장소에 올리지 마세요.

### 4.2 필수 탭 만들기

스프레드시트에 다음 세 탭을 정확한 이름으로 만듭니다.

- `Candidates`
- `Responses`
- `EventLogs`

`Responses_V2`와 `Responses_V2_Bank`는 해당 검사 버전을 처음 실행할 때 애플리케이션이 자동으로 만들고 헤더를 입력합니다. 단, 기존 응답 확인을 위해 기본 `Responses` 탭은 미리 만들어 두어야 합니다.

### 4.3 Candidates 탭

첫 번째 행에 다음 헤더를 입력합니다.

```text
email | name | phone | allow | start_at | end_at | status | invited_at | started_at | completed_at
```

예시:

```text
hong@example.com | 홍길동 | 010-1234-5678 | true | 2026-08-13 09:00 | 2026-08-13 18:00 | INVITED | 2026-08-12 10:00 |  |
```

각 열의 의미:

| 열 | 입력 방법 |
| --- | --- |
| `email` | 지원자가 본인 확인에 사용할 이메일 |
| `name` | 지원자가 입력할 이름 |
| `phone` | 지원자가 입력할 휴대폰 번호. 하이픈 유무는 달라도 됩니다. |
| `allow` | 응시 허용 시 `true`, 차단 시 `false` |
| `start_at` | 응시 시작 시각. 비워두면 시작 시각을 제한하지 않습니다. |
| `end_at` | 응시 종료 시각. 비워두면 종료 시각을 제한하지 않습니다. |
| `status` | 초기값은 `INVITED` 권장. 시작 시 `STARTED`, 제출 시 `COMPLETED`로 갱신됩니다. |
| `invited_at` | 초대 시각을 관리할 때 사용하며 비워둘 수 있습니다. |
| `started_at` | 검사 시작 시 애플리케이션이 기록합니다. |
| `completed_at` | 제출 완료 시 애플리케이션이 기록합니다. |

시간대가 포함되지 않은 날짜는 한국 시간으로 해석합니다. 권장 형식은 `YYYY-MM-DD HH:mm`입니다.

### 4.4 Responses 탭

첫 번째 행에 다음 헤더를 입력합니다.

```text
Session ID | Name | Email | Phone | Timestamp | Status | Time Spent | Completion |
Focus Out Count | Forced Submit | Pattern Warning | Notes | Score
```

`v1`을 실제로 운영하려면 위 13개 열 뒤에 `data/items_full.json`의 문항 ID 열도 순서대로 준비해야 합니다. 기본 버전인 `v2-bank-pilot`의 응답 헤더는 앱이 `Responses_V2_Bank` 탭에 자동으로 생성합니다.

### 4.5 EventLogs 탭

첫 번째 행에 다음 헤더를 입력합니다.

```text
timestamp | sessionId | eventType | data
```

화면 이탈, 탭 이동, 복사 시도 등 검사 중 발생한 이벤트가 이 탭에 저장됩니다.

## 5. 환경 변수 설정

### Google Apps Script로 시트 자동 준비하기

필수 탭과 전체 문항 헤더를 수동으로 만들기 어렵다면 [`gas/Code.gs`](gas/Code.gs)를 사용할 수 있습니다. 스프레드시트의 `확장 프로그램 > Apps Script`에 코드를 붙여넣고 `setupCultureFitWorkbook` 함수를 한 번 실행하면 다음 항목을 자동으로 준비합니다.

- V1, V2 Pilot, V2 Bank 응답 탭과 전체 문항 ID 헤더
- Candidates와 EventLogs 탭
- 날짜·상태·응시 허용 입력 규칙과 기본 서식
- 지원자 추가, 허용·차단, 재응시 초기화 운영 메뉴
- 필수 구성과 지원자 데이터 점검 기능

설치 및 운영 방법은 [`gas/README.md`](gas/README.md)를 참고하세요. GAS는 Google Sheets 운영을 돕는 도구이며, Next.js 검사 웹사이트나 환경 변수를 대신하지는 않습니다.

`.env.local.example`을 복사해 만든 `.env.local` 파일에 실제 값을 입력합니다.

| 변수 | 필수 여부 | 설명 |
| --- | --- | --- |
| `SHEET_ID` | 필수 | Google 스프레드시트 ID |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | 필수 | 서비스 계정 키 JSON 전체 |
| `SESSION_SECRET` | 운영 필수 | 응시 세션을 보호하는 비밀 키. 32자 이상 권장 |
| `DIAGNOSTICS_TOKEN` | 관리자 기능 사용 시 필수 | `/admin` 및 진단 API에서 사용할 관리자 토큰 |
| `ALERT_WEBHOOK_URL` | 선택 | 심각한 저장 오류를 전송할 Slack 호환 웹훅 주소 |
| `ASSESSMENT_VERSION` | 선택 | 신규 검사 버전. 기본값은 `v2-bank-pilot` |

### SHEET_ID 찾기

스프레드시트 주소가 다음과 같다면:

```text
https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit
```

`SHEET_ID`는 `/d/`와 `/edit` 사이의 값입니다.

```dotenv
SHEET_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz
```

### 서비스 계정 JSON 입력

다운로드한 JSON 파일의 전체 내용을 한 줄 값으로 입력합니다. `private_key` 안의 줄바꿈은 `\n` 형태를 유지합니다.

```dotenv
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","client_email":"service-account@example.com","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}
```

### 비밀 키 만들기

다음 명령을 두 번 실행해 서로 다른 값을 만들고 각각 `SESSION_SECRET`과 `DIAGNOSTICS_TOKEN`에 사용할 수 있습니다.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.local`은 인증 정보를 포함하므로 공유하거나 Git에 커밋하지 마세요. 환경 변수를 변경한 후에는 개발 서버를 다시 시작해야 합니다. 검사 버전 변경은 신규 세션에만 적용되며, 진행 중인 세션은 시작 당시 버전과 문항 구성으로 복구됩니다.

## 6. 로컬 실행과 운영 배포

### 개발 환경

```powershell
npm run dev
```

코드를 수정하면 개발 서버가 변경사항을 자동으로 반영합니다.

### 운영 환경

```powershell
npm ci
npm run build
npm start
```

배포 서비스에는 `.env.local` 파일을 올리는 대신 해당 서비스의 환경 변수 설정 화면에서 동일한 값을 등록하세요. 운영 환경에서는 다음 사항을 확인해야 합니다.

- `SESSION_SECRET`과 `DIAGNOSTICS_TOKEN`에 충분히 긴 서로 다른 값을 사용합니다.
- HTTPS가 적용된 주소를 사용합니다.
- 서비스 계정은 검사 전용 스프레드시트에만 공유합니다.
- 지원자 개인정보와 응답 결과의 접근 권한 및 보관 기간을 조직 정책에 맞게 관리합니다.

## 7. 결과 확인 방법

### 관리자 화면

`/admin`에 접속해 `DIAGNOSTICS_TOKEN` 값을 입력하면 다음 항목을 확인할 수 있습니다.

- 전체 지원자 수
- 진행 중인 검사 수
- 완료된 검사 수
- 검토 필요 신호가 있는 검사 수
- 최근 응시자의 상태, 완료율, 점수 및 이상 신호

### 응답 시트

| 값 | 의미 |
| --- | --- |
| `STARTED` | 본인 확인을 마치고 검사 세션이 생성됨 |
| `IN_PROGRESS` | 답안이 임시 저장됨 |
| `COMPLETED` | 제출 완료 |
| `Time Spent` | 실제 응시 시간 |
| `Completion` | 응답한 문항 수와 전체 출제 문항 수 |
| `Focus Out Count` | 탭 또는 창을 벗어난 횟수 |
| `Forced Submit` | 제한시간 종료로 자동 제출되었는지 여부 |
| `Pattern Warning` | 추가 확인이 필요한 응답 신호 |
| `Notes` | 버전, 문항 구성, 영역별 점수 및 검사 메타데이터 |
| `Score` | 100점 기준 Culture Fit 총점 요약 |

주요 검토 신호:

| 신호 | 의미 |
| --- | --- |
| `FAST_RESPONSE` | 응답 시간이 지나치게 짧음 |
| `UNIFORM_RESPONSE` | 동일한 번호를 반복하는 등 응답 패턴이 단조로움 |
| `EXCESSIVE_FOCUS_OUT` | 검사 화면을 벗어난 횟수가 많음 |
| `IMC_FAILED_n` | 안내를 읽었는지 확인하는 문항을 `n`개 통과하지 못함 |
| `RESPONSE_INCONSISTENCY_REVIEW` | 비슷한 문항에 대한 응답 차이가 커 추가 확인이 필요함 |
| `HIGH_RESPONSE_DISTORTION` | 지나치게 바람직하게 보이려는 응답 경향이 높음 |
| `INCOMPLETE_RESPONSE` | 일부 문항에 응답하지 않음 |

이 신호들은 자동 탈락 기준이 아닙니다. 다른 채용 자료와 함께 사람이 추가 검토하기 위한 정보입니다.

## 8. 자주 발생하는 문제

| 증상 | 확인할 내용 |
| --- | --- |
| `Google Sheets 연결에 실패했습니다.` | Sheets API 활성화 여부, 서비스 계정 JSON, 스프레드시트 편집 권한 확인 |
| `시스템 설정 오류입니다.` | `SHEET_ID`와 필수 환경 변수 입력 여부 확인 |
| 등록 정보가 일치하지 않음 | `Candidates`의 이름·이메일·휴대폰 번호와 지원자 입력값 확인 |
| 응시 허용 대상이 아님 | 해당 지원자의 `allow`가 `true`인지 확인 |
| 응시 시간이 아니라고 표시됨 | `start_at`, `end_at` 값과 한국 시간 기준 확인 |
| 응답이 저장되지 않음 | `Responses`, `EventLogs` 탭 존재 여부와 서비스 계정 편집 권한 확인 |
| `/admin` 인증 실패 | 입력한 값과 `DIAGNOSTICS_TOKEN`이 같은지 확인 후 서버 재시작 |
| 진행 중 검사가 복구되지 않음 | 같은 브라우저인지, 검사 시작 후 6시간이 지나지 않았는지 확인 |

설정 상태는 관리자 토큰을 헤더에 넣어 진단 API에서 확인할 수 있습니다. PowerShell 예시:

```powershell
$headers = @{ Authorization = "Bearer 여기에_DIAGNOSTICS_TOKEN_입력" }
Invoke-RestMethod -Uri http://localhost:3000/api/envcheck -Headers $headers
Invoke-RestMethod -Uri http://localhost:3000/api/diag -Headers $headers
```

- `/api/envcheck`: 필수 환경 변수 설정 여부 확인
- `/api/diag`: Google Sheets의 필수 탭 연결 상태 확인
- `/api/diag2`: 시트 연결과 채점 엔진 상태를 함께 확인

진단 결과에는 운영 설정 정보가 포함될 수 있으므로 진단 API와 관리자 토큰을 외부에 공개하지 마세요.

## 9. 검사 버전과 채점 상세

### 지원 버전

| 버전 | 설명 | 응답 탭 |
| --- | --- | --- |
| `v1` | 기존 300문항 검사 | `Responses` |
| `v2-pilot` | 동결된 192문항 검사 | `Responses_V2` |
| `v2-bank-pilot` | 300문항 은행에서 230문항을 선별하는 기본 버전 | `Responses_V2_Bank` |

`ASSESSMENT_VERSION`에 알 수 없는 값을 입력하면 기본 버전인 `v2-bank-pilot`이 사용됩니다.

### 300문항 은행 구성

여기서 문항 은행은 지원자마다 일부 문항을 골라 출제하기 위한 전체 질문 모음을 뜻합니다.

| 구분 | 전체 문항 | 개인별 출제 |
| --- | ---: | ---: |
| 핵심 Culture Fit 5개 영역 | 200 | 150, 영역별 30 |
| OCB(조직에 도움이 되는 자발적 행동) | 12 | 10 |
| CWB(조직에 해가 될 수 있는 행동) | 12 | 10 |
| 정직성·무결성 | 16 | 15 |
| 사회적 바람직성 | 15 | 10 |
| 인상관리 | 15 | 10 |
| 자기기만 | 15 | 10 |
| 일관성 확인용 반복문항 | 10 | 10 |
| IMC(안내문 주의집중 확인) | 5 | 5 |
| 합계 | 300 | 230 |

같은 세션에는 항상 같은 문항 조합이 재현됩니다. 다른 세션에는 영역별 문항 수를 유지하면서 다른 조합이 출제될 수 있습니다. 일관성 기준문항 10개, 반복문항 10개, IMC 5개는 항상 포함됩니다.

### 채점 원칙

- 총점에는 선별된 핵심 Culture Fit 150문항만 반영합니다.
- OCB, CWB, 정직성·무결성은 별도 보조척도로 계산합니다.
- 사회적 바람직성, 인상관리, 자기기만은 총점에서 제외하고 응답왜곡 검토에 사용합니다.
- IMC는 총점에서 제외하고 안내 준수 여부를 확인합니다.
- 일관성 반복문항은 총점에서 제외합니다.
- 원문항과 반복문항의 응답이 2점 이상 다른 쌍이 10쌍 중 4쌍 이상이면 `RESPONSE_INCONSISTENCY_REVIEW`를 기록합니다.
- OCB와 CWB는 최근 12개월 동안의 행동 빈도를 묻습니다.
- 각 문항은 정방향(`direct`), 역방향(`reverse`), 주의집중 확인(`imc`) 중 하나의 채점 방식을 가집니다.

## 10. 개발자 검증

일반적인 코드 변경 후에는 다음 명령을 실행합니다.

```powershell
npm test
npm run build
```

브라우저 기반 E2E 테스트를 처음 실행할 때는 Chromium 설치가 필요할 수 있습니다.

```powershell
npx playwright install chromium
npm run test:e2e
```

문항 원본을 수정해 V2 문항 JSON을 다시 생성해야 할 때만 다음 명령을 사용합니다.

```powershell
npm run build:items:v2
```

이 명령은 `data/items_v2.json`과 `data/items_v2_192.json`을 다시 작성하므로 단순 상태 확인 목적으로 실행하지 마세요.

## 11. 주요 파일

| 경로 | 역할 |
| --- | --- |
| `pages/index.js` | 지원자 검사 화면과 진행 흐름 |
| `pages/admin.js` | 관리자 운영 현황 화면 |
| `pages/api/` | 본인 확인, 임시 저장, 제출 및 진단 API |
| `lib/scoring.js` | 채점과 검토 신호 계산 |
| `lib/sheets.js` | Google Sheets 읽기·쓰기 |
| `lib/assessment-versions.js` | 검사 버전별 문항과 응답 탭 설정 |
| `data/` | 검사 문항 JSON |
| `tests/` | 단위 및 브라우저 테스트 |

상세 설계와 V1 대비 변경점은 [culture_fit_v1_v2_comparison.md](culture_fit_v1_v2_comparison.md)를 참고하세요.
