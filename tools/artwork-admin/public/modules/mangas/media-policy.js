export const MANGA_CARD_MEDIA = Object.freeze({
  canonicalField: "banner",
  fallbackField: "cover",
  ratioWidth: 16,
  ratioHeight: 9,
  highQualityWidth: 1600,
  highQualityHeight: 900,
  idealWidth: 1280,
  idealHeight: 720,
  acceptableWidth: 960,
  acceptableHeight: 540,
  minimumWidth: 800,
  minimumHeight: 450,
  ratioConformTolerance: 0.02,
  ratioWarningTolerance: 0.08,
});

export function primaryMangaMedia(manga) {
  if (manga.banner) return { field: "banner", path: manga.banner, fallback: false };
  if (manga.cover) return { field: "cover", path: manga.cover, fallback: true };
  return { field: "banner", path: "", fallback: false };
}

function resolutionAnalysis(width, height) {
  if (width >= 1600 && height >= 900) return { level: "success", label: "Haute qualité", warning: "" };
  if (width >= 1280 && height >= 720) return { level: "success", label: "Taille idéale", warning: "" };
  if (width >= 960 && height >= 540) return { level: "success", label: "Qualité correcte", warning: "" };
  if (width >= 800 && height >= 450) return { level: "warning", label: "Qualité minimale acceptable", warning: "L’image reste utilisable, mais peut être légèrement moins nette sur les grands écrans ou les écrans haute densité." };
  return { level: "error", label: "Image trop petite", warning: "Utilisez au minimum 800 × 450 px pour éviter une perte de netteté." };
}

function ratioAnalysis(width, height) {
  const ratio = width / height;
  const target = 16 / 9;
  const difference = Math.abs(ratio - target) / target;
  if (difference <= 0.02) return { level: "success", label: "Conforme", difference, ratio, warning: "" };
  if (difference <= 0.08) return { level: "warning", label: "Légèrement différent : recadrage possible", difference, ratio, warning: "Les bords peuvent être légèrement recadrés." };
  return { level: "error", label: "Ratio fortement incorrect", difference, ratio, warning: "Le recadrage 16:9 sera important." };
}

export function analyzeMangaCardMedia(details) {
  if (!details || details.missing || !details.width || !details.height) {
    const missing = { level: "error", label: "Média absent", warning: "Ajoutez une image principale." };
    return { level: "error", label: "Média absent", ratio: null, resolution: missing, ratioStatus: missing };
  }
  const resolution = resolutionAnalysis(details.width, details.height);
  const ratioStatus = ratioAnalysis(details.width, details.height);
  const level = resolution.level === "error" || ratioStatus.level === "error" ? "error" : resolution.level === "warning" || ratioStatus.level === "warning" ? "warning" : "success";
  const label = level === "success" ? "Prête pour la carte manga" : level === "warning" ? "Utilisable avec avertissement" : "À corriger de préférence";
  return { level, label, ratio: ratioStatus.ratio, resolution, ratioStatus };
}
