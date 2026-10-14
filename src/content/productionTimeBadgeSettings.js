// Presentation only. Thresholds are minutes; no recorded duration is changed.
// medium: first amber minute; long: first muted-red minute.
export const productionTimeBadgeSettings = Object.freeze({
  colorMode: "tiered", // "tiered" | "neutral" (Illustration cards only)
  placement: "top-right", // "top-right" | "bottom-right" | "metadata"
  thresholds: Object.freeze({ medium: 120, long: 240 }),
});
