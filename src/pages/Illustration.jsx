import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ArtworkCard from "../components/gallery/ArtworkCard";
import IllustrationViewControls from "../components/gallery/IllustrationViewControls";
import "../components/gallery/IllustrationViews.css";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import PageHero from "../components/PageHero";
import {
  isArtworkCategoryVisible,
  isArtworkPubliclyVisible,
} from "../content/artworkPresentation";
import * as artworkCatalog from "../content/artworks";
import { getPublicArtworkProductionGroups } from "../utils/publicProductionTime";
import { createProductionTimeCaption } from "../utils/productionTimeCaption";
import { useLanguage } from "../i18n/languageContext";
import { formatPortfolioDate } from "../utils/formatPortfolioDate";
import { illustrationCategories, resolveIllustrationFilter } from "../utils/illustrationFilters";
import { readIllustrationView, saveIllustrationView } from "../utils/illustrationView";

export const ILLUSTRATION_PAGE_SIZE = 24;
const { artworks } = artworkCatalog;
// Optional export in historical catalogs; no migration or copied duration file.
const productionGroups = Reflect.get(artworkCatalog, "artworkProductionGroups");

const parseArtworkDate = (date) => {
  const [day, month, year] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
};

const publicArtworks = artworks.filter((artwork) =>
  isArtworkPubliclyVisible(artwork),
);
const groupsByArtwork = new Map(publicArtworks.map(artwork => [artwork.id, getPublicArtworkProductionGroups(productionGroups, artwork.id, publicArtworks)]));

const visibleIllustrationCategories = illustrationCategories.filter((category) =>
  isArtworkCategoryVisible(category),
);

const countArtworksForFilter = (filter) =>
  publicArtworks.reduce((count, artwork) => {
    if (filter === "all") return count + 1;
    if (filter === "featured") return count + (artwork.featured ? 1 : 0);
    return count + (artwork.category.includes(filter) ? 1 : 0);
  }, 0);

const Illustration = () => {
  const { t, locale } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const hasFeaturedArtwork = publicArtworks.some((artwork) => artwork.featured);
  const filter = resolveIllustrationFilter(searchParams.get("category"), visibleIllustrationCategories, hasFeaturedArtwork);
  const [sortOrder, setSortOrder] = useState("recent");
  const [view, setView] = useState(() => readIllustrationView());
  const [visibleCount, setVisibleCount] = useState(ILLUSTRATION_PAGE_SIZE);
  const loadSentinelRef = useRef(null);
  const loadingNextBatchRef = useRef(false);

  const filters = useMemo(
    () => [
      { value: "all", label: t.common.all },
      ...visibleIllustrationCategories.map((category) => ({
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
    [hasFeaturedArtwork, t],
  );

  const filteredArtworks = useMemo(() => {
    const filtered = publicArtworks.filter((artwork) => {
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
      caption: createProductionTimeCaption(formatPortfolioDate(artwork.date, locale) || "", artwork.productionTime, groupsByArtwork.get(artwork.id), locale, t.productionTime),
      alt: artwork.alt || "",
    })),
    [filteredArtworks, locale, t.productionTime],
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
    setSearchParams((current) => { const next = new URLSearchParams(current); next.set("category", nextFilter); return next; }, { replace: true });
    setVisibleCount(ILLUSTRATION_PAGE_SIZE);
  };

  const toggleSort = () => {
    setSortOrder((current) => current === "recent" ? "oldest" : "recent");
    setVisibleCount(ILLUSTRATION_PAGE_SIZE);
  };

  const changeView = (nextView) => {
    setView(nextView);
    saveIllustrationView(nextView);
  };

  return (
    <main className="public-page px-5 pb-16 pt-24 sm:px-8 lg:px-10">
      <PageHero
        index="02"
        eyebrow={t.illustration.eyebrow}
        title={t.illustration.title}
        introduction={t.illustration.introduction}
        backgroundWord={t.home.artWord}
      />

      <div className="mx-auto max-w-[100rem]">

      <FilterBar
        filters={filters}
        activeFilter={filter}
        onFilterChange={changeFilter}
        onSortChange={toggleSort}
        sortLabel={`${t.common.sortLabel} : ${
          sortOrder === "recent" ? t.common.oldest : t.common.newest
        }`}
        filtersLabel={t.illustration.filtersLabel}
        controls={<IllustrationViewControls view={view} onChange={changeView} labels={t.illustration.views} />}
      />

      <Lightbox
        selector="[data-fancybox='illustration-gallery']"
        galleryName="illustration-gallery"
        slides={lightboxSlides}
      />

      {visibleArtworks.length > 0 ? (
        <>
          <PortfolioGrid className={view === "compact" ? "illustration-grid illustration-grid--compact" : "illustration-grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"} gapClassName="gap-2 sm:gap-3 lg:gap-4">
            {visibleArtworks.map((artwork) => {
              const formattedDate = formatPortfolioDate(artwork.date, locale);

              return (
                <ArtworkCard
                  key={artwork.id}
                  item={artwork}
                  galleryName="illustration-gallery"
                  lightboxId={artwork.id}
                  caption={formattedDate}
                  metadata={formattedDate}
                  className="artwork-card--illustration"
                  variant="wall"
                  showProductionTime
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
              <span className="h-2 w-2 animate-pulse bg-primary motion-reduce:animate-none" />
            </div>
          )}
        </>
      ) : (
        <EmptyState message={t.common.noResults} />
      )}
      </div>
    </main>
  );
};

export default Illustration;
