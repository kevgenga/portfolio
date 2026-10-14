import { Link } from "react-router-dom";
import { profile } from "./content/profile";
import { sitePresentation } from "./content/sitePresentation";
import { useLanguage } from "./i18n/languageContext";
import CapabilityGroup from "./components/about/CapabilityGroup";

const Footer = () => {
  const { t, content } = useLanguage();
  const experience = content?.experience || profile.experience;
  const localizeGroups = (groups) => groups.map((group) => ({
    ...group,
    label: content?.capabilityLabels?.[group.label] || group.label,
    items: group.items.map((item) => content?.capabilityItems?.[item] || item),
  }));
  const capabilities = localizeGroups(profile.capabilities.filter((group) => sitePresentation.showAnimationSection || group.label !== "2D / Motion"));
  const footerLinks = [
    { label: t.navigation.about, to: "/" },
    { label: t.navigation.manga, to: "/mangaka" },
    { label: t.navigation.illustration, to: "/illustration" },
    ...(sitePresentation.showAnimationSection ? [{ label: t.navigation.animation, to: "/animation" }] : []),
    { label: t.navigation.contact, to: "/contact" },
  ];
  return (
  <footer className="portfolio-footer border-t-[3px] border-primary bg-ink text-paper">
    <div className="portfolio-footer__inner mx-auto max-w-[100rem] px-5 sm:px-8 lg:px-10">
      <div className="portfolio-footer__grid">
        <div className="portfolio-footer__identity">
          <div>
          <p className="portfolio-footer__name font-display uppercase text-paper">
            {profile.name}
          </p>
          <span className="mt-4 block h-1 w-10 bg-primary" aria-hidden="true" />
          <p className="portfolio-footer__roles font-bold uppercase text-paper/70">
            {(content?.about.roles || profile.about.roles).map((role) => (
              <span key={role} className="block">{role}</span>
            ))}
          </p>
          </div>
        <nav className="portfolio-footer__navigation font-black uppercase" aria-label={t.footer.navigation}>
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
        <section id="experience" className="portfolio-footer__experience" aria-labelledby="footer-experience-title">
          <h2 id="footer-experience-title" className="portfolio-footer__title">{t.home.experienceNote}</h2>
          <h3 id="experience-title" className="portfolio-footer__role">{experience.role}</h3>
          <p className="portfolio-footer__period">{experience.period}</p>
          <div className="portfolio-footer__groups">
            {capabilities.map((group, index) => <CapabilityGroup key={profile.capabilities[index].label} {...group} index={index + 1} headingId={`footer-skill-${index}`} />)}
          </div>
        </section>
        <section id="tools" className="portfolio-footer__tools" aria-labelledby="tools-title">
          <h2 id="tools-title" className="portfolio-footer__title">{t.home.toolsLabel}</h2>
          <div className="portfolio-footer__groups">
            {localizeGroups(profile.tools).map((group, index) => <CapabilityGroup key={profile.tools[index].label} {...group} index={index + 1} headingId={`footer-tool-${index}`} />)}
          </div>
        </section>
      </div>
      <p className="portfolio-footer__copyright border-t border-paper/20 text-xs font-semibold text-paper/55">
        {t.footer.copyright(new Date().getFullYear())}
      </p>
    </div>
  </footer>
  );
};

export default Footer;
