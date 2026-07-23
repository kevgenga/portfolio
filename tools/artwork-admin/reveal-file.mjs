import { spawn } from "node:child_process";
import path from "node:path";

export function isPathInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function resolveArtworkFile(projectRoot, assetPath) {
  if (typeof assetPath !== "string" || !assetPath.startsWith("assets/illustration/")) {
    throw new Error("Chemin d’image invalide.");
  }

  const root = path.resolve(projectRoot);
  const illustrationRoot = path.join(root, "public/assets/illustration");
  const target = path.resolve(root, "public", ...assetPath.split("/"));
  if (!isPathInside(root, target) || !isPathInside(illustrationRoot, target)) {
    throw new Error("Le chemin d’image sort du projet.");
  }
  return target;
}

export function buildRevealCommand(filePath, platform = process.platform) {
  const absolutePath = path.resolve(filePath);
  if (platform === "win32") return { command: "explorer.exe", args: ["/select,", absolutePath], mode: "selected" };
  if (platform === "darwin") return { command: "open", args: ["-R", absolutePath], mode: "selected" };
  if (platform === "linux") return { command: "xdg-open", args: [path.dirname(absolutePath)], mode: "opened-folder" };
  throw new Error(`Système non pris en charge : ${platform}`);
}

export function buildRevealFallbackCommand(filePath, platform = process.platform) {
  if (platform !== "win32") return null;
  return {
    command: "explorer.exe",
    args: [path.dirname(path.resolve(filePath))],
    mode: "opened-folder",
  };
}

function spawnCommand(specification, spawnImpl, platform) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(specification.command, specification.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: platform !== "win32",
      });
    } catch (error) {
      reject(error);
      return;
    }
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve(specification);
    });
  });
}

export async function launchReveal(filePath, { platform = process.platform, spawnImpl = spawn } = {}) {
  const absolutePath = path.resolve(filePath);
  const primary = { ...buildRevealCommand(absolutePath, platform), filePath: absolutePath };
  try {
    return await spawnCommand(primary, spawnImpl, platform);
  } catch (selectionError) {
    const fallback = buildRevealFallbackCommand(absolutePath, platform);
    if (!fallback) throw selectionError;
    return spawnCommand({
      ...fallback,
      filePath: absolutePath,
      warning: "Le dossier a été ouvert, mais Windows n’a pas pu sélectionner automatiquement le fichier.",
    }, spawnImpl, platform);
  }
}
