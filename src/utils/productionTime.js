// Pure metadata helpers shared by Node and the local Admin. No media processing.
export function validateProductionTime(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== 2
    || !Object.hasOwn(value, "minutes") || !Object.hasOwn(value, "kind")
    || !Number.isSafeInteger(value.minutes) || value.minutes <= 0
    || !["actual", "estimated"].includes(value.kind)) {
    throw new Error("Temps invalide : minutes entières positives et type mesuré ou estimé requis.");
  }
  return { minutes: value.minutes, kind: value.kind };
}

export function productionTimeFromInputs(hours, minutes, kind, current) {
  // Empty inputs never delete an existing time. Clearing is an explicit action.
  if (hours === "" && minutes === "") {
    return current === undefined ? undefined : validateProductionTime({ ...current, kind });
  }
  const integer = (input) => typeof input === "string" && /^\d+$/.test(input)
    && Number.isSafeInteger(Number(input));
  if (!integer(hours) || !integer(minutes) || Number(minutes) > 59) {
    throw new Error("Saisissez des heures entières ≥ 0 et des minutes entre 0 et 59.");
  }
  return validateProductionTime({ minutes: Number(hours) * 60 + Number(minutes), kind });
}

export function splitProductionTime(value) {
  if (value === undefined) return { hours: "", minutes: "", kind: "actual" };
  const time = validateProductionTime(value);
  return { hours: String(Math.floor(time.minutes / 60)), minutes: String(time.minutes % 60), kind: time.kind };
}

export function applyProductionTimePatch(artwork, payload) {
  const next = { ...artwork };
  if (!Object.hasOwn(payload, "productionTime")) return next;
  if (payload.productionTime === null) delete next.productionTime;
  else next.productionTime = validateProductionTime(payload.productionTime);
  return next;
}
