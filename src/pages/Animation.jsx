import { useMemo, useState } from "react";
import ArtworkCard from "../components/gallery/ArtworkCard";
import EmptyState from "../components/gallery/EmptyState";
import FilterBar from "../components/gallery/FilterBar";
import Lightbox from "../components/gallery/Lightbox";
import PortfolioGrid from "../components/gallery/PortfolioGrid";
import PageHero from "../components/PageHero";
import { animations } from "../content/animations";
import { t } from "../content/ui";
import { formatPortfolioDate } from "../utils/formatPortfolioDate";

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
    <main className="public-page px-5 pb-16 pt-24 sm:px-8 lg:px-10">
      <PageHero
        index="03"
        eyebrow={t.animation.eyebrow}
        title={t.animation.title}
        introduction={t.animation.introduction}
        backgroundWord="MOTION"
      />

      <div className="mx-auto max-w-[100rem]">

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
        <PortfolioGrid className="grid-cols-1 md:grid-cols-2" gapClassName="gap-5 lg:gap-8">
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
                variant="cinematic"
                showPlayIndicator
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
