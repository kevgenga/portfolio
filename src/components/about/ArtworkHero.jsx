const ArtworkHero = ({ artwork }) => (
  <figure className="artwork-hero">
    <div className="artwork-hero__backdrop" aria-hidden="true" />
    <div className="artwork-hero__frame">
      <img
        src={artwork.image}
        alt={artwork.alt}
        className="artwork-hero__image"
        style={{ objectPosition: artwork.objectPosition }}
        fetchPriority="high"
        loading="eager"
        decoding="async"
      />
      <span className="artwork-hero__caption">Original artwork · KEVGENGA</span>
    </div>
  </figure>
);

export default ArtworkHero;
