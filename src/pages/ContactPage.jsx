import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { t } from "../content/ui";

const emptyForm = { name: "", email: "", message: "" };
const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9]{2,}$/;

const ContactPage = () => {
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const resetTimer = useRef(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  useEffect(() => {
    const isComplete = formData.name && formData.email && formData.message;

    if (isComplete) setError("");
    setSuccess(
      isComplete && emailPattern.test(formData.email) ? t.contact.ready : "",
    );
  }, [formData]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name || !formData.email || !formData.message) {
      setError(t.contact.requiredError);
      return;
    }

    if (!emailPattern.test(formData.email)) {
      setError(t.contact.emailError);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("https://formspree.io/f/mwpllanl", {
        method: "POST",
        body: JSON.stringify(formData),
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        setError(t.contact.submitError);
        setIsSubmitting(false);
        return;
      }

      setSuccess(t.contact.success);
      resetTimer.current = setTimeout(() => {
        setFormData(emptyForm);
        setIsSubmitting(false);
      }, 2500);
    } catch {
      setError(t.contact.networkError);
      setIsSubmitting(false);
    }
  };

  const fieldClass =
    "w-full rounded-md bg-gray-100 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-gray-900";

  return (
    <main className="contact-container min-h-screen overflow-x-clip bg-light-background text-light-text dark:bg-dark-background dark:text-dark-text">
      <div className="mx-auto max-w-screen-xl p-4 pt-16 sm:p-8 sm:pt-16">
        <motion.h1
          className="mb-6 pt-12 text-center text-3xl font-semibold uppercase tracking-wide"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {t.contact.title}
        </motion.h1>

        <div id="form-status" aria-live="polite" aria-atomic="true">
          {error && (
            <p className="mb-4 text-center text-red-600" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-4 text-center text-green-600" role="status">
              {success}
            </p>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mx-auto w-full rounded-md bg-gray-700 p-6 shadow-sm dark:bg-gray-800 md:w-2/3 lg:w-1/2"
        >
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="contact-name" className="mb-2 block text-white">
                {t.contact.name}
              </label>
              <input
                id="contact-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                autoComplete="name"
                required
                aria-describedby="form-status"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="contact-email" className="mb-2 block text-white">
                {t.contact.email}
              </label>
              <input
                id="contact-email"
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
                aria-describedby="form-status"
                className={fieldClass}
              />
            </div>

            <div>
              <label htmlFor="contact-message" className="mb-2 block text-white">
                {t.contact.message}
              </label>
              <textarea
                id="contact-message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                autoComplete="off"
                required
                aria-describedby="form-status"
                className={fieldClass}
                rows="5"
              />
            </div>

            <div className="flex justify-center">
              <motion.button
                type="submit"
                className="rounded-md bg-blue-700 px-6 py-3 text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-700 disabled:cursor-wait disabled:opacity-70"
                whileHover={{ scale: 1.03 }}
                transition={{ duration: 0.2 }}
                disabled={isSubmitting}
              >
                {isSubmitting ? t.contact.submitting : t.contact.submit}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </div>
    </main>
  );
};

export default ContactPage;
