'use strict';

const SOURCES = [
  'https://cdn.jsdelivr.net/gh/farskipper/kjv@master/json/verses-1769.json',
  'https://raw.githubusercontent.com/farskipper/kjv/master/json/verses-1769.json'
];
const featured = new Map([['3:16', 'John 3:16']]);
const fallback = [
  ['John 3:16', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
  ['Psalm 118:24', 'This is the day which the LORD hath made; we will rejoice and be glad in it.'],
  ['Proverbs 3:5', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.']
];
const state = { byTime: new Map(), byChapter: new Map(), ready: false, minute: '', reading: null, sound: localStorage.getItem('scriptureClockSound') === 'true', prompt: null };
const $ = (s) => document.querySelector(s);
const el = { time: $('#digitalTime'), am: $('#meridiem'), date: $('#dateLine'), ref: $('#verseReference'), text: $('#verseText'), badge: $('#matchBadge'), note: $('#fallbackNote'), chapter: $('#chapterNumber'), verse: $('#verseNumber'), progress: $('#minuteProgress'), next: $('#nextReading'), count: $('#verseCount'), zone: $('#timezoneName'), sound: $('#soundButton'), share: $('#shareButton'), full: $('#fullscreenButton'), install: $('#installButton'), toast: $('#toast'), card: $('.verse-card') };

function parseRef(ref) { const m = ref.match(/^(.*?)\s+(\d+):(\d+)$/); return m ? { book:m[1], chapter:+m[2], verse:+m[3] } : null; }
function seed(s) { let h=2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h,16777619); } return h>>>0; }
function pick(a,s) { return a[seed(s)%a.length]; }
function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; }
function hour12(d) { return d.getHours()%12 || 12; }
function wantedVerse(d) { return d.getMinutes() || 1; }

function indexBible(data) {
  let total=0;
  for (const [reference, raw] of Object.entries(data)) {
    const p=parseRef(reference); if (!p || p.chapter<1 || p.chapter>12) continue;
    const item={ reference, text:String(raw).replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim(), ...p };
    total++;
    const ck=String(p.chapter); if (!state.byChapter.has(ck)) state.byChapter.set(ck,[]); state.byChapter.get(ck).push(item);
    if (p.verse<=59) { const tk=`${p.chapter}:${p.verse}`; if (!state.byTime.has(tk)) state.byTime.set(tk,[]); state.byTime.get(tk).push(item); }
  }
  state.ready=true; el.count.textContent=`${Object.keys(data).length.toLocaleString()} loaded`; el.card.setAttribute('aria-busy','false');
}

async function loadBible() {
  for (const url of SOURCES) {
    try { const r=await fetch(url,{cache:'force-cache'}); if(!r.ok) throw Error(r.status); const d=await r.json(); if(Object.keys(d).length<10000) throw Error('incomplete'); indexBible(d); return; }
    catch(e) { console.warn('Scripture source failed',url,e); }
  }
  el.count.textContent='Offline sample'; toast('Connect once to load the complete KJV collection.');
}

function choose(d) {
  const h=hour12(d), v=wantedVerse(d), key=`${h}:${v}`;
  if (!state.ready) { const [reference,text]=pick(fallback,`${dayKey(d)}-${key}`); return {reference,text,requestedChapter:h,requestedVerse:v,exact:false,offline:true}; }
  const exact=state.byTime.get(key)||[];
  const forced=featured.get(key); const hit=forced && exact.find(x=>x.reference.toLowerCase()===forced.toLowerCase());
  if (hit) return {...hit,requestedChapter:h,requestedVerse:v,exact:true};
  if (exact.length) return {...pick(exact,`${dayKey(d)}-${key}`),requestedChapter:h,requestedVerse:v,exact:true};
  const chapter=state.byChapter.get(String(h))||[];
  return {...pick(chapter,`${dayKey(d)}-fallback-${key}`),requestedChapter:h,requestedVerse:v,exact:false};
}

function render(r) {
  state.reading=r; el.ref.textContent=r.reference; el.text.textContent=r.text; el.chapter.textContent=r.requestedChapter; el.verse.textContent=String(r.requestedVerse).padStart(2,'0');
  el.note.hidden=r.exact;
  if (r.offline) { el.badge.textContent='Offline sample'; el.note.textContent='Connect to load and cache the full King James Version.'; }
  else if (r.exact) { el.badge.textContent='Exact time match · KJV'; }
  else { el.badge.textContent='Chapter match · KJV'; el.note.textContent=`No exact ${r.requestedChapter}:${r.requestedVerse} reference exists in the loaded KJV data, so this is a real verse from chapter ${r.requestedChapter}.`; }
}

function chime() { if (!state.sound) return; try { const C=window.AudioContext||window.webkitAudioContext, c=new C(), o=c.createOscillator(), g=c.createGain(); o.frequency.value=523.25; g.gain.setValueAtTime(.0001,c.currentTime); g.gain.exponentialRampToValueAtTime(.08,c.currentTime+.02); g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.45); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+.5); } catch {} }
function toast(msg) { el.toast.textContent=msg; el.toast.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.toast.classList.remove('show'),2600); }

function tick() {
  const d=new Date(), h=hour12(d), m=String(d.getMinutes()).padStart(2,'0'), s=d.getSeconds();
  el.time.textContent=`${h}:${m}`; el.time.dateTime=d.toISOString(); el.am.textContent=d.getHours()>=12?'PM':'AM'; el.date.textContent=d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  el.progress.style.width=`${((s+d.getMilliseconds()/1000)/60)*100}%`; el.next.textContent=`${60-s}s`;
  const k=`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`;
  if (k!==state.minute) { if(state.minute) chime(); state.minute=k; render(choose(d)); }
  requestAnimationFrame(tick);
}

el.zone.textContent=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local time';
el.sound.setAttribute('aria-pressed',String(state.sound));
el.sound.addEventListener('click',()=>{ state.sound=!state.sound; localStorage.setItem('scriptureClockSound',state.sound); el.sound.setAttribute('aria-pressed',String(state.sound)); toast(state.sound?'Minute chime on':'Minute chime off'); });
el.share.addEventListener('click',async()=>{ const text=`${state.reading.reference} — “${state.reading.text}” (KJV)`; try { if(navigator.share) await navigator.share({title:'Scripture Clock',text,url:location.href}); else { await navigator.clipboard.writeText(`${text}\n${location.href}`); toast('Verse copied'); } } catch {} });
el.full.addEventListener('click',async()=>{ try { if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { document.body.classList.toggle('fullscreen-mode'); } });
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); state.prompt=e; el.install.hidden=false; });
el.install.addEventListener('click',async()=>{ if(!state.prompt) return; state.prompt.prompt(); await state.prompt.userChoice; state.prompt=null; el.install.hidden=true; });
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
loadBible().finally(()=>{ state.minute=''; }); tick();
