import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "../components/gallery/ArtworkCard";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import { animations } from "../content/animations";
import { t } from "../content/ui";
import { formatPortfolioDate } from "../utils/formatPortfolioDate";
import "./custom.css";

const animationCategories = ["court-métrage", "animation 2d", "animation 3d"];

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
    <main className="min-h-screen overflow-x-clip bg-[#f4f1eb] px-5 pb-16 pt-28 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb] sm:px-8 lg:px-10">
      <motion.header
        className="mx-auto mb-12 max-w-7xl border-b border-black/10 pb-10 dark:border-white/10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="section-eyebrow">{t.animation.eyebrow}</p>
        <h1 className="section-title">{t.animation.title}</h1>
        <p className="mt-5 max-w-xl text-[#68645e] dark:text-[#bbb5ac]">{t.animation.introduction}</p>
      </motion.header>

      <div className="mx-auto max-w-7xl">

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
        <PortfolioGrid className="grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {sortedMedia.map((item) => {
            const formattedDate = formatPortfolioDate(item.date);

            return (
              <ArtworkCard
                key={item.id}
                item={item}
                galleryName="animation-gallery"
                href={item.video}
                image={item.poster || item.video}
                caption={formattedDate}
                metadata={formattedDate}
                mediaClassName="aspect-video"
              />
            );
          })}
        </PortfolioGrid>
      ) : (
        <EmptyState message={t.common.noResults} />
      )}
      </div>
    </main>
  );
};

export default Animation;
