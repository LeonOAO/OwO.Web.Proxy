/* sw.js (for https://leonoao.github.io/OwO.Web.Proxy/ixlmath/sw.js) */

if (navigator.userAgent.includes('Firefox')) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value: true,
    writable: false,
  });
}

const SW_SCOPE = (self.registration && self.registration.scope)
  ? self.registration.scope
  : new URL('./', self.location.href).toString();

importScripts(new URL('scram/scramjet.all.js', SW_SCOPE).toString());

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const CONFIG = {
  blocked: [
    'youtube.com/get_video_info?*adformat=*',
    'youtube.com/api/stats/ads/*',
    'youtube.com/pagead/*',
    '.facebook.com/ads/*',
    '.facebook.com/tr/*',
    '.fbcdn.net/ads/*',
    'graph.facebook.com/ads/*',
    'ads-api.twitter.com/*',
    'analytics.twitter.com/*',
    '.twitter.com/i/ads/*',
    '.ads.yahoo.com',
    '.advertising.com',
    '.adtechus.com',
    '.oath.com',
    '.verizonmedia.com',
    '.amazon-adsystem.com',
    'aax.amazon-adsystem.com/*',
    'c.amazon-adsystem.com/*',
    '.adnxs.com',
    '.adnxs-simple.com',
    'ab.adnxs.com/*',
    '.rubiconproject.com',
    '.magnite.com',
    '.pubmatic.com',
    'ads.pubmatic.com/*',
    '.criteo.com',
    'bidder.criteo.com/*',
    'static.criteo.net/*',
    '.openx.net',
    '.openx.com',
    '.indexexchange.com',
    '.casalemedia.com',
    '.adcolony.com',
    '.chartboost.com',
    '.unityads.unity3d.com',
    '.inmobiweb.com',
    '.tapjoy.com',
    '.applovin.com',
    '.vungle.com',
    '.ironsrc.com',
    '.fyber.com',
    '.smaato.net',
    '.supersoniads.com',
    '.startappservice.com',
    '.airpush.com',
    '.outbrain.com',
    '.taboola.com',
    '.revcontent.com',
    '.zedo.com',
    '.mgid.com',
    '*/ads/*',
    '*/adserver/*',
    '*/adclick/*',
    '*/banner_ads/*',
    '*/sponsored/*',
    '*/promotions/*',
    '*/tracking/ads/*',
    '*/promo/*',
    '*/affiliates/*',
    '*/partnerads/*',
  ]
};

/** @type {{ origin: string, html: string, css: string, js: string } | undefined} */
let playgroundData;

function escapeRegex(s) {
  return String(s).replace(/[\^$.*+?()[\]{}|]/g, '\$&');
}

function toRegex(pattern) {
  const escaped = escapeRegex(pattern)
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE_STAR}}/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isBlocked(hostname, pathname) {
  return CONFIG.blocked.some((pattern) => {
    if (pattern.startsWith('#')) pattern = pattern.substring(1);
    if (pattern.startsWith('*')) pattern = pattern.substring(1);

    if (pattern.includes('/')) {
      const [hostPattern, ...pathParts] = pattern.split('/');
      const pathPattern = pathParts.join('/');
      const hostRegex = toRegex(hostPattern);
      const pathRegex = toRegex(`/${pathPattern}`);
      return hostRegex.test(hostname) && pathRegex.test(pathname);
    }

    const hostRegex = toRegex(pattern);
    return hostRegex.test(hostname);
  });
}

async function handleRequest(event) {
  await scramjet.loadConfig();

  // 🔧 Force prefix to include /go/ based on SW scope.
  // This prevents decoding the remote URL as "go/<encoded>" which becomes an invalid URL.
  const expectedPrefix = new URL('./go/', SW_SCOPE).pathname;
  if (scramjet.config && scramjet.config.prefix !== expectedPrefix) {
    scramjet.config.prefix = expectedPrefix;
  }

  const reqUrl = new URL(event.request.url);
  const isGo = reqUrl.pathname.includes('/ixlmath/go/');
  if (isGo) {
    console.log('[SW] saw go request:', reqUrl.href);
    console.log('[SW] using prefix:', scramjet.config ? scramjet.config.prefix : '(no config)');
  }

  const shouldRoute = scramjet.route(event);
  if (isGo) console.log('[SW] route(event)=', shouldRoute);

  if (shouldRoute) {
    const response = await scramjet.fetch(event);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/html')) {
      const originalText = await response.text();
      const encoder = new TextEncoder();
      const byteLength = encoder.encode(originalText).length;

      const newHeaders = new Headers(response.headers);
      newHeaders.set('content-length', byteLength.toString());

      return new Response(originalText, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }

    return response;
  }

  return fetch(event.request);
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (url.includes('supabase.co')) return;
  event.respondWith(handleRequest(event));
});

self.addEventListener('message', ({ data }) => {
  if (data && data.type === 'playgroundData') {
    playgroundData = data;
  }
});

scramjet.addEventListener('request', (e) => {
  if (isBlocked(e.url.hostname, e.url.pathname)) {
    e.response = new Response('Site Blocked', { status: 403 });
    return;
  }

  if (playgroundData && e.url.href.startsWith(playgroundData.origin)) {
    const routes = {
      '/': { content: playgroundData.html, type: 'text/html' },
      '/style.css': { content: playgroundData.css, type: 'text/css' },
      '/script.js': { content: playgroundData.js, type: 'application/javascript' },
    };

    const route = routes[e.url.pathname];

    if (route) {
      const headers = { 'content-type': route.type };
      e.response = new Response(route.content, { headers });

      e.response.rawHeaders = headers;
      e.response.rawResponse = {
        body: e.response.body,
        headers,
        status: e.response.status,
        statusText: e.response.statusText,
      };
      e.response.finalURL = e.url.toString();
    } else {
      e.response = new Response('empty response', { headers: {} });
    }
  }
});
