import { motion } from "framer-motion";

const ArtworkCard = ({
  item,
  galleryName,
  href = item.image,
  image = item.thumbnail || item.poster || item.image,
  caption = item.alt || item.title,
  metadata,
  rounded = false,
  className = "",
  mediaClassName = "aspect-[4/5]",
}) => {
  const imageDimensions = {};

  if (item.width) imageDimensions.width = item.width;
  if (item.height) imageDimensions.height = item.height;

  return (
    <motion.article
      className={`overflow-hidden border border-black/10 bg-[#faf8f4] dark:border-white/10 dark:bg-[#1d1d1b] ${className}`}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={{ duration: 0.2 }}
    >
      <a
        href={href}
        data-fancybox={galleryName}
        data-caption={caption || undefined}
        className="group block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9b4035]"
      >
        <img
          src={image}
          alt={item.alt || item.title || ""}
          className={`w-full bg-[#e8e3da] object-cover transition-opacity duration-300 group-hover:opacity-90 dark:bg-[#262522] ${mediaClassName} ${
            rounded ? "rounded-none" : ""
          }`}
          loading="lazy"
          decoding="async"
          {...imageDimensions}
        />
      </a>

      {(item.title || metadata || item.category) && (
        <div className="border-t border-black/10 px-3 py-3 text-sm text-[#716c64] dark:border-white/10 dark:text-[#aaa49b]">
          {item.title && (
            <h2 className="font-semibold text-[#1d1d1b] dark:text-[#f4f1eb]">
              {item.title}
            </h2>
          )}
          {metadata && <p className="text-xs uppercase tracking-[0.12em]">{metadata}</p>}
          {!metadata && item.category && <p>{item.category}</p>}
        </div>
      )}
    </motion.article>
  );
};

export default ArtworkCard;
