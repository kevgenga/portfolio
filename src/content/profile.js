import { assetPath } from "../utils/assetPath";

export const profile = {
  name: "KEVGENGA",
  role: "Manga Artist, Illustrator & 2D Animator",
  image: assetPath("assets/illustration/profil 150921.jpg"),
  about: {
    location: "Lyon, France",
    headline: ["Drawing stories", "into life."],
    roles: ["Manga Artist", "Illustrator", "2D Animator"],
    experienceLabel: "15+ years drawing experience",
    summary:
      "Self-taught manga artist based in Lyon, France, working across manga, illustration and 2D animation. 15+ years of drawing practice, with a focus on expressive characters, dynamic action and visual storytelling.",
    availability: {
      label: "Available for work",
      details: ["Freelance", "Remote", "International"],
    },
  },
  recognition: [
    {
      id: "mangadraft-first-prize-2022",
      award: "First Prize",
      distinction: "Winner",
      year: "2022",
      organization: "MangaDraft × Manga-io × XP-PEN",
      event: 'Winning manga: "Stubborn Love"',
      eventLanguage: "fr",
      tone: "yellow",
    },
    {
      id: "kadokawa-finalist-2026",
      award: "Finalist",
      distinction: "Selected",
      year: "2026",
      organization: "KADOKAWA WORLD MANGA CONTEST",
      event: 'Manga Finalist: “悟空の世!” — Top 300 of 1,959 entries from 118 countries & regions',
      eventLanguage: "ja",
      tone: "blue",
    },
  ],
  experience: {
    role: "Independent Manga Artist",
    period: "2010 — Present",
  },
  capabilities: [
    {
      label: "Manga Production",
      items: [
        "Storyboarding",
        "Visual Storytelling",
        "Action Choreography",
        "Composition",
        "Rough-to-Clean Workflow",
      ],
    },
    {
      label: "Illustration",
      items: [
        "Manga Illustration",
        "Character Design",
        "Action Sketching",
        "Dynamic Poses",
        "Anatomy & Expressions",
        "Perspective",
      ],
    },
    {
      label: "2D / Motion",
      items: ["2D Animation", "Motion"],
    },
  ],
  tools: [
    {
      label: "Digital",
      items: ["Clip Studio Paint", "Adobe Photoshop", "Adobe After Effects"],
    },
    {
      label: "Traditional",
      items: [
        "Ink — G-Pen, Maru-Pen",
        "Painting & Color — Poster Color, Copic Sketch",
      ],
    },
  ],
  contact: {
    email: "kevin.lao@hotmail.fr",
  },
  social: {
    instagram: "https://www.instagram.com/kevgenga/",
  },
};
