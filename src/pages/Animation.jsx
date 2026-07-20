import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "../components/gallery/ArtworkCard";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import { animations } from "../content/animations";
import { t } from "../content/ui";
import "./custom.css";

const animationCategories = ["court-métrage", "animation 2d"];

const formatDate = (date) =>
  new Date(date).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const Animation = () => {
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");

  const sortedMedia = useMemo(() => {
    const filteredMedia = animations.filter(
      (item) => filter === "all" || item.category === filter,
    );

    return [...filteredMedia].sort((a, b) =>
      sortOrder === "desc"
        ? new Date(b.date) - new Date(a.date)
        : new Date(a.date) - new Date(b.date),
    );
  }, [filter, sortOrder]);

  const filters = [
    { value: "all", label: t.common.all },
    ...animationCategories.map((category) => ({
      value: category,
      label: t.animation.categories[category],
    })),
  ];

  return (
    <main className="mx-auto min-h-screen overflow-x-clip bg-light-background p-4 pt-16 text-light-text dark:bg-dark-background dark:text-dark-text sm:p-8 sm:pt-16">
      <motion.h1
        className="mb-6 pt-12 text-center text-3xl font-semibold uppercase tracking-wide"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {t.animation.title}
      </motion.h1>

      <FilterBar
        filters={filters}
        activeFilter={filter}
        onFilterChange={setFilter}
        onSortChange={() =>
          setSortOrder((current) => (current === "desc" ? "asc" : "desc"))
        }
        sortLabel={`${t.common.sortLabel} : ${
          sortOrder === "desc" ? t.common.newest : t.common.oldest
        }`}
        filtersLabel={t.animation.filtersLabel}
      />

      <Lightbox selector="[data-fancybox='animation-gallery']" />

      {sortedMedia.length > 0 ? (
        <PortfolioGrid className="grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sortedMedia.map((item) => (
            <ArtworkCard
              key={item.id}
              item={item}
              galleryName="animation-gallery"
              href={item.video}
              image={item.poster || item.video}
              metadata={item.date ? formatDate(item.date) : item.category}
              rounded
              className="border-gray-400 shadow-lg dark:border-gray-800"
            />
          ))}
        </PortfolioGrid>
      ) : (
        <EmptyState message={t.common.noResults} />
      )}
    </main>
  );
};

export default Animation;
