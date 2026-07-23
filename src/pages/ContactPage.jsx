import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { profile } from "../content/profile";
import { t } from "../content/ui";
import {
  ContactSubmissionError,
  submitContactForm,
} from "../services/contactForm";
import {
  createSubmissionGuard,
  recordAcceptedContactSubmission,
  validateContactForm,
  validateContactSubmissionProtections,
} from "../services/contactValidation";

const emptyForm = { name: "", email: "", message: "" };
const emptyHoneypots = { companyWebsite: "", gotcha: "" };
const fieldOrder = ["name", "email", "message"];

const fieldMessage = (field, code) => {
  if (code === "abusive") return t.contact.respectfulLanguageError;
  if (field === "name") {
    return code === "required" ? t.contact.nameRequiredError : t.contact.nameError;
  }
  if (field === "email") {
    if (code === "required") return t.contact.emailRequiredError;
    return code === "emailDisposable"
      ? t.contact.disposableEmailError
      : t.contact.professionalEmailError;
  }
  if (code === "required") return t.contact.messageRequiredError;
  if (code === "messageTooShort") return t.contact.messageTooShortError;
  if (code === "messageTooLong") return t.contact.messageTooLongError;
  if (code === "tooManyLinks") return t.contact.tooManyLinksError;
  if (code === "urlShortener") return t.contact.urlShortenerError;
  return t.contact.clearMessageError;
};

