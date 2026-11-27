<script lang="ts">
  import { base } from '$app/paths';
</script>
<svelte:head>
  <title>개인정보 처리방침 초안 | 혜택찾기</title>
  <meta name="description" content="혜택찾기 개인화 정보 처리 및 저장에 관한 안내"/>
  <meta name="robots" content="index, follow"/>
  <link rel="canonical" href="https://dailyfoodfighter.com/benefits/privacy/"/>
  <meta property="og:type" content="website"/>
  <meta property="og:locale" content="ko_KR"/>
  <meta property="og:site_name" content="쓸모있는 모음.zip"/>
  <meta property="og:url" content="https://dailyfoodfighter.com/benefits/privacy/"/>
  <meta property="og:title" content="혜택찾기 개인정보 처리 안내 | 쓸모있는 모음.zip"/>
  <meta property="og:description" content="혜택찾기에서 조건 설정 값이 어떻게 저장되고 처리되는지 안내합니다."/>
  <meta property="og:image" content="https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="혜택찾기 개인정보 처리 안내 | 쓸모있는 모음.zip"/>
  <meta name="twitter:description" content="혜택찾기에서 조건 설정 값이 어떻게 저장되고 처리되는지 안내합니다."/>
  <meta name="twitter:image" content="https://dailyfoodfighter.com/benefits/og-benefits-20261119.jpg"/>
</svelte:head>
<div class="legal-page">
  <header class="legal-header"><div class="container"><a href={base + '/'} class="site-brand"><span class="brand-mark">✳</span><span>혜택찾기<span class="brand-dot">.</span></span></a><a class="legal-back" href={base + '/'}>← 홈으로 돌아가기</a></div></header>
  <main class="container legal-main">
    <div class="legal-paper">
      <span class="legal-draft">출시 전 검토용 초안</span>
      <h1>개인정보 처리방침</h1>
      <p class="legal-sub">작성일: 2026년 11월 19일 · 시행일: 미정</p>
      <p class="legal-emphasis"><strong>이 문서는 확정된 운영 개인정보 처리방침이 아닙니다.</strong> 서비스 개시 전 운영자·문의처, Cloudflare·호스팅 로그, 보존 기간, 위탁·국외 처리 사실을 검증해 정식 방침으로 교체해야 합니다.</p>
      <h2>1. 맞춤 조건의 처리</h2>
      <p>브라우저에서 입력한 지역, 출생연도, 가구원 수, 자녀 수 및 자녀 출생연도, 임신·출산 예정 여부, 혼인 상태, 주거 형태, 취업 상태, 중위소득 비율, 사업 시작일과 매출 등의 맞춤 조건은 사용자 브라우저의 로컬 저장소에 보관됩니다. 현재 구현에서는 이 맞춤 조건을 공고 수집기·Ollama·데이터베이스에 전송하지 않습니다. 서버에서는 개인 조건이 아닌 공고 검색어와 공개 분류 필터만 사용합니다.</p>
      <h2>2. 저장 정보의 삭제</h2>
      <p>이용자는 내 조건 설정 화면에서 저장된 프로필과 관심 혜택 목록을 삭제할 수 있습니다. 브라우저 사이트 데이터 삭제로도 제거할 수 있으며 계정 동기화는 제공되지 않습니다.</p>
      <h2>3. 외부 링크 및 데이터 출처</h2>
      <p>지원사업 확인 버튼은 공식 기관의 별도 웹사이트로 이동합니다. 해당 사이트의 개인정보 처리방침은 해당 기관이 운영합니다. 조회 결과는 신청·수급 자격이나 대출 승인을 보장하지 않습니다.</p>
      <h2>4. 제3자 처리 및 운영 환경</h2>
      <p>개인화 프로필을 정책 공고 수집 모델로 보내지 않는 설계입니다. 다만 방문 접속 로그, 호스팅 공급자의 데이터 처리 범위와 국외 전송·위탁 여부는 실제 배포 환경을 기준으로 확정해야 합니다.</p>
      <h2>5. 이용자 권리 및 문의</h2>
      <p>이용자는 이 기기의 프로필과 북마크를 삭제할 수 있습니다. 운영자 문의처와 담당자 정보는 출시 전 확정 후 공개합니다.</p>
      <div class="legal-bottom"><a class="primary-cta" href={base + '/'}>혜택찾기로 돌아가기 →</a></div>
    </div>
  </main>
</div>
<style>
  .legal-page{min-height:100vh;background:#f5f7f3}.legal-header{background:white;border-bottom:1px solid #e0e9df}.legal-header .container{height:80px;display:flex;align-items:center;justify-content:space-between;gap:16px}.legal-back{color:#417352;font-size:13px;font-weight:800}.legal-main{padding-top:60px;padding-bottom:80px}.legal-paper{background:white;border:1px solid #e1e8de;border-radius:19px;max-width:850px;margin:auto;padding:50px 55px;color:#405344;line-height:1.9;font-size:14px}.legal-draft{display:inline-block;border-radius:6px;background:#fff2df;color:#94662b;padding:5px 10px;font-size:11px;font-weight:900}.legal-paper h1{font-size:32px;letter-spacing:-1px;color:#253f2e}.legal-paper h2{font-size:20px;margin:30px 0 8px;color:#274632}.legal-sub{color:#8b9a8e;font-size:12px}.legal-emphasis{background:#f1f7f0;padding:18px;border-radius:12px}.legal-bottom{border-top:1px solid #e4e9e2;padding-top:30px;margin-top:35px}.primary-cta{display:inline-flex;text-decoration:none}@media(max-width:620px){.legal-header .container{height:64px}.legal-main{padding-top:20px;padding-bottom:40px}.legal-paper{padding:26px 20px}.legal-paper h1{font-size:26px}.legal-paper h2{font-size:17px}}
</style>
