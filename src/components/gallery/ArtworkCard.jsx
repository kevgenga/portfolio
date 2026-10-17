import { motion } from "framer-motion";
import ProductionTimeBadge from "../ProductionTimeBadge";
import { getProductionTimeBadgeAppearance } from "../../utils/publicProductionTime";
import { useLanguage } from "../../i18n/languageContext";
import { formatPortfolioDateLines } from "../../utils/formatPortfolioDate";

const ArtworkDateRibbon = ({ date, label }) => {
  const { locale } = useLanguage();
  const lines = formatPortfolioDateLines(date, locale);
  return (
    <span className="artwork-card__date-ribbon">
      <span className="sr-only">{label}</span>
      <span className="artwork-card__date-inline" aria-hidden="true">{label}</span>
      <span className="artwork-card__date-lines" aria-hidden="true">
        {(lines.length ? lines : [label]).map((line, index) => <span className="artwork-card__date-line" key={index}>{line}</span>)}
      </span>
    </span>
  );
};

const ArtworkCard = ({
  item,
  galleryName,
  href = item.image,
  image = item.thumbnail || item.poster || item.image,
  caption = item.alt || item.title,
  metadata,
  lightboxId,
  className = "",
  mediaClassName = "aspect-[4/5]",
  variant = "wall",
  showPlayIndicator = false,
  showProductionTime = false,
}) => {
  const imageDimensions = {};
  if (item.width) imageDimensions.width = item.width;
  if (item.height) imageDimensions.height = item.height;
  const badgeAppearance = showProductionTime && getProductionTimeBadgeAppearance(item.productionTime);
  const dateOnly = showProductionTime && !badgeAppearance;
  const metadataBadge = showProductionTime && (!badgeAppearance || badgeAppearance.placement === "metadata");
  const productionBadge = badgeAppearance && <ProductionTimeBadge time={item.productionTime} variant="artwork" appearance={badgeAppearance} />;

  return (
    <motion.article
      className={`artwork-card artwork-card--${variant} ${className}`}
      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
      transition={{ duration: 0.2 }}
    >
      <a
        href={href}
        data-fancybox={galleryName}
        data-lightbox-id={lightboxId || undefined}
        data-caption={caption || undefined}
        className="artwork-card__link"
      >
        <img
          src={image}
          alt={item.alt || item.title || ""}
          className={`artwork-card__image ${mediaClassName}`}
          loading="lazy"
          decoding="async"
          {...imageDimensions}
        />
        {showPlayIndicator && (
          <span className="artwork-card__play" aria-hidden="true">
            <span className="ml-0.5 text-lg">▶</span>
          </span>
        )}
        {!metadataBadge && productionBadge}
      </a>

      {(item.title || metadata || (metadata === undefined && item.category) || (metadataBadge && productionBadge)) && (
        <div className="artwork-card__metadata">
          {item.title && <h2 className="font-display text-xl uppercase leading-none text-foreground">{item.title}</h2>}
          {metadata && !metadataBadge && <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em]">{metadata}</p>}
          {metadata === undefined && item.category && <p>{item.category}</p>}
          {metadataBadge && (metadata || productionBadge) && <div className={`artwork-card__footer${dateOnly ? " artwork-card__footer--date-only" : metadata ? "" : " artwork-card__footer--time-only"}`}>
            {metadata && <ArtworkDateRibbon date={item.date} label={metadata} />}
            {productionBadge}
          </div>}
        </div>
      )}
    </motion.article>
  );
};

export default ArtworkCard;
