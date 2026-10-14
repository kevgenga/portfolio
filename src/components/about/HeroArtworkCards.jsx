import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../../i18n/languageContext";
import { calculateHeroCardSizes } from "../../utils/heroArtworkCards";
import { assetPath } from "../../utils/assetPath";
import "./HeroArtworkCards.css";

const HeroArtworkCards = ({ cards }) => {
  const { t } = useLanguage();
  const descriptionId = useId();
  const trackRef = useRef(null);
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const [metrics, setMetrics] = useState({ trackWidth: 0, gap: 0, minimumWidth: 0, expansion: 0, enabled: false });
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const css = window.getComputedStyle(track);
    setMetrics({
      trackWidth: track.getBoundingClientRect().width,
      gap: Number.parseFloat(css.columnGap) || 0,
      minimumWidth: Number.parseFloat(css.getPropertyValue("--hero-min-card-width")) || 0,
      expansion: Number.parseFloat(css.getPropertyValue("--hero-expand")) || 0,
      enabled: css.getPropertyValue("--hero-expand-enabled").trim() === "1",
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, [measure, cards.length]);

  const activeIndex = hovered ?? focused;
  const sizing = calculateHeroCardSizes({ ...metrics, count: cards.length, activeIndex });
  if (!cards.length) return null;

  return (
    <div id="hero-work" className="hero-art-cards" data-interacting={activeIndex !== null} role="group" aria-label={t.home.heroCategories}>
      <div ref={trackRef} className="hero-art-cards__track" style={{ "--hero-card-count": cards.length }}
        onPointerLeave={() => setHovered(null)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(null); }}>
        {cards.map((card, index) => {
          const title = t.illustration.categories[card.titleKey];
          const highlighted = index === activeIndex;
          return (
            <Link key={card.id} to={`/illustration?category=${card.category}`}
              className="hero-art-card" data-category={card.category} data-active={highlighted}
              data-expanded={index === activeIndex && sizing.expansion > 0}
              aria-label={t.home.openCategory(title)}
              aria-describedby={`${descriptionId}-${card.id}-description`}
              style={{ "--hero-card-extra": `${sizing.extras[index] || 0}px`, "--hero-image-fit": card.objectFit === "contain" ? "contain" : "cover", "--hero-image-position": card.objectPosition }}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse" && window.matchMedia("(hover: hover) and (pointer: fine)").matches) { measure(); setHovered(index); }
              }}
              onFocus={() => { measure(); setFocused(index); }}>
              <div className="hero-art-card__media">
                <div className="hero-art-card__image-plane">
                  <img src={card.heroImage ? assetPath(card.heroImage) : card.artwork.thumbnail || card.artwork.image} alt={t.home.workAlt(title)}
                    loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
                </div>
              </div>
              <div className="hero-art-card__caption">
                <div className="hero-art-card__markers"><span>{String(card.order).padStart(2, "0")}</span><span aria-hidden="true">↗</span></div>
                <span className="hero-art-card__title">{title}</span>
                <span id={`${descriptionId}-${card.id}-description`} className="hero-art-card__description">{t.home.workDescriptions[card.category]}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default HeroArtworkCards;
