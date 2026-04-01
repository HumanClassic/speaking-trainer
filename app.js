// ====== 설정 부분 ======
// 새로 배포한 구글 앱스 스크립트 웹앱 URL을 이곳에 넣으세요!
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzMc-eFoYfjNzSkj4jpNgxACdndnqZ093MXqMXTYdFxwsQXjL_Ejdx4LnFbtfxEvKKYUw/exec";

// ====== 전역 상태 ======
let appData = []; // 서버에서 불러온 전체 데이터
let userProgress = JSON.parse(localStorage.getItem('delsseo_progress_v2')) || {};
let currentSubject = 'all';
let currentChapter = 'all';
const AUTH_STORE_KEY = 'delsseo_auth_pwd'; // 스마트 세션 인증 토큰 키

// 오디오/녹음 관련 상태
let mediaRecorder = null;
let audioChunks = [];

let isLooping = false;
let currentSequenceAudio = null; // 사용자가 녹음한 오디오 객체
let globalTTSMsg = null; // 원어민 TTS 메시지 객체

// ====== PWA 설치 제어 ======
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  // 기본 팝업 뜨는 것 방지 (우리가 만든 버튼으로 제어하기 위해)
  e.preventDefault();
  deferredPrompt = e;

  // 설치 가능한 환경이고, 아직 설치가 안 되었다면 버튼 보이기
  if (installBtn && !window.matchMedia('(display-mode: standalone)').matches) {
    installBtn.style.display = 'block';
  }
});

// 설치 버튼 클릭 처리
if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); // 브라우저 고유 설치 팝업 호출

    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      installBtn.style.display = 'none'; // 성공적으로 수락하면 숨김
    }
    deferredPrompt = null;
  });
}

// 설치가 완료되면 감지하여 버튼 숨김
window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
  if (installBtn) installBtn.style.display = 'none';
});


// ====== 초기화 코어 ======
document.addEventListener('DOMContentLoaded', () => {
  // 서비스 워커 등록 (PWA의 근간)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW등록 실패', err));

    // 최신 코드가 백그라운드 배포되었을 때 사용자의 앱을 자동 새로고침 (강제종료 불필요)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // 자동 로그인 시도 (저장된 비밀번호가 있다면 백그라운드 우회 요청)
  const savedPwd = localStorage.getItem(AUTH_STORE_KEY);
  if (savedPwd) {
    performAuth(savedPwd, false);
  }

  // 이벤트 리스너 세팅
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('subjectSelect').addEventListener('change', (e) => {
    currentSubject = e.target.value;
    currentChapter = 'all'; // 과목 변경 시 챕터는 전체보기로 초기화
    populateChapters();
    renderList();
  });
  document.getElementById('chapterSelect').addEventListener('change', (e) => {
    currentChapter = e.target.value;
    renderList();
  });
});

const getEl = id => document.getElementById(id);

// 전역 로더 제어
function showLoader() { getEl('global-loader').style.display = 'flex'; }
function hideLoader() { getEl('global-loader').style.display = 'none'; }


// ====== 데이터 Fetch & 로그인 ======
async function handleLogin() {
  const pwd = getEl('passwordInput').value.trim();
  if (!pwd) return alert("비밀번호를 입력하세요.");

  // 모바일 브라우저 오디오 잠금 해제 (빈 소리 1회 재생)
  if (window.speechSynthesis) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  }

  // 수동 로그인(직접 버튼 클릭) 트리거 시도
  await performAuth(pwd, true);
}

async function performAuth(pwd, isManual) {
  showLoader();

  try {
    // 🔥 Vercel 프론트엔드 -> Google Apps Script API 로 GET 요청 (CORS)
    const url = `${GAS_API_URL}?password=${encodeURIComponent(pwd)}`;
    const response = await fetch(url);
    const result = await response.json();

    if (result.status === "error") {
      // 인증 실패. 만약 자동 로그인(백그라운드) 중이었다면, 서버 비번이 바뀐 상황임.
      if (!isManual) {
        localStorage.removeItem(AUTH_STORE_KEY); // 더 이상 동작하지 않는 낡은 세션 키를 로컬 창고에서 즉시 파기
        alert("원장님이 서버의 비밀번호를 변경하셨습니다. 카페 공지사항 확인 후 새로운 비밀번호로 다시 로그인해 주세요.");
      } else {
        alert(result.message);
      }
      hideLoader();
      return;
    }

    // 성공적으로 데이터 로드
    appData = result.data;

    // 접속에 성공한 정상 비밀번호이므로, 폰(PC)의 로컬 스토리지에 캐싱 (강력 자동 로그인 구현)
    localStorage.setItem(AUTH_STORE_KEY, pwd);

    // 과목 및 챕터 목록 생성
    populateSubjects();
    populateChapters();

    // 화면 전환
    getEl('login-screen').style.display = 'none';
    getEl('app-screen').style.display = 'block';

    renderList();
    updateProgressUI();

  } catch (err) {
    console.error(err);
    alert("데이터를 서버에서 가져오지 못했습니다. 마우스 드래그로 최신 app.js 가 제대로 업로드 되었는지 확인하세요!");
  } finally {
    hideLoader();
  }
}

