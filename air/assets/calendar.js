(() => {
  const $ = id => document.getElementById(id);
  const root = $("results");
  const bar = document.createElement("div");
  bar.className = "view-switch";
  bar.innerHTML = `
    <button type="button" id="list-view"
      aria-pressed="true">목록 보기</button>
    <button type="button" id="calendar-view"
      aria-pressed="false">달력 보기</button>
  `;

  $("count").parentElement.after(bar);

  const calendar = document.createElement("section");
  calendar.id = "award-calendar";
  calendar.hidden = true;
  root.before(calendar);

  let records = [];
  let loaded = false;
  let view = "list";
  let selectedMonth = "";
  let selectedDate = "";

  const airlineNames = {
    KE_SKYPASS: "대한항공",
    OZ_ASIANA_CLUB: "아시아나"
  };

  const cabinNames = {
    economy: "일반석",
    premium: "프리미엄석",
    business: "비즈니스석"
  };

  function node(tag, text, cls) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }

  function matchingRows() {
    return records.filter(r =>
      (!$("program").value ||
        r.program === $("program").value) &&
      (!$("origin").value ||
        r.origin === $("origin").value) &&
      (!$("destination").value ||
        r.destination === $("destination").value) &&
      (!$("cabin").value ||
        r.cabin === $("cabin").value)
    );
  }

  function renderCalendar() {
    calendar.replaceChildren();

    if (!loaded) {
      calendar.append(node("p", "데이터 불러오는 중 또는 미확인"));
      return;
    }

    const rows = matchingRows();
    const mode = window.AirAwardFilter.mode();

    const visibleRows = rows.filter(r =>
      window.AirAwardFilter.matches(r, mode)
    );
    const months = [...new Set(
      rows.map(r => r.departure_date.slice(0,7))
    )].sort();

    if (!months.length) {
      calendar.append(node("p", "수집된 테스트 기록이 없습니다."));
      return;
    }

    if ($("month").value) {
      selectedMonth = $("month").value;
    } else if (!months.includes(selectedMonth)) {
      selectedMonth = months[0];
    }

    const monthRows = rows.filter(r =>
      r.departure_date.startsWith(selectedMonth)
    );

    const heading = node("div", undefined, "calendar-heading");
    const prev = node("button", "‹");
    const next = node("button", "›");

    prev.setAttribute("aria-label", "이전 수집 월");
    next.setAttribute("aria-label", "다음 수집 월");

    const idx = months.indexOf(selectedMonth);
    prev.disabled = idx <= 0;
    next.disabled = idx < 0 || idx >= months.length - 1;

    function changeMonth(step) {
      selectedMonth = months[idx + step];
      selectedDate = "";
      $("month").value = selectedMonth;
      $("month").dispatchEvent(new Event("change"));
      renderCalendar();
    }

    prev.onclick = () => changeMonth(-1);
    next.onclick = () => changeMonth(1);

    const [year, month] = selectedMonth.split("-").map(Number);

    heading.append(
      prev,
      node("strong", `${year}년 ${month}월`),
      next
    );

    calendar.append(heading);

    const grid = node("div", undefined, "calendar-grid");

    for (const weekday of ["일","월","화","수","목","금","토"]) {
      grid.append(node("div", weekday, "calendar-weekday"));
    }

    const offset = new Date(year, month - 1, 1).getDay();
    const days = new Date(year, month, 0).getDate();

    for (let i=0; i<offset; i++) {
      grid.append(node("div"));
    }

    for (let day=1; day<=days; day++) {
      const date = `${selectedMonth}-${String(day).padStart(2,"0")}`;
      const dayRows = monthRows.filter(r =>
        r.departure_date === date
      );

      const available = dayRows.filter(r =>
        r.status === "available"
      );

      const filteredAvailable = available.filter(r =>
        window.AirAwardFilter.matches(r, mode)
      );

      const hasDiscount = filteredAvailable.some(r =>
        window.AirAwardFilter.discounted(r)
      );

      const hasNew = filteredAvailable.some(r =>
        r.newly_available === true
      );

      const unknown = !dayRows.length ||
        dayRows.some(r => r.status === "unknown");

      const state = filteredAvailable.length
        ? "available"
        : unknown ? "unknown"
        : mode !== "all" ? "filtered"
        : "unavailable";

      const labels = {
        available: "좌석 표시 있음",
        unknown: "미확인",
        unavailable: "좌석 표시 없음",
        filtered: "선택한 조건의 확인된 기록 없음"
      };

      const cell = node("button", undefined,
        `calendar-day ${state}`);

      cell.append(node("strong", String(day)));
      cell.append(node("small",
        filteredAvailable.length ? "있음" :
        unknown ? "미확인" :
        state === "filtered" ? "해당 없음" : "없음"));

      if (hasDiscount) {
        cell.classList.add("calendar-discount");
        cell.append(node("small", "할인",
          "calendar-discount-tag"));
      }

      if (hasNew) {
        cell.classList.add("calendar-new");
        cell.append(node("small", "NEW",
          "calendar-new-tag"));
      }

      cell.setAttribute("aria-label",
        `${date}, ${labels[state]}`);

      cell.setAttribute("aria-pressed",
        String(selectedDate === date));

      cell.onclick = () => {
        selectedDate = date;
        renderCalendar();
      };

      grid.append(cell);
    }

    calendar.append(grid);

    const legend = node("div", undefined, "calendar-legend");

    for (const [state,text] of [
      ["available","좌석 표시 있음"],
      ["unavailable","좌석 표시 없음"],
      ["unknown","미확인"],
      ["filtered","필터 해당 기록 없음"],
      ["calendar-discount-tag","할인"],
      ["calendar-new-tag","신규"]
    ]) {
      legend.append(node("span",text,state));
    }

    calendar.append(legend);

    calendar.append(node("p",
      "저장된 테스트 기록 기준이며 실시간 재고가 아닙니다.",
      "calendar-note"));

    if (selectedDate.startsWith(selectedMonth)) {
      const detail = node("div",undefined,"calendar-detail");
      detail.append(node("h3",selectedDate));

      const selected = monthRows.filter(r =>
        r.departure_date === selectedDate &&
        window.AirAwardFilter.matches(r, mode)
      );

      if (!selected.length) {
        detail.append(node("p",
          mode === "all" ? "수집 기록 없음" :
          "선택한 조건의 확인된 기록 없음"));
      }

      for (const r of selected) {
        const label =
          `${airlineNames[r.program]} · ` +
          `${r.origin} → ${r.destination} · ` +
          `${cabinNames[r.cabin]} · ` +
          (r.status === "available" ? "표시 있음" :
          r.status === "unknown" ? "미확인" : "표시 없음");

        detail.append(node("p",label));

        if (window.AirAwardFilter.discounted(r)) {
          detail.append(node("p",
            "할인 예상 공제량: " +
            r.pricing.discounted_miles.toLocaleString("ko-KR") +
            " 마일", "calendar-discount-tag"));
        }

        if (r.newly_available === true) {
          detail.append(node("span","NEW",
            "calendar-new-tag"));
        }
      }

      calendar.append(detail);
    }
  }

  function setView(value) {
    view = value;
    const active = value === "calendar";

    root.hidden = active;
    calendar.hidden = !active;

    document.dispatchEvent(
      new CustomEvent("air-view-change")
    );

    const pagination = $("pagination");
    if (pagination) pagination.hidden = active;

    $("list-view").setAttribute("aria-pressed", String(!active));
    $("calendar-view").setAttribute("aria-pressed", String(active));

    if (active) renderCalendar();
  }

  $("list-view").onclick = () => setView("list");
  $("calendar-view").onclick = () => setView("calendar");

  for (const id of ["program","origin","destination","month","cabin"]) {
    $(id).addEventListener("change", () => {
      selectedDate = "";
      if (view === "calendar") renderCalendar();
    });
  }

  new MutationObserver(() => {
    if (view === "calendar") renderCalendar();
  }).observe(root,{childList:true});

  document.addEventListener(
    "air-award-filter-change", () => {
      selectedDate = "";
      if (view === "calendar") renderCalendar();
    }
  );

  // FINAL_FILTER_SYNC_V1
  window.AirData.response()
    .then(r => {
      if (!r.ok) throw new Error("Load failed");
      return r.json();
    })
    .then(payload => {
      if (payload.mode !== "test" ||
          !Array.isArray(payload.items)) {
        throw new Error("Invalid dataset");
      }

      records = payload.items.filter(r => r.test_data === 1);
      loaded = true;

      if (view === "calendar") renderCalendar();
    })
    .catch(console.error);
})();
