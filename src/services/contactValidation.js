import { disposableEmailDomains } from "../data/disposableEmailDomains.js";

export const CONTACT_RATE_LIMIT_KEY = "kevgenga-contact-submissions-v1";
export const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const CONTACT_RATE_LIMIT_MAX = 3;
export const CONTACT_MINIMUM_SUBMIT_DELAY_MS = 2000;

const RESERVED_EMAIL_TLDS = new Set([
  "example",
  "invalid",
  "local",
  "localhost",
  "test",
]);
const URL_SHORTENERS = new Set([
  "bit.ly",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "tinyurl.com",
]);
const LOW_VALUE_MESSAGES = new Set([
  "123456",
  "aaaaaaaa",
  "bonjour",
  "hello",
  "loremipsum",
  "salut",
  "test",
  "xxxxxxxx",
]);
const LOW_VALUE_EMAIL_TOKENS = new Set([
  "aaa",
  "fake",
  "fakemail",
  "invalid",
  "test",
]);
const KEYBOARD_SEQUENCES = [
  "asdfghjkl",
  "qwertyuiop",
  "zxcvbnm",
];
const ABUSIVE_TERMS = [
  "asshole",
  "bitch",
  "connard",
  "connasse",
  "cunt",
  "encule",
  "enculer",
  "fuck",
  "fucking",
  "motherfucker",
  "pute",
  "salope",
  "shit",
];

const disposableDomains = new Set(disposableEmailDomains);

function graphemes(value) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].map(({ segment }) => segment);
  }
  return Array.from(value);
}

export function countUnicodeCharacters(value) {
  return graphemes(value).length;
}

export function normalizeContactName(value = "") {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeContactMessage(value = "") {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/gu, " ").trimEnd())
    .join("\n")
    .trim();
}

function isExcessiveSingleCharacter(value, minimumLength = 8) {
  const useful = graphemes(value.normalize("NFKC"))
    .filter((character) => /[\p{L}\p{M}\p{N}]/u.test(character));
  return useful.length >= minimumLength && new Set(useful.map((character) => character.toLocaleLowerCase())).size === 1;
}

function isRepeatedSequence(value) {
  const compact = graphemes(
    value.normalize("NFKC").toLocaleLowerCase(),
  ).filter((character) => /[\p{L}\p{M}\p{N}]/u.test(character));

  if (compact.length < 8) return false;
  const joined = compact.join("");
  const maximumUnitLength = Math.min(12, Math.floor(compact.length / 3));

  for (let unitLength = 1; unitLength <= maximumUnitLength; unitLength += 1) {
    if (compact.length % unitLength !== 0) continue;
    const unit = compact.slice(0, unitLength).join("");
    if (unit.repeat(compact.length / unitLength) === joined) return true;
  }
  return false;
}

function repeatsOneWordExcessively(value) {
  const words = value.toLocaleLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  if (words.length < 6) return false;

  const counts = new Map();
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
  return Math.max(...counts.values()) / words.length >= 0.8;
}

function abusiveTermPattern(term) {
  const characters = Array.from(term);
  const pattern = characters
    .map((character) => `${character}+(?:[\\s.*_\\-]*)`)
    .join("");
  return new RegExp(`(?:^|[^a-z])${pattern}(?=$|[^a-z])`, "u");
}

const abusivePatterns = ABUSIVE_TERMS.map(abusiveTermPattern);

export function containsAbusiveLanguage(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en");
  return abusivePatterns.some((pattern) => pattern.test(normalized));
}

