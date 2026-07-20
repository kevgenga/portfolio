import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
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

const PageFallback = () => (
  <div
    className="min-h-screen bg-light-background pt-24 text-center text-light-text dark:bg-dark-background dark:text-dark-text"
    role="status"
  >
    {t.common.loading}
  </div>
);

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Router basename="/test-portfolio-mangaka">
        <Navbar />
        <Suspense fallback={<PageFallback />}>
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
        <Footer />
      </Router>
    </MotionConfig>
  );
}

export default App;
