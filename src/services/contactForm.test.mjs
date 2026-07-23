import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactSubmissionError,
  CONTACT_FORM_ENDPOINT,
  submitContactForm,
} from "./contactForm.js";

const validForm = {
  name: "Portfolio test",
  email: "visitor@example.com",
  message: "Test message",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function expectSubmissionError(operation, status) {
  await assert.rejects(operation, (error) => {
    assert.equal(error instanceof ContactSubmissionError, true);
    assert.equal(error.status, status);
    return true;
  });
}

test("confirms a submission only when Formspree returns ok true", async () => {
  let request;
  const result = await submitContactForm(validForm, async (url, options) => {
    request = { url, options };
    return jsonResponse({ ok: true, next: "/thanks" }, 200);
  });

  assert.equal(result.status, 200);
  assert.equal(request.url, CONTACT_FORM_ENDPOINT);
  assert.equal(request.options.headers.Accept, "application/json");
  assert.deepEqual(JSON.parse(request.options.body), validForm);
});

test("rejects a network failure", async () => {
  await expectSubmissionError(
    () => submitContactForm(validForm, async () => {
      throw new TypeError("Failed to fetch");
    }),
    null,
  );
});

for (const status of [400, 403, 500]) {
  test(`rejects an HTTP ${status} response`, async () => {
    await expectSubmissionError(
      () => submitContactForm(
        validForm,
        async () => jsonResponse({ ok: false, error: `HTTP ${status}` }, status),
      ),
      status,
    );
  });
}

test("rejects a nominal HTTP response containing a service error", async () => {
  await expectSubmissionError(
    () => submitContactForm(
      validForm,
      async () => jsonResponse({ ok: false, errors: [{ message: "Form inactive" }] }),
    ),
    200,
  );
});

test("rejects a nominal HTTP response without explicit confirmation", async () => {
  await expectSubmissionError(
    () => submitContactForm(validForm, async () => jsonResponse({ next: "/thanks" })),
    200,
  );
});

test("rejects invalid JSON even with a nominal HTTP status", async () => {
  await expectSubmissionError(
    () => submitContactForm(
      validForm,
      async () => new Response("not-json", { status: 200 }),
    ),
    200,
  );
});
