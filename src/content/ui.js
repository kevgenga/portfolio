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
        backgrounds: "Backgrounds",
        featured: "Personal Selection",
      },
    },
    animation: {
      eyebrow: "Motion work",
      title: "Animation",
      introduction: "Short films, 2D and 3D animation studies, and character motion.",
      filtersLabel: "Filter animations",
      categories: {
        "court-métrage": "Short Film",
        "animation 2d": "2D Animation",
        "animation 3d": "3D Animation",
      },
    },
    manga: {
      eyebrow: "Sequential art",
      title: "Manga",
      introduction: "Original manga projects. Select a title to read every page.",
      sections: {
        completed: {
          title: "Completed Manga",
          description: "Fully inked and finalized manga projects.",
        },
        storyboard: {
          title: "Storyboards & Manga Concepts",
          description: "Storyboards, sketches and original manga concepts currently in development.",
        },
      },
      emptySection: "No projects are currently available in this section.",
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
      successTitle: "Your message has been sent successfully.",
      successReply:
        "Thank you for contacting me. I will reply as soon as possible using the email address you provided.",
      successDirectBefore:
        "If you have not received a response within 3–4 weeks, please contact me directly at ",
      successEmail: "kevin.lao@hotmail.fr",
      successDirectAfter: ".",
      requiredError: "Please complete all fields.",
      validationSummary: "Please correct the highlighted fields.",
      nameRequiredError: "Please enter your name or artist pseudonym.",
      nameError: "Please enter a valid name.",
      emailRequiredError: "Please enter your email address.",
      emailError: "Please enter a valid email address.",
      professionalEmailError: "Please enter a professional and valid email address.",
      disposableEmailError: "Please use a permanent email address.",
      messageRequiredError: "Please enter your message.",
      messageTooShortError: "Please write at least 20 characters.",
      messageTooLongError: "Please keep your message under 3000 characters.",
      meaningfulMessageError: "Please provide a meaningful project enquiry.",
      clearMessageError: "Please write a clear message describing your request.",
      respectfulLanguageError: "Please use respectful language.",
      tooManyLinksError: "Please include no more than one direct link.",
      urlShortenerError: "URL shorteners are not accepted.",
      submitError: "Your message could not be sent.",
      networkError: "Unable to connect. Please try again.",
      protectionError: "Your message could not be sent. Please review the form and try again.",
      rateLimitError:
        "Too many messages were sent. Please wait a few minutes before trying again.",
      badRequestError: "Please check your information and try again.",
      forbiddenError:
        "The contact service rejected the request. Please try again later or contact me directly by email.",
      serviceError:
        "The contact service is temporarily unavailable. Please try again later.",
    },
  },
};

export const t = uiText[defaultLocale];

export const getUiText = (locale = defaultLocale) =>
  uiText[locale] || uiText[defaultLocale];
