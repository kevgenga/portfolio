import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_MINIMUM_SUBMIT_DELAY_MS,
  CONTACT_RATE_LIMIT_KEY,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  createSubmissionGuard,
  isContactRateLimited,
  normalizeContactMessage,
  recordAcceptedContactSubmission,
  validateContactEmail,
  validateContactForm,
  validateContactMessage,
  validateContactName,
  validateContactSubmissionProtections,
} from "./contactValidation.js";

function createStorage(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(CONTACT_RATE_LIMIT_KEY, initialValue);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("accepts international names and artist pseudonyms", () => {
  for (const name of [
    "Kevin Lao",
    "AZN Kev",
    "山田太郎",
    "ケブゲンガ",
    "김민수",
    "王小明",
    "สมชาย",
    "محمد علي",
    "Олександр",
    "Γεώργιος",
    "Artist_27",
    "X",
  ]) {
    assert.equal(validateContactName(name), null, name);
  }
});

test("rejects unusable names without aggressively rejecting ordinary names", () => {
  assert.equal(validateContactName("."), "nameInvalid");
  assert.equal(validateContactName("111111111"), "nameInvalid");
  assert.equal(validateContactName("!!!!!!"), "nameInvalid");
  assert.equal(validateContactName("😀😀😀😀"), "nameInvalid");
  assert.equal(validateContactName("aaaaaaaaaaaaa"), "nameInvalid");
  assert.equal(validateContactName("Test"), null);
  assert.equal(validateContactName("ABC"), null);
});

test("validates professional email structure", () => {
  assert.equal(validateContactEmail("artist@example.com"), null);
  assert.equal(validateContactEmail(`${"a".repeat(60)}@example.com`), null);
  assert.equal(validateContactEmail("artist @example.com"), "emailInvalid");
  assert.equal(validateContactEmail("artist@@example.com"), "emailInvalid");
  assert.equal(validateContactEmail("artist@localhost"), "emailInvalid");
  assert.equal(validateContactEmail("artist@example.invalid"), "emailInvalid");
  assert.equal(validateContactEmail("artist@example.1"), "emailInvalid");
  assert.equal(validateContactEmail("fuck@fuck.fr"), "emailUnprofessional");
  assert.equal(validateContactEmail("FUCK@FUCK.FR"), "emailUnprofessional");
  assert.equal(validateContactEmail("test@test.test"), "emailInvalid");
  assert.equal(validateContactEmail("aaa@aaa.aaa"), "emailUnprofessional");
  assert.equal(validateContactEmail("contact@studio-manga.com"), null);
  assert.equal(validateContactEmail("artist@example.co.jp"), null);
  assert.equal(validateContactEmail("contact@scunthorpe-studio.com"), null);
});

test("detects disposable email domains case-insensitively", () => {
  assert.equal(validateContactEmail("artist@mailinator.com"), "emailDisposable");
  assert.equal(validateContactEmail("artist@YOPMAIL.COM"), "emailDisposable");
  assert.equal(validateContactEmail("artist@sub.guerrillamail.com"), "emailDisposable");
});

test("validates meaningful Unicode messages and preserves line breaks", () => {
  const professional = "Hello,\nI would like to discuss an illustration commission for a publishing project.";
  assert.equal(validateContactMessage(professional), null);
  assert.equal(
    normalizeContactMessage("Hello,   artist.\r\nSecond   line."),
    "Hello, artist.\nSecond line.",
  );
  assert.equal(validateContactMessage("この漫画プロジェクトについて詳しく相談したいです。"), null);
  assert.equal(validateContactMessage("مرحباً، أود التحدث معك بشأن مشروع فني."), null);
  assert.equal(validateContactMessage("sqfdsfsdfsfsfsfdsfdsdss"), "messageMeaningless");
  assert.equal(validateContactMessage("asdasdasdasdasdasdasd"), "messageMeaningless");
  assert.equal(validateContactMessage("qwertyuiopqwertyuiop"), "messageMeaningless");
  assert.equal(
    validateContactMessage("Manga project enquiry for publication."),
    null,
  );
  assert.equal(validateContactMessage("Hello"), "messageTooShort");
  assert.equal(validateContactMessage("a".repeat(3001)), "messageTooLong");
  assert.equal(validateContactMessage("...................."), "messageMeaningless");
  assert.equal(validateContactMessage("abcabcabcabcabcabcabcabc"), "messageMeaningless");
  assert.equal(
    validateContactMessage("project project project project project project project"),
    "messageMeaningless",
  );
});

test("detects a small controlled set of abusive terms and simple obfuscations", () => {
  for (const message of [
    "This request contains fuck and should be rejected.",
    "This request contains f u c k and should be rejected.",
    "This request contains f.u.c.k and should be rejected.",
    "This request contains f-u-c-k and should be rejected.",
  ]) {
    assert.equal(validateContactMessage(message), "abusive");
  }
  assert.equal(
    validateContactMessage("I have professional feedback about the classical composition and its contrast."),
    null,
  );
});

test("allows one direct link but rejects multiple links and shorteners", () => {
  assert.equal(
    validateContactMessage("Please review my project details and portfolio presentation."),
    null,
  );
  assert.equal(
    validateContactMessage("Please review my portfolio at https://example.com/portfolio for this project."),
    null,
  );
  assert.equal(
    validateContactMessage("Please review https://example.com and https://example.org for this project."),
    "tooManyLinks",
  );
  assert.equal(
    validateContactMessage("Please review my complete project presentation at https://bit.ly/example."),
    "urlShortener",
  );
  assert.equal(
    validateContactMessage("You can reply to artist@example.com about this professional project."),
    null,
  );
});

test("returns field-specific validation errors and normalized values", () => {
  const result = validateContactForm({
    name: "  Kevin   Lao  ",
    email: "artist@mailinator.com",
    message: "Hello",
  });
  assert.deepEqual(result.errors, {
    email: "emailDisposable",
    message: "messageTooShort",
  });
  assert.equal(result.values.name, "Kevin Lao");
  assert.equal(result.isValid, false);
});

test("does not call Formspree when frontend validation fails", async () => {
  let requestCount = 0;
  const validation = validateContactForm({
    name: "test",
    email: "fuck@fuck.fr",
    message: "texte aléatoire sans signification",
  });

  if (validation.isValid) requestCount += 1;
  assert.equal(validation.isValid, false);
  assert.equal(validation.errors.email, "emailUnprofessional");
  assert.equal(requestCount, 0);
});

test("rejects filled honeypots and submissions made too quickly", () => {
  const now = 1_000_000;
  assert.equal(validateContactSubmissionProtections({
    companyWebsite: "spam.example",
    formAvailableAt: now - 10_000,
    now,
  }), "automated");
  assert.equal(validateContactSubmissionProtections({
    gotcha: "spam",
    formAvailableAt: now - 10_000,
    now,
  }), "automated");
  assert.equal(validateContactSubmissionProtections({
    formAvailableAt: now - CONTACT_MINIMUM_SUBMIT_DELAY_MS + 1,
    now,
  }), "tooFast");
  assert.equal(validateContactSubmissionProtections({
    formAvailableAt: now - CONTACT_MINIMUM_SUBMIT_DELAY_MS,
    now,
  }), null);
});

test("limits only accepted submissions to three per rolling window", () => {
  const storage = createStorage();
  const now = 2_000_000;
  assert.equal(isContactRateLimited(storage, now), false);
  recordAcceptedContactSubmission(storage, now - 3000);
  recordAcceptedContactSubmission(storage, now - 2000);
  recordAcceptedContactSubmission(storage, now - 1000);
  assert.equal(isContactRateLimited(storage, now), true);
  assert.equal(validateContactSubmissionProtections({
    formAvailableAt: now - 10_000,
    now,
    storage,
  }), "rateLimited");
});

test("expires old timestamps and tolerates corrupt or unavailable storage", () => {
  const now = 3_000_000;
  const expiredStorage = createStorage(JSON.stringify([
    now - CONTACT_RATE_LIMIT_WINDOW_MS - 1,
    now - 1000,
  ]));
  assert.equal(isContactRateLimited(expiredStorage, now), false);

  const corruptStorage = createStorage("{not-json");
  assert.equal(isContactRateLimited(corruptStorage, now), false);

  const unavailableStorage = {
    getItem() {
      throw new Error("Unavailable");
    },
    removeItem() {
      throw new Error("Unavailable");
    },
    setItem() {
      throw new Error("Unavailable");
    },
  };
  assert.doesNotThrow(() => recordAcceptedContactSubmission(unavailableStorage, now));
  assert.equal(isContactRateLimited(unavailableStorage, now), false);
});

test("prevents double submission and releases the guard in finally", async () => {
  const guard = createSubmissionGuard();
  assert.equal(guard.acquire(), true);
  assert.equal(guard.acquire(), false);
  try {
    await Promise.reject(new Error("Simulated request failure"));
  } catch {
    // The request failed as expected.
  } finally {
    guard.release();
  }
  assert.equal(guard.isLocked(), false);
  assert.equal(guard.acquire(), true);
});
