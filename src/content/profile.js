import { assetPath } from "../utils/assetPath";

export const profile = {
  name: "KEVGENGA",
  role: "Manga Artist, Illustrator & 2D Animator",
  image: assetPath("assets/illustration/profil 150921.jpg"),
  introduction: {
    greeting: "Hello World! My name is",
    profession: "manga artist, illustrator and 2D animator.",
  },
  highlights: {
    award: {
      icon: "🎉",
      label: "First prize winner",
      connector: "in the",
      linkLabel: "Mangadraft × XP-Pen 2022 competition",
      link: "https://www.mangadraft.com/contests/mangadraft-x-xp-pen-2022.fr",
    },
    selfTaught: {
      icon: "📖",
      label: "Self-taught since",
      value: "2010",
    },
    education: {
      icon: "🎨",
      label: "Training in",
      value: "drawing and graphic communication",
    },
    experience: {
      icon: "💼",
      label: "Experience in",
      value: "freelance work",
    },
  },
  software:
    "Clip Studio Paint EX, After Effects, Photoshop, Illustrator, InDesign, Flash Animate, OpenToonz, Toon Boom Harmony, Cinema 4D, Blender, Jump Paint, Visual Studio Code, Git, FileZilla, XAMPP, Android Studio and Microsoft Office.",
  contact: {
    email: "kevin.lao@hotmail.fr",
  },
};
