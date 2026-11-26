(() => {
  "use strict";

  let pending;

  async function read(url) {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("DATA_FETCH_FAILED");
    }

    return response.json();
  }

  async function load() {
    const base = new URL(
      "./data/preview/",
      document.baseURI
    );

    const index = await read(
      new URL("index.json", base)
    );

    if (
      (index.mode !== "test" && index.mode !== "production") ||
      !Array.isArray(index.files) ||
      !index.files.length
    ) {
      throw new Error("INVALID_MANIFEST");
    }

    const testMode = index.mode === "test";

    const items = [];
    const seen = new Set();

    for (const file of index.files) {
      const url = new URL(file.path, base);

      if (
        url.origin !== base.origin ||
        !url.pathname.startsWith(base.pathname)
      ) {
        throw new Error("INVALID_DATA_PATH");
      }

      const part = await read(url);

      if (
        part.mode !== index.mode ||
        !Array.isArray(part.items) ||
        part.items.length !== file.total
      ) {
        throw new Error("INVALID_DATA_PART");
      }

      for (const row of part.items) {
        if (
          (testMode && row.test_data !== 1) ||
          (!testMode && row.test_data !== undefined) ||
          row.seat_count !== null
        ) {
          throw new Error("INVALID_TEST_RECORD");
        }

        const key = [
          row.program,
          row.origin,
          row.destination,
          row.departure_date,
          row.cabin
        ].join("|");

        if (seen.has(key)) {
          throw new Error("DUPLICATE_RECORD");
        }

        seen.add(key);
        items.push(row);
      }
    }

    if (items.length !== index.total) {
      throw new Error("TOTAL_MISMATCH");
    }

    return {
      mode: index.mode,
      schema_version: 3,
      generated_at: index.generated_at,
      total: items.length,
      items
    };
  }

  window.AirData = {
    load() {
      if (!pending) {
        pending = load().catch(error => {
          pending = null;
          throw error;
        });
      }

      return pending;
    },

    async response() {
      const data = await this.load();

      return new Response(
        JSON.stringify(data),
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }
  };
})();
