import { createHash, randomUUID } from "node:crypto";
import {
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  parseMangaCatalog,
  serializeMangaCatalog,
  validateMangaCatalog,
} from "./catalog.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../../..");
const assetRoot = path.join(projectRoot, "public/assets/mangaka");
const catalogPath = path.join(projectRoot, "src/content/mangas.js");
const stagingRoot = path.resolve(process.argv[2] || "");
const backupRoot = path.resolve(process.argv[3] || "");

const projects = [
  { slug: "legend-of-animiste", storyboardSlug: "legend-of-animiste-storyboard-test" },
  { slug: "ahes", storyboardSlug: "ahes-storyboard-test" },
];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

async function verifyCopy(source, copy) {
  const sourceFiles = await files(source);
  const copyFiles = await files(copy);
  ensure(sourceFiles.length === copyFiles.length, `Nombre de fichiers différent pour ${path.basename(source)}.`);
  for (const sourceFile of sourceFiles) {
    const relative = path.relative(source, sourceFile);
    const copyFile = path.join(copy, relative);
    ensure(await exists(copyFile), `Copie manquante : ${relative}.`);
    const [sourceHash, copyHash] = await Promise.all([
      readFile(sourceFile).then(hash),
      readFile(copyFile).then(hash),
    ]);
    ensure(sourceHash === copyHash, `Hash différent : ${relative}.`);
  }
}

function rewritePaths(manga, previousPrefix, nextPrefix) {
  const output = structuredClone(manga);
  for (const field of ["cover", "banner", "thumbnail", "presentation"]) {
    if (output[field]?.startsWith(`${previousPrefix}/`)) {
      output[field] = `${nextPrefix}${output[field].slice(previousPrefix.length)}`;
    }
  }
  for (const language of Object.values(output.languages)) {
    language.pages = language.pages.map((page) =>
      page.startsWith(`${previousPrefix}/`)
        ? `${nextPrefix}${page.slice(previousPrefix.length)}`
        : page);
  }
  return output;
}

async function validatePhysical(catalog) {
  for (const manga of catalog) {
    const references = [
      manga.cover,
      manga.banner,
      manga.thumbnail,
      manga.presentation,
      ...Object.values(manga.languages).flatMap((language) => language.pages),
    ].filter(Boolean);
    for (const relative of references) {
      const target = path.join(projectRoot, "public", ...relative.split("/"));
      ensure((await stat(target)).isFile(), `Fichier migré invalide : ${relative}.`);
    }
  }
}

async function writeAtomic(content) {
  const temporary = `${catalogPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: "wx" });
  try {
    await rename(temporary, catalogPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

ensure(process.argv[2] && process.argv[3], "Usage : node migrate-presentation-sections.mjs <staging> <backup>.");
ensure(await exists(stagingRoot), "Staging de migration introuvable.");
ensure(await exists(backupRoot), "Sauvegarde de migration introuvable.");
ensure((await realpath(stagingRoot)).startsWith(await realpath(path.join(projectRoot, "tools/artwork-admin/staging"))), "Staging hors du dossier autorisé.");
ensure((await realpath(backupRoot)).startsWith(await realpath(path.join(projectRoot, "tools/artwork-admin/backups"))), "Sauvegarde hors du dossier autorisé.");

const originalSource = await readFile(catalogPath, "utf8");
const backupSource = await readFile(path.join(backupRoot, "mangas.js"), "utf8");
ensure(hash(originalSource) === hash(backupSource), "Le catalogue a changé depuis la sauvegarde de migration.");
const originalCatalog = parseMangaCatalog(originalSource);
ensure(originalCatalog.length === 3, `La migration attend 3 mangas, catalogue actuel : ${originalCatalog.length}.`);
ensure(projects.every(({ slug }) => originalCatalog.some((manga) => manga.slug === slug)), "Un projet attendu manque dans le catalogue.");

const completedStage = path.join(stagingRoot, "completed-manga");
const storyboardStage = path.join(stagingRoot, "complete-storyboards");
const completedTarget = path.join(assetRoot, "completed-manga");
const storyboardTarget = path.join(assetRoot, "complete-storyboards");
ensure(!await exists(completedTarget) && !await exists(storyboardTarget), "Une racine Manga cible existe déjà.");

for (const { slug, storyboardSlug } of projects) {
  const source = path.join(assetRoot, slug);
  await verifyCopy(source, path.join(completedStage, slug));
  await verifyCopy(source, path.join(storyboardStage, storyboardSlug));
}

const completedCatalog = originalCatalog.map((manga) => {
  const previousPrefix = `assets/mangaka/${manga.slug}`;
  const nextPrefix = `assets/mangaka/completed-manga/${manga.slug}`;
  return {
    ...rewritePaths(manga, previousPrefix, nextPrefix),
    presentationSection: "completed",
  };
});

const storyboardCatalog = completedCatalog.map((manga) => {
  const mapping = projects.find((project) => project.slug === manga.slug);
  const previousPrefix = `assets/mangaka/completed-manga/${manga.slug}`;
  const nextPrefix = `assets/mangaka/complete-storyboards/${mapping.storyboardSlug}`;
  return {
    ...rewritePaths(manga, previousPrefix, nextPrefix),
    id: mapping.storyboardSlug,
    slug: mapping.storyboardSlug,
    route: `/mangas/${mapping.storyboardSlug}`,
    presentationSection: "storyboard",
    isTemporaryExample: true,
  };
});

const migratedCatalog = [...completedCatalog, ...storyboardCatalog];
validateMangaCatalog(migratedCatalog);

let completedInstalled = false;
let storyboardInstalled = false;
try {
  await rename(completedStage, completedTarget);
  completedInstalled = true;
  await rename(storyboardStage, storyboardTarget);
  storyboardInstalled = true;
  await validatePhysical(migratedCatalog);
  await writeAtomic(serializeMangaCatalog(migratedCatalog));
  const reloaded = parseMangaCatalog(await readFile(catalogPath, "utf8"));
  validateMangaCatalog(reloaded);
  await validatePhysical(reloaded);
  await rm(stagingRoot, { recursive: true, force: true });
  console.log(`Migration préparée : ${reloaded.length} objets Manga, ${await files(completedTarget).then((items) => items.length)} fichiers Completed, ${await files(storyboardTarget).then((items) => items.length)} fichiers Storyboards.`);
} catch (error) {
  await writeAtomic(originalSource).catch(() => undefined);
  if (storyboardInstalled && await exists(storyboardTarget)) {
    await rename(storyboardTarget, storyboardStage).catch(() => undefined);
  }
  if (completedInstalled && await exists(completedTarget)) {
    await rename(completedTarget, completedStage).catch(() => undefined);
  }
  throw error;
}
