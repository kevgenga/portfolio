import { Link } from "react-router-dom";

const ArtworkStrip = ({ artworks, categories = false }) => (
  <div className={`artwork-strip${categories ? " artwork-strip--categories" : ""}`}>
    {artworks.map((artwork, index) => (
      <Link
        key={artwork.id}
        to={artwork.to}
        className={`artwork-strip__item artwork-strip__item--${index + 1}`}
      >
        <img src={artwork.image} alt={artwork.alt} loading="lazy" decoding="async" />
        <span className="artwork-strip__label">
          <span>{String(index + 1).padStart(2, "0")}</span>
          {artwork.label}
          <span aria-hidden="true">↗</span>
        </span>
        {artwork.description && <span className="artwork-strip__description">{artwork.description}</span>}
      </Link>
    ))}
  </div>
);

export default ArtworkStrip;
