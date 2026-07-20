import React, { useEffect, useState } from "react";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import { Link } from "react-router-dom";

const BDReadingPage = ({ pages }) => {
  // État pour gérer la visibilité des images
  const [imagesVisible, setImagesVisible] = useState(false);

  useEffect(() => {
    // Initialiser Fancybox quand la page est chargée
    Fancybox.bind("[data-fancybox='gallery']", {
      infinite: true, // Permet une navigation infinie entre les pages
      loop: true, // Permet de boucler entre les pages
    });
  }, [pages]);

  return (
    <div className="flex flex-col min-h-screen bg-light-background dark:bg-dark-background">
      {/* Contenu principal */}
      <div className="flex-grow p-36 pt-16">
        {/* Titre */}
        <h1 className="text-4xl font-bold text-center mb-9 pt-6">
          Bonne lecture 🙂
        </h1>

        {/* Bouton "Ouvrir les premières pages en grand" */}
        <div className="mt-6 text-center">
          <a
            href={pages[0]} // Lien vers la première image pour Fancybox
            data-fancybox="gallery" // Associe l'image à la galerie Fancybox
            data-caption={`Page 1`} // Légende de la première page
            className="inline-block text-white bg-blue-500 hover:bg-blue-700 px-6 py-3 rounded-md text-lg text-center"
          >
            Commencer la lecture
          </a>
        </div>

        {/* Container Fancybox pour afficher toutes les pages dynamiquement */}
        <div style={{ display: "none" }}>
          {pages.slice(1, 31).map((page, index) => (
            <div
              key={index}
              data-fancybox="gallery"
              href={page} // Lien vers l'image
              data-caption={`Page ${index + 2}`}
            />
          ))}
        </div>

        {/* Afficher les images uniquement après un clic sur le bouton */}
        {imagesVisible && (
          <div className="gallery grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 justify-items-center mx-auto mt-8">
            {pages.slice(0, 16).map((page, index) => (
              <div key={index} className="text-center">
                <a
                  href={page} // Lien vers l'image pour Fancybox
                  data-fancybox="gallery" // Associe chaque image à la galerie
                  data-caption={`Page ${index + 1}`} // Légende de chaque image
                  className="block"
                >
                  <img
                    src={page}
                    alt={`Page ${index + 1}`}
                    className="w-32 sm:w-40 md:w-48 lg:w-64 h-auto rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300 ease-in-out cursor-pointer"
                  />
                </a>
                {/* Affichage du numéro de la page */}
                <p className="mt-2 text-sm font-semibold">Page {index + 1}</p>
              </div>
            ))}
          </div>
        )}

        {/* Bouton retour à la sélection */}
        <div className="mt-6 text-center">
          <Link
            to="/mangaka" // Chemin pour revenir à la sélection
            className="inline-block text-white bg-gray-700 hover:bg-gray-500 px-6 py-2 rounded-md text-center"
          >
            Retour à la sélection
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BDReadingPage;
