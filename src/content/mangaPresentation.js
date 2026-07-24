export const MANGA_PRESENTATION_SECTIONS = Object.freeze({
  COMPLETED: "completed",
  STORYBOARD: "storyboard",
});

export const MANGA_PRESENTATION_SECTION_VALUES = Object.freeze(
  Object.values(MANGA_PRESENTATION_SECTIONS),
);

export const MANGA_PRESENTATION_DIRECTORIES = Object.freeze({
  [MANGA_PRESENTATION_SECTIONS.COMPLETED]: "completed-manga",
  [MANGA_PRESENTATION_SECTIONS.STORYBOARD]: "complete-storyboards",
});

export const getMangaPresentationSection = (manga) =>
  MANGA_PRESENTATION_SECTION_VALUES.includes(manga?.presentationSection)
    ? manga.presentationSection
    : MANGA_PRESENTATION_SECTIONS.COMPLETED;

export const getMangaPresentationDirectory = (manga) =>
  MANGA_PRESENTATION_DIRECTORIES[getMangaPresentationSection(manga)];
