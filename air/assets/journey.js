(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const results = $("results");
    const search = $("search");

    if (!results || !search) return;

    if ($("simple-journey")) return;

    const controls = document.createElement("div");

    controls.id = "simple-journey";

    controls.innerHTML = `
      <div class="simple-trip-buttons">
        <button type="button" id="trip-one"
          aria-pressed="true">편도 검색</button>
        <button type="button" id="trip-round"
          aria-pressed="false">왕복 검색</button>
      </div>

      <div id="return-options" hidden>
        <label for="return-cabin">오는 편 좌석 등급</label>
        <select id="return-cabin">
          <option value="">전체 등급</option>
          <option value="economy">일반석</option>
          <option value="premium">프리미엄석</option>
          <option value="business">비즈니스석</option>
        </select>

        <label for="return-month">오는 편 출발 월</label>
        <input type="month" id="return-month">
      </div>
    `;

    search.before(controls);

    const panel = document.createElement("section");

    panel.id = "simple-round-results";
    panel.hidden = true;

    results.before(panel);

    let round = false;
    let sequence = 0;

    const airline = {
        KE_SKYPASS: "대한항공",
        OZ_ASIANA_CLUB: "아시아나"
    };

    const cabin = {
        economy: "일반석",
        premium: "프리미엄석",
        business: "비즈니스석"
    };

    const val = id => $(id)?.value || "";

    const match = (selected, actual) =>
        !selected ||
        ["all", "ALL", "*"].includes(selected) ||
        selected === actual;

    function makeSection(title, origin, dest, rows) {

        const section = document.createElement("section");
        section.className = "simple-leg";

        const heading = document.createElement("h3");

        heading.textContent =
            title + " · " + origin + " → " + dest;

        section.append(heading);

        const count = document.createElement("p");

        count.textContent =
            "테스트 좌석 표시 " + rows.length + "건";

        section.append(count);

        if (!rows.length) {
            const empty = document.createElement("p");

            empty.textContent =
                "확인된 테스트 좌석 정보가 없습니다. " +
                "실제 매진을 의미하지 않습니다.";

            section.append(empty);

            return section;
        }

        for (const row of rows) {
            const item = document.createElement("label");
            item.className = "simple-leg-item";

            const radio = document.createElement("input");

            radio.type = "radio";
            radio.name = title;
            radio.value = row.departure_date;

            radio.dataset.program = row.program;
            radio.dataset.cabin = row.cabin;

            const text = document.createElement("span");

            text.textContent =
                row.departure_date + " · " +
                (airline[row.program] || row.program) +
                " · " +
                (cabin[row.cabin] || row.cabin);

            item.append(radio, text);
            section.append(item);
        }

        return section;
    }

    async function render() {

        const current = ++sequence;

        if (!round) {
            panel.hidden = true;
            results.classList.remove("round-hidden");
            return;
        }

        panel.hidden = false;
        results.classList.add("round-hidden");

        panel.textContent = "검색 중";

        const origin = val("origin");
        const dest = val("destination");

        if (!/^[A-Z]{3}$/.test(origin) ||
            !/^[A-Z]{3}$/.test(dest) ||
            origin === dest) {

            panel.textContent =
                "출발 공항과 목적지를 선택하세요.";

            return;
        }

        try {

            const data = await window.AirData.load();

            if (current !== sequence || !round) return;

            const available = data.items.filter(r =>
                r.test_data === 1 &&
                r.status === "available" &&
                match(val("program"), r.program)
            );

            const outgoing = available.filter(r =>
                r.origin === origin &&
                r.destination === dest &&
                match(val("cabin"), r.cabin) &&
                match(
                    val("month"),
                    r.departure_date.slice(0,7)
                )
            );

            const incoming = available.filter(r =>
                r.origin === dest &&
                r.destination === origin &&
                match(val("return-cabin"), r.cabin) &&
                match(
                    val("return-month"),
                    r.departure_date.slice(0,7)
                )
            );

            const sort = (a,b) =>
                a.departure_date.localeCompare(
                    b.departure_date
                );

            outgoing.sort(sort);
            incoming.sort(sort);

            const note = document.createElement("p");

            note.id = "simple-trip-note";

            note.textContent =
                "가는 편과 오는 편을 각각 선택하세요.";

            panel.replaceChildren(
                makeSection(
                    "가는 편", origin, dest, outgoing
                ),
                makeSection(
                    "오는 편", dest, origin, incoming
                ),
                note
            );

        } catch {
            if (current === sequence) {
                panel.textContent =
                    "좌석 데이터를 불러오지 못했습니다.";
            }
        }
    }

    panel.addEventListener("change", () => {

        const out = panel.querySelector(
            'input[name="가는 편"]:checked'
        );

        const back = panel.querySelector(
            'input[name="오는 편"]:checked'
        );

        const note = $("simple-trip-note");

        if (!note || !out || !back) return;

        if (back.value < out.value) {
            note.textContent =
                "귀국 날짜는 출국 날짜 이후여야 합니다.";
            return;
        }

        note.textContent =
            "선택한 여정: " +
            out.value + " ~ " + back.value +
            " · 실제 발권은 항공사에서 확인";
    });

    function mode(value) {

        round = value;

        $("trip-one").setAttribute(
            "aria-pressed", String(!round)
        );

        $("trip-round").setAttribute(
            "aria-pressed", String(round)
        );

        $("return-options").hidden = !round;

        if (round) {
            $("return-month").value =
                /^\d{4}-\d{2}$/.test(val("month"))
                ? val("month") : "";

            $("return-cabin").value =
                val("cabin") || "";
        }

        render();
    }

    $("trip-one").onclick = () => mode(false);

    $("trip-round").onclick = () => mode(true);

    search.addEventListener("click", render);

    for (const id of [
        "origin", "destination", "program",
        "month", "cabin",
        "return-month", "return-cabin"
    ]) {
        $(id)?.addEventListener("change", render);
    }

    console.log("SIMPLE ROUND TRIP: INSTALLED");
})();
