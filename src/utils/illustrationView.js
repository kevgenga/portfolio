export const ILLUSTRATION_VIEW_STORAGE_KEY = "portfolio-illustration-view";

export const resolveIllustrationView = (value) => value === "compact" ? "compact" : "cards";

export function readIllustrationView(storage) {
  try {
    return resolveIllustrationView((storage ?? globalThis.localStorage)?.getItem(ILLUSTRATION_VIEW_STORAGE_KEY));
  } catch {
    return "cards";
  }
}

export function saveIllustrationView(value, storage) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(ILLUSTRATION_VIEW_STORAGE_KEY, resolveIllustrationView(value));
  } catch {
    // Blocked/full storage must not prevent a visual view change.
  }
}
