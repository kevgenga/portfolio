import { motion } from "framer-motion";

const PortfolioGrid = ({ children, className = "" }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={{
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
    }}
    className={`grid gap-3 pt-3 ${className}`}
  >
    {children}
  </motion.div>
);

export default PortfolioGrid;
