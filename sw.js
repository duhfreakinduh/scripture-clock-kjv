'use strict';
const APP_CACHE='scripture-clock-app-v1';
const DATA_CACHE='scripture-clock-data-v1';
const APP_SHELL=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./assets/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>![APP_CACHE,DATA_CACHE].includes(key)).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url);const scripture=url.hostname==='cdn.jsdelivr.net'||url.hostname==='raw.githubusercontent.com';if(scripture){event.respondWith(networkFirst(request,DATA_CACHE));return;}if(url.origin===self.location.origin)event.respondWith(cacheFirst(request,APP_CACHE));});
async function cacheFirst(request,cacheName){const cached=await caches.match(request);if(cached)return cached;try{const response=await fetch(request);if(response.ok){const cache=await caches.open(cacheName);cache.put(request,response.clone());}return response;}catch(error){if(request.mode==='navigate')return caches.match('./index.html');throw error;}}
async function networkFirst(request,cacheName){try{const response=await fetch(request);if(response.ok||response.type==='opaque'){const cache=await caches.open(cacheName);cache.put(request,response.clone());}return response;}catch(error){const cached=await caches.match(request);if(cached)return cached;throw error;}}
