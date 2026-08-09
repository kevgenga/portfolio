import { motion } from "framer-motion";

const PortfolioGrid = ({ children, className = "", gapClassName = "gap-4 sm:gap-5" }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
    }}
    className={`grid ${gapClassName} ${className}`}
  >
    {children}
  </motion.div>
);

export default PortfolioGrid;
