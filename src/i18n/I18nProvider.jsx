import { useEffect, useLayoutEffect, useState } from "react";
import { getContentTranslations, getTranslations, readStoredLocale, resolveInitialLocale, storeLocale } from "./locale";
import { LanguageContext } from "./languageContext";


export const LanguageProvider = ({ children }) => {
  const [locale, setLocale] = useState(() => resolveInitialLocale({
    search: window.location.search,
    stored: readStoredLocale(),
    browserLanguage: navigator.language,
  }));

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    storeLocale(locale);
  }, [locale]);

  useEffect(() => {
    const syncUrlLocale = () => {
      const urlLocale = new URLSearchParams(window.location.search).get("lang");
      if (urlLocale === "en" || urlLocale === "ja" || urlLocale === "fr") setLocale(urlLocale);
    };
    window.addEventListener("popstate", syncUrlLocale);
    return () => window.removeEventListener("popstate", syncUrlLocale);
  }, []);

  const changeLocale = (nextLocale) => {
    if (nextLocale !== "en" && nextLocale !== "ja" && nextLocale !== "fr") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", nextLocale);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setLocale(nextLocale);
  };

  const value = {
    locale,
    setLocale: changeLocale,
    t: getTranslations(locale),
    content: getContentTranslations(locale),
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

