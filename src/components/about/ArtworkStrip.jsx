import { Link } from "react-router-dom";

const ArtworkStrip = ({ artworks }) => (
  <div className="artwork-strip">
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
      </Link>
    ))}
  </div>
);

export default ArtworkStrip;
