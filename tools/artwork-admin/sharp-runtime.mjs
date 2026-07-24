import sharp from "sharp";

// libvips peut conserver les fichiers récemment lus dans son cache natif.
// Sous Windows, ces handles empêchent ensuite rename() de déplacer un dossier Manga.
if (process.platform === "win32") sharp.cache({ files: 0 });

export default sharp;
