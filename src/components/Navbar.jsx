import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaBars, FaMoon, FaSun, FaTimes } from "react-icons/fa";
import { profile } from "../content/profile";
import { t } from "../content/ui";
import { useTheme } from "../context/ThemeContext";

const navItems = [
  { to: "/", label: t.navigation.home, end: true },
  { to: "/mangaka", label: t.navigation.manga },
  { to: "/illustration", label: t.navigation.illustration },
  { to: "/animation", label: t.navigation.animation },
  { to: "/#about", label: t.navigation.about, hash: true },
  { to: "/contact", label: t.navigation.contact },
];

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4035] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#171716]";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const firstLinkRef = useRef(null);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstLinkRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const handleHomeClick = () => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const handleNavigationClick = (item) => {
    setMenuOpen(false);

    if (item.to === "/") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (item.hash && location.pathname === "/") {
      requestAnimationFrame(() => {
        document.getElementById("about")?.scrollIntoView({ block: "start" });
      });
    }
  };

  const navClass = ({ isActive }, item) => {
    const active = item.hash
      ? location.pathname === "/" && location.hash === "#about"
      : isActive && !location.hash;

    return `relative py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors hover:text-[#9b4035] ${focusClass} ${
      active ? "text-[#9b4035] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#9b4035]" : ""
    }`;
  };

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-black/10 bg-[#f4f1eb]/95 text-[#1d1d1b] backdrop-blur-md dark:border-white/10 dark:bg-[#171716]/95 dark:text-[#f4f1eb]">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link to="/" onClick={handleHomeClick} className={`text-lg font-bold tracking-[0.18em] ${focusClass}`}>
          {profile.name}
        </Link>

        <div className="hidden items-center gap-6 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => handleNavigationClick(item)}
              className={(state) => navClass(state, item)}
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            className={`rounded-full border border-black/15 p-2 text-sm transition-colors hover:border-[#9b4035] hover:text-[#9b4035] dark:border-white/20 ${focusClass}`}
            aria-label={theme === "dark" ? t.navigation.lightMode : t.navigation.darkMode}
          >
            {theme === "dark" ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
          </button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className={`text-xl lg:hidden ${focusClass}`}
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={menuOpen ? t.navigation.closeMenu : t.navigation.openMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
        >
          {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="mobile-navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex h-dvh flex-col bg-[#f4f1eb] px-6 py-6 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb] lg:hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold tracking-[0.18em]">{profile.name}</span>
                <button type="button" onClick={() => setMenuOpen(false)} className={`text-2xl ${focusClass}`} aria-label={t.navigation.closeMenu}>
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
              <div className="my-auto flex flex-col items-start gap-5">
                {navItems.map((item, index) => (
                  <NavLink
                    key={item.to}
                    ref={index === 0 ? firstLinkRef : undefined}
                    to={item.to}
                    end={item.end}
                    onClick={() => handleNavigationClick(item)}
                    className="text-3xl font-medium tracking-tight hover:text-[#9b4035] focus-visible:outline-none focus-visible:text-[#9b4035]"
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className={`flex w-fit items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] ${focusClass}`}
              >
                {theme === "dark" ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
                {theme === "dark" ? t.navigation.lightMode : t.navigation.darkMode}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
};

export default Navbar;
