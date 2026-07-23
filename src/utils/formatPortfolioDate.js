const portfolioDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const formatPortfolioDate = (value) => {
  if (typeof value !== "string" || !value.trim()) return "";

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
    return "";
  }

  const parsedDate = new Date(Date.UTC(year, month - 1, day));
  const isValidDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  return isValidDate ? portfolioDateFormatter.format(parsedDate) : "";
};
