import { t } from "./content/ui";

const Footer = () => {
  return (
    <footer className="mt-10 py-4 bg-gray-100 dark:bg-gray-800 text-center">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {t.footer.credit} <span className="font-semibold">{t.footer.author}</span>
      </p>
    </footer>
  );
};

export default Footer;
