import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { mangas } from "../content/mangas";

const Mangaka = () => {
  useEffect(() => {
    document.title = "Mes Mangas | Portfolio";
  }, []);

  return (
    <div className="mx-auto px-6 pt-16 min-h-screen bg-light-background dark:bg-dark-background">
      
      {/* Titre animé */}
      <motion.h1
        className="text-3xl font-semibold text-center mb-6 uppercase tracking-wide pt-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        Mes Créations Manga
      </motion.h1>

      {/* Grille des mangas */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
      >
        {mangas.map((comic) => (
          <motion.div
            key={comic.id}
            className="overflow-hidden border border-gray-300 dark:border-gray-700 rounded-sm cursor-pointer"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <Link to={comic.route} className="block">
              <div className="relative h-48">
                <img
                  src={comic.cover}
                  alt={`Couverture du manga ${comic.title}`}
                  className="w-full h-full object-cover transition-all duration-300 hover:opacity-85"
                  loading="lazy"
                />
              </div>
              {/* Conteneur avec hauteur dynamique et ajustée */}
              <div className="p-4 bg-white dark:bg-gray-900 flex flex-col justify-between min-h-[350px] md:min-h-[400px]">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {comic.title} {comic.edition && <span className="text-red-500">{comic.edition}</span>}
              </h2>

                {/* Description ajustée pour l'affichage sur mobile */}
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-2 flex-grow break-words">{comic.summary}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Mangaka;
