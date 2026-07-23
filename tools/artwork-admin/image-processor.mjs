import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUTPUT_EXTENSIONS = {
  jpeg: ".jpg",
  png: ".png",
  webp: ".webp",
};

function visualDimensions(metadata) {
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
  };
}

export function normalizeCompression(value = {}) {
  const enabled = value.enabled === true;
  const rawMaxDimension = value.maxDimension;
  let maxDimension = null;
  if (rawMaxDimension !== "original" && rawMaxDimension !== null && rawMaxDimension !== undefined && rawMaxDimension !== "") {
    maxDimension = Number(rawMaxDimension);
    if (!Number.isInteger(maxDimension) || maxDimension < 320 || maxDimension > 12000) {
      throw new Error("La dimension maximale doit être comprise entre 320 et 12000 px.");
    }
  }

  const quality = Number(value.quality ?? 92);
  if (!Number.isInteger(quality) || quality < 60 || quality > 100) {
    throw new Error("La qualité doit être comprise entre 60 et 100.");
  }

  const format = ["original", "webp", "jpeg", "png"].includes(value.format) ? value.format : "original";
  return { enabled, maxDimension, quality, format, preserveMetadata: value.preserveMetadata === true };
}

export async function inspectImage(filePath) {
  const metadata = await sharp(filePath, { animated: true }).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Impossible de lire les dimensions de cette image.");
  }
  return {
    ...visualDimensions(metadata),
    format: metadata.format,
    hasAlpha: metadata.hasAlpha === true,
    pages: metadata.pages || 1,
    animated: (metadata.pages || 1) > 1,
  };
}

function originalFormat(extension) {
  if ([".jpg", ".jpeg"].includes(extension)) return "jpeg";
  return extension.slice(1);
}

export async function processImage(sourcePath, originalName, requestedCompression) {
  const compression = normalizeCompression(requestedCompression);
  const originalBuffer = await readFile(sourcePath);
  const originalExtension = path.extname(originalName).toLowerCase();
  const sourceInfo = await inspectImage(sourcePath);

  if (!compression.enabled) {
    return {
      buffer: originalBuffer,
      extension: originalExtension,
      originalSize: originalBuffer.length,
      outputSize: originalBuffer.length,
      originalWidth: sourceInfo.width,
      originalHeight: sourceInfo.height,
      outputWidth: sourceInfo.width,
      outputHeight: sourceInfo.height,
      originalFormat: sourceInfo.format,
      outputFormat: sourceInfo.format,
      hasAlpha: sourceInfo.hasAlpha,
      warning: "",
    };
  }

  if (sourceInfo.format === "gif") {
    return {
      buffer: originalBuffer,
      extension: originalExtension,
      originalSize: originalBuffer.length,
      outputSize: originalBuffer.length,
      originalWidth: sourceInfo.width,
      originalHeight: sourceInfo.height,
      outputWidth: sourceInfo.width,
      outputHeight: sourceInfo.height,
      originalFormat: sourceInfo.format,
      outputFormat: sourceInfo.format,
      hasAlpha: sourceInfo.hasAlpha,
      warning: sourceInfo.animated
        ? "GIF animé conservé sans compression pour préserver l’animation."
        : "GIF conservé dans son format original pour éviter toute altération.",
    };
  }

  const targetFormat = compression.format === "original" ? originalFormat(originalExtension) : compression.format;
  let pipeline = sharp(sourcePath, { failOn: "error" }).rotate();
  if (compression.maxDimension) {
    pipeline = pipeline.resize({
      width: compression.maxDimension,
      height: compression.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    });
  }
  if (compression.preserveMetadata) pipeline = pipeline.withMetadata();

  if (targetFormat === "jpeg") {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: compression.quality, mozjpeg: true });
  } else if (targetFormat === "png") {
    pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  } else if (targetFormat === "webp") {
    pipeline = pipeline.webp({ quality: compression.quality });
  } else if (targetFormat === "avif") {
    pipeline = pipeline.avif({ quality: compression.quality });
  } else {
    throw new Error(`Le format ${targetFormat.toUpperCase()} ne peut pas être compressé en toute sécurité.`);
  }

  const buffer = await pipeline.toBuffer();
  const outputInfo = await inspectImage(buffer);
  return {
    buffer,
    extension: compression.format === "original" ? originalExtension : OUTPUT_EXTENSIONS[targetFormat],
    originalSize: originalBuffer.length,
    outputSize: buffer.length,
    originalWidth: sourceInfo.width,
    originalHeight: sourceInfo.height,
    outputWidth: outputInfo.width,
    outputHeight: outputInfo.height,
    originalFormat: sourceInfo.format,
    outputFormat: outputInfo.format,
    hasAlpha: sourceInfo.hasAlpha,
    warning: "",
  };
}
