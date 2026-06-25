const TIME_ZONE = "Asia/Kolkata";
const DEFAULT_USER = "arun";
const DETAILED_TABLE = "Detailed Data";
const SUMMARY_TABLE = "Daily Summary";
const USER_TO_PERSON = {
  arun: "Arun",
  ishita: "Ishita",
};

const FIELD_NAMES = {
  detailed: ["Entry Name", "Consumption Date", "Meal", "Calories", "Protein", "Type", "Person"],
  summary: [
    "Date",
    "Person",
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
  const person = USER_TO_PERSON[user];

  if (!person) {
    return { error: errorResponse(`Unknown dashboard user: ${user}`, 404) };
  }

  return { user, person };
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

async function listFiltered({ token, baseId, tableName, fields, filterByFormula, sort }) {
  const records = [];
  let offset;

  do {
    const url = airtableUrl(baseId, tableName, { pageSize: 100, offset, filterByFormula });
    for (const field of fields) url.searchParams.append("fields[]", field);
    for (const sortItem of sort ?? []) {
      url.searchParams.append("sort[0][field]", sortItem.field);
      url.searchParams.append("sort[0][direction]", sortItem.direction);
    }

    const payload = await airtableRequest(token, url);
    records.push(...payload.records);
    offset = payload.offset;
  } while (offset);

  return records;
}

function formulaString(value) {
  return `'${String(value).replace(/'/g, "\\'")}'`;
}

function isSameDayFormula(fieldName, date) {
  return `IS_SAME({${fieldName}}, ${formulaString(date)}, 'day')`;
}

function completedDateKeys(count) {
  return Array.from({ length: count }, (_, index) => dateNDaysAgo(index + 1));
}

function emptyTotals(date, person) {
  return {
    date,
    person,
    calories: 0,
    protein: 0,
    weight: null,
    junkCalories: 0,
    alcoholCalories: 0,
    eatingOutCalories: 0,
  };
}

function detailedTotals(records, date, person) {
  const totals = emptyTotals(date, person);
  for (const record of records) {
    const fields = record.fields ?? {};
    if (fields["Consumption Date"] !== date) continue;
    if (fields.Person !== person) continue;

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
    person: fields.Person,
    calories: numeric(fields.Calories),
    protein: numeric(fields.Protein),
    weight: fields.Weight ?? null,
    junkCalories: numeric(fields["Calories from Junk"]),
    alcoholCalories: numeric(fields["Calories from Alcohol"]),
    eatingOutCalories: numeric(fields["Calories from Eating Out"]),
  };
}

function foodEntries(records) {
  return records
    .map((record) => {
      const fields = record.fields ?? {};
      return {
        date: fields["Consumption Date"],
        person: fields.Person,
        meal: fields.Meal ?? "",
        name: fields["Entry Name"] ?? "Food entry",
        calories: numeric(fields.Calories),
        protein: numeric(fields.Protein),
        type: fields.Type ?? "Core",
      };
    })
    .filter((entry) => entry.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);
}

export async function getDashboardData(user, person, env) {
  const config = requireConfig(user, env);
  const today = todayKey();
  const last7DateKeys = completedDateKeys(7);
  const personFormula = `{Person}=${formulaString(person)}`;

  const [detailedRecords, summaryRecords] = await Promise.all([
    listFiltered({
      ...config,
      tableName: DETAILED_TABLE,
      fields: FIELD_NAMES.detailed,
      filterByFormula: `AND(${personFormula}, ${isSameDayFormula("Consumption Date", today)})`,
    }),
    listFiltered({
      ...config,
      tableName: SUMMARY_TABLE,
      fields: FIELD_NAMES.summary,
      filterByFormula: `AND(${personFormula}, OR(${last7DateKeys
        .map((date) => isSameDayFormula("Date", date))
        .join(", ")}))`,
      sort: [{ field: "Date", direction: "desc" }],
    }),
  ]);

  const todayTotals = detailedTotals(detailedRecords, today, person);

  const summariesByDate = new Map(
    summaryRecords
      .map(summaryValue)
      .filter((summary) => summary.person === person && last7DateKeys.includes(summary.date))
      .map((summary) => [summary.date, summary]),
  );

  const last7Days = [...summariesByDate.values()]
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    user,
    person,
    updatedAt: nowInKolkata(),
    today: todayTotals,
    last7Days,
    last30Days: last7Days,
    todayEntries: foodEntries(detailedRecords).filter((entry) => entry.person === person && entry.date === today),
  };
}
