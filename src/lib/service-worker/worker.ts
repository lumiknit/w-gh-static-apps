/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;
declare const __SW_CACHE_VERSION__: string;

const CACHE_PREFIX = 'cache-';
const CACHE_NAME = `${CACHE_PREFIX}offline-${__SW_CACHE_VERSION__}`;

self.addEventListener('install', () => {
	console.log('[SW] Install with version', __SW_CACHE_VERSION__);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());

	// Remove old caches
	(async () => {
		const keys = await caches.keys();
		await Promise.all(
			keys.map(async (key) => {
				if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
					console.log('[SW] Deleting old cache', key);
					return caches.delete(key);
				}
			})
		);
	})();
});

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only hanle GET requests
	if (request.method !== 'GET') return;

	// Ignore chrome extensions and other non-http(s) requests
	const url = new URL(request.url);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

	event.respondWith(
		(async () => {
			let response: Response;
			try {
				response = await fetch(request);
			} catch {
				// Network error (offline)
				const cached = await caches.match(request);
				if (cached) return cached;

				return new Response('Offline and no cache', {
					status: 503,
					statusText: 'Service Unavailable',
				});
			}

			// Online -> Keep in cache
			const co = await caches.open(CACHE_NAME);
			let needCache = false;
			if (response.ok) {
				const isHtml = response.headers
					.get('content-type')
					?.includes('text/html');
				if (isHtml) {
					// HTML always needs to be updated
					needCache = true;
				} else {
					// Otherwise, only cache if not already cached, to avoid clone.
					const existing = await co.match(request);
					if (!existing) needCache = true;
				}
			}
			if (needCache) {
				const c = response.clone();
				co.put(request, c).catch((err) => {
					console.warn('[SW] Failed to cache', request.url, err);
				});
			}
			return response;
		})()
	);
});
