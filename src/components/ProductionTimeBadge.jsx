import { useLanguage } from "../i18n/languageContext";
import { getProductionTimePresentation, getProductionTimeBadgeAppearance } from "../utils/publicProductionTime";
import "./ProductionTimeBadge.css";

const Clock = () => <svg className="production-time__clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></svg>;

export default function ProductionTimeBadge({ time, context = "individual", variant = "compact", pageNumber, memberCount, appearance }) {
  const { locale, t } = useLanguage();
  const value = getProductionTimePresentation(time, locale, t.productionTime, context, { pageNumber, memberCount });
  if (!value) return null;
  const artwork = variant === "artwork" && context === "individual";
  const style = artwork ? appearance || getProductionTimeBadgeAppearance(time) : null;
  const label = t.productionTime.compact[context]?.[value.kind] || value.label;
  return (
    <span className={`production-time production-time--${variant}${artwork ? ` work-badge work-badge--${style.tier}` : ""}`} data-production-kind={value.kind} data-production-context={context} data-badge-placement={style?.placement}>
      {artwork ? <>
        <span className="sr-only">{value.accessible}</span>
        <span className="work-badge__copy" aria-hidden="true">
          <span className="work-badge__label">{label}</span>
          <span className="work-badge__duration"><Clock /><span>{value.display}</span></span>
        </span>
      </> : variant === "compact" ? <>
        <Clock /><span className="sr-only">{value.accessible}</span>
        <span aria-hidden="true">{label}{t.productionTime.separator}{value.display}</span>
      </> : <><Clock />
        <span><span className="production-time__label">{value.label}</span><span className="production-time__value">{value.prefix ? `${value.prefix} · ` : ""}{value.display}{value.measured ? ` — ${value.measured}` : ""}</span></span>
      </>}
    </span>
  );
}
