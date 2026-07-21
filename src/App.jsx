import { lazy, Suspense, useEffect, useLayoutEffect } from "react";
import {
  BrowserRouter as Router,
  matchPath,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "framer-motion";
import Navbar from "./components/Navbar";
import Footer from "./Footer";
import { t } from "./content/ui";

const HomePage = lazy(() => import("./pages/HomePage"));
const Animation = lazy(() => import("./pages/Animation"));
const Contact = lazy(() => import("./pages/ContactPage"));
const MangakaPage = lazy(() => import("./pages/Mangaka"));
const Illustration = lazy(() => import("./pages/Illustration"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MangaReaderPage = lazy(() => import("./pages/MangaReaderPage"));

const pageTitles = {
  "/": "KEVGENGA — Manga Artist, Illustrator & 2D Animator",
  "/mangaka": "Manga — KEVGENGA Portfolio",
  "/illustration": "Illustration — KEVGENGA Portfolio",
  "/animation": "2D Animation — KEVGENGA Portfolio",
  "/contact": "Contact — KEVGENGA Portfolio",
};

const DocumentMetadata = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pathname.startsWith("/mangas/")
      ? "Read Manga — KEVGENGA Portfolio"
      : pageTitles[pathname] || "Page not found — KEVGENGA Portfolio";
  }, [pathname]);

  return null;
};

const ScrollToTop = () => {
  const { hash, key, pathname } = useLocation();

  useLayoutEffect(() => {
    if (pathname === "/" && !hash) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [hash, key, pathname]);

  return null;
};

const PageFallback = ({ immersive = false }) => (
  <div
    className={`min-h-[100dvh] text-center ${
      immersive
        ? "bg-[#111110] pt-8 text-white"
        : "bg-[#f4f1eb] pt-28 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb]"
    }`}
    role="status"
  >
    {t.common.loading}
  </div>
);

const AppRoutes = () => {
  const { pathname } = useLocation();
  const isMangaReader = Boolean(matchPath({ path: "/mangas/:id", end: true }, pathname));

  return (
    <>
      <DocumentMetadata />
      <ScrollToTop />
      {!isMangaReader && <Navbar />}
      <Suspense fallback={<PageFallback immersive={isMangaReader} />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mangaka" element={<MangakaPage />} />
          <Route path="/illustration" element={<Illustration />} />
          <Route path="/animation" element={<Animation />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/mangas/:id" element={<MangaReaderPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {!isMangaReader && <Footer />}
    </>
  );
};

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Router basename={import.meta.env.BASE_URL}>
        <AppRoutes />
      </Router>
    </MotionConfig>
  );
}

export default App;
