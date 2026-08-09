export const MANGA_CARD_MEDIA = Object.freeze({
  ratioWidth: 3,
  ratioHeight: 4,
  highQualityWidth: 1200,
  highQualityHeight: 1600,
  idealWidth: 900,
  idealHeight: 1200,
  acceptableWidth: 750,
  acceptableHeight: 1000,
  minimumWidth: 600,
  minimumHeight: 800,
  ratioConformTolerance: 0.02,
  ratioWarningTolerance: 0.08,
});

function resolutionAnalysis(width, height) {
  if (width >= MANGA_CARD_MEDIA.highQualityWidth && height >= MANGA_CARD_MEDIA.highQualityHeight) return { level: "success", label: "Haute qualité", warning: "" };
  if (width >= MANGA_CARD_MEDIA.idealWidth && height >= MANGA_CARD_MEDIA.idealHeight) return { level: "success", label: "Taille idéale", warning: "" };
  if (width >= MANGA_CARD_MEDIA.acceptableWidth && height >= MANGA_CARD_MEDIA.acceptableHeight) return { level: "success", label: "Qualité correcte", warning: "" };
  if (width >= MANGA_CARD_MEDIA.minimumWidth && height >= MANGA_CARD_MEDIA.minimumHeight) return { level: "warning", label: "Qualité minimale acceptable", warning: "L’image reste utilisable, mais peut être légèrement moins nette sur les grands écrans ou les écrans haute densité." };
  return { level: "error", label: "Image trop petite", warning: `Utilisez au minimum ${MANGA_CARD_MEDIA.minimumWidth} × ${MANGA_CARD_MEDIA.minimumHeight} px pour éviter une perte de netteté.` };
}

function ratioAnalysis(width, height) {
  const ratio = width / height;
  const target = MANGA_CARD_MEDIA.ratioWidth / MANGA_CARD_MEDIA.ratioHeight;
  const difference = Math.abs(ratio - target) / target;
  if (difference <= MANGA_CARD_MEDIA.ratioConformTolerance) return { level: "success", label: "Conforme", difference, ratio, warning: "" };
  if (difference <= MANGA_CARD_MEDIA.ratioWarningTolerance) return { level: "warning", label: "Légèrement différent : recadrage possible", difference, ratio, warning: "Les bords peuvent être légèrement recadrés." };
  return { level: "error", label: "Ratio fortement incorrect", difference, ratio, warning: `Le recadrage ${MANGA_CARD_MEDIA.ratioWidth}:${MANGA_CARD_MEDIA.ratioHeight} sera important.` };
}

export function analyzeMangaCardMedia(details) {
  if (!details || details.missing || !details.width || !details.height) {
    const missing = { level: "error", label: "Média absent", warning: "Ajoutez une image de carte Manga." };
    return { level: "error", label: "Média absent", ratio: null, resolution: missing, ratioStatus: missing };
  }
  const resolution = resolutionAnalysis(details.width, details.height);
  const ratioStatus = ratioAnalysis(details.width, details.height);
  const level = resolution.level === "error" || ratioStatus.level === "error" ? "error" : resolution.level === "warning" || ratioStatus.level === "warning" ? "warning" : "success";
  const label = level === "success" ? "Prête pour la carte manga" : level === "warning" ? "Utilisable avec avertissement" : "À corriger de préférence";
  return { level, label, ratio: ratioStatus.ratio, resolution, ratioStatus };
}
