const formatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
};

const parsePortfolioDate = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;

  const date = value.trim();
  const dayFirstMatch = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(date);
  const yearFirstMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date);

  let day;
  let month;
  let year;

  if (dayFirstMatch) {
    day = Number(dayFirstMatch[1]);
    month = Number(dayFirstMatch[3]);
    year = Number(dayFirstMatch[4]);
  } else if (yearFirstMatch) {
    year = Number(yearFirstMatch[1]);
    month = Number(yearFirstMatch[2]);
    day = Number(yearFirstMatch[3]);
  } else {
    return null;
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  const isValidDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  return isValidDate ? parsedDate : null;
};

export const formatPortfolioDate = (value, locale = "en") => {
  const parsedDate = parsePortfolioDate(value);
  return parsedDate ? new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : locale === "fr" ? "fr-FR" : "en-GB", formatOptions).format(parsedDate) : "";
};

// Illustration ribbon only: natural month/day order, without splitting a
// translated month name or changing the full dates used elsewhere on the site.
export const formatPortfolioDateLines = (value, locale = "en") => {
  const parsedDate = parsePortfolioDate(value);
  if (!parsedDate) return [];
  const language = locale === "ja" ? "ja-JP" : locale === "fr" ? "fr-FR" : "en-US";
  const dayMonth = new Intl.DateTimeFormat(language, { day: "numeric", month: "long", timeZone: "UTC" }).format(parsedDate);
  const year = new Intl.DateTimeFormat(language, { year: "numeric", timeZone: "UTC" }).format(parsedDate);
  return locale === "ja" ? [year, dayMonth] : [dayMonth, year];
};
