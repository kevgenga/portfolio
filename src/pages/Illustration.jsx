import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import ArtworkCard from "../components/gallery/ArtworkCard";
import BackToTopButton from "../components/gallery/BackToTopButton";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import { artworks } from "../content/artworks";
import { t } from "../content/ui";
import { formatPortfolioDate } from "../utils/formatPortfolioDate";

export const ILLUSTRATION_PAGE_SIZE = 24;

const illustrationCategories = [
  "illustrations",
  "sketches",
  "paintings",
  "character-design",
  "backgrounds",
];

const parseArtworkDate = (date) => {
  const [day, month, year] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
};

const countArtworksForFilter = (filter) =>
  artworks.reduce((count, artwork) => {
    if (filter === "all") return count + 1;
    if (filter === "featured") return count + (artwork.featured ? 1 : 0);
    return count + (artwork.category.includes(filter) ? 1 : 0);
  }, 0);

const Illustration = () => {
  const [filter, setFilter] = useState("illustrations");
  const [sortOrder, setSortOrder] = useState("recent");
  const [visibleCount, setVisibleCount] = useState(ILLUSTRATION_PAGE_SIZE);
  const loadSentinelRef = useRef(null);
  const loadingNextBatchRef = useRef(false);

  const hasFeaturedArtwork = artworks.some((artwork) => artwork.featured);
  const filters = useMemo(
    () => [
      { value: "all", label: t.common.all },
      ...illustrationCategories.map((category) => ({
        value: category,
        label: t.illustration.categories[category],
      })),
      ...(hasFeaturedArtwork
        ? [{ value: "featured", label: t.illustration.categories.featured }]
        : []),
    ].map((item) => ({
      ...item,
      count: countArtworksForFilter(item.value),
    })),
    [hasFeaturedArtwork],
  );

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

  const visibleArtworks = filteredArtworks.slice(0, visibleCount);
  const remainingCount = filteredArtworks.length - visibleArtworks.length;
  const lightboxSlides = useMemo(
    () => filteredArtworks.map((artwork) => ({
      id: artwork.id,
      src: artwork.image,
      thumbSrc: artwork.thumbnail || artwork.image,
      caption: formatPortfolioDate(artwork.date) || "",
      alt: artwork.alt || "",
    })),
    [filteredArtworks],
  );

  useEffect(() => {
    loadingNextBatchRef.current = false;
    const sentinel = loadSentinelRef.current;
    if (!sentinel || remainingCount <= 0) return undefined;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingNextBatchRef.current) return;
      loadingNextBatchRef.current = true;
      setVisibleCount((current) =>
        Math.min(current + ILLUSTRATION_PAGE_SIZE, filteredArtworks.length),
      );
    }, { rootMargin: "0px 0px 800px 0px" });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredArtworks.length, remainingCount, visibleCount]);

  const changeFilter = (nextFilter) => {
    setFilter(nextFilter);
    setVisibleCount(ILLUSTRATION_PAGE_SIZE);
  };

  const toggleSort = () => {
    setSortOrder((current) => current === "recent" ? "oldest" : "recent");
    setVisibleCount(ILLUSTRATION_PAGE_SIZE);
  };

  return (
    <main className="min-h-screen overflow-x-clip bg-[#f4f1eb] px-5 pb-16 pt-28 text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb] sm:px-8 lg:px-10">
      <motion.header
        className="mx-auto mb-12 max-w-7xl border-b border-black/10 pb-10 dark:border-white/10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <p className="section-eyebrow">{t.illustration.eyebrow}</p>
        <h1 className="section-title">{t.illustration.title}</h1>
        <p className="mt-5 max-w-xl text-[#68645e] dark:text-[#bbb5ac]">{t.illustration.introduction}</p>
      </motion.header>

      <div className="mx-auto max-w-7xl">

      <FilterBar
        filters={filters}
        activeFilter={filter}
        onFilterChange={changeFilter}
        onSortChange={toggleSort}
        sortLabel={`${t.common.sortLabel} : ${
          sortOrder === "recent" ? t.common.oldest : t.common.newest
        }`}
        filtersLabel={t.illustration.filtersLabel}
      />

      <Lightbox
        selector="[data-fancybox='illustration-gallery']"
        galleryName="illustration-gallery"
        slides={lightboxSlides}
      />

      {visibleArtworks.length > 0 ? (
        <>
          <PortfolioGrid className="grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {visibleArtworks.map((artwork) => {
              const formattedDate = formatPortfolioDate(artwork.date);

              return (
                <ArtworkCard
                  key={artwork.id}
                  item={artwork}
                  galleryName="illustration-gallery"
                  lightboxId={artwork.id}
                  caption={formattedDate}
                  metadata={formattedDate}
                />
              );
            })}
          </PortfolioGrid>

          {remainingCount > 0 && (
            <div
              ref={loadSentinelRef}
              className="flex min-h-20 items-center justify-center py-8"
              aria-hidden="true"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9b4035] motion-reduce:animate-none" />
            </div>
          )}
        </>
      ) : (
        <EmptyState message={t.common.noResults} />
      )}
      </div>
      <BackToTopButton />
    </main>
  );
};

export default Illustration;
