const CapabilityGroup = ({ label, items, index = 1 }) => {
  const headingId = `capability-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <section className="capability-block" aria-labelledby={headingId}>
      <p className="capability-block__index" aria-hidden="true">
        {String(index).padStart(2, "0")}
      </p>
      <h3 id={headingId} className="capability-block__title">{label}</h3>
      <ul className="capability-block__list">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
};

export default CapabilityGroup;
