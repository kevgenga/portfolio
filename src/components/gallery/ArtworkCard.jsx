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
}) => {
  const imageDimensions = {};

  if (item.width) imageDimensions.width = item.width;
  if (item.height) imageDimensions.height = item.height;

  return (
    <motion.article
      className={`overflow-hidden border border-gray-300 shadow-sm dark:border-gray-700 ${
        rounded ? "rounded-xl" : "rounded-sm"
      } ${className}`}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
      }}
      whileHover={{ scale: 1.015 }}
      transition={{ duration: 0.2 }}
    >
      <a
        href={href}
        data-fancybox={galleryName}
        data-caption={caption || undefined}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        <img
          src={image}
          alt={item.alt || item.title || ""}
          className={`w-full object-cover transition-opacity duration-300 hover:opacity-85 ${
            rounded ? "h-64 rounded-t-lg" : "h-48"
          }`}
          loading="lazy"
          decoding="async"
          {...imageDimensions}
        />
      </a>

      {(item.title || metadata || item.category) && (
        <div className="bg-white px-2 py-2 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          {item.title && (
            <h2 className="font-semibold text-gray-700 dark:text-gray-100">
              {item.title}
            </h2>
          )}
          {metadata && <p className="font-semibold">{metadata}</p>}
          {!metadata && item.category && <p>{item.category}</p>}
        </div>
      )}
    </motion.article>
  );
};

export default ArtworkCard;
