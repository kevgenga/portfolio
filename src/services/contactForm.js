export const CONTACT_FORM_ENDPOINT = "https://formspree.io/f/mwpllanl";

export class ContactSubmissionError extends Error {
  constructor(message, { status = null, responseBody = null, cause } = {}) {
    super(message, { cause });
    this.name = "ContactSubmissionError";
    this.status = status;
    this.responseBody = responseBody;
  }
}

function responseErrorMessage(responseBody, fallback) {
  if (typeof responseBody?.error === "string" && responseBody.error.trim()) {
    return responseBody.error;
  }

  if (Array.isArray(responseBody?.errors)) {
    const messages = responseBody.errors
      .map((error) => error?.message)
      .filter((message) => typeof message === "string" && message.trim());
    if (messages.length) return messages.join(" ");
  }

  return fallback;
}

function developmentLog(level, message, details) {
  if (import.meta.env?.DEV !== true) return;
  console[level](`[Contact form] ${message}`, details);
}

export async function submitContactForm(formData, fetchImplementation = fetch) {
  let response;

  try {
    response = await fetchImplementation(CONTACT_FORM_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(formData),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  } catch (cause) {
    developmentLog("error", "Network request failed.", { cause });
    throw new ContactSubmissionError("Network request failed.", { cause });
  }

  const responseText = await response.text();
  let responseBody = null;

  if (responseText.trim()) {
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      developmentLog("error", "The service returned invalid JSON.", {
        status: response.status,
        responseText,
      });
      throw new ContactSubmissionError("The contact service returned an invalid response.", {
        status: response.status,
        responseBody: responseText,
      });
    }
  }

  developmentLog(response.ok ? "info" : "error", "Formspree response received.", {
    status: response.status,
    responseBody,
  });

  if (!response.ok) {
    throw new ContactSubmissionError(
      responseErrorMessage(responseBody, `The contact service returned HTTP ${response.status}.`),
      { status: response.status, responseBody },
    );
  }

  const hasServiceErrors = Boolean(responseBody?.error)
    || (Array.isArray(responseBody?.errors) && responseBody.errors.length > 0);
  if (responseBody?.ok !== true || hasServiceErrors) {
    throw new ContactSubmissionError(
      responseErrorMessage(responseBody, "Formspree did not confirm the submission."),
      { status: response.status, responseBody },
    );
  }

  return { status: response.status, responseBody };
}
