(() => {
  const byId = id => document.getElementById(id);
  const filters = [
    "program", "origin", "destination",
    "month", "cabin", "sort"
  ];

  const PAGE_SIZE = 20;
  let currentPage = 1;

  const toolbar = document.createElement("div");
  toolbar.className = "enhanced-toolbar";

  const reset = document.createElement("button");
  reset.className = "secondary-button";
  reset.textContent = "검색 조건 초기화";

  const share = document.createElement("button");
  share.className = "secondary-button";
  share.textContent = "검색 링크 복사";

  toolbar.append(reset, share);
  byId("search").after(toolbar);

  const pagination = document.createElement("div");
  pagination.id = "pagination";
  byId("results").after(pagination);

  function showPage(page) {
    const cards = [...document.querySelectorAll(".flight")];
    const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));

    currentPage = Math.max(1, Math.min(page, pages));

    cards.forEach((card, index) => {
      card.hidden = index < (currentPage - 1) * PAGE_SIZE ||
        index >= currentPage * PAGE_SIZE;
    });

    pagination.replaceChildren();

    if (pages <= 1) return;

    const prev = document.createElement("button");
    prev.textContent = "이전";
    prev.disabled = currentPage === 1;

    const label = document.createElement("span");
    label.textContent = `${currentPage} / ${pages} 페이지`;

    const next = document.createElement("button");
    next.textContent = "다음";
    next.disabled = currentPage === pages;

    prev.onclick = () => {
      showPage(currentPage - 1);
      byId("count").scrollIntoView({block:"start"});
    };

    next.onclick = () => {
      showPage(currentPage + 1);
      byId("count").scrollIntoView({block:"start"});
    };

    pagination.append(prev, label, next);
  }

  function saveFilters() {
    const url = new URL(location.href);

    filters.forEach(id => {
      const value = byId(id).value;

      if (value) url.searchParams.set(id, value);
      else url.searchParams.delete(id);
    });

    history.replaceState(null, "", url);
  }

  function refresh() {
    saveFilters();
    byId("search").click();
  }

  reset.onclick = () => {
    filters.forEach(id => {
      byId(id).selectedIndex = 0;
    });
    refresh();
  };

  share.onclick = async () => {
    saveFilters();
    try {
      await navigator.clipboard.writeText(location.href);
      share.textContent = "복사 완료";
    } catch {
      share.textContent = "주소창 링크를 복사하세요";
    }
    setTimeout(() => {
      share.textContent = "검색 링크 복사";
    }, 2500);
  };

  const observer = new MutationObserver(() => {
    showPage(1);
  });

  observer.observe(byId("results"), {
    childList: true
  });

  const ready = setInterval(() => {
    if (
      byId("origin").options.length < 2 ||
      byId("month").options.length < 2
    ) return;

    clearInterval(ready);

    const params = new URLSearchParams(location.search);

    filters.forEach(id => {
      const value = params.get(id);

      if ([...byId(id).options].some(o => o.value === value)) {
        byId(id).value = value;
      }

      byId(id).addEventListener("change", refresh);
    });

    refresh();
  }, 100);

  setTimeout(() => clearInterval(ready), 15000);
})();
