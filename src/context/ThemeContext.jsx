import { createContext, useContext, useEffect, useState } from 'react';

// Création du contexte
const ThemeContext = createContext();

// Hook personnalisé pour accéder au thème facilement
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Vérifie si l'utilisateur a un thème enregistré
    return localStorage.getItem('portfolio-theme') || 'light';
  });

  // Met à jour le localStorage et la classe de <html>
  useEffect(() => {
    localStorage.setItem('portfolio-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
