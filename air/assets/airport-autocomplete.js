(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const aliases = {
        ICN: "서울 인천 Seoul Incheon",
        GMP: "서울 김포 Seoul Gimpo",
        PUS: "부산 김해 Busan Gimhae",
        CJU: "제주 Jeju",
        NRT: "도쿄 동경 Tokyo Narita 나리타",
        HND: "도쿄 동경 Tokyo Haneda 하네다",
        KIX: "오사카 Osaka Kansai 간사이",
        NGO: "나고야 Nagoya",
        FUK: "후쿠오카 Fukuoka",
        CTS: "삿포로 Sapporo",
        OKA: "오키나와 Okinawa",
        PEK: "베이징 북경 Beijing",
        PVG: "상하이 Shanghai 푸동",
        SHA: "상하이 Shanghai 홍차오",
        TPE: "타이베이 Taipei",
        HKG: "홍콩 Hong Kong",
        SIN: "싱가포르 Singapore",
        BKK: "방콕 Bangkok",
        DAD: "다낭 Da Nang",
        CXR: "나트랑 Nha Trang Cam Ranh",
        SGN: "호치민 Ho Chi Minh",
        HAN: "하노이 Hanoi",
        MNL: "마닐라 Manila",
        CEB: "세부 Cebu",
        DPS: "발리 Bali Denpasar",
        JFK: "뉴욕 New York Kennedy",
        LAX: "로스앤젤레스 Los Angeles LA",
        SFO: "샌프란시스코 San Francisco",
        CDG: "파리 Paris",
        LHR: "런던 London Heathrow",
        FCO: "로마 Rome",
        AMS: "암스테르담 Amsterdam",
        FRA: "프랑크푸르트 Frankfurt",
        SYD: "시드니 Sydney"
    };

    
    fetch("./data/airport-coordinates.json")
        .then(response => {
            if (!response.ok) throw new Error("AIRPORTS");
            return response.json();
        })
        .then(data => {

            for (const airport of data.airports) {

                aliases[airport.code] = [
                    aliases[airport.code],
                    airport.name,
                    airport.english_name,
                    airport.municipality,
                    airport.code,
                    airport.icao
                ].filter(Boolean).join(" ");
            }

            console.log("FULL AIRPORT ALIASES: READY");
        })
        .catch(() => {
            console.warn("Using existing airport aliases");
        });

    const normalize = value =>

        String(value || "")
            .toLowerCase()
            .normalize("NFKC")
            .replace(/[\s/().,-]/g, "");

    function install(id, label) {

        const select = $(id);

        if (!select || $(id + "-autocomplete")) return;

        const wrapper = document.createElement("div");
        wrapper.className = "airport-autocomplete";

        const input = document.createElement("input");
        input.id = id + "-autocomplete";
        input.type = "search";
        input.placeholder = "도시명 또는 공항 코드 검색";
        input.autocomplete = "off";
        input.setAttribute("aria-label", label + " 검색");
        input.setAttribute("aria-expanded", "false");
        input.setAttribute("aria-controls", id + "-suggestions");

        const list = document.createElement("div");
        list.id = id + "-suggestions";
        list.className = "airport-suggestions";
        list.hidden = true;

        wrapper.append(input, list);

        select.before(wrapper);
        select.classList.add("airport-native-hidden");
        select.setAttribute("aria-hidden", "true");
        select.tabIndex = -1;

        function close() {
            list.hidden = true;
            input.setAttribute("aria-expanded", "false");
        }

        function choose(option) {

            select.value = option.value;

            input.value = option.textContent;

            close();

            select.dispatchEvent(
                new Event("change", {bubbles: true})
            );
        }

        function show(showAll = false) {

            const keyword = showAll === true ? "" : normalize(input.value);

            list.replaceChildren();

            const matches = [...select.options]
                .filter(option => {

                    if (!option.value) return false;

                    const searchable = normalize(
                        option.textContent + " " +
                        option.value + " " +
                        (aliases[option.value] || "")
                    );

                    return searchable.includes(keyword);
                });

            const unique = new Map();

            for (const option of matches) {
                const code = option.value.trim().toUpperCase();
                if (!unique.has(code)) {
                    unique.set(code, option);
                }
            }

            for (const option of unique.values()) {

                const button = document.createElement("button");

                button.type = "button";
                button.className = "airport-suggestion";
                button.textContent = option.textContent;

                button.addEventListener(
                    "click", () => choose(option)
                );

                list.append(button);
            }

            if (!matches.length) {

                const empty = document.createElement("p");

                empty.textContent =
                    "선택 가능한 관련 공항이 없습니다.";

                list.append(empty);
            }

            list.hidden = false;
            input.setAttribute("aria-expanded", "true");
        }

        input.addEventListener("input", show);
        input.addEventListener("focus", () => {
            input.select();
            show(true);
        });

        input.addEventListener("keydown", e => {

            if (e.key === "Escape") close();

            if (e.key === "ArrowDown") {
                e.preventDefault();
                list.querySelector("button")?.focus();
            }

            if (e.key === "Enter") {
                const options = list.querySelectorAll("button");
                if (options.length === 1) {
                    e.preventDefault();
                    options[0].click();
                }
            }
        });

        wrapper.addEventListener("focusout", e => {
            if (!wrapper.contains(e.relatedTarget)) close();
        });

        document.addEventListener("pointerdown", e => {
            if (!wrapper.contains(e.target)) close();
        });

        function sync() {
            input.value = select.value
                ? select.selectedOptions[0]?.textContent || ""
                : "";
            close();
        }

        select.addEventListener("change", sync);

        new MutationObserver(sync).observe(select, {
            childList: true,
            subtree: true
        });

        sync();
    }

    install("origin", "출발 공항");
    install("destination", "도착 공항");

    console.log("AIRPORT AUTOCOMPLETE: READY");
})();