function normalizedEmailToken(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isRepeatedEmailToken(value) {
  const characters = Array.from(value);
  return characters.length >= 3 && new Set(characters).size === 1;
}

function hasExplicitAbusiveEmailToken(value) {
  return value
    .split(/[.@+_-]+/u)
    .filter(Boolean)
    .some((token) => containsAbusiveLanguage(token));
}

function normalizeEmailDomain(domain) {
  try {
    return new URL(`http://${domain}`).hostname.toLocaleLowerCase("en");
  } catch {
    return "";
  }
}

export function isDisposableEmailDomain(domain) {
  const normalized = normalizeEmailDomain(domain);
  return [...disposableDomains].some(
    (disposableDomain) =>
      normalized === disposableDomain || normalized.endsWith(`.${disposableDomain}`),
  );
}

export function validateContactEmail(value = "") {
  const email = value.trim();
  if (!email) return "required";
  if (countUnicodeCharacters(email) > 254 || /\s/u.test(email)) return "emailInvalid";

  const parts = email.split("@");
  if (parts.length !== 2) return "emailInvalid";
  const [localPart, rawDomain] = parts;
  if (!localPart || !rawDomain || countUnicodeCharacters(localPart) > 64) {
    return "emailInvalid";
  }
  if (
    localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
    || !/^[\p{L}\p{M}\p{N}.!#$%&'*+/=?^_`{|}~-]+$/u.test(localPart)
  ) {
    return "emailInvalid";
  }

  const domain = normalizeEmailDomain(rawDomain);
  if (!domain || domain === "localhost" || domain.length > 253) return "emailInvalid";
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => (
    !label
    || label.length > 63
    || label.startsWith("-")
    || label.endsWith("-")
    || !/^[a-z0-9-]+$/u.test(label)
  ))) {
    return "emailInvalid";
  }

  const topLevelDomain = labels.at(-1);
  if (
    topLevelDomain.length < 2
    || /^\d+$/u.test(topLevelDomain)
    || RESERVED_EMAIL_TLDS.has(topLevelDomain)
  ) {
    return "emailInvalid";
  }

  if (
    hasExplicitAbusiveEmailToken(localPart)
    || hasExplicitAbusiveEmailToken(domain)
  ) {
    return "emailUnprofessional";
  }

  const localToken = normalizedEmailToken(localPart);
  const domainNameToken = normalizedEmailToken(labels.at(-2));
  if (
    isRepeatedEmailToken(topLevelDomain)
    || (
      localToken === domainNameToken
      && (
        LOW_VALUE_EMAIL_TOKENS.has(localToken)
        || isRepeatedEmailToken(localToken)
      )
    )
  ) {
    return "emailUnprofessional";
  }

  return isDisposableEmailDomain(domain) ? "emailDisposable" : null;
}

function extractUrls(value) {
  const withoutEmails = value.replace(
    /[\p{L}\p{M}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{M}\p{N}.-]+/gu,
    " ",
  );
  return withoutEmails.match(
    /\b(?:(?:https?:\/\/|www\.)[^\s<>"']+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>"']*)?)/giu,
  ) || [];
}

function urlHostname(value) {
  const withoutTrailingPunctuation = value.replace(/[),.;:!?]+$/u, "");
  try {
    return new URL(
      /^https?:\/\//iu.test(withoutTrailingPunctuation)
        ? withoutTrailingPunctuation
        : `https://${withoutTrailingPunctuation.replace(/^www\./iu, "")}`,
    ).hostname.toLocaleLowerCase("en");
  } catch {
    return "";
  }
}

function isLikelyLatinGibberish(value) {
  const letters = value.match(/\p{L}/gu) || [];
  if (letters.length < 20) return false;
  if (letters.some((letter) => !/\p{Script=Latin}/u.test(letter))) return false;

  const latinTokens = value.match(/[\p{Script=Latin}\p{M}]+/gu) || [];
  if (!latinTokens.length) return false;

  const normalizedTokens = latinTokens.map((token) =>
    token.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("en"));
  const tokensWithoutVowels = normalizedTokens.filter((token) => !/[aeiouy]/u.test(token));
  const vowelFreeRatio = tokensWithoutVowels.length / normalizedTokens.length;
  const normalizedLetters = normalizedTokens.join("");
  if (KEYBOARD_SEQUENCES.some((sequence) => (
    normalizedLetters.length >= sequence.length * 2
    && normalizedLetters === sequence.repeat(normalizedLetters.length / sequence.length)
  ))) {
    return true;
  }
  const uniqueCharacterRatio = new Set(normalizedLetters).size / normalizedLetters.length;
  const counts = new Map();
  for (const character of normalizedLetters) {
    counts.set(character, (counts.get(character) || 0) + 1);
  }
  const dominantCharacterRatio = Math.max(...counts.values()) / normalizedLetters.length;
  const hasLongUnbrokenToken = normalizedTokens.length === 1
    && normalizedLetters.length >= 18;
  const hasLowCharacterDiversity = uniqueCharacterRatio < 0.35
    || dominantCharacterRatio > 0.35;

  return (
    hasLongUnbrokenToken
    && (vowelFreeRatio === 1 || hasLowCharacterDiversity)
  ) || (
    normalizedTokens.length <= 3
    && vowelFreeRatio >= 0.75
    && hasLowCharacterDiversity
  );
}

export function validateContactName(value = "") {
  const name = normalizeContactName(value);
  if (!name) return "required";
  if (countUnicodeCharacters(name) > 80) return "nameInvalid";
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return "nameInvalid";
  if (!/\p{L}/u.test(name)) return "nameInvalid";
  if (isExcessiveSingleCharacter(name)) return "nameInvalid";
  if (containsAbusiveLanguage(name)) return "abusive";

  const usefulCharacters = graphemes(name).filter((character) =>
    /[\p{L}\p{M}\p{N}]/u.test(character));
  if (usefulCharacters.length < 2 && !/^\p{L}\p{M}*$/u.test(name)) {
    return "nameInvalid";
  }
  return null;
}

export function validateContactMessage(value = "") {
  const message = normalizeContactMessage(value);
  if (!message) return "required";

  const length = countUnicodeCharacters(message);
  if (length < 20) return "messageTooShort";
  if (length > 3000) return "messageTooLong";
  if (!/\p{L}/u.test(message)) return "messageMeaningless";
  if (
    isExcessiveSingleCharacter(message)
    || isRepeatedSequence(message)
    || repeatsOneWordExcessively(message)
    || isLikelyLatinGibberish(message)
  ) {
    return "messageMeaningless";
  }

  const simplified = message
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
  if (LOW_VALUE_MESSAGES.has(simplified)) return "messageMeaningless";
  if (containsAbusiveLanguage(message)) return "abusive";

  const urls = extractUrls(message);
  if (urls.some((url) => URL_SHORTENERS.has(urlHostname(url)))) {
    return "urlShortener";
  }
  if (urls.length > 1) return "tooManyLinks";
  return null;
}

export function validateContactForm(formData) {
  const values = {
    name: normalizeContactName(formData.name),
    email: formData.email.trim(),
    message: normalizeContactMessage(formData.message),
  };
  const errors = {};

  const nameError = validateContactName(values.name);
  const emailError = validateContactEmail(values.email);
  const messageError = validateContactMessage(values.message);
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (messageError) errors.message = messageError;

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    values,
  };
}

