import { motion } from "framer-motion";

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
}) => {
  const imageDimensions = {};
  if (item.width) imageDimensions.width = item.width;
  if (item.height) imageDimensions.height = item.height;

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
      </a>

      {(item.title || metadata || (metadata === undefined && item.category)) && (
        <div className="artwork-card__metadata">
          {item.title && <h2 className="font-display text-xl uppercase leading-none text-foreground">{item.title}</h2>}
          {metadata && <p className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.12em]">{metadata}</p>}
          {metadata === undefined && item.category && <p>{item.category}</p>}
        </div>
      )}
    </motion.article>
  );
};

export default ArtworkCard;
