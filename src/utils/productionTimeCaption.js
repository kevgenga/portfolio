import { getProductionTimePresentation } from "./publicProductionTime";

// Fancybox accepts an HTMLElement caption. Build text nodes, not HTML strings:
// dates and catalog values cannot inject markup; no react-dom/server bundle.
export function createProductionTimeCaption(date, time, groups, locale, text) {
  const individual = getProductionTimePresentation(time, locale, text);
  const collective = (groups || []).map(group => getProductionTimePresentation(group.time, locale, text, "group", { memberCount: group.memberCount })).filter(Boolean);
  if (!individual && !collective.length) return date;
  const root = document.createElement("div"); root.className = "portfolio-lightbox-metadata";
  if (date) { const node = document.createElement("span"); node.textContent = date; root.append(node); }
  const append = (parent, value, context) => {
    const node = document.createElement("span"); node.className = "production-time production-time--detailed";
    node.dataset.productionKind = value.kind; node.dataset.productionContext = context;
    const label = document.createElement("span"); label.className = "production-time__label"; label.textContent = value.label;
    const display = document.createElement("span"); display.className = "production-time__value";
    display.textContent = `${value.prefix ? `${value.prefix} · ` : ""}${value.display}${value.measured ? ` — ${value.measured}` : ""}`;
    const copy = document.createElement("span"); copy.append(label, display); node.append(copy); parent.append(node);
  };
  if (individual) append(root, individual, "individual");
  if (collective.length) {
    const details = document.createElement("details"); details.className = "portfolio-lightbox-metadata__group-details";
    const summary = document.createElement("summary"); summary.textContent = text.groupSummary(collective.length);
    const secondary = document.createElement("div"); secondary.className = "portfolio-lightbox-metadata__groups";
    for (const group of collective) append(secondary, group, "group");
    details.append(summary, secondary); root.append(details);
  }
  return root;
}