function readRecentSubmissionTimestamps(storage, now) {
  if (!storage) return [];

  try {
    const parsed = JSON.parse(storage.getItem(CONTACT_RATE_LIMIT_KEY) || "[]");
    if (!Array.isArray(parsed)) throw new TypeError("Invalid submission history.");

    const recent = parsed.filter((timestamp) => (
      Number.isFinite(timestamp)
      && timestamp <= now
      && timestamp > now - CONTACT_RATE_LIMIT_WINDOW_MS
    ));
    storage.setItem(CONTACT_RATE_LIMIT_KEY, JSON.stringify(recent));
    return recent;
  } catch {
    try {
      storage.removeItem(CONTACT_RATE_LIMIT_KEY);
    } catch {
      // Storage can be unavailable in private or restricted browsing contexts.
    }
    return [];
  }
}

export function isContactRateLimited(storage, now = Date.now()) {
  return readRecentSubmissionTimestamps(storage, now).length >= CONTACT_RATE_LIMIT_MAX;
}

export function recordAcceptedContactSubmission(storage, now = Date.now()) {
  if (!storage) return;
  const recent = readRecentSubmissionTimestamps(storage, now);
  try {
    storage.setItem(CONTACT_RATE_LIMIT_KEY, JSON.stringify([...recent, now]));
  } catch {
    // The form remains usable when localStorage is unavailable.
  }
}

export function validateContactSubmissionProtections({
  companyWebsite = "",
  gotcha = "",
  formAvailableAt,
  now = Date.now(),
  storage = null,
}) {
  if (companyWebsite.trim() || gotcha.trim()) return "automated";
  if (!Number.isFinite(formAvailableAt) || now - formAvailableAt < CONTACT_MINIMUM_SUBMIT_DELAY_MS) {
    return "tooFast";
  }
  return isContactRateLimited(storage, now) ? "rateLimited" : null;
}

export function createSubmissionGuard() {
  let isLocked = false;
  return {
    acquire() {
      if (isLocked) return false;
      isLocked = true;
      return true;
    },
    release() {
      isLocked = false;
    },
    isLocked() {
      return isLocked;
    },
  };
}
