export const defaultLocale = "en";

export const uiText = {
  en: {
    common: {
      all: "All",
      loading: "Loading…",
      loadMore: "Load more",
      noResults: "No work matches these filters.",
      sortLabel: "Sort by",
      newest: "Newest",
      oldest: "Oldest",
    },
    navigation: {
      home: "Home",
      manga: "Manga",
      illustration: "Illustration",
      animation: "Animation",
      about: "About",
      contact: "Contact",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      lightMode: "Use light mode",
      darkMode: "Use dark mode",
    },
    footer: {
      role: "Manga Artist, Illustrator & 2D Animator",
      copyright: (year) => `© ${year} KEVGENGA. All rights reserved.`,
    },
    notFound: {
      title: "Page not found",
      message: "The page you are looking for does not exist.",
      back: "Back to home",
    },
    illustration: {
      eyebrow: "Portfolio",
      title: "Illustration",
      introduction: "Illustration, sketches, paintings and character design.",
      filtersLabel: "Filter illustrations",
      categories: {
        illustrations: "Illustrations",
        sketches: "Sketches",
        paintings: "Paintings",
        "character-design": "Character Design",
        featured: "Personal Selection",
      },
    },
    animation: {
      eyebrow: "Motion work",
      title: "2D Animation",
      introduction: "Short films, animation studies and character motion.",
      filtersLabel: "Filter animations",
      categories: {
        "court-métrage": "Short Film",
        "animation 2d": "2D Animation",
      },
    },
    manga: {
      eyebrow: "Sequential art",
      title: "Manga",
      introduction: "Original manga projects. Select a title to read every page.",
      read: "Read Manga",
      coverAlt: (title) => `${title} manga cover`,
    },
    mangaReader: {
      title: (mangaTitle) => `Read ${mangaTitle}`,
      progress: (current, total) => `Page ${current} of ${total}`,
      pageAlt: (title, page) => `${title} — page ${page}`,
      pageCaption: (page) => `Page ${page}`,
      back: "Back to Manga",
      previous: "Previous page",
      next: "Next page",
    },
    contact: {
      eyebrow: "Start a conversation",
      title: "Contact",
      introduction:
        "For project enquiries and professional opportunities, use the form or contact me directly by email.",
      directEmail: "Email directly",
      name: "Name",
      email: "Email",
      message: "Message",
      submit: "Send Message",
      submitting: "Sending…",
      ready: "Your message is ready to send.",
      success: "Your message has been sent successfully.",
      requiredError: "Please complete all fields.",
      emailError: "Please enter a valid email address.",
      submitError: "Your message could not be sent.",
      networkError: "Unable to connect. Please try again.",
    },
  },
};

export const t = uiText[defaultLocale];

export const getUiText = (locale = defaultLocale) =>
  uiText[locale] || uiText[defaultLocale];
