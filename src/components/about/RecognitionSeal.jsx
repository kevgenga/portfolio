const RecognitionSeal = ({ award, distinction, year, tone, index }) => (
  <div
    className={`recognition-seal recognition-seal--${tone}`}
    aria-label={`${award}, ${distinction}, ${year}`}
  >
    <span className="recognition-seal__number" aria-hidden="true">
      {String(index).padStart(2, "0")}
    </span>
    <span className="recognition-seal__award">{award}</span>
    <span className="recognition-seal__divider" aria-hidden="true" />
    <span className="recognition-seal__distinction">{distinction}</span>
    <span className="recognition-seal__year">{year}</span>
  </div>
);

export default RecognitionSeal;
