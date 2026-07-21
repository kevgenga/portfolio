const LoadMoreButton = ({ onClick, label, remaining }) => (
  <div className="flex justify-center py-12">
    <button
      type="button"
      onClick={onClick}
      className="border border-[#9b4035] bg-[#9b4035] px-7 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white transition-colors hover:border-[#7e3028] hover:bg-[#7e3028] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9b4035] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#171716]"
      aria-label={`${label} (${remaining})`}
    >
      {label}
    </button>
  </div>
);

export default LoadMoreButton;
