const STORAGE_KEY = "calorie-dashboard-settings";
const DATA_KEY = "calorie-dashboard-last-data";

const elements = {
  calories: document.querySelector("#calories"),
  protein: document.querySelector("#protein"),
  eatingOut: document.querySelector("#eatingOut"),
  junk: document.querySelector("#junk"),
  alcohol: document.querySelector("#alcohol"),
  avg7: document.querySelector("#avg7"),
  updated: document.querySelector("#updated"),
  bars: document.querySelector("#bars"),
  entries: document.querySelector("#entries"),
  range7: document.querySelector("#range7"),
  refresh: document.querySelector("#refresh"),
  setup: document.querySelector("#setup"),
};

function readSettings() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    user: params.get("user"),
  };

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const settings = {
    user: fromUrl.user || saved.user || "arun",
  };

  if (fromUrl.user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.history.replaceState({}, "", window.location.pathname);
  }

  return settings;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function shortDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00+05:30`));
}

function setText(name, value) {
  elements[name].textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function render(data, stale = false) {
  const today = data.today ?? {};
  const last7 = data.last7Days ?? [];
  const entries = data.recentEntries ?? [];
  const averageCalories = last7.length
    ? last7.reduce((total, day) => total + Number(day.calories || 0), 0) / last7.length
    : 0;

  setText("calories", formatNumber(today.calories));
  setText("protein", `${formatNumber(today.protein, 1)} g`);
  setText("eatingOut", formatNumber(today.eatingOutCalories));
  setText("junk", formatNumber(today.junkCalories));
  setText("alcohol", formatNumber(today.alcoholCalories));
  setText("avg7", formatNumber(averageCalories));
  setText(
    "updated",
    `${stale ? "Cached" : "Updated"} ${new Date(data.updatedAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
  );

  elements.range7.textContent = last7.length
    ? `${shortDate(last7[0].date)} – ${shortDate(last7[last7.length - 1].date)}`
    : "";

  const maxCalories = Math.max(1, ...last7.map((day) => Number(day.calories || 0)));
  elements.bars.innerHTML = last7
    .map((day) => {
      const calories = Number(day.calories || 0);
      const width = Math.max(4, Math.round((calories / maxCalories) * 100));
      return `
        <div class="bar-row">
          <span>${shortDate(day.date)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
          <span>${formatNumber(calories)}</span>
        </div>
      `;
    })
    .join("");

  elements.entries.innerHTML = entries.length
    ? entries
        .map(
          (entry) => `
            <article class="entry">
              <div>
                <div class="entry-title">${escapeHtml(entry.name)}</div>
                <div class="entry-meta">${shortDate(entry.date)} · ${escapeHtml(entry.meal || "Meal")} · ${escapeHtml(entry.type)}</div>
              </div>
              <div class="entry-meta">${formatNumber(entry.calories)} kcal<br>${formatNumber(entry.protein, 1)}g</div>
            </article>
          `,
        )
        .join("")
    : `<p class="muted">No recent food entries yet.</p>`;
}

async function loadFresh(settings) {
  elements.refresh.disabled = true;
  elements.refresh.textContent = "Refreshing…";

  const url = new URL("/api/dashboard", window.location.origin);
  url.searchParams.set("user", settings.user);

  const response = await fetch(url);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Dashboard refresh failed.");
  }

  localStorage.setItem(DATA_KEY, JSON.stringify(payload));
  render(payload);
}

async function main() {
  const settings = readSettings();
  const cached = JSON.parse(localStorage.getItem(DATA_KEY) || "null");
  if (cached) render(cached, true);

  elements.refresh.addEventListener("click", () => {
    loadFresh(settings)
      .catch((error) => {
        elements.updated.textContent = error.message;
      })
      .finally(() => {
        elements.refresh.disabled = false;
        elements.refresh.textContent = "Refresh";
      });
  });

  try {
    await loadFresh(settings);
  } catch (error) {
    elements.updated.textContent = error.message;
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.textContent = "Refresh";
  }
}

main();
