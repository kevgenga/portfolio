const englishFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function parseAnimationDate(value) {
  const input = String(value || "").trim();
  const dayFirst = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(input);
  const yearFirst = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(input);
  let day;
  let month;
  let year;
  if (dayFirst) {
    day = Number(dayFirst[1]); month = Number(dayFirst[3]); year = Number(dayFirst[4]);
  } else if (yearFirst) {
    year = Number(yearFirst[1]); month = Number(yearFirst[2]); day = Number(yearFirst[3]);
  } else {
    return null;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
}

export function formatAnimationAdminDate(value) {
  const parsed = parseAnimationDate(value);
  if (!parsed) return "";
  return `${String(parsed.getUTCDate()).padStart(2, "0")}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${parsed.getUTCFullYear()}`;
}

export function formatAnimationDisplayDate(value) {
  const parsed = parseAnimationDate(value);
  return parsed ? englishFormatter.format(parsed) : "";
}
