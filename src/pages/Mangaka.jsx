import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

const comics = [
  {
    id: 1,
    title: "SHARING!!",
    description: "Un esprit en colère dévastait tout sur son passage. Deux combattants, chacun avec une approche différente, cherchaient à l'arrêter tout en tentant de comprendre ce qui alimentait sa rage.\nDécouvrez l'histoire de SHARING!!",
    coverImage: "/test-portfolio-mangaka/assets/mangaka/sharing/447x200.jpg",
  },
  {
    id: 2,
    title: "Stubborn love",
    description: "Deux amis d'enfance \"Stubborn\" et \"Love\" sont transportés devant la porte de la mort suite à un accident mortel. Pourront-ils y survivre ? La vérité sur leurs sentiments est à son paroxysme. Découvrez l'histoire de Stubborn Love.",
    coverImage: "/test-portfolio-mangaka/assets/mangaka/stubborn-love/01.jpg",
  },
  {
    id: 3,
    title: "Ahès",
    description: "Enfermée dans son château depuis des siècles, la princesse Ahès finit par s'enfuir pour découvrir le monde extérieur qui lui était interdit... Face à la destruction de son royaume, elle devra lutter contre son destin. Découvrez l'histoire de Ahès.",
    coverImage: "/test-portfolio-mangaka/assets/mangaka/ahes/page_001.jpg",
  },
  {
    id: 4,
    title: "SHARING!!",
    extended: "[VERSION EXTENDED]",
    description: "Un esprit en colère dévastait tout sur son passage. Deux combattants, chacun avec une approche différente, cherchaient à l'arrêter tout en tentant de comprendre ce qui alimentait sa rage.\nDécouvrez l'histoire de SHARING!!",
    coverImage: "/test-portfolio-mangaka/assets/mangaka/sharing_version-extended/447x200.jpg",
  },
];

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
        {comics.map((comic) => (
          <motion.div
            key={comic.id}
            className="overflow-hidden border border-gray-300 dark:border-gray-700 rounded-sm cursor-pointer"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <Link to={`/mangas/${comic.id}`} className="block">
              <div className="relative h-48">
                <img
                  src={comic.coverImage}
                  alt={`Couverture du manga ${comic.title}`}
                  className="w-full h-full object-cover transition-all duration-300 hover:opacity-85"
                  loading="lazy"
                />
              </div>
              {/* Conteneur avec hauteur dynamique et ajustée */}
              <div className="p-4 bg-white dark:bg-gray-900 flex flex-col justify-between min-h-[350px] md:min-h-[400px]">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {comic.title} {comic.extended && <span className="text-red-500">{comic.extended}</span>}
              </h2>

                {/* Description ajustée pour l'affichage sur mobile */}
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-2 flex-grow break-words">{comic.description}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Mangaka;
