import { Link } from "react-router-dom";
import { profile } from "./content/profile";
import { t } from "./content/ui";

const Footer = () => (
  <footer className="border-t border-black/10 bg-[#1d1d1b] text-[#f4f1eb]">
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 md:grid-cols-2 md:items-end lg:px-10">
      <div>
        <p className="text-xl font-bold tracking-[0.18em]">{profile.name}</p>
        <p className="mt-2 text-sm text-[#b9b4ab]">{t.footer.role}</p>
      </div>
      <nav className="flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold uppercase tracking-[0.14em] md:justify-end" aria-label="Footer">
        <Link className="hover:text-[#d88a7e]" to="/mangaka">{t.navigation.manga}</Link>
        <Link className="hover:text-[#d88a7e]" to="/illustration">{t.navigation.illustration}</Link>
        <Link className="hover:text-[#d88a7e]" to="/animation">{t.navigation.animation}</Link>
        <Link className="hover:text-[#d88a7e]" to="/contact">{t.navigation.contact}</Link>
      </nav>
      <p className="border-t border-white/10 pt-6 text-xs text-[#8f8a82] md:col-span-2 md:text-right">
        {t.footer.copyright(new Date().getFullYear())}
      </p>
    </div>
  </footer>
);

export default Footer;
