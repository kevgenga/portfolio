import { useMemo } from "react";
import { useLanguage } from "../../i18n/languageContext";
import { createMangaProductionTimeLookup } from "../../utils/publicProductionTime";
import ProductionTimeBadge from "../ProductionTimeBadge";

// Presentation only: consumes the Reader's already resolved page numbers and
// language paths. No page calculation, preferences, input handler or preloading.
export default function ReaderPageProductionTimes({ manga, pages, pageNumbers }) {
  const { t } = useLanguage();
  const lookup = useMemo(() => createMangaProductionTimeLookup(manga), [manga]);
  const entries = pageNumbers.map(number => ({ number, time: lookup(pages[number - 1]) })).filter(entry => entry.time);
  if (!entries.length) return null;
  return <span className="reader-production-times" data-reader-production-times>{entries.map(({ number, time }) => (
    <span className="reader-production-times__page" data-production-page={number} key={number}>
      <span aria-hidden="true">{t.productionTime.pageNumber(number)}</span><ProductionTimeBadge time={time} context="page" pageNumber={number} />
    </span>
  ))}</span>;
}
