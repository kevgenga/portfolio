export const defaultLocale = "fr";

export const uiText = {
  fr: {
    common: {
      all: "Tout",
      loading: "Chargement…",
      loadMore: "Afficher plus",
      noResults: "Aucun résultat pour ces filtres.",
      sortLabel: "Trier par",
      newest: "Plus récent",
      oldest: "Plus ancien",
    },
    navigation: {
      home: "Accueil",
      mangaka: "Mangaka",
      illustration: "Illustration",
      animation: "Animation",
      contact: "Contact",
      openMenu: "Ouvrir le menu",
      closeMenu: "Fermer le menu",
      lightMode: "Mode Clair",
      darkMode: "Mode Sombre",
      changeTheme: "Changer de thème",
    },
    footer: {
      credit: "Site web créé par",
      author: "Kevgenga",
    },
    notFound: {
      title: "Page introuvable",
      message: "La page demandée n’existe pas.",
      back: "Retour à l’accueil",
    },
    illustration: {
      title: "Galerie d'Illustrations",
      filtersLabel: "Filtrer les illustrations",
      categories: {
        illustrations: "Illustrations",
        sketches: "Sketches",
        paintings: "Paintings",
        "character-design": "Character-design",
        featured: "Personal Selection",
      },
    },
    animation: {
      title: "Animations 2D",
      filtersLabel: "Filtrer les animations",
      categories: {
        "court-métrage": "Court-métrage",
        "animation 2d": "Animation 2d",
      },
    },
    mangaReader: {
      title: "Bonne lecture 🙂",
      progress: (current, total) => `Page ${current} / ${total}`,
      pageAlt: (title, page) => `${title} — page ${page}`,
      pageCaption: (page) => `Page ${page}`,
      back: "Retour à la sélection",
      previous: "Page précédente",
      next: "Page suivante",
    },
    contact: {
      title: "Contactez-moi",
      name: "Nom",
      email: "Email",
      message: "Écrivez-moi un message ...",
      submit: "Envoyer",
      submitting: "Envoi en cours...",
      ready: "Le formulaire a bien été rempli. Vous pouvez maintenant envoyer.",
      success: "Message envoyé avec succès!",
      requiredError: "Tous les champs doivent être remplis.",
      emailError: "L'adresse e-mail est invalide.",
      submitError: "Erreur lors de l'envoi du message.",
      networkError: "Erreur de connexion au serveur.",
    },
  },
};

export const t = uiText[defaultLocale];

export const getUiText = (locale = defaultLocale) =>
  uiText[locale] || uiText[defaultLocale];
