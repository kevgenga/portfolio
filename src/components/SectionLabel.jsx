const SectionLabel = ({ index, label, note, inverse = false }) => (
  <header className={`section-label ${inverse ? "section-label--inverse" : ""}`}>
    <div className="flex items-center gap-3">
      <span className="section-label__index" aria-hidden="true">{index}</span>
      <p className="section-label__text">{label}</p>
    </div>
    {note && <p className="section-label__note">{note}</p>}
  </header>
);

export default SectionLabel;
