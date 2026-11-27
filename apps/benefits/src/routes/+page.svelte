<script lang="ts">
  import { browseEligibility, matchesProgramTopic, type BrowseProgram } from '../lib/browse-selection';
  import { approvedNationalRepresentative, nationalBaseKey, preferNationalRepresentatives } from '../lib/national-titles';
  import nationalCatalog from '../lib/national-catalog.json';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { ArrowRight, ArrowUpRight, Baby, BriefcaseBusiness, Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Heart, HeartHandshake, House, Leaf, MapPin, Menu, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users, Wallet, X, Bookmark, RefreshCw, Trash2 } from 'lucide-svelte';
  import { matchProgram, relevanceScore, type Profile } from '../lib/matching';
  import { classifyRegion, regionAreas, regionFit, selectableDistricts } from '../lib/territory';
  import { displayRegion, type RegionDisplayMode } from '../lib/region-visibility';
  import { loadProfile, saveProfile, deleteLocalPersonalization, BOOKMARK_KEY } from '../lib/profile';
  import { scanPage, type ProgramBatch, type ScanPosition } from '../lib/page-scan';

  type Benefit = BrowseProgram & {
    source?: string; summary?: string; support_amount?: string; amount_type?: string;
    apply_url: string; last_verified_at?: string;
  };
  const nationalBenefits=nationalCatalog as unknown as Benefit[];
  type Topic = 'all'|'birth'|'youth'|'housing'|'living'|'health'|'business';
  const topics: {id:Topic; name:string; caption:string; icon:typeof Heart}[] = [
    {id:'birth',name:'임신·출산·육아',caption:'가족과 아이를 위한 혜택',icon:Baby},
    {id:'youth',name:'청년·취업',caption:'취업부터 자산형성까지',icon:Sparkles},
    {id:'housing',name:'주거·생활',caption:'월세와 주거비 지원',icon:House},
    {id:'living',name:'생활·긴급지원',caption:'생계와 일상 지원',icon:Wallet},
    {id:'health',name:'건강·돌봄',caption:'의료·장애·어르신',icon:HeartHandshake},
    {id:'business',name:'창업·정책자금',caption:'소상공인과 기업 지원',icon:BriefcaseBusiness}
  ];
  const regions=['서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시','세종특별자치시','경기도','강원특별자치도','충청북도','충청남도','전북특별자치도','전라남도','경상북도','경상남도','제주특별자치도'];

  let profile: Profile={};
  let items:Benefit[]=[];
  let bookmarks:string[]=[];
  let savedItems:Benefit[]=[];
  const SAVED_ITEMS_KEY='policy-benefit-bookmark-cards-v1';
  let tab: 'all'|'FUND'|'WELFARE'|'saved'='all';
  let topic:Topic='all';
  let query='';
  let searchDraft='';
  let loading=true;
  let error='';
  let apiBase='';
  let offset=0;
  let hasMore=false;
  const startPosition:ScanPosition<Benefit>={pending:[],cursor:''};
  let pagePositions=[startPosition];
  let requestVersion=0;
  let activeRequest:AbortController|undefined;
  let pageCache=new Map<number,{items:Benefit[];hasMore:boolean;scanLimitReached:boolean}>();
  let retryPage=0;
  let profileOpen=false;
  let mobileMenu=false;
  let notice='';
  let ready=false;
  // No published deadline is NOT proof of closure. Keep such notices visible by default.
  let showUnverified=true;
  let personalFirst=true;
  let regionMode:RegionDisplayMode='mine';
  let scanLimitReached=false;
  let subtopic='all';
  const facets: {id:string; label:string}[] = [
    {id:'pregnancy',label:'임신·난임'},
    {id:'childbirth',label:'출산·신생아'},
    {id:'childcare',label:'영유아·돌봄'},
    {id:'multichild',label:'다자녀·가족'},
    {id:'young',label:'청년·취업'},
    {id:'student',label:'학생·장학금'},
    {id:'rent',label:'월세·임대'},
    {id:'jeonse',label:'전세·보증금'},
    {id:'living',label:'생계·긴급'},
    {id:'health',label:'의료·건강'},
    {id:'senior',label:'노인·돌봄'},
    {id:'startup',label:'예비창업·창업'},
    {id:'smallbiz',label:'소상공인·자영업'},
    {id:'company',label:'중소기업·수출'}
  ];

  function pastDeadline(p: Benefit):boolean {
    if(p.end_date && /^\d{4}-\d{2}-\d{2}$/.test(p.end_date)) {
      const kstToday=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
      return p.end_date<kstToday;
    }
    return false;
  }
  function applicationPeriodLabel(p: Benefit):string {
    const today=new Date(Date.now()+9*60*60*1000).toISOString().slice(0,10);
    if(p.start_date && p.start_date>today) return '접수 예정 · 시작일 '+p.start_date;
    if(p.application_type==='ROLLING') return '공고상 상시 신청';
    if(p.start_date && p.end_date) return '접수기간 '+p.start_date+' ~ '+p.end_date;
    return '신청기간 확인 필요 · 공식 안내 확인';
  }
  onMount(()=>{
    profile=loadProfile();
    // Profiles saved before the city/county dropdown could contain arbitrary
    // or obsolete text. Do not let it silently exclude valid benefits.
    if(profile.regionSigungu && !selectableDistricts(profile.regionSido).includes(profile.regionSigungu)){
      profile={...profile,regionSigungu:undefined};
      notice='기존 시·군·구 입력을 최신 선택 항목에서 확인하지 못해 미선택 처리했습니다. 내 조건을 다시 확인해 주세요.';
    }
    try {bookmarks=JSON.parse(localStorage.getItem(BOOKMARK_KEY)||'[]');if(!Array.isArray(bookmarks))bookmarks=[];} catch {bookmarks=[];}
    try {
      const parsed=JSON.parse(localStorage.getItem(SAVED_ITEMS_KEY)||'[]');
      savedItems=Array.isArray(parsed)?parsed.filter((p:Benefit)=>p && bookmarks.includes(p.id) && typeof p.title==='string' && typeof p.apply_url==='string' && !pastDeadline(p)):[];
    } catch {savedItems=[];}
    apiBase=(import.meta.env.VITE_PUBLIC_API_BASE_URL||base).replace(/\/$/,'');
    ready=true;
    void loadResults();
  });
  async function loadResults(page=0,reset=page===0) {
    const version=++requestVersion;
    activeRequest?.abort();
    const controller=new AbortController();
    activeRequest=controller;
    loading=true;error='';scanLimitReached=false;
    if(reset){pagePositions=[startPosition];pageCache=new Map();offset=0;items=[];hasMore=false;}
    if(tab==='saved'){loading=false;return;}
    if(pageCache.has(page)){
      const cached=pageCache.get(page)!;
      items=cached.items;hasMore=cached.hasMore;scanLimitReached=cached.scanLimitReached;
      offset=page;loading=false;return;
    }
    try {
      const start=pagePositions[page];
      if(start===undefined)throw new Error('Unknown cursor');
      const urlBase=new URL(apiBase+'/api/programs',window.location.origin);
      if(tab==='FUND'||tab==='WELFARE')urlBase.searchParams.set('category',tab);
      if(query.trim())urlBase.searchParams.set('q',query.trim());
      if(topic!=='all')urlBase.searchParams.set('topic',topic);
      if(subtopic!=='all')urlBase.searchParams.set('subtopic',subtopic);
      urlBase.searchParams.set('availability',showUnverified?'review':'open');
      const pageSize=50, maxRows=1000;
      const eligible=(p:Benefit)=>browseEligibility(p,{topic,subtopic,profile,regionMode,personalFirst});
      const fetchBatch=async (cursor:string,limit:number,national=false):Promise<ProgramBatch<Benefit>>=>{
        const url=new URL(urlBase);
        url.searchParams.set('limit',String(limit));
        if(!national)url.searchParams.set('cursor',cursor);
        if(national){
          url.searchParams.delete('topic');
          url.searchParams.delete('subtopic');
          url.searchParams.set('collection','national');
        }
        const response=await fetch(url.toString(),{signal:controller.signal});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const data=await response.json();
        if(!Array.isArray(data.items)||data.items.length>limit)throw new Error('Invalid data');
        if(!national && data.nextCursor!==null && typeof data.nextCursor!=='string')
          throw new Error('Missing pagination metadata');
        return {items:data.items as Benefit[],nextCursor:national?null:data.nextCursor};
      };
      // Bundled, officially sourced nationwide baseline: no D1 lookup needed.
      // Local government's copy never substitutes for a missing official entry.
      const search=query.trim().toLowerCase();
      const priorityItems:Benefit[]=page===0?nationalBenefits.filter(p=>
        p.verification_status==='VERIFIED' &&
        (tab!=='FUND'&&tab!=='saved') &&
        (showUnverified||p.application_type==='ROLLING') &&
        (!search||[p.title,p.agency,p.summary].some(value=>value?.toLowerCase().includes(search))) &&
        (topic==='all'||topic===p.topic) &&
        (subtopic==='all'||matchesProgramTopic(p,topic,subtopic)) &&
        eligible(p)
      ):[];
      if(page===0){items=priorityItems;}
      const priorIds=new Set<string>();
      const priorNationalKeys=new Set<string>();
      for(let previous=0;previous<page;previous++)
        for(const item of pageCache.get(previous)?.items||[]){
          priorIds.add(item.id);
          const key=approvedNationalRepresentative(item)?nationalBaseKey(item.title):null;
          if(key)priorNationalKeys.add(key);
        }
      const acceptOnce=preferNationalRepresentatives(eligible,priorNationalKeys);
      const result=await scanPage({
        start,pageSize,maxRows,
        fetchBatch,
        accept:acceptOnce,
        initialItems:priorityItems,
        excludedIds:priorIds,
        onProgress:page===0?(partial)=>{if(version===requestVersion)items=partial;}:undefined
      });
      if(version!==requestVersion)return;
      items=result.items;
      offset=page;
      hasMore=result.hasMore;
      scanLimitReached=result.rowsScanned>=maxRows&&result.hasMore;
      pagePositions[page+1]=result.position;
      pageCache.set(page,{items,hasMore,scanLimitReached});
    }catch{
      if(version!==requestVersion)return;
      retryPage=page;
      if(page===0)hasMore=false;
      error='공고 정보를 조회하지 못했습니다. 잠시 후 다시 시도해주세요.';
    }finally{if(version===requestVersion)loading=false;}
  }
  function scrollToResults() {
    if (typeof document !== 'undefined') {
      document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  function chooseTab(next:typeof tab){
    tab=next;
    topic='all';
    subtopic='all';
    mobileMenu=false;
    void loadResults(0);
    scrollToResults();
  }
  function chooseTopic(next:Topic){
    topic=topic===next?'all':next;
    if(tab==='saved')tab='all';
    subtopic='all';
    if(topic==='business')tab='FUND';
    else if(tab==='FUND')tab='WELFARE';
    void loadResults(0);
  }
  function changeAvailability(){showUnverified=!showUnverified;void loadResults(0);}
  function chooseRegionMode(mode:RegionDisplayMode){regionMode=mode;void loadResults(0);}
  function submitSearch() {
    query=searchDraft.trim();topic='all';subtopic='all';if(tab==='saved')tab='all';void loadResults(0);
    document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function store(){saveProfile(profile);notice='이 브라우저에 맞춤 조건을 저장했습니다.';profile={...profile};regionMode='mine';void loadResults(0);}
  function clearProfile(){deleteLocalPersonalization();localStorage.removeItem(SAVED_ITEMS_KEY);savedItems=[];profile={};bookmarks=[];notice='저장된 맞춤 조건과 관심 혜택을 삭제했습니다.';void loadResults(0);}
  function toggleBookmark(item:Benefit){
    const id=item.id;
    if(bookmarks.includes(id)){
      bookmarks=bookmarks.filter(k=>k!==id);
      savedItems=savedItems.filter(p=>p.id!==id);
    }else{
      bookmarks=[...bookmarks,id];
      savedItems=[...savedItems.filter(p=>p.id!==id),item];
    }
    localStorage.setItem(BOOKMARK_KEY,JSON.stringify(bookmarks));
    localStorage.setItem(SAVED_ITEMS_KEY,JSON.stringify(savedItems));
  }
  $: filtered=(tab==='saved'?savedItems:items).filter(p=>!pastDeadline(p)).filter(p=>matchesProgramTopic(p,topic,subtopic))
    .filter(p=>displayRegion(p,profile,regionMode))
    .filter(p=>!personalFirst || matchProgram(p,profile,undefined,{compareAllRegions:regionMode==='all'}).status!=='NO')
    .sort((a,b)=>{
      const rank=(p:Benefit)=>regionFit(p,profile)==='UNKNOWN'?1:0;
      return rank(a)-rank(b)||(personalFirst?relevanceScore(b,profile)-relevanceScore(a,profile):0);
    });
  $: visibleCount=filtered.length;
</script>

<svelte:head>
  <title>혜택찾기 | 정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색</title>
  <meta name="description" content="출산·육아, 청년·취업, 주거·생활, 건강·돌봄, 창업·소상공인 정책자금까지 정부지원금과 복지 혜택을 내 조건에 맞춰 찾아보세요. 정부24·기업마당 공식 공고 기반, 회원가입·로그인 없이 검색할 수 있습니다."/>
  <meta name="robots" content="index, follow, max-image-preview:large"/>
  <link rel="canonical" href="https://dailyfoodfighter.com/benefits/"/>
  <meta property="og:type" content="website"/>
  <meta property="og:locale" content="ko_KR"/>
  <meta property="og:site_name" content="혜택찾기"/>
  <meta property="og:url" content="https://dailyfoodfighter.com/benefits/"/>
  <meta property="og:title" content="혜택찾기 | 정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색"/>
  <meta property="og:description" content="출산·육아, 청년·취업, 주거·생활, 건강·돌봄, 창업·소상공인 정책자금까지. 내 조건에 맞는 정부지원금과 복지 혜택을 로그인 없이 찾아보세요."/>
  <meta property="og:image" content="https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg"/>
  <meta property="og:image:secure_url" content="https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg"/>
  <meta property="og:image:type" content="image/jpeg"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:image:alt" content="혜택찾기 — 내 삶에 필요한 지원을 한눈에. 출산·육아, 청년·취업, 주거·생활, 건강·돌봄, 창업·정책자금"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="혜택찾기 | 정부지원금·청년·주거·출산육아·창업 정책자금 맞춤 검색"/>
  <meta name="twitter:description" content="출산·육아, 청년·취업, 주거·생활, 건강·돌봄, 창업·소상공인 정책자금까지. 내 조건에 맞는 정부지원금과 복지 혜택을 로그인 없이 찾아보세요."/>
  <meta name="twitter:image" content="https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg"/>
</svelte:head>

<div class="site-shell">
  <div class="utility-bar"><div class="container utility-inner"><ShieldCheck size={13}/> 공식 공공데이터 기반 정보 탐색 서비스 <span>정부 운영 사이트가 아닙니다</span></div></div>
  <header class="site-header">
    <div class="container header-inner">
      <a class="site-brand" href={base + '/'} aria-label="혜택찾기 홈"><span class="brand-mark"><Leaf size={23} strokeWidth={2.5}/></span><span>혜택찾기<span class="brand-dot">.</span></span></a>
      <nav class="desktop-nav" aria-label="주 메뉴">
        <button class:current={tab==='all'} onclick={()=>chooseTab('all')}>전체 혜택</button>
        <button class:current={tab==='WELFARE'} onclick={()=>chooseTab('WELFARE')}>생활·복지</button>
        <button class:current={tab==='FUND'} onclick={()=>chooseTab('FUND')}>창업·정책자금</button>
        <button class:current={tab==='saved'} onclick={()=>chooseTab('saved')}>관심 혜택 {#if bookmarks.length}<span class="nav-count">{bookmarks.length}</span>{/if}</button>
      </nav>
      <div class="header-actions"><button class="quiet-btn" onclick={()=>profileOpen=true}><SlidersHorizontal size={17}/> 내 조건 설정</button><button class="mobile-toggle" aria-label="메뉴 열기" aria-expanded={mobileMenu} onclick={()=>mobileMenu=!mobileMenu}>{#if mobileMenu}<X size={23}/>{:else}<Menu size={23}/>{/if}</button></div>
    </div>
    {#if mobileMenu}
      <nav class="mobile-nav" aria-label="모바일 메뉴">
        <button onclick={()=>chooseTab('all')}>전체 혜택</button><button onclick={()=>chooseTab('WELFARE')}>생활·복지</button><button onclick={()=>chooseTab('FUND')}>창업·정책자금</button><button onclick={()=>chooseTab('saved')}>관심 혜택</button>
      </nav>
    {/if}
  </header>

  <main>
    <section class="hero-section">
      <div class="container hero-layout">
        <div class="hero-content">
          <span class="hero-kicker"><Sparkles size={15}/> MY BENEFIT FINDER</span>
          <h1>몰라서 놓치는 혜택,<br/><em>이제는 찾지 말고 발견하세요.</em></h1>
          <p>출산·육아부터 청년, 주거, 사업자 지원까지.<br/>흩어진 공공서비스를 하나의 검색으로 살펴보세요.</p>
          <form class="hero-search" onsubmit={(e)=>{e.preventDefault();submitSearch();}}>
            <Search size={21} color="#647768"/>
            <input aria-label="지원사업 검색" bind:value={searchDraft} placeholder="어떤 혜택이 궁금하세요? 예: 월세, 출산, 창업"/>
            <button type="submit">혜택 찾기 <ArrowRight size={16}/></button>
          </form>
          <div class="hero-highlights"><span><Check size={15}/> 회원가입 없이 검색</span><span><Check size={15}/> 공식 신청 경로 안내</span><span><Check size={15}/> 내 조건은 기기에 보관</span></div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="art-main"><span class="art-small">BETTER EVERY DAY</span><span class="art-symbol"><Heart size={45} fill="currentColor"/></span><strong>내 삶에 딱 맞는<br/>지원 혜택</strong><span class="art-deco">✳ ✦ ✳</span></div>
          <div class="float-card float-top"><span class="float-icon purple"><Baby size={19}/></span><span>출산·육아<small>가족 지원</small></span><Check size={16} color="#2a8266"/></div>
          <div class="float-card float-bottom"><span class="float-icon amber"><House size={19}/></span><span>주거 지원<small>생활비 부담 덜기</small></span><ArrowUpRight size={17} color="#2a8266"/></div>
          <span class="sparkle star-a">✳</span><span class="sparkle star-b">✦</span>
        </div>
      </div>
    </section>

    <section class="container categories" aria-labelledby="categories-title">
      <div class="section-heading"><div><span class="overline">EXPLORE BY LIFE</span><h2 id="categories-title">어떤 도움이 필요하세요?</h2><p>삶의 상황에 따라 지원 정보를 살펴보세요.</p></div><span class="section-note">6가지 생활 주제</span></div>
      <div class="category-grid">
        {#each topics as t (t.id)}
          <button class="category-card" class:selected={topic===t.id} onclick={()=>{chooseTopic(t.id);document.getElementById('results')?.scrollIntoView({behavior:'smooth'});}} aria-pressed={topic===t.id}>
            <span class="category-icon category-{t.id}"><t.icon size={24} strokeWidth={1.8}/></span><strong>{t.name}</strong><small>{t.caption}</small><ArrowUpRight size={17} class="category-arrow"/>
          </button>
        {/each}
      </div>
      <div class="trust-strip"><ShieldCheck size={20}/><strong>안심하고 이용하세요.</strong><span>주민등록번호·사업자등록번호 없이 탐색할 수 있으며, 실제 신청 자격은 공식 기관이 결정합니다.</span><button onclick={()=>profileOpen=true}>내 조건 입력 <ArrowRight size={15}/></button></div>
    </section>

    <section class="container discover" id="results" aria-labelledby="browse-title">
      <div class="section-heading"><div><span class="overline">FIND YOUR BENEFITS</span><h2 id="browse-title">지금 확인할 수 있는 지원 정보</h2><p>마감이 확인된 공고는 제외하고, 신청기간이 표시되지 않은 공고도 확인 대상으로 제공합니다. 신청 자격과 접수 상태는 공식 기관에서 최종 확인하세요.</p></div></div>
      <div class="results-layout">
        <aside class="filter-side">
          <div class="filter-panel">
            <div class="filter-title"><SlidersHorizontal size={19}/><strong>탐색 필터</strong></div>
            <span class="filter-label">지원 종류</span>
            <button class:chosen={tab==='all'} onclick={()=>chooseTab('all')}><span>전체</span>{#if tab==='all'}<Check size={16}/>{/if}</button>
            <button class:chosen={tab==='WELFARE'} onclick={()=>chooseTab('WELFARE')}><span>생활·복지혜택</span>{#if tab==='WELFARE'}<Check size={16}/>{/if}</button>
            <button class:chosen={tab==='FUND'} onclick={()=>chooseTab('FUND')}><span>창업·정책자금</span>{#if tab==='FUND'}<Check size={16}/>{/if}</button>
            <button class:chosen={tab==='saved'} onclick={()=>chooseTab('saved')}><span>관심 혜택</span>{#if tab==='saved'}<Check size={16}/>{/if}</button>
            <div class="filter-divider"></div>
            <span class="filter-label">세부 탐색 항목</span>
             <label class="filter-description" for="benefit-subtopic">세부 분야 선택</label>
             <select id="benefit-subtopic" value={subtopic} onchange={(event)=>{subtopic=event.currentTarget.value;void loadResults(0);}} aria-label="세부 혜택 분야">
               <option value="all">모든 세부 분야</option>
               {#each facets as facet}<option value={facet.id}>{facet.label}</option>{/each}
             </select>
             <div class="filter-divider"></div>
             <span class="filter-label">맞춤 조건</span>
            <p class="filter-description">{profile.regionSido||'지역 미설정'} · {profile.birthYear?profile.birthYear+'년생':'연령 미설정'} · {profile.childrenCount!=null?`자녀 ${profile.childrenCount}명`:'자녀 미설정'}</p>
            <button class="filter-edit" onclick={()=>profileOpen=true}>조건 설정하기 <ChevronRight size={16}/></button>
            {#if profile.regionSido}
              <div class="filter-divider"></div>
              <span class="filter-label">지역 판정</span>
              <button class:chosen={regionMode==='mine'} onclick={()=>chooseRegionMode('mine')}>내 지역·전국·지역 미확인 {#if regionMode==='mine'}<Check size={16}/>{/if}</button>
              <button class:chosen={regionMode==='unknown'} onclick={()=>chooseRegionMode('unknown')}>지역 확인 필요 {#if regionMode==='unknown'}<Check size={16}/>{/if}</button>
              <button class:chosen={regionMode==='all'} onclick={()=>chooseRegionMode('all')}>전체 지역 비교 {#if regionMode==='all'}<Check size={16}/>{/if}</button>
              <p class="filter-description">지원 지역을 확인하지 못한 공고도 결과에 함께 표시합니다. 다른 지역 전용 공고는 기본 검색에서 제외됩니다.</p>
            {/if}
            <div class="filter-divider"></div>
            <p class="filter-tip"><CircleHelp size={16}/> 선택한 주제는 공고 제목과 요약의 키워드로 분류합니다. 정확한 자격 요건은 공식 안내를 확인하세요.</p>
          </div>
        </aside>
        <div class="results-main">
          <div class="results-toolbar">
            <div><strong>{tab==='saved'?'관심 혜택':tab==='FUND'&&topic==='all'?'창업·정책자금':tab==='WELFARE'&&topic==='all'?'생활·복지':topic==='all'?'전체 혜택':topics.find(t=>t.id===topic)?.name}</strong><span class="results-count">{loading?'조회 중':visibleCount+'건 표시'}</span></div>
            <div class="availability-controls"><label><input type="checkbox" checked={showUnverified} onchange={changeAvailability}/> 신청기간 미표기·접수 예정 포함</label><label><input type="checkbox" bind:checked={personalFirst} onchange={()=>void loadResults(0)}/> 내 조건과 불일치 제외</label><button class="refresh-btn" onclick={()=>loadResults(0)} disabled={loading}><RefreshCw size={16}/> 새로고침</button></div>
          </div>
          {#if profile.regionSido}
            <p class="results-disclaimer"><MapPin size={16}/>{regionMode==='mine'?'내 지역·전국 및 지역 확인 필요 공고 표시 중':regionMode==='unknown'?'지역 확인 필요 공고만 표시 중':'모든 지역 비교 중'} · 실제 신청 자격은 공식 기관에서 확인하세요.</p>
          {/if}
          {#if scanLimitReached}
            <p class="results-disclaimer"><CircleHelp size={16}/> 이번 화면에서 공고 1,000건을 살펴봤습니다. 다음을 누르면 이후 공고를 계속 탐색합니다.</p>
          {/if}
          {#if topic!=='all'||query}
            <div class="active-filters">{#if topic!=='all'}<button onclick={()=>{topic='all';subtopic='all';void loadResults(0);}}>{topics.find(t=>t.id===topic)?.name} <X size={13}/></button>{/if}{#if query}<button onclick={()=>{query='';searchDraft='';void loadResults(0)}}>“{query}” <X size={13}/></button>{/if}</div>
          {/if}
          {#if loading&&items.length===0}
            <div class="results-empty" role="status"><RefreshCw class="spin" size={30}/><strong>혜택 정보를 불러오는 중입니다</strong><p>공식 데이터 목록을 확인하고 있습니다.</p></div>
          {:else if error&&items.length===0}
            <div class="results-empty" role="status"><span class="empty-emblem"><ClipboardList size={30}/></span><strong>공고 데이터 연결을 준비하고 있습니다</strong><p>{error}</p><button onclick={()=>loadResults(retryPage)}>다시 연결하기 <RefreshCw size={15}/></button></div>
          {:else if filtered.length===0}
            <div class="results-empty"><span class="empty-emblem"><Search size={30}/></span><strong>{hasMore?'이번 구간에 일치 공고가 없습니다':'조건에 맞는 항목이 없습니다'}</strong><p>{hasMore?'다음 페이지에서 이후 공고를 확인할 수 있습니다.':tab==='saved'?'저장된 관심 혜택이 없습니다. 공고 카드에서 북마크를 눌러 저장할 수 있습니다.':'검색어를 바꾸거나 다른 주제를 선택해 보세요.'}</p><button onclick={()=>{topic='all';subtopic='all';query='';searchDraft='';tab='all';void loadResults(0);}}>필터 초기화 <ArrowRight size={15}/></button></div>
          {:else}
            {#if loading}<p class="results-disclaimer" role="status"><RefreshCw class="spin" size={15}/> 현재 공고를 유지하면서 다음 결과를 불러오는 중입니다.</p>{/if}
            {#if error}<p class="results-disclaimer" role="alert">{error} <button onclick={()=>loadResults(retryPage)}>다시 시도</button></p>{/if}
            <div class="benefit-list">
              {#each filtered as p (p.id)}
                {@const match=matchProgram(p,profile)}
                {@const geo=classifyRegion(p)}
                {@const geoFit=regionFit(p,profile)}
                <article class="benefit-card">
                  <div class="benefit-top"><div class="benefit-badges"><span class="benefit-kind">{p.category==='FUND'?'정책자금·기업지원':'공공서비스·복지'}</span><span class="benefit-source">{p.source==='BIZINFO'?'기업마당':p.source==='GOV24'?'정부24':'공식 공고'}</span>{#if geoFit==='UNKNOWN'}<span class="benefit-source">지역 확인 필요</span>{:else if geoFit==='OTHER'}<span class="benefit-source">다른 지역</span>{/if}</div><button class:saved={bookmarks.includes(p.id)} class="bookmark-btn" aria-label={bookmarks.includes(p.id)?'관심 혜택에서 제거':'관심 혜택 저장'} aria-pressed={bookmarks.includes(p.id)} onclick={()=>toggleBookmark(p)}><Bookmark size={19} fill={bookmarks.includes(p.id)?'currentColor':'none'}/></button></div>
                  <h3>{p.title}</h3>
                  <p class="application-window">{applicationPeriodLabel(p)}</p>
                  <p class="benefit-summary">{p.summary||'현재 저장된 요약이 없습니다. 지원 대상과 신청 방법은 공식 안내를 확인하세요.'}</p>
                  <div class="benefit-meta"><span><MapPin size={14}/>{geo.scope==='NATIONAL'?'전국':geo.scope==='UNKNOWN'?'지원 지역 미확인':regionAreas(geo).map(x=>x.sigungu?x.sido+' '+x.sigungu:x.sido).join(' / ')}</span><span><Users size={14}/>{p.agency||'소관기관 확인 필요'}</span></div>
                  <p class="filter-description">{match.reasons[0]}</p>
                  <div class="benefit-bottom"><span class:maybe={match.status==='CHECK'} class:ineligible={match.status==='NO'} class="match-label">{match.status==='NO'?'입력 조건과 불일치':match.status==='CHECK'?'자격 추가 확인 필요':'입력 조건상 불일치 없음'}</span><a href={p.apply_url} target="_blank" rel="noopener noreferrer">공식 정보 확인 <ArrowUpRight size={16}/></a></div>
                </article>
              {/each}
            </div>

          {/if}
          {#if tab!=='saved'&&!loading}
            <div class="page-controls"><button disabled={offset===0} onclick={()=>loadResults(offset-1,false)}><ChevronLeft size={16}/> 이전</button><span>{offset+1}페이지 · 현재 {filtered.length}건</span><button disabled={!hasMore} onclick={()=>loadResults(offset+1)}>다음 <ChevronRight size={16}/></button></div>
          {/if}
          <p class="results-disclaimer"><ShieldCheck size={16}/> 본 서비스의 필터·매칭은 정보 탐색용이며, 신청 가능 여부나 지원금 수령을 보증하지 않습니다.</p>
        </div>
      </div>
    </section>

    <section class="container how-it-works">
      <div><span class="overline">HOW IT WORKS</span><h2>복잡한 혜택 찾기,<br/>세 단계면 충분해요.</h2></div>
      <div class="steps"><div><span>01</span><strong>관심 분야 선택</strong><p>생활 상황에 맞는 주제로 지원사업을 탐색합니다.</p></div><div><span>02</span><strong>선택적으로 조건 입력</strong><p>지역·연령 등을 내 기기에만 저장해 비교합니다.</p></div><div><span>03</span><strong>공식 공고에서 신청</strong><p>지원 조건과 신청 기간을 기관 원문에서 확인합니다.</p></div></div>
    </section>
  </main>

  <footer class="site-footer"><div class="container footer-inner"><div><a class="site-brand" href={base + '/'}><span class="brand-mark"><Leaf size={20}/></span><span>혜택찾기<span class="brand-dot">.</span></span></a><p>좋은 정보를 더 쉽게, 필요한 혜택을 더 가까이.</p></div><div class="footer-links"><a href={base + '/privacy/'}>개인정보 처리방침 (초안)</a><a href="#results">혜택 탐색</a><a href="/about/">사이트 소개</a><a href="/editorial-policy/">콘텐츠 작성 원칙</a><a href="/contact/">문의·오류 제보</a><a href="/privacy/">쓸모있는 모음.zip 개인정보처리방침</a><button onclick={()=>profileOpen=true}>내 정보 관리</button></div></div><div class="container footer-bottom">정부·공공기관 공식 운영 서비스가 아닙니다. 정보의 정확성과 최종 자격은 해당 기관의 최신 공고를 확인하세요. © 2026 혜택찾기</div></footer>
</div>

{#if profileOpen}
  <div class="dialog-overlay" role="presentation" onclick={(e)=>{if(e.target===e.currentTarget)profileOpen=false;}}>
    <div class="profile-dialog" role="dialog" aria-modal="true" aria-label="내 맞춤 조건" tabindex="-1">
      <div class="dialog-top"><div><span class="overline">PRIVATE PROFILE</span><h2>내 조건 설정</h2><p>이 정보는 브라우저에만 저장되며 서버로 전송하지 않습니다.</p></div><button class="dialog-close" aria-label="닫기" onclick={()=>profileOpen=false}><X size={22}/></button></div>
      <div class="profile-fields">
        <label>이용자 유형<select bind:value={profile.userType}><option value={undefined}>선택 안 함</option><option value="INDIVIDUAL">개인·가구</option><option value="PRE_STARTUP">예비창업자</option><option value="SMALL_BIZ">소상공인·자영업</option></select></label>
        <label>시·도<select bind:value={profile.regionSido} onchange={()=>{profile.regionSigungu=undefined;}}><option value={undefined}>선택 안 함</option>{#each regions as r}<option value={r}>{r}</option>{/each}</select></label>
        <label>시·군·구<select bind:value={profile.regionSigungu}><option value={undefined}>미선택 (시·도 기준)</option>{#each selectableDistricts(profile.regionSido) as district (district)}<option value={district}>{district}</option>{/each}</select></label>
        <label>출생연도<input type="number" min="1900" max="2026" bind:value={profile.birthYear} placeholder="예: 1995"/></label>
        <label>가구원 수<input type="number" min="1" max="20" bind:value={profile.householdSize} placeholder="예: 3"/></label>
        <label>자녀 수<input type="number" min="0" max="20" bind:value={profile.childrenCount} placeholder="예: 2"/></label>
        <label>자녀별 출생연도(쉼표로 구분)<input bind:value={profile.childBirthYears} maxlength="100" placeholder="예: 2020, 2024"/></label>
        <p class="filter-description">자녀 수와 출생연도를 일치시켜 입력하세요. 출생연도만으로 정확한 생후 개월 수가 필요한 혜택은 자동 확정하지 않습니다.</p>
        <label>임신·출산 예정<select bind:value={profile.expectingChild}><option value={undefined}>선택 안 함</option><option value={true}>해당</option><option value={false}>해당 없음</option></select></label>
        <label>혼인 상태<select bind:value={profile.maritalStatus}><option value={undefined}>선택 안 함</option><option value="SINGLE">미혼</option><option value="MARRIED">기혼</option><option value="OTHER">기타</option></select></label>
        <label>주거 형태<select bind:value={profile.housingType}><option value={undefined}>선택 안 함</option><option value="OWNER">자가</option><option value="MONTHLY_RENT">월세</option><option value="JEONSE">전세</option><option value="OTHER">기타</option></select></label>
        <label>취업·경제활동 상태<select bind:value={profile.employmentStatus}><option value={undefined}>선택 안 함</option><option value="EMPLOYED">재직 중</option><option value="JOB_SEEKER">구직 중</option><option value="SELF_EMPLOYED">자영업·사업 중</option><option value="STUDENT">학생</option><option value="OTHER">기타</option></select></label>
        <label>기준 중위소득 비율 (%)<input type="number" min="0" max="500" step="0.1" bind:value={profile.incomeBracket} placeholder="예: 100"/></label>
        <p class="filter-description">금액(원)이 아닌 기준 중위소득 대비 비율입니다. 연도별 기준·가구원 수·건강보험료 등은 공고 원문에서 확인하세요.</p>
        <label>사업 시작일<input type="date" bind:value={profile.businessStartDate}/></label>
        <label>연매출 (만원)<input type="number" min="0" bind:value={profile.annualRevenue} placeholder="예: 5000"/></label>
      </div>
      {#if notice}<p class="dialog-notice" role="status">{notice}</p>{/if}
      <div class="dialog-actions"><button class="danger-quiet" onclick={clearProfile}><Trash2 size={16}/> 이 기기의 정보 삭제</button><button class="primary-cta" onclick={()=>{store();profileOpen=false;}}>저장하고 적용 <Check size={16}/></button></div>
    </div>
  </div>
{/if}
