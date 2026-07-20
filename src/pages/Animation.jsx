import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import './custom.css'; // Importation du fichier CSS personnalisé

// Liste des médias à afficher dans la galerie
const media = [
  { 
    src: "/test-portfolio-mangaka/assets/animation/pour-cassie.mp4", 
    alt: "court-métrage 01", 
    category: "court-métrage", 
    date: "2022-12-12", 
    type: "video",
    thumbnail: "/test-portfolio-mangaka/assets/animation/miniature/cassie.jpg" // Miniature de la vidéo
  },
  { 
    src: "/test-portfolio-mangaka/assets/animation/anime-transformation-v2.gif", 
    alt: "animation 2d 01", 
    category: "animation 2d", 
    date: "2025-02-01", 
    type: "image"
  },
  { 
    src: "/test-portfolio-mangaka/assets/animation/disparition.mp4", 
    alt: "animation 2d 02", 
    category: "animation 2d", 
    date: "2023-07-15", 
    type: "video",
    thumbnail: "/test-portfolio-mangaka/assets/animation/miniature/disparition.jpg" // Miniature de la vidéo
  },
  { 
    src: "/test-portfolio-mangaka/assets/animation/petite-fille.mp4", 
    alt: "animation 2d 03", 
    category: "animation 2d", 
    date: "2022-08-30", 
    type: "video",
    thumbnail: "/test-portfolio-mangaka/assets/animation/miniature/petite-fille.jpg" // Miniature de la vidéo
  },
  { 
    src: "/test-portfolio-mangaka/assets/animation/chanteuse.mp4", 
    alt: "animation 2d 03", 
    category: "animation 2d", 
    date: "2022-08-30", 
    type: "video",
    thumbnail: "/test-portfolio-mangaka/assets/animation/miniature/chanteuse.jpg" // Miniature de la vidéo
  },
  { 
    src: "/test-portfolio-mangaka/assets/animation/turn-arround.mp4", 
    alt: "animation 2d 03", 
    category: "animation 2d", 
    date: "2022-08-30", 
    type: "video",
    thumbnail: "/test-portfolio-mangaka/assets/animation/miniature/turn-arround.jpg" // Miniature de la vidéo
  },
  // Ajoute d'autres vidéos avec miniatures ici...
];

const Animation = () => {
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");

  useEffect(() => {
    // Initialisation de Fancybox
    Fancybox.bind("[data-fancybox='gallery']");
  }, []);

  const filteredMedia = media.filter(item => item.category === filter || filter === "all");

  const sortedMedia = filteredMedia.sort((a, b) => {
    if (sortOrder === "desc") {
      return new Date(b.date) - new Date(a.date);
    } else if (sortOrder === "asc") {
      return new Date(a.date) - new Date(b.date);
    }
    return 0;
  });

  const formatDate = (date) => {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Date(date).toLocaleDateString('fr-FR', options);
  };

  const toggleSortOrder = () => {
    setSortOrder(prevSortOrder => (prevSortOrder === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="mx-auto p-8 pt-16 min-h-screen bg-light-background dark:bg-dark-background text-light-text dark:text-dark-text">
      <motion.h1
        className="text-3xl font-semibold text-center mb-6 uppercase tracking-wide pt-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        Animations 2D
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-wrap justify-center gap-4 mb-6"
      >
        {["all", "court-métrage", "animation 2d"].map((category) => (
          <button
          key={category}
          className={`px-4 py-1.5 text-sm font-medium uppercase transition-all duration-200 border 
            ${filter === category 
              ? "border-blue-600 text-blue-600 shadow-sm" 
              : "border-gray-400 text-gray-600 hover:border-gray-700 hover:text-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-400"}
          `}
          onClick={() => setFilter(category)}
        >
          {category === "all" ? "Tout" : category.charAt(0).toUpperCase() + category.slice(1)}
        </button>
      ))}
      
        <button
          className="px-4 py-1.5 text-sm font-medium uppercase border border-gray-400 text-gray-600 
            hover:border-gray-700 hover:text-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-400 transition-all duration-200"
          onClick={toggleSortOrder}
        >
          Trier par : {sortOrder === "desc" ? "Plus récent" : "Plus ancien"}
        </button>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
        }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pt-3"
      >
        {sortedMedia.map((item, index) => (
          <motion.div 
            key={index}
            className="overflow-hidden shadow-lg cursor-pointer rounded-xl border border-gray-400 dark:border-gray-800"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.05 }}
            transition={{ duration: 0.2 }}
          >
            <a href={item.src} data-fancybox="gallery" data-caption={item.alt}>
              {item.type === "video" ? (
                <img 
                  src={item.thumbnail || "/assets/default-thumbnail.jpg"} 
                  alt={item.alt} 
                  className="w-full h-64 object-cover transition-all duration-300 hover:opacity-80 rounded-t-lg"
                  loading="lazy"
                />
              ) : (
                <img 
                  src={item.src} 
                  alt={item.alt} 
                  className="w-full h-64 object-cover transition-all duration-300 hover:opacity-80"
                  loading="lazy"
                />
              )}
            </a>
            <div className="font-semibold text-center text-sm text-gray-500 dark:text-gray-400 dark:bg-gray-800 py-2 pb-2">
              {formatDate(item.date)}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Animation;
