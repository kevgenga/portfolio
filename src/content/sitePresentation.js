import { assetPath } from "../utils/assetPath";

export const sitePresentation = Object.freeze({
  hero: Object.freeze({
    image: assetPath("assets/illustration/page1-v8-72dpi.jpg"),
    alt: "Color manga illustration by KEVGENGA",
    objectPosition: "center 38%",
  }),
  aboutShowcase: Object.freeze([
    Object.freeze({
      id: "action-sketch",
      image: assetPath("assets/illustration/illustrations/Illustration44-2.jpg"),
      alt: "Dynamic action sketch by KEVGENGA",
      label: "Action Sketch",
      to: "/illustration",
    }),
    Object.freeze({
      id: "character-illustration",
      image: assetPath("assets/illustration/illustrations/Illustration34.jpg"),
      alt: "Character illustration by KEVGENGA",
      label: "Character Work",
      to: "/illustration",
    }),
    Object.freeze({
      id: "stubborn-love",
      image: assetPath("assets/mangaka/completed-manga/stubborn-love/banner.jpg"),
      alt: "Stubborn Love manga artwork by KEVGENGA",
      label: "Manga",
      to: "/mangaka",
    }),
  ]),
});
