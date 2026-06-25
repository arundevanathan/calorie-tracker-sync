const STORAGE_KEY = "calorie-dashboard-settings";
const DATA_KEY_PREFIX = "calorie-dashboard-last-data";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const supportedUsers = ["arun", "ishita"];

const elements = {
  calories: document.querySelector("#calories"),
  protein: document.querySelector("#protein"),
  alcoholJunk: document.querySelector("#alcoholJunk"),
  updated: document.querySelector("#updated"),
  trend: document.querySelector("#trend"),
  entries: document.querySelector("#entries"),
  range7: document.querySelector("#range7"),
  refresh: document.querySelector("#refresh"),
  switchButtons: [...document.querySelectorAll("[data-user]")],
};

function readSettings() {
  const params = new URLSearchParams(window.location.search);
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const candidateUser = (params.get("user") || saved.user || "arun").toLowerCase();
  const settings = {
    user: supportedUsers.includes(candidateUser) ? candidateUser : "arun",
  };

  if (params.get("user")) {
    writeSettings(settings);
    window.history.replaceState({}, "", window.location.pathname);
  }

  return settings;
}

function writeSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function dataKey(user) {
  return `${DATA_KEY_PREFIX}:${user}`;
}

function readCachedData(user) {
  const cached = JSON.parse(localStorage.getItem(dataKey(user)) || "null");
  if (!cached) return null;

  if (cached.payload) return cached;

  // Backward compatibility for the older cache format, which stored the API
  // payload directly. Show it if present, but refresh it once because it has no
  // local API-call timestamp.
  return { fetchedAt: 0, payload: cached };
}

function writeCachedData(user, payload) {
  localStorage.setItem(dataKey(user), JSON.stringify({
    fetchedAt: Date.now(),
    payload,
  }));
}

function isCacheFresh(cached) {
  return Boolean(cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS);
}

function timeLabel(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
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

function updateSwitcher(activeUser) {
  for (const button of elements.switchButtons) {
    const isActive = button.dataset.user === activeUser;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function render(data, options = {}) {
  const { fromCache = false, fetchedAt = null } = options;
  const today = data.today ?? {};
  const last7 = data.last7Days ?? [];
  const entries = data.todayEntries ?? [];

  updateSwitcher(data.user);
  setText("calories", formatNumber(today.calories));
  setText("protein", `${formatNumber(today.protein, 1)} g`);
  setText("alcoholJunk", formatNumber(Number(today.junkCalories || 0) + Number(today.alcoholCalories || 0)));
  setText(
    "updated",
    `Last updated ${timeLabel(fromCache && fetchedAt ? fetchedAt : data.updatedAt)}`,
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
                <div class="entry-meta">${escapeHtml(entry.meal || "Meal")} - ${escapeHtml(entry.type)}</div>
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

  writeCachedData(settings.user, payload);
  render(payload);
}

function showLoadingState(settings) {
  setText("calories", "-");
  setText("protein", "-");
  setText("alcoholJunk", "-");
  elements.range7.textContent = "";
  elements.trend.innerHTML = "";
  elements.entries.innerHTML = `<p class="muted">Loading ${displayName(settings.user)}...</p>`;
  elements.updated.textContent = "Loading dashboard...";
}

async function refresh(settings) {
  try {
    await loadFresh(settings);
  } catch (error) {
    elements.updated.textContent = error.message;
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.textContent = "Refresh";
  }
}

async function showCachedThenRefreshIfNeeded(settings) {
  const cached = readCachedData(settings.user);
  if (cached) {
    render(cached.payload, { fromCache: true, fetchedAt: cached.fetchedAt });
    if (isCacheFresh(cached)) return;
  } else {
    showLoadingState(settings);
  }

  await refresh(settings);
}

async function main() {
  const settings = readSettings();
  writeSettings(settings);
  updateSwitcher(settings.user);

  for (const button of elements.switchButtons) {
    button.addEventListener("click", () => {
      const user = button.dataset.user;
      if (!supportedUsers.includes(user) || user === settings.user) return;

      settings.user = user;
      writeSettings(settings);
      updateSwitcher(settings.user);

      showCachedThenRefreshIfNeeded(settings);
    });
  }

  elements.refresh.addEventListener("click", () => {
    refresh(settings);
  });

  await showCachedThenRefreshIfNeeded(settings);
}

main();
