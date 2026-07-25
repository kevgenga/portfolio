import { useEffect } from "react";
import ReactGA from "react-ga4";
import { useLocation } from "react-router-dom";

const GOOGLE_ANALYTICS_ID = "G-3BQK63JRTQ";
const MICROSOFT_CLARITY_ID = "xs76mxjq62";
const CLARITY_SCRIPT_ID = "microsoft-clarity-script";

let trackersInitialized = false;

const initializeGoogleAnalytics = () => {
  ReactGA.initialize(GOOGLE_ANALYTICS_ID, {
    gaOptions: {
      send_page_view: false,
    },
  });
};

const initializeMicrosoftClarity = () => {
  window.clarity =
    window.clarity ||
    function clarity() {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };

  if (document.getElementById(CLARITY_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${MICROSOFT_CLARITY_ID}`;
  document.head.appendChild(script);
};

const trackerInitializers = [
  initializeGoogleAnalytics,
  initializeMicrosoftClarity,
];

const initializeTrackers = () => {
  if (!import.meta.env.PROD || trackersInitialized) {
    return;
  }

  trackersInitialized = true;
  trackerInitializers.forEach((initialize) => initialize());
};

const trackPageView = () => {
  ReactGA.send({
    hitType: "pageview",
    page: `${window.location.pathname}${window.location.search}`,
    title: document.title,
  });
};

const Analytics = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    initializeTrackers();
    trackPageView();
  }, [pathname, search]);

  return null;
};

export default Analytics;
