const TIME_ZONE = "Asia/Kolkata";
const DEFAULT_USER = "arun";
const DETAILED_TABLE = "Detailed Data";
const SUMMARY_TABLE = "Daily Summary";

const FIELD_NAMES = {
  detailed: ["Entry Name", "Consumption Date", "Meal", "Calories", "Protein", "Type"],
  summary: [
    "Date",
    "Calories",
    "Protein",
    "Weight",
    "Calories from Junk",
    "Calories from Alcohol",
    "Calories from Eating Out",
  ],
};

export function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}

export function authenticate(request, env) {
  const url = new URL(request.url);
  const user = (url.searchParams.get("user") || DEFAULT_USER).toLowerCase();
  const key = url.searchParams.get("key") || request.headers.get("x-dashboard-key");
  const expected = env[`DASHBOARD_KEY_${user.toUpperCase()}`];

  if (!expected) {
    return { error: errorResponse(`Dashboard user is not configured: ${user}`, 404) };
  }
  if (!key || key !== expected) {
    return { error: errorResponse("Missing or invalid dashboard key.", 401) };
  }

  return { user };
}

export function requireConfig(user, env) {
  const token = env[`AIRTABLE_TOKEN_${user.toUpperCase()}`] || env.AIRTABLE_TOKEN;
  const baseId = env[`AIRTABLE_BASE_ID_${user.toUpperCase()}`] || env.AIRTABLE_BASE_ID;

  if (!token) throw new Error(`Missing Airtable token for ${user}.`);
  if (!baseId) throw new Error(`Missing Airtable base ID for ${user}.`);

  return { token, baseId };
}

export function todayKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function dateNDaysAgo(daysAgo) {
  const today = new Date(`${todayKey()}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() - daysAgo);
  return today.toISOString().slice(0, 10);
}

export function nowInKolkata() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+05:30`;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function airtableUrl(baseId, tableName, query = {}) {
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url;
}

async function airtableRequest(token, url) {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Airtable API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function listAll({ token, baseId, tableName, fields }) {
  const records = [];
  let offset;

  do {
    const url = airtableUrl(baseId, tableName, { pageSize: 100, offset });
    for (const field of fields) url.searchParams.append("fields[]", field);

    const payload = await airtableRequest(token, url);
    records.push(...payload.records);
    offset = payload.offset;
  } while (offset);

  return records;
}

function emptyTotals(date) {
  return {
    date,
    calories: 0,
    protein: 0,
    weight: null,
    junkCalories: 0,
    alcoholCalories: 0,
    eatingOutCalories: 0,
  };
}

function detailedTotals(records, date) {
  const totals = emptyTotals(date);
  for (const record of records) {
    const fields = record.fields ?? {};
    if (fields["Consumption Date"] !== date) continue;

    const calories = numeric(fields.Calories);
    totals.calories += calories;
    totals.protein += numeric(fields.Protein);
    if (fields.Type === "Junk") totals.junkCalories += calories;
    if (fields.Type === "Alcohol") totals.alcoholCalories += calories;
    if (fields.Type === "Eating Out") totals.eatingOutCalories += calories;
  }
  return totals;
}

function summaryValue(record) {
  const fields = record.fields ?? {};
  return {
    date: fields.Date,
    calories: numeric(fields.Calories),
    protein: numeric(fields.Protein),
    weight: fields.Weight ?? null,
    junkCalories: numeric(fields["Calories from Junk"]),
    alcoholCalories: numeric(fields["Calories from Alcohol"]),
    eatingOutCalories: numeric(fields["Calories from Eating Out"]),
  };
}

function recentEntries(records) {
  return records
    .map((record) => {
      const fields = record.fields ?? {};
      return {
        date: fields["Consumption Date"],
        meal: fields.Meal ?? "",
        name: fields["Entry Name"] ?? "Food entry",
        calories: numeric(fields.Calories),
        protein: numeric(fields.Protein),
        type: fields.Type ?? "Core",
      };
    })
    .filter((entry) => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
}

export async function getDashboardData(user, env) {
  const config = requireConfig(user, env);
  const [detailedRecords, summaryRecords] = await Promise.all([
    listAll({ ...config, tableName: DETAILED_TABLE, fields: FIELD_NAMES.detailed }),
    listAll({ ...config, tableName: SUMMARY_TABLE, fields: FIELD_NAMES.summary }),
  ]);

  const today = todayKey();
  const thirtyDaysAgo = dateNDaysAgo(29);
  const todayTotals = detailedTotals(detailedRecords, today);

  const summariesByDate = new Map(
    summaryRecords
      .map(summaryValue)
      .filter((summary) => summary.date && summary.date >= thirtyDaysAgo)
      .map((summary) => [summary.date, summary]),
  );

  summariesByDate.set(today, {
    ...todayTotals,
    weight: summariesByDate.get(today)?.weight ?? todayTotals.weight,
  });

  const last30Days = [...summariesByDate.values()]
    .filter((summary) => summary.date >= thirtyDaysAgo)
    .sort((a, b) => a.date.localeCompare(b.date));

  const last7Days = last30Days.filter((summary) => summary.date >= dateNDaysAgo(6));

  return {
    user,
    updatedAt: nowInKolkata(),
    today: todayTotals,
    last7Days,
    last30Days,
    recentEntries: recentEntries(detailedRecords),
  };
}
