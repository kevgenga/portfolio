import { motion } from "framer-motion";

const PortfolioGrid = ({ children, className = "" }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
    }}
    className={`grid gap-4 sm:gap-5 ${className}`}
  >
    {children}
  </motion.div>
);

export default PortfolioGrid;
