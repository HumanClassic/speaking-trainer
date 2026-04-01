# [MEMORY_BANK] 생활영어 스피킹 앱 프로젝트

## 🏛️ Arch-decisions
- 기존 `Google Apps Script(GAS) Web App`을 `API 데이터 서버(Backend)`로 역할을 격하 및 분리. (다중 탭 자동 파싱 알고리즘 추가 `getSheets()`)
- `Vercel`을 기반으로 한 `HTML/CSS/Vanilla JS`의 `PWA (Progressive Web App)` 1st-party 프론트엔드로 신규 이주(마이그레이션).
- 프론트엔드 내 `PingPong Sequencer` 도입하여 무한 교차 재생 시스템 확립.
- **2-Depth Cascading UI:** 구글 시트의 다중 탭(과목)을 분리하여 제공.
- **보안/편의 결합형 자동로그인 (Auto-Login):** `LocalStorage`에 성공한 패스워드를 기억하되, 세션 유효성(비교) 검사는 구글 서버에 위임. 서버 비번 갱신 시 기존 로컬 암호 파기 및 수동 로그인 강제.
- **PingPong Sequencer 지연 상수화:** 원어민 TTS 및 사용자 음성 재생 간격(Delay)을 단일 상수(`SEQUENCE_DELAY_MS`)로 통제하여 티키타카(Tiki-Taka) 대화 이질감 제거.
- **인앱 브라우저 강제 탈출 (Auto-Escape) 아키텍처:** 카카오톡, 인스타그램 등 인앱 웹뷰(WebView)에서 PWA 설치가 OS보안 정책상 원천 차단되는 악성 UX를 돌파하기 위해, `index.html` 렌더링 극초단에 User Agent를 스니핑하여 안드로이드(`intent://`), iOS 카톡(`kakaotalk://...`) 스킴으로 외부 시스템 브라우저를 강제 오픈시키도록 설계함.

## 🕵️ Root-causes
- **녹음/재생 불가 증상:** 최근 강화된 브라우저(Apple Safari, Chrome 등)의 샌드박스 정책으로 인하여 `iframe` 기반 내부에서 서비스되는 GAS 웹앱에서 미디어/스트림 통신 권한(MediaRecorder API) 접근이 원천 차단되었기 때문. 
- **트래픽 동시 접속 오해:** TTS 변환과 마이크 녹음은 전적으로 클라이언트(학생 스마트폰)의 CPU 코어 자원(Local Media Engine)을 사용하기 때문에 GAS 서버 트래픽이나 과금, 부하와 무관함.
- **대화 시퀀스 간극 (Delay) 이질감:** 기존 재생 함수 내부에 하드코딩된 로직(`setTimeout`)으로 인하여 대화 흐름이 끊기던 문제를 해결하기 위해, 껍데기 뿐인 타이머 래퍼(Wrapper)를 완전히 박살내고 오디오 이벤트(.onend/.onended) 완료 즉시 직접(논스톱) 함수를 트리거시켜 원천 마이크로 지연까지 차단함.
- **배포 후 스크립트(.js) 미반영 현상:** PWA 환경의 `sw.js`가 가지고 있던 **`Cache-First` (캐시 우선)** 정책의 만성적 병폐(배포 무시)를 타파하기 위해, 무조건 Vercel의 프론트 코드를 먼저 긁어오는 **`Network-First`** 프레임워크로 대격변(v5)하여 클라이언트 좀비 캐시 문제를 영구 사살함.
- **배포 시 앱 강제 종료(Kill) 필수였던 악성 UX 타파:** 신규 서비스 워커가 통제권을 탈취했을 때 발생하는 `controllerchange` 이벤트를 `app.js` 코어 단에서 수신하도록 신규 설계함. 이제 Vercel 업데이트가 모바일 기기 백그라운드에 도달하는 즉시, 화면이 알아서 `window.location.reload()` 하며 최신 코드로 자체 재부팅됨 (수동 껐다 켜기 불필요).
- **인앱 브라우저 내 PWA '앱 설치하기' 불능 증상:** OS 정책상 사내망 뷰어(인앱)에서는 악성코드 및 무단 서드파티 앱 설치를 방지하고자 `Service Worker` 통제권과 `beforeinstallprompt` 이벤트를 널파이(Nullify) 처리해버리기 때문. 사용자 수동 조작을 통제하기 위해 코드 레벨의 탈출 스니펫(Intent)을 최초로 도입함.

## 🚀 Next-steps
1. **[사용자 진행]** 작성된 `Code.gs.txt` 파일의 코드를 기존 앱스 스크립트 에디터에 붙여넣고 "새 배포(웹 앱)" 수행 후 배포된 `URL` 복사. (이제 모든 탭의 내용을 동시에 긁어옵니다.)
2. **[사용자 진행]** 동일하게 `Vercel` 환경에 있는 `app.js` 파일 최상단의 `GAS_API_URL` 위치에 해당 구글 앱스 스크립트 URL을 적용.
3. **[사용자 진행]** 바탕화면에 노출될 로고용 이미지인 `icon-192.png`, `icon-512.png` 파일을 디렉토리 안에 업로드 후 모든 로컬 파일 변동 사항(app.js, styles.css 등)을 `Vercel`로 최종 배포(Push).
