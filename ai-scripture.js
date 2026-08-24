'use strict';

/* Scripture Clock AI Finder
   AI chooses a theme/reference only. Verse text is fetched from the same KJV data
   source as Scripture Clock, so the model never writes or paraphrases Scripture.
*/

(() => {
  const HF_IMPORT = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
  const MODEL_CANDIDATES = ['Xenova/bge-small-en-v1.5', 'Xenova/all-MiniLM-L6-v2'];
  const THEMES = [
    { name:'Peace & anxiety', text:'peace anxiety worry stress calm troubled heart prayer fear rest', refs:['Philippians 4:6','John 14:27','Isaiah 26:3'] },
    { name:'Fear & courage', text:'fear afraid courage bravery danger confidence power sound mind', refs:['Isaiah 41:10','Psalms 56:3','2 Timothy 1:7'] },
    { name:'Grief & comfort', text:'grief death loss sadness mourning broken heart comfort sorrow heaven', refs:['Psalms 34:18','Matthew 5:4','Revelation 21:4'] },
    { name:'Strength & endurance', text:'strength tired weak endurance perseverance keep going hard times energy', refs:['Philippians 4:13','Isaiah 40:31','Psalms 46:1'] },
    { name:'Wisdom & decisions', text:'wisdom decision choices understanding knowledge discernment unsure what should I do', refs:['James 1:5','Proverbs 3:5','Proverbs 4:7'] },
    { name:'Family & parenting', text:'family parenting children child father mother home marriage household raise teach kids', refs:['Proverbs 22:6','Joshua 24:15','Ephesians 6:4'] },
    { name:'Work & purpose', text:'work job career purpose effort diligence labor serve excellence calling', refs:['Colossians 3:23','Proverbs 16:3','Ecclesiastes 9:10'] },
    { name:'Faith & trust', text:'faith trust believe belief doubt God promise confidence unseen hearing word', refs:['Hebrews 11:1','Romans 10:17','Mark 11:24'] },
    { name:'Forgiveness', text:'forgive forgiveness resentment hurt apology mercy grace forgive others', refs:['Ephesians 4:32','Colossians 3:13','Matthew 6:14'] },
    { name:'Love', text:'love kindness patience relationship marriage charity compassion how to love', refs:['1 Corinthians 13:4','1 Corinthians 13:7','John 3:16'] },
    { name:'Hope & future', text:'hope future discouraged plans tomorrow purpose good future waiting', refs:['Jeremiah 29:11','Romans 15:13','Romans 8:28'] },
    { name:'Temptation & self-control', text:'temptation addiction urge self control discipline sin escape resist', refs:['1 Corinthians 10:13','James 4:7','Matthew 26:41'] },
    { name:'Anger & conflict', text:'anger mad conflict argument temper words fighting slow to anger listen', refs:['Proverbs 15:1','James 1:19','Ephesians 4:26'] },
    { name:'Guidance', text:'guidance direction path where to go next step light path lead me decision', refs:['Psalms 119:105','Proverbs 3:5','James 1:5'] },
    { name:'Gratitude & joy', text:'gratitude thankful thankfulness joy rejoice good day blessings contentment', refs:['1 Thessalonians 5:18','Psalms 118:24','Colossians 3:17'] }
  ];

  let bible = null;
  let embedder = null;
  let themeVectors = null;
  let loading = null;
  let activeModel = null;

  const esc = (value='') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function installUI() {
    if (document.querySelector('#scriptureAiFinder')) return;
    const anchor = document.querySelector('.info-strip');
    if (!anchor) return;
    const section = document.createElement('section');
    section.id = 'scriptureAiFinder';
    section.className = 'scripture-ai';
    section.innerHTML = `
      <div class="scripture-ai-heading"><div><p class="eyebrow dark">Grounded Hugging Face AI</p><h2>Find Scripture for what you’re facing.</h2></div><span>KJV text only</span></div>
      <div class="scripture-ai-card">
        <p>Describe what is on your mind. AI matches the topic, then Scripture Clock pulls the actual words from the KJV source. AI never writes the verse.</p>
        <div class="scripture-ai-row"><textarea id="scriptureAiQuestion" rows="3" maxlength="320" placeholder="Examples: I am worried about tomorrow • I need patience with my family • Help me find Scripture about working hard"></textarea><button id="scriptureAiAsk" type="button">Find verses</button></div>
        <div id="scriptureAiStatus" class="scripture-ai-status" role="status">The AI model loads only when you ask.</div>
        <div id="scriptureAiAnswer" class="scripture-ai-answer" hidden></div>
      </div>`;
    anchor.insertAdjacentElement('afterend', section);
    document.querySelector('#scriptureAiAsk')?.addEventListener('click', runFinder);
  }

  async function loadFullBible() {
    if (bible) return bible;
    const urls = (typeof SOURCES !== 'undefined' && Array.isArray(SOURCES)) ? SOURCES : [
      'https://cdn.jsdelivr.net/gh/farskipper/kjv@master/json/verses-1769.json',
      'https://raw.githubusercontent.com/farskipper/kjv/master/json/verses-1769.json'
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, { cache:'force-cache' });
        if (!response.ok) throw new Error(`KJV source ${response.status}`);
        const data = await response.json();
        if (Object.keys(data).length < 10000) throw new Error('Incomplete KJV data');
        bible = data;
        return bible;
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('KJV source unavailable');
  }

  function verseFromBible(reference) {
    if (!bible) return null;
    const variants = [reference];
    if (reference.startsWith('Psalms ')) variants.push(reference.replace(/^Psalms /, 'Psalm '));
    if (reference.startsWith('Psalm ')) variants.push(reference.replace(/^Psalm /, 'Psalms '));
    for (const ref of variants) {
      if (bible[ref]) return { reference:ref, text:String(bible[ref]).replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim() };
    }
    const lower = reference.toLowerCase();
    const match = Object.keys(bible).find(key => key.toLowerCase() === lower || key.toLowerCase() === lower.replace(/^psalms /,'psalm ') || key.toLowerCase() === lower.replace(/^psalm /,'psalms '));
    return match ? { reference:match, text:String(bible[match]).replace(/[\[\]]/g,'').replace(/\s+/g,' ').trim() } : null;
  }

  async function ensureEmbedder(status) {
    if (embedder && themeVectors) return embedder;
    if (loading) return loading;
    loading = (async () => {
      status.textContent = 'Loading lightweight Hugging Face topic matcher…';
      const { pipeline, env } = await import(HF_IMPORT);
      if (env) {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
      }
      let lastError = null;
      for (const model of MODEL_CANDIDATES) {
        try {
          const pipe = await pipeline('feature-extraction', model, { dtype:'q8' });
          const output = await pipe(THEMES.map(t => `${t.name}. ${t.text}`), { pooling:'mean', normalize:true });
          embedder = pipe;
          themeVectors = output.tolist();
          activeModel = model;
          return pipe;
        } catch (error) {
          lastError = error;
          embedder = null;
          themeVectors = null;
        }
      }
      throw lastError || new Error('AI topic model unavailable');
    })().finally(() => { loading = null; });
    return loading;
  }

  function dot(a,b){ let total=0; for(let i=0;i<Math.min(a.length,b.length);i++) total+=a[i]*b[i]; return total; }

  async function semanticThemes(query, status) {
    const pipe = await ensureEmbedder(status);
    const q = await pipe(query, { pooling:'mean', normalize:true });
    const vector = q.tolist()[0];
    return THEMES.map((theme,i)=>({theme,score:dot(vector,themeVectors[i])})).sort((a,b)=>b.score-a.score);
  }

  function lexicalThemes(query) {
    const terms=query.toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2);
    return THEMES.map(theme=>{
      const hay=`${theme.name} ${theme.text}`.toLowerCase();
      const score=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0)/Math.max(1,terms.length);
      return {theme,score};
    }).sort((a,b)=>b.score-a.score);
  }

  function renderMatches(query, ranked, mode) {
    const selected = ranked.slice(0,2);
    const refs = [...new Set(selected.flatMap(x => x.theme.refs))].slice(0,5);
    const verses = refs.map(verseFromBible).filter(Boolean).slice(0,4);
    if (!verses.length) return `<p>The KJV source loaded, but those reference keys could not be resolved. Try again after refreshing.</p>`;
    return `
      <div class="scripture-ai-theme"><strong>${esc(selected[0].theme.name)}</strong><span>${esc(mode)}</span></div>
      <p class="scripture-ai-intent">For “${esc(query)}”, these are exact KJV readings selected from the matched themes.</p>
      ${verses.map(v=>`<article><h3>${esc(v.reference)}</h3><blockquote>${esc(v.text)}</blockquote><button type="button" data-copy-verse="${esc(v.reference)}">Copy verse</button></article>`).join('')}
      <small>AI chose the theme/reference only. Every quoted word above came from the same KJV data source used by Scripture Clock.</small>`;
  }

  async function runFinder() {
    const question=String(document.querySelector('#scriptureAiQuestion')?.value||'').trim();
    const status=document.querySelector('#scriptureAiStatus');
    const answer=document.querySelector('#scriptureAiAnswer');
    const button=document.querySelector('#scriptureAiAsk');
    if(question.length<3){status.textContent='Tell me what you want Scripture about first.';return;}
    button.disabled=true; answer.hidden=true;
    let ranked; let mode='AI semantic match';
    try {
      await loadFullBible();
      ranked=await semanticThemes(question,status);
      status.textContent=`AI ready • ${activeModel} • exact KJV text`;
    } catch(error) {
      console.warn('Scripture AI fallback',error);
      try { await loadFullBible(); } catch {}
      ranked=lexicalThemes(question); mode='Offline topic fallback';
      status.textContent=bible?'Hugging Face AI could not load, so Scripture Clock used its built-in topic matcher with exact KJV text.':'The KJV source is unavailable right now. Connect and try again.';
    } finally { button.disabled=false; }
    if(!bible) return;
    answer.innerHTML=renderMatches(question,ranked,mode); answer.hidden=false;
    answer.querySelectorAll('[data-copy-verse]').forEach(btn=>btn.addEventListener('click',async()=>{
      const verse=verseFromBible(btn.dataset.copyVerse); if(!verse)return;
      try { await navigator.clipboard.writeText(`${verse.reference} — ${verse.text} (KJV)`); status.textContent='Verse copied.'; } catch {}
    }));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installUI,{once:true}); else installUI();
})();
