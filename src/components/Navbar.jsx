import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaBars, FaMoon, FaSun, FaTimes } from "react-icons/fa";
import { profile } from "../content/profile";
import { t } from "../content/ui";
import { useTheme } from "../context/ThemeContext";

const navItems = [
  { to: "/", label: t.navigation.about, end: true },
  { to: "/mangaka", label: t.navigation.manga },
  { to: "/illustration", label: t.navigation.illustration },
  { to: "/animation", label: t.navigation.animation },
  { to: "/contact", label: t.navigation.contact },
];

const focusClass =
  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page";

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

  const handleAboutClick = () => {
    setMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const handleNavigationClick = (item) => {
    setMenuOpen(false);
    if (item.to === "/") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const navClass = ({ isActive }) =>
    `nav-link ${isActive ? "nav-link--active" : ""} ${focusClass}`;

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b-[3px] border-ink bg-page text-foreground dark:border-paper">
      <div className="mx-auto flex h-[68px] max-w-[100rem] items-center justify-between px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          onClick={handleAboutClick}
          className={`brand-link ${focusClass}`}
          aria-label={`${profile.name} — ${t.navigation.about}`}
        >
          {profile.name}
        </Link>

        <div className="hidden items-center gap-5 lg:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => handleNavigationClick(item)}
              className={navClass}
            >
              {item.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={toggleTheme}
            className={`grid h-10 w-10 place-items-center border-2 border-current text-sm transition-colors duration-150 hover:bg-surface ${focusClass}`}
            aria-label={theme === "dark" ? t.navigation.lightMode : t.navigation.darkMode}
          >
            {theme === "dark" ? <FaSun aria-hidden="true" /> : <FaMoon aria-hidden="true" />}
          </button>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className={`grid h-10 w-10 place-items-center border-2 border-current text-xl lg:hidden ${focusClass}`}
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
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 flex h-dvh flex-col bg-page px-6 py-6 text-foreground dark:bg-ink dark:text-paper lg:hidden"
            >
              <div className="flex items-center justify-between border-b-2 border-foreground/30 pb-5 dark:border-paper/30">
                <span className="border-b-[3px] border-primary pb-1 font-display text-3xl uppercase tracking-tight text-foreground dark:text-paper">{profile.name}</span>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className={`grid h-11 w-11 place-items-center border-2 border-foreground bg-page text-2xl text-foreground dark:border-paper dark:bg-transparent dark:text-paper ${focusClass}`}
                  aria-label={t.navigation.closeMenu}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
              <div className="my-auto flex flex-col items-start gap-3">
                {navItems.map((item, index) => (
                  <NavLink
                    key={item.to}
                    ref={index === 0 ? firstLinkRef : undefined}
                    to={item.to}
                    end={item.end}
                    onClick={() => handleNavigationClick(item)}
                    className={({ isActive }) =>
                      `border-l-4 font-display text-[clamp(2.8rem,12vw,5rem)] uppercase leading-[0.9] tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:text-foreground dark:focus-visible:text-paper ${
                        isActive ? "border-primary pl-3 text-foreground dark:text-paper" : "border-transparent text-foreground/70 hover:text-foreground dark:text-paper/75 dark:hover:text-paper"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleTheme}
                className={`flex w-fit items-center gap-2 border-2 border-foreground px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-foreground dark:border-paper dark:text-paper ${focusClass}`}
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
