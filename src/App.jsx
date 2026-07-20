import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import HomePage from "./pages/HomePage";
import Animation from "./pages/Animation";
import Contact from "./pages/ContactPage";
import MangakaPage from "./pages/Mangaka";
import Illustration from "./pages/Illustration";

// Import des fichiers spécifiques pour chaque manga
import BD1 from "./mangaka/1";
import BD2 from "./mangaka/2";
import BD3 from "./mangaka/3";
import BD4 from "./mangaka/4";
import Footer from "./Footer";

function App() {
  return (
    <Router basename="/test-portfolio-mangaka">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/mangaka" element={<MangakaPage />} />
        <Route path="/illustration" element={<Illustration />} />
        <Route path="/animation" element={<Animation />} />
        <Route path="/contact" element={<Contact />} />

        {/* Routes spécifiques à chaque BD */}
        <Route path="/mangas/1" element={<BD1 />} />
        <Route path="/mangas/2" element={<BD2 />} />
        <Route path="/mangas/3" element={<BD3 />} />
        <Route path="/mangas/4" element={<BD4 />} />
      </Routes>
      <Footer /> {/* Footer global ici */}
    </Router>
  );
}

export default App;
