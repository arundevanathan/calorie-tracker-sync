const BASE_ID = "appVP3GZ2ap1L422y";
const DETAILED_TABLE = "Detailed Data";
const SUMMARY_TABLE = "Daily Summary";
const TIME_ZONE = "Asia/Kolkata";
const WINDOW_DAYS = 5;
const INCLUDE_TODAY = process.env.INCLUDE_TODAY === "true";

const token = process.env.AIRTABLE_TOKEN;
if (!token) throw new Error("AIRTABLE_TOKEN is not set.");

function kolkataToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]),
  );
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function completedDateKeys() {
  const today = kolkataToday();
  return Array.from({ length: WINDOW_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (index + (INCLUDE_TODAY ? 0 : 1)));
    return dateKey(date);
  });
}

function apiUrl(table, query = {}) {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Airtable API ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function listAll(table) {
  const records = [];
  let offset;
  do {
    const payload = await request(apiUrl(table, { pageSize: 100, offset }));
    records.push(...payload.records);
    offset = payload.offset;
  } while (offset);
  return records;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newTotals() {
  return { calories: 0, protein: 0, junk: 0, alcohol: 0, eatingOut: 0 };
}

function fieldsFor(totals) {
  return {
    Calories: totals.calories,
    Protein: totals.protein,
    "Calories from Junk": totals.junk,
    "Calories from Alcohol": totals.alcohol,
    "Calories from Eating Out": totals.eatingOut,
  };
}

function batches(values, size = 10) {
  return Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );
}

async function create(records) {
  for (const recordsBatch of batches(records)) {
    await request(apiUrl(SUMMARY_TABLE), {
      method: "POST",
      body: JSON.stringify({ records: recordsBatch }),
    });
  }
}

async function update(records) {
  for (const recordsBatch of batches(records)) {
    await request(apiUrl(SUMMARY_TABLE), {
      method: "PATCH",
      body: JSON.stringify({ records: recordsBatch }),
    });
  }
}

async function remove(recordIds) {
  for (const recordIdsBatch of batches(recordIds)) {
    await request(apiUrl(SUMMARY_TABLE, { "records[]": recordIdsBatch }), { method: "DELETE" });
  }
}

const activeDates = new Set(completedDateKeys());
const [detailedRecords, summaryRecords] = await Promise.all([
  listAll(DETAILED_TABLE),
  listAll(SUMMARY_TABLE),
]);

const totalsByDate = new Map();
for (const { fields } of detailedRecords) {
  const date = fields["Consumption Date"];
  if (!activeDates.has(date)) continue;

  const totals = totalsByDate.get(date) ?? newTotals();
  const calories = numeric(fields.Calories);
  totals.calories += calories;
  totals.protein += numeric(fields.Protein);
  if (fields.Type === "Junk") totals.junk += calories;
  if (fields.Type === "Alcohol") totals.alcohol += calories;
  if (fields.Type === "Eating Out") totals.eatingOut += calories;
  totalsByDate.set(date, totals);
}

const summaryByDate = new Map();
for (const record of summaryRecords) {
  const date = record.fields.Date;
  if (!activeDates.has(date)) continue;
  if (summaryByDate.has(date)) {
    throw new Error(`Duplicate Daily Summary records found for ${date}. Resolve the duplicate before retrying.`);
  }
  summaryByDate.set(date, record);
}

const creates = [];
const updates = [];
for (const [date, totals] of totalsByDate) {
  const existing = summaryByDate.get(date);
  const fields = fieldsFor(totals);
  if (existing) updates.push({ id: existing.id, fields });
  else creates.push({ fields: { Date: date, ...fields } });
}

const deletes = [];
for (const [date, record] of summaryByDate) {
  if (!totalsByDate.has(date)) deletes.push(record.id);
}

await create(creates);
await update(updates);
await remove(deletes);

console.log(JSON.stringify({
  includeToday: INCLUDE_TODAY,
  processedDates: [...activeDates].sort(),
  created: creates.length,
  updated: updates.length,
  deleted: deletes.length,
}));
