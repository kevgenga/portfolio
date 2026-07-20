import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FaBars, FaTimes } from "react-icons/fa";
import { useTheme } from "../context/ThemeContext";
import { t } from "../content/ui";

const navItems = [
  { to: "/", label: t.navigation.home },
  { to: "/mangaka", label: t.navigation.mangaka },
  { to: "/illustration", label: t.navigation.illustration },
  { to: "/animation", label: t.navigation.animation },
  { to: "/contact", label: t.navigation.contact },
];

const focusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const firstLinkRef = useRef(null);
  const { toggleTheme, theme } = useTheme();

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

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav
      className={`fixed z-50 w-full ${
        theme === "dark"
          ? "bg-dark-background text-dark-text"
          : "bg-light-background text-light-text"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t.navigation.changeTheme}
          className={`rounded-md px-4 py-2 text-white ${focusClass} ${
            theme === "dark"
              ? "bg-blue-700 hover:bg-blue-500"
              : "bg-gray-700 hover:bg-gray-500"
          }`}
        >
          {theme === "dark" ? t.navigation.lightMode : t.navigation.darkMode}
        </button>

        <button
          ref={menuButtonRef}
          type="button"
          className={`text-2xl md:hidden ${focusClass}`}
          onClick={() => setMenuOpen((current) => !current)}
          aria-label={menuOpen ? t.navigation.closeMenu : t.navigation.openMenu}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
        >
          {menuOpen ? <FaTimes aria-hidden="true" /> : <FaBars aria-hidden="true" />}
        </button>

        <ul className="hidden space-x-6 md:flex">
          {navItems.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className={`hover:text-blue-500 ${focusClass}`}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              id="mobile-navigation"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed inset-0 flex h-dvh flex-col items-center justify-center space-y-6 md:hidden ${
                theme === "dark" ? "bg-dark-background" : "bg-light-background"
              }`}
            >
              <button
                type="button"
                className={`absolute right-6 top-6 text-3xl dark:text-white ${focusClass}`}
                onClick={closeMenu}
                aria-label={t.navigation.closeMenu}
              >
                <FaTimes aria-hidden="true" />
              </button>

              {navItems.map((item, index) => (
                <Link
                  key={item.to}
                  ref={index === 0 ? firstLinkRef : undefined}
                  to={item.to}
                  className={`text-xl transition-colors duration-200 dark:text-white ${focusClass}`}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}

export default Navbar;
