import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { profile } from "../content/profile";
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
    setSuccess(isComplete && emailPattern.test(formData.email) ? t.contact.ready : "");
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
    "w-full border border-black/15 bg-[#f4f1eb] px-4 py-3 text-[#1d1d1b] outline-none transition-colors placeholder:text-[#8a857d] focus:border-[#9b4035] focus:ring-1 focus:ring-[#9b4035] dark:border-white/20 dark:bg-[#171716] dark:text-[#f4f1eb]";

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
            {error && <p className="mb-4 text-sm text-red-700 dark:text-red-300" role="alert">{error}</p>}
            {success && <p className="mb-4 text-sm text-green-700 dark:text-green-300" role="status">{success}</p>}
          </div>

          <form className="mt-2 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="contact-name" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.name}</label>
              <input id="contact-name" type="text" name="name" value={formData.name} onChange={handleChange} autoComplete="name" required aria-describedby="form-status" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="contact-email" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.email}</label>
              <input id="contact-email" type="email" name="email" value={formData.email} onChange={handleChange} autoComplete="email" required aria-describedby="form-status" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="contact-message" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em]">{t.contact.message}</label>
              <textarea id="contact-message" name="message" value={formData.message} onChange={handleChange} autoComplete="off" required aria-describedby="form-status" className={fieldClass} rows="6" />
            </div>
            <button
              type="submit"
              className="button-primary disabled:cursor-wait disabled:opacity-60"
              disabled={isSubmitting}
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
