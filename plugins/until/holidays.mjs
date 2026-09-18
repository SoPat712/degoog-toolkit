import Holidays from "./vendor/date-holidays/index.mjs";
import { calendars, names, records } from "./vendor/date-holidays/catalog.mjs";
import { normalizeHolidayName } from "./holiday-names.mjs";
import { supplementalHolidays, correctedDates } from "./holiday-supplement.mjs";

const calendarNames = new Map();
const calendarIds = Object.keys(calendars);
for (const [id, label] of Object.entries(calendars)) {
  calendarNames.set(normalizeHolidayName(id), id);
  calendarNames.set(normalizeHolidayName(label), id);
}
for (const [name, id] of Object.entries({ usa: "US", uk: "GB", britain: "GB", "united states of america": "US", "south korea": "KR" })) calendarNames.set(name, id);

// Deterministic fallbacks when a festival is absent from the configured calendar.
// The chosen region is always displayed; explicit region requests never fall back.
const preferred = ["US", "IN", "GB", "IL", "CN", "JP", "KR", "SG", "SA", "IR", "MX", "TH", "MU"];
const instances = new Map();
const years = new Map();
function remember(cache, key, value, limit) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}
export function calendarId(value) {
  return calendarNames.get(normalizeHolidayName(value)) || null;
}

export function matchHoliday(input, defaultCalendar = "US") {
  let text = String(input || "").trim().replace(/[?!.]+$/, "").replace(/^the\s+/i, "");
  if (!text || text.length > 180) return null;
  let year = null;
  const takeYear = () => {
    const match = text.match(/\s+(?:in\s+)?(\d{4})$/);
    if (match) { year = Number(match[1]); text = text.slice(0, match.index); }
  };
  takeYear();
  let requestedCalendar = null;
  const region = text.match(/\s+in\s+(.+)$/i);
  if (region) {
    requestedCalendar = calendarId(region[1]);
    if (!requestedCalendar) return null;
    text = text.slice(0, region.index);
    if (!year) takeYear();
  }
  let key = normalizeHolidayName(text);
  let forcedCalendar = null;
  if (key === "orthodox easter") { key = "easter sunday"; forcedCalendar = "GR"; }
  if (key === "western easter") { key = "easter sunday"; forcedCalendar = "US"; }
  if (forcedCalendar && requestedCalendar && forcedCalendar !== requestedCalendar) {
    return { unavailable: true, name: text, calendar: requestedCalendar, year };
  }
  if (!Object.hasOwn(names, key)) return null;
  const candidates = names[key].flatMap(i => records[i][1].map(c => [calendarIds[c], records[i][0]]));
  const selected = requestedCalendar || forcedCalendar || calendarId(defaultCalendar) || "US";
  let choices = candidates.filter(([id]) => id === selected);
  if (!choices.length) choices = candidates.filter(([id]) => id.startsWith(`${selected}.`));
  if (!choices.length && !requestedCalendar && !forcedCalendar) {
    choices = candidates.filter(([id]) => id === selected.split(".")[0]);
    if (!choices.length) choices = [...candidates].sort(([a], [b]) => {
      const rank = id => preferred.includes(id) ? preferred.indexOf(id) : 100 + id.split(".").length;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }
  if (!choices.length) return { unavailable: true, name: text, calendar: selected, year };
  const [calendar, name] = choices[0];
  return { calendar, name, year };
}

function holidaysForYear(calendar, year) {
  const key = `${calendar}|${year}`;
  if (years.has(key)) return years.get(key);
  let h = instances.get(calendar);
  if (!h) {
    // UTC is only used to obtain civil dates. Countdown semantics remain the
    // existing server-local date, not a claimed exact religious start instant.
    h = new Holidays(calendar, { languages: "en", timezone: "UTC" });
    for (const extra of supplementalHolidays.filter(x => x.calendar === calendar && !/^\d{4}-/.test(x.rule))) {
      h.setHoliday(extra.rule, { name: { en: extra.name }, type: "observance" });
    }
    remember(instances, calendar, h, 12);
  }
  const supplements = supplementalHolidays.filter(x => x.calendar === calendar && x.rule.startsWith(`${year}-`));
  const dates = h.getHolidays(year, "en").filter(h => !h.substitute && !supplements.some(x => x.name === h.name));
  dates.push(...supplements.map(x => ({ name: x.name, date: `${x.rule} 00:00:00`, rule: x.rule })));
  return remember(years, key, dates, 48);
}

export function resolveHoliday(match, now = new Date(), direction = "future") {
  if (!match) return null;
  const metadata = { holidayName: match.name, calendar: match.calendar, calendarLabel: calendars[match.calendar] || match.calendar };
  const missing = { ...metadata, unavailable: true };
  if (match.unavailable) return missing;
  const year = match.year ?? now.getFullYear();
  // Upstream table-backed Hebrew/Hijri rules have finite ranges. Restrict all
  // holiday lookups to this documented window, never invent dates outside it.
  if (year < 1970 || year > 2080) return missing;
  const requestedYears = match.year ? [year] : [year, year + (direction === "past" ? -1 : 1)];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const y of requestedYears) {
    if (y < 1970 || y > 2080) continue;
    const dates = holidaysForYear(match.calendar, y).filter(h => h.name === match.name).map(h => {
      const civil = correctedDates[`${match.calendar}|${h.name}|${y}`] || h.date.slice(0, 10);
      const [yy, mm, dd] = civil.split("-").map(Number);
      const evening = / -0600$/.test(h.date);
      // For sunset-based calendars, count to the beginning of the eve's civil
      // day. No hard-coded "6pm sunset" precision is presented as fact.
      const date = new Date(yy, mm - 1, dd - (evening ? 1 : 0));
      return { date, evening, rule: h.rule };
    }).sort((a, b) => direction === "past" ? b.date - a.date : a.date - b.date);
    const target = dates.find(({ date }) => match.year || (direction === "past" ? date <= today : date >= today));
    if (target) return {
      ...metadata, date: target.date, precision: "day", explicitYear: Boolean(match.year),
      note: match.name === "Day of the Dead" && match.calendar === "MX"
        ? "Celebrated November 1–2; countdown is to the first calendar day. Regional traditions vary."
        : target.evening
        ? "Begins at local sunset on this date; countdown is to the calendar day, not an exact sunset time."
        : /Muharram|Safar|Rabi|Jumada|Rajab|Shaban|Ramadan|Shawwal|Dhu/i.test(target.rule)
          ? "Calendar estimate; local moon sighting can change the date. Countdown is to the calendar day."
          : "Calendar date; local observances may differ.",
    };
  }
  return missing;
}