const ContactPage = () => {
  const [formData, setFormData] = useState(emptyForm);
  const [honeypots, setHoneypots] = useState(emptyHoneypots);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionGuard = useRef(createSubmissionGuard());
  const formAvailableAt = useRef(Date.now());
  const nameInput = useRef(null);
  const emailInput = useRef(null);
  const messageInput = useRef(null);
  const fieldRefs = { name: nameInput, email: emailInput, message: messageInput };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
    setFormError("");
    setSuccess(false);
  };

  const focusFirstInvalidField = (errors) => {
    const firstInvalidField = fieldOrder.find((field) => errors[field]);
    if (!firstInvalidField) return;
    window.requestAnimationFrame(() => fieldRefs[firstInvalidField].current?.focus());
  };

  const localStorageOrNull = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!submissionGuard.current.acquire()) return;

    setFieldErrors({});
    setFormError("");
    setSuccess(false);

    const validation = validateContactForm(formData);
    if (!validation.isValid) {
      const messages = Object.fromEntries(
        Object.entries(validation.errors).map(([field, code]) => [
          field,
          fieldMessage(field, code),
        ]),
      );
      setFieldErrors(messages);
      if (Object.keys(messages).length > 1) setFormError(t.contact.validationSummary);
      focusFirstInvalidField(messages);
      submissionGuard.current.release();
      return;
    }

    const now = Date.now();
    const storage = localStorageOrNull();
    const protectionError = validateContactSubmissionProtections({
      ...honeypots,
      formAvailableAt: formAvailableAt.current,
      now,
      storage,
    });
    if (protectionError) {
      setFormError(
        protectionError === "rateLimited"
          ? t.contact.rateLimitError
          : t.contact.protectionError,
      );
      submissionGuard.current.release();
      return;
    }

    setIsSubmitting(true);
    setFormData(validation.values);

    try {
      await submitContactForm({
        ...validation.values,
        _gotcha: honeypots.gotcha,
        _subject: "New KEVGENGA portfolio enquiry",
        pageUrl: window.location.href,
        submittedAt: new Date(now).toISOString(),
        source: "KEVGENGA portfolio",
      });
      recordAcceptedContactSubmission(storage, Date.now());
      setSuccess(true);
      setFormData(emptyForm);
      setHoneypots(emptyHoneypots);
    } catch (submissionError) {
      if (!(submissionError instanceof ContactSubmissionError) || submissionError.status === null) {
        setFormError(t.contact.networkError);
      } else if (submissionError.status === 400) {
        setFormError(t.contact.badRequestError);
      } else if (submissionError.status === 403) {
        setFormError(t.contact.forbiddenError);
      } else if (submissionError.status >= 500) {
        setFormError(t.contact.serviceError);
      } else {
        setFormError(t.contact.submitError);
      }
    } finally {
      setIsSubmitting(false);
      submissionGuard.current.release();
    }
  };

  const fieldClass = (hasError) =>
    `w-full border bg-[#f4f1eb] px-4 py-3 text-[#1d1d1b] outline-none transition-colors placeholder:text-[#8a857d] focus:ring-1 dark:bg-[#171716] dark:text-[#f4f1eb] ${
      hasError
        ? "border-red-700 ring-1 ring-red-700 focus:border-red-700 focus:ring-red-700 dark:border-red-300 dark:ring-red-300"
        : "border-black/15 focus:border-[#9b4035] focus:ring-[#9b4035] dark:border-white/20"
    }`;

  const errorMessage = (field) => fieldErrors[field] && (
    <p
      id={`contact-${field}-error`}
      className="mt-2 flex items-start gap-2 text-sm font-medium text-red-700 dark:text-red-300"
      role="alert"
    >
      <span aria-hidden="true">!</span>
      <span>{fieldErrors[field]}</span>
    </p>
  );

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f4f1eb] px-5 pb-20 pt-28 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb] sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <motion.header initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="section-eyebrow">{t.contact.eyebrow}</p>
          <h1 className="section-title">{t.contact.title}</h1>
          <p className="mt-6 max-w-md leading-7 text-[#68645e] dark:text-[#bbb5ac]">{t.contact.introduction}</p>
          <div className="mt-9 border-t border-black/10 pt-6 dark:border-white/10">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#8a857d]">{t.contact.directEmail}</p>
            <a className="mt-2 inline-block text-lg underline decoration-[#9b4035] underline-offset-4 hover:text-[#9b4035]" href={`mailto:${profile.contact.email}`}>
              {profile.contact.email}
            </a>
          </div>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="border border-black/10 bg-[#faf8f4] p-5 dark:border-white/10 dark:bg-[#1d1d1b] sm:p-8"
        >
          <div id="form-status" className="min-h-6" aria-live="polite" aria-atomic="true">
            {formError && <p className="mb-4 text-sm font-medium text-red-700 dark:text-red-300" role="alert">{formError}</p>}
            {success && (
              <div
                className="mb-4 space-y-3 text-sm leading-6 text-green-700 dark:text-green-300"
                role="status"
              >
                <p>{t.contact.successTitle}</p>
                <p>{t.contact.successReply}</p>
                <p>
                  {t.contact.successDirectBefore}
                  <a
                    href={`mailto:${t.contact.successEmail}`}
                    className="font-medium underline decoration-current underline-offset-2 hover:no-underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
                  >
                    {t.contact.successEmail}
                  </a>
                  {t.contact.successDirectAfter}
                </p>
              </div>
            )}
          </div>

          <form className="mt-2 space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="contact-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.name}</label>
              <input
                ref={nameInput}
                id="contact-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                autoComplete="name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={fieldErrors.name ? "contact-name-error form-status" : "form-status"}
                className={fieldClass(Boolean(fieldErrors.name))}
              />
              {errorMessage("name")}
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.email}</label>
              <input
                ref={emailInput}
                id="contact-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "contact-email-error form-status" : "form-status"}
                className={fieldClass(Boolean(fieldErrors.email))}
              />
              {errorMessage("email")}
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.message}</label>
              <textarea
                ref={messageInput}
                id="contact-message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                autoComplete="off"
                required
                aria-invalid={Boolean(fieldErrors.message)}
                aria-describedby={fieldErrors.message ? "contact-message-error form-status" : "form-status"}
                className={fieldClass(Boolean(fieldErrors.message))}
                rows="6"
              />
              {errorMessage("message")}
            </div>
            <div
              className="pointer-events-none absolute left-[-10000px] top-auto h-px w-px overflow-hidden opacity-0"
              aria-hidden="true"
            >
              <label htmlFor="contact-company-website">Company website</label>
              <input
                id="contact-company-website"
                type="text"
                name="companyWebsite"
                value={honeypots.companyWebsite}
                onChange={(event) => setHoneypots((current) => ({
                  ...current,
                  companyWebsite: event.target.value,
                }))}
                autoComplete="off"
                tabIndex={-1}
              />
              <label htmlFor="contact-gotcha">Website confirmation</label>
              <input
                id="contact-gotcha"
                type="text"
                name="_gotcha"
                value={honeypots.gotcha}
                onChange={(event) => setHoneypots((current) => ({
                  ...current,
                  gotcha: event.target.value,
                }))}
                autoComplete="off"
                tabIndex={-1}
              />
            </div>
            <button
              type="submit"
              className="button-primary disabled:cursor-wait disabled:opacity-60"
              disabled={isSubmitting}
              aria-disabled={isSubmitting}
            >
              {isSubmitting ? t.contact.submitting : t.contact.submit}
            </button>
          </form>
        </motion.div>
      </div>
    </main>
  );
};

export default ContactPage;
