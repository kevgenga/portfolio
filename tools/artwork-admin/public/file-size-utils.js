const FILE_SIZE_UNITS = ["o", "Ko", "Mo", "Go"];

function formatDecimal(value) {
  return value.toFixed(1).replace(".", ",");
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Indisponible";

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) return `${Math.round(value)} ${FILE_SIZE_UNITS[unitIndex]}`;
  return `${formatDecimal(value)} ${FILE_SIZE_UNITS[unitIndex]}`;
}
