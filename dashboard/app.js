const STORAGE_KEY = "calorie-dashboard-settings";
const DATA_KEY = "calorie-dashboard-last-data";

const elements = {
  userName: document.querySelector("#userName"),
  calories: document.querySelector("#calories"),
  protein: document.querySelector("#protein"),
  alcoholJunk: document.querySelector("#alcoholJunk"),
  updated: document.querySelector("#updated"),
  trend: document.querySelector("#trend"),
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

function displayName(user) {
  return String(user || "arun")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
  const entries = data.todayEntries ?? [];

  setText("userName", displayName(data.user));
  setText("calories", formatNumber(today.calories));
  setText("protein", `${formatNumber(today.protein, 1)} g`);
  setText("alcoholJunk", formatNumber(Number(today.junkCalories || 0) + Number(today.alcoholCalories || 0)));
  setText(
    "updated",
    `${stale ? "Cached" : "Updated"} ${new Date(data.updatedAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`,
  );

  elements.range7.textContent = last7.length
    ? `${shortDate(last7[0].date)} - ${shortDate(last7[last7.length - 1].date)}`
    : "";

  elements.trend.innerHTML = last7
    .map((day) => {
      const calories = Number(day.calories || 0);
      const protein = Number(day.protein || 0);
      return `
        <div class="trend-row">
          <span class="trend-date">${shortDate(day.date)}</span>
          <strong>${formatNumber(calories)}</strong>
          <strong>${formatNumber(protein, 1)}g</strong>
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
                <div class="entry-meta">${escapeHtml(entry.meal || "Meal")} · ${escapeHtml(entry.type)}</div>
              </div>
              <div class="entry-numbers">
                <strong>${formatNumber(entry.calories)}</strong>
                <span>kcal</span>
                <span>${formatNumber(entry.protein, 1)}g protein</span>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="muted">No food logged today yet.</p>`;
}

async function loadFresh(settings) {
  elements.refresh.disabled = true;
  elements.refresh.textContent = "Refreshing...";

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
