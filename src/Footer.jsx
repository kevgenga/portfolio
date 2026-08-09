import { Link } from "react-router-dom";
import { profile } from "./content/profile";
import { t } from "./content/ui";

const footerLinks = [
  { label: t.navigation.about, to: "/" },
  { label: t.navigation.manga, to: "/mangaka" },
  { label: t.navigation.illustration, to: "/illustration" },
  { label: t.navigation.animation, to: "/animation" },
  { label: t.navigation.contact, to: "/contact" },
];

const Footer = () => (
  <footer className="border-t-[3px] border-primary bg-ink text-paper">
    <div className="mx-auto max-w-[100rem] px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.3fr)] lg:items-end lg:gap-20">
        <div>
          <p className="font-display text-[clamp(4rem,9vw,8rem)] uppercase leading-[0.78] tracking-[-0.035em] text-paper">
            {profile.name}
          </p>
          <span className="mt-7 block h-1 w-10 bg-primary" aria-hidden="true" />
          <p className="mt-8 text-sm font-bold uppercase leading-7 tracking-[0.12em] text-paper/70">
            {profile.about.roles.map((role) => (
              <span key={role} className="block">{role}</span>
            ))}
          </p>
        </div>
        <nav className="grid gap-3 border-l border-paper/20 pl-5 text-sm font-black uppercase tracking-[0.12em]" aria-label="Footer">
          {footerLinks.map((link) => (
            <Link
              key={link.to}
              className="w-fit text-paper transition-colors duration-150 hover:text-paper/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              to={link.to}
              onClick={link.to === "/" ? () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }) : undefined}
            >
              {link.label}
            </Link>
          ))}
          <a
            className="w-fit text-paper transition-colors duration-150 hover:text-paper/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            href={profile.social.instagram}
            target="_blank"
            rel="noreferrer"
          >
            Instagram ↗
          </a>
        </nav>
      </div>
      <p className="mt-14 border-t border-paper/20 pt-5 text-xs font-semibold text-paper/55 lg:text-right">
        {t.footer.copyright(new Date().getFullYear())}
      </p>
    </div>
  </footer>
);

export default Footer;