// ====== UI 렌더링 ======
function populateSubjects() {
  const subjectEl = getEl('subjectSelect');
  const subjects = [...new Set(appData.map(item => item.subject).filter(s => s))];

  subjectEl.innerHTML = '<option value="all">📚 전체 과목 보기</option>';
  subjects.forEach(sub => {
    const option = document.createElement('option');
    option.value = sub;
    option.innerText = `📚 ${sub}`;
    subjectEl.appendChild(option);
  });

  // 최초 로그인 시 첫 번째 탭(과목)을 기본 선택하도록 강제
  if (subjects.length > 0) {
    currentSubject = subjects[0];
    subjectEl.value = currentSubject;
  }
}

function populateChapters() {
  const chapterEl = getEl('chapterSelect');
  const targetData = currentSubject === 'all' ? appData : appData.filter(item => item.subject === currentSubject);
  const categories = [...new Set(targetData.map(item => item.category).filter(c => c))];

  chapterEl.innerHTML = '<option value="all">📂 전체 챕터 보기</option>';
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.innerText = `🏷️ ${cat}`;
    chapterEl.appendChild(option);
  });
  chapterEl.value = currentChapter;
}

function renderList() {
  const container = getEl('list-container');
  container.innerHTML = '';

  const filtered = appData.filter(item => {
    const matchSub = currentSubject === 'all' || item.subject === currentSubject;
    const matchChap = currentChapter === 'all' || item.category === currentChapter;
    return matchSub && matchChap;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#6b7280;padding:2rem;">해당 챕터에 단어가 없습니다.</div>`;
    return;
  }

  filtered.forEach(item => {
    const isCompleted = userProgress[item.id] ? 'completed' : '';
    const isChecked = userProgress[item.id] ? 'checked' : '';

    // XSS 방지 처리
    const safeEngText = escapeHTML(item.english || "");
    const safeSubject = escapeHTML(item.subject || "");
    const safeCategory = escapeHTML(item.category || "-");

    const html = `
      <div class="card ${isCompleted}" id="card-${item.id}">
        <span class="category-tag">[${safeSubject}] ${safeCategory}</span>
        <div class="korean-text">${escapeHTML(item.korean || "")}</div>
        
        <div class="english-section">
          <button class="btn-toggle-answer" id="toggle-ans-${item.id}" onclick="toggleAnswer(${item.id})">👀 정답 보기</button>
          <div class="english-text" id="eng-text-${item.id}">${safeEngText}</div>
        </div>

        <div class="action-buttons">
          <button class="btn-action btn-listen" id="btn-listen-${item.id}" onclick="startTTSLoop(${item.id}, \`${safeEngText}\`)">
            🔊 듣기
          </button>
          <button class="btn-action btn-record" id="btn-record-${item.id}" onclick="handleRecordAndSequence(${item.id}, \`${safeEngText}\`)">
            🎤 녹음
          </button>
          <button class="btn-action btn-done ${isChecked}" id="btn-done-${item.id}" onclick="toggleCardDone(${item.id})">
            ✔
          </button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });
}

// 보안용 HTML 익스케이프 함수
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function toggleAnswer(id) {
  const textDiv = getEl(`eng-text-${id}`);
  const btn = getEl(`toggle-ans-${id}`);

  if (textDiv.classList.contains('visible')) {
    textDiv.classList.remove('visible');
    btn.classList.remove('active');
    btn.innerText = '👀 정답 보기';
  } else {
    textDiv.classList.add('visible');
    btn.classList.add('active');
    btn.innerText = '🙈 정답 가리기';
  }
}

// ====== 미디어 코어 로직 ======

function stopAllPlayback() {
  isLooping = false; // 루프 플래그 해제

  // 1. 진행중인 TTS 멈춤
  window.speechSynthesis.cancel();

  // 2. 진행중인 오디오 멈춤
  if (currentSequenceAudio) {
    currentSequenceAudio.pause();
    currentSequenceAudio.currentTime = 0;
  }

  // 3. 진행중인 녹음 멈춤
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }

  // 4. 모든 버튼 상태 초기화
  document.querySelectorAll('.btn-listen').forEach(b => {
    b.classList.remove('active');
    b.innerText = '🔊 듣기';
  });
  document.querySelectorAll('.btn-record').forEach(b => {
    b.classList.remove('recording', 'playing');
    b.innerText = '🎤 녹음';
  });
}

// 기능 1: 순수 원어민 TTS 무한 반복
function startTTSLoop(id, text) {
  const btn = getEl(`btn-listen-${id}`);

  if (btn.classList.contains('active')) {
    stopAllPlayback(); // 이미 듣는 중이면 중지
    return;
  }

  stopAllPlayback();
  isLooping = true;
  btn.classList.add('active');
  btn.innerText = '🛑 듣기 멈춤';

  function play() {
    if (!isLooping) return;
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    msg.rate = 0.9;

    msg.onend = () => {
      if (isLooping) play(); // 지연 없이 즉각 원어민 재생
    };

    window.speechSynthesis.speak(msg);
  }

  play();
}

// 기능 2: 🎤 사용자 녹음 -> [사용자 음성 -> 원어민 TTS] 교차 무한 시퀀스
async function handleRecordAndSequence(id, text) {
  const btn = getEl(`btn-record-${id}`);

  // 상태 1: 녹음 중지 및 시퀀스 돌입
  if (btn.classList.contains('recording')) {
    mediaRecorder.stop();
    return;
  }

  // 상태 2: 시퀀스 멈춤
  if (btn.classList.contains('playing')) {
    stopAllPlayback();
    return;
  }

  stopAllPlayback(); // 기존 모든 동작 리셋

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 모바일 호환 확장자 탐색
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    mediaRecorder = new MediaRecorder(stream, { mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

    mediaRecorder.onstop = () => {
      // 마이크 해제
      stream.getTracks().forEach(track => track.stop());

      // 블롭 생성
      const blob = new Blob(audioChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      currentSequenceAudio = new Audio(url);

      // UI 갱신 (시퀀스 시작)
      btn.classList.remove('recording');
      btn.classList.add('playing');
      btn.innerText = '🛑 핑퐁 재생 멈춤';

      isLooping = true;
      runPingPongSequence(text); // 핑퐁 시작
    };

    mediaRecorder.start();
    btn.classList.add('recording');
    btn.innerText = '⏹ 녹음 완료 (누르세요)';

  } catch (e) {
    console.error(e);
    alert('마이크 접근 권한이 필요합니다. 설정에서 허용해주세요.');
  }
}

// 핵심 알고리즘: 사용자 Voice -> TTS 원어민 핑퐁 무한 반복
function runPingPongSequence(text) {
  if (!isLooping || !currentSequenceAudio) return;

  // 1단계: 사용자 오디오 재생 시작
  currentSequenceAudio.play().catch(e => console.error(e));

  // 2단계: 사용자 오디오 재생 완료 시점에 트리거
  currentSequenceAudio.onended = () => {
    if (!isLooping) return;

    // 지연 없이 원어민 TTS 바로 발화
    const msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'en-US';
    msg.rate = 0.9;

    // 3단계: TTS 원어민 발화 완료 시점에 트리거
    msg.onend = () => {
      if (!isLooping) return;

      // 원어민 발화 끝나자마자 다시 최상위 PingPong(사용자) 즉각 재진입 (논스톱 무한루프)
      runPingPongSequence(text);
    };

    window.speechSynthesis.speak(msg);
  };
}


// ====== 진도 설정 (LocalStorage) ======
function toggleCardDone(id) {
  const card = getEl(`card-${id}`);
  const btn = getEl(`btn-done-${id}`);

  if (userProgress[id]) {
    delete userProgress[id];
    card.classList.remove('completed');
    btn.classList.remove('checked');
  } else {
    userProgress[id] = true;
    card.classList.add('completed');
    btn.classList.add('checked');
  }

  localStorage.setItem('delsseo_progress_v2', JSON.stringify(userProgress));
  updateProgressUI();
}

function updateProgressUI() {
  const total = appData.length;
  const done = Object.keys(userProgress).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  getEl('progressDisplay').innerText = `진도율: ${percent}% (${done}/${total})`;
}
