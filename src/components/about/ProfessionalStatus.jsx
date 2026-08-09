const ProfessionalStatus = ({ label, details }) => (
  <aside className="professional-status" aria-label={`${label}: ${details.join(", ")}`}>
    <span className="professional-status__marker" aria-hidden="true" />
    <div>
      <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-positive">{label}</p>
      <p className="mt-1 text-sm font-semibold text-paper/75">{details.join(" · ")}</p>
    </div>
  </aside>
);

export default ProfessionalStatus;
