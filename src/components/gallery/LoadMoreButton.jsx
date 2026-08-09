const LoadMoreButton = ({ onClick, label, remaining }) => (
  <div className="flex justify-center py-12">
    <button
      type="button"
      onClick={onClick}
      className="button-primary"
      aria-label={`${label} (${remaining})`}
    >
      {label}
    </button>
  </div>
);

export default LoadMoreButton;
