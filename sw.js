const CACHE_NAME = 'english-speaking-cache-v6';
const urlsToCache = [
  './',
  './index.html?v=v6',
  './styles.css?v=v6',
  './app.js?v=v6',
  './manifest.json'
];

// 1. 서비스 워커 설치 및 파일 캐싱
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 2. 새로운 버전 나오면 기존 캐시 삭제
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. 오프라인 또는 빠른 로딩을 위한 fetch 가로채기
self.addEventListener('fetch', event => {
  // 구글 앱스 스크립트 API 호출(https://script.google.com/...) 은 캐싱하지 않고 네트워크에서 직접 받습니다.
  if (event.request.url.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 로컬 파일들은 네트워크 우선(Network First) 전략 사용 (항상 최신 코드 강제 적용)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 다운로드 성공시, 캐시창고에도 최신 버전을 슬쩍 갱신해둠
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // 인터넷(오프라인)이 끊겼을 경우에만 최후의 수단으로 폰 내부의 캐시 반환
        return caches.match(event.request);
      })
  );
});
