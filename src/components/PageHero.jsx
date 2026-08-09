import { motion } from "framer-motion";

const PageHero = ({ eyebrow, title, introduction, index, backgroundWord = title }) => (
  <motion.header
    className="page-hero"
    initial={{ opacity: 0, x: -12 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
  >
    <span className="page-hero__word" aria-hidden="true">{backgroundWord}</span>
    <div className="relative z-10 max-w-4xl">
      <p className="page-kicker"><span>{index}</span>{eyebrow}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-introduction">{introduction}</p>
    </div>
  </motion.header>
);

export default PageHero;
