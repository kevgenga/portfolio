import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "../components/gallery/ArtworkCard";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import LoadMoreButton from "../components/gallery/LoadMoreButton";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import { artworks } from "../content/artworks";
import { t } from "../content/ui";

export const ILLUSTRATION_PAGE_SIZE = 24;

const illustrationCategories = [
  "illustrations",
  "sketches",
  "paintings",
  "character-design",
];

const parseArtworkDate = (date) => {
  const [day, month, year] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
};

const Illustration = () => {
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent");
  const [visibleCount, setVisibleCount] = useState(ILLUSTRATION_PAGE_SIZE);

  const hasFeaturedArtwork = artworks.some((artwork) => artwork.featured);
  const filters = [
    { value: "all", label: t.common.all },
    ...illustrationCategories.map((category) => ({
      value: category,
      label: t.illustration.categories[category],
    })),
    ...(hasFeaturedArtwork
      ? [{ value: "featured", label: t.illustration.categories.featured }]
      : []),
  ];

  const filteredArtworks = useMemo(() => {
    const filtered = artworks.filter((artwork) => {
      if (filter === "all") return true;
      if (filter === "featured") return artwork.featured;
      return artwork.category.includes(filter);
    });

    return [...filtered].sort((a, b) =>
      sortOrder === "recent"
        ? parseArtworkDate(b.date) - parseArtworkDate(a.date)
        : parseArtworkDate(a.date) - parseArtworkDate(b.date),
    );
  }, [filter, sortOrder]);

  useEffect(() => {
    setVisibleCount(ILLUSTRATION_PAGE_SIZE);
  }, [filter, sortOrder]);

  const visibleArtworks = filteredArtworks.slice(0, visibleCount);
  const remainingCount = filteredArtworks.length - visibleArtworks.length;

  return (
    <main className="mx-auto min-h-screen overflow-x-clip bg-light-background px-4 pt-16 dark:bg-dark-background sm:px-6">
      <motion.h1
        className="mb-6 pt-12 text-center text-3xl font-semibold uppercase tracking-wide"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {t.illustration.title}
      </motion.h1>

      <FilterBar
        filters={filters}
        activeFilter={filter}
        onFilterChange={setFilter}
        onSortChange={() =>
          setSortOrder((current) =>
            current === "recent" ? "oldest" : "recent",
          )
        }
        sortLabel={`${t.common.sortLabel} : ${
          sortOrder === "recent" ? t.common.oldest : t.common.newest
        }`}
        filtersLabel={t.illustration.filtersLabel}
      />

      <Lightbox
        selector="[data-fancybox='illustration-gallery']"
        refreshKey={visibleCount}
      />

      {visibleArtworks.length > 0 ? (
        <>
          <PortfolioGrid className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {visibleArtworks.map((artwork) => (
              <ArtworkCard
                key={artwork.id}
                item={artwork}
                galleryName="illustration-gallery"
                metadata={artwork.date || artwork.category}
              />
            ))}
          </PortfolioGrid>

          {remainingCount > 0 && (
            <LoadMoreButton
              label={t.common.loadMore}
              remaining={remainingCount}
              onClick={() =>
                setVisibleCount((current) =>
                  Math.min(current + ILLUSTRATION_PAGE_SIZE, filteredArtworks.length),
                )
              }
            />
          )}
        </>
      ) : (
        <EmptyState message={t.common.noResults} />
      )}
    </main>
  );
};

export default Illustration;
