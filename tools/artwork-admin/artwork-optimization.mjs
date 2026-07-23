import { FileTransaction } from "./file-transaction.mjs";

function injectFailure(activePoint, expectedPoint) {
  if (activePoint === expectedPoint) throw new Error(`Échec d’optimisation simulé : ${expectedPoint}`);
}

export async function runOptimizationTransaction({
  oldFile,
  newFile,
  newBuffer,
  trashFile,
  manifestFile,
  manifest,
  nextEntries,
  catalogChanged,
  backupPath,
  writeCatalog,
  restoreCatalog,
  failurePoint = "",
}) {
  const transaction = new FileTransaction();
  let catalogWritten = false;

  try {
    await transaction.move(oldFile, trashFile);
    await transaction.writeExclusive(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    injectFailure(failurePoint, "after-old-move");
    await transaction.writeExclusive(newFile, newBuffer);
    injectFailure(failurePoint, "after-new-install");

    if (catalogChanged) {
      injectFailure(failurePoint, "before-catalog-write");
      await writeCatalog(nextEntries);
      catalogWritten = true;
      injectFailure(failurePoint, "after-catalog-write-invalid");
    }
    transaction.commit();
  } catch (error) {
    const rollbackErrors = [];
    if (catalogWritten) {
      try { await restoreCatalog(backupPath); } catch (restoreError) { rollbackErrors.push(restoreError); }
    }
    try { await transaction.rollback(); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], "L’optimisation a échoué et son rollback est incomplet.");
    }
    throw error;
  }
}
