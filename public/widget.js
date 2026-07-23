(function () {
  var BUTTON_LABEL = {
    ko: '상담',
    en: 'Chat',
    jp: 'サポート',
  };
  var BUTTON_ARIA = {
    ko: '상담 채팅 열기',
    en: 'Open chat',
    jp: 'チャットを開く',
  };
  var FRAME_TITLE = {
    ko: '고객센터 채팅',
    en: 'Customer support chat',
    jp: 'カスタマーサポートチャット',
  };

  var currentScript = document.currentScript;
  var scriptUrl = new URL(currentScript.src);
  var origin = scriptUrl.origin;
  var basePath = scriptUrl.pathname.replace(/[^/]*$/, '');
  var lng = scriptUrl.searchParams.get('lng') || 'ko';
  var site = scriptUrl.searchParams.get('site') || '';

  var button = document.createElement('button');
  button.textContent = BUTTON_LABEL[lng] || BUTTON_LABEL.ko;
  button.setAttribute('aria-label', BUTTON_ARIA[lng] || BUTTON_ARIA.ko);
  Object.assign(button.style, {
    position: 'fixed',
    right: '20px',
    bottom: '20px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    zIndex: 2147483000,
  });

  var iframeParams = new URLSearchParams({ lng: lng, site: site });
  var iframe = document.createElement('iframe');
  iframe.src = origin + basePath + 'widget-chat.html?' + iframeParams.toString();
  iframe.title = FRAME_TITLE[lng] || FRAME_TITLE.ko;
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '20px',
    bottom: '86px',
    width: '340px',
    height: '480px',
    maxWidth: 'calc(100vw - 40px)',
    maxHeight: 'calc(100vh - 120px)',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
    display: 'none',
    zIndex: 2147483000,
  });

  var open = false;
  function setOpen(next) {
    open = next;
    iframe.style.display = open ? 'block' : 'none';
  }

  button.addEventListener('click', function () {
    setOpen(!open);
  });

  window.addEventListener('message', function (event) {
    if (event.origin === origin && event.data && event.data.type === 'shop-chat:close') {
      setOpen(false);
    }
  });

  function mount() {
    document.body.appendChild(iframe);
    document.body.appendChild(button);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
