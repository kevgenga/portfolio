const EmptyState = ({ message }) => (
  <p
    className="my-12 max-w-xl border-[3px] border-dashed border-line bg-surface p-6 font-semibold text-muted"
    role="status"
  >
    {message}
  </p>
);

export default EmptyState;
