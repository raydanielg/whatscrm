/**
 * Public widget loader script served at `/api/public/widget.js`.
 *
 * Customers embed this via:
 *   <script src="https://your-app/api/public/widget.js" data-config='{...}'></script>
 * or the wrapper snippet generated in the Embed tab. It injects a launcher
 * button plus a lazily-loaded iframe pointing at `/embed/chatbots/:botId`,
 * so the widget UI itself is a real React route we already build.
 */
import { createFileRoute } from "@tanstack/react-router";

const SCRIPT = `(function(){
  if (window.__WACRMChatLoaded) return;
  window.__WACRMChatLoaded = true;

  function readConfig() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if ((s.src || '').indexOf('/api/public/widget.js') !== -1) {
        var raw = s.getAttribute('data-config');
        if (raw) { try { return JSON.parse(raw); } catch(e) {} }
      }
    }
    return (window.WACRMChat && window.WACRMChat.config) || {};
  }

  var cfg = readConfig();
  if (!cfg.botId) { console.warn('[WACRM] missing botId'); return; }

  var host = cfg.host || (new URL(document.currentScript ? document.currentScript.src : location.href)).origin;
  var accent = cfg.color || '#075E54';
  var position = cfg.position === 'bl' ? 'bl' : 'br';
  var greeting = cfg.greeting || '';

  // ----- Launcher button -----
  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Open chat');
  btn.setAttribute('type', 'button');
  btn.style.cssText = [
    'position:fixed',
    position === 'br' ? 'right:20px' : 'left:20px',
    'bottom:20px',
    'width:56px','height:56px','border-radius:9999px','border:0',
    'background:' + accent,'color:#fff','cursor:pointer',
    'box-shadow:0 10px 30px rgba(0,0,0,.18)',
    'display:flex','align-items:center','justify-content:center',
    'z-index:2147483000','transition:transform .2s ease,opacity .2s ease',
    'font-family:Inter,system-ui,sans-serif','font-size:0'
  ].join(';');
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  btn.onmouseenter = function(){ btn.style.transform = 'scale(1.05)'; };
  btn.onmouseleave = function(){ btn.style.transform = 'scale(1)'; };

  // ----- Greeting bubble -----
  var bubble = null;
  if (greeting) {
    bubble = document.createElement('div');
    bubble.textContent = greeting;
    bubble.style.cssText = [
      'position:fixed',
      position === 'br' ? 'right:88px' : 'left:88px',
      'bottom:32px',
      'max-width:260px','background:#fff','color:#161a1d',
      'padding:12px 14px','border-radius:14px',
      'box-shadow:0 12px 32px rgba(0,0,0,.14)',
      'font-family:Inter,system-ui,sans-serif','font-size:14px','line-height:1.4',
      'z-index:2147482999','cursor:pointer'
    ].join(';');
    bubble.onclick = function(){ open(); };
  }

  // ----- Iframe panel (lazy) -----
  var iframe = null;
  var wrap = null;
  var isOpen = false;

  function ensureFrame() {
    if (iframe) return;
    wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      position === 'br' ? 'right:20px' : 'left:20px',
      'bottom:88px',
      'width:380px','max-width:calc(100vw - 40px)',
      'height:600px','max-height:calc(100vh - 120px)',
      'border-radius:16px','overflow:hidden',
      'box-shadow:0 20px 60px rgba(0,0,0,.22)',
      'z-index:2147483000','background:#fff',
      'transform:translateY(20px) scale(.98)','opacity:0',
      'transition:transform .22s ease,opacity .22s ease',
      'pointer-events:none'
    ].join(';');
    iframe = document.createElement('iframe');
    iframe.title = 'Chat';
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write');
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:transparent';
    var qs = '?color=' + encodeURIComponent(accent) + '&pos=' + position;
    iframe.src = host + '/embed/chatbots/' + encodeURIComponent(cfg.botId) + qs;
    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
  }

  function open() {
    ensureFrame();
    isOpen = true;
    if (bubble) bubble.style.display = 'none';
    requestAnimationFrame(function(){
      wrap.style.opacity = '1';
      wrap.style.transform = 'translateY(0) scale(1)';
      wrap.style.pointerEvents = 'auto';
    });
    btn.style.opacity = '.85';
  }
  function close() {
    isOpen = false;
    if (!wrap) return;
    wrap.style.opacity = '0';
    wrap.style.transform = 'translateY(20px) scale(.98)';
    wrap.style.pointerEvents = 'none';
    btn.style.opacity = '1';
  }

  btn.onclick = function(){ isOpen ? close() : open(); };

  window.addEventListener('message', function(e){
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.wacrm === 'close') close();
    if (e.data.wacrm === 'unread' && !isOpen) {
      btn.style.animation = 'wacrm-pulse 1.2s ease-out 2';
    }
  });

  var style = document.createElement('style');
  style.textContent = '@keyframes wacrm-pulse{0%{box-shadow:0 0 0 0 ' + accent + '80}70%{box-shadow:0 0 0 18px ' + accent + '00}100%{box-shadow:0 0 0 0 ' + accent + '00}}';
  document.head.appendChild(style);

  function boot() {
    document.body.appendChild(btn);
    if (bubble) document.body.appendChild(bubble);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.WACRMChat = {
    config: cfg,
    open: open,
    close: close,
    toggle: function(){ isOpen ? close() : open(); }
  };
})();`;

export const Route = createFileRoute("/api/public/widget.js")({
  server: {
    handlers: {
      GET: async () =>
        new Response(SCRIPT, {
          status: 200,
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
