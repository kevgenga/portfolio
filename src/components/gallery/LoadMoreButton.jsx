const LoadMoreButton = ({ onClick, label, remaining }) => (
  <div className="flex justify-center py-8">
    <button
      type="button"
      onClick={onClick}
      className="border border-blue-500 px-6 py-3 font-medium uppercase text-blue-600 transition-colors hover:bg-blue-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-blue-300 dark:focus-visible:ring-offset-gray-900"
      aria-label={`${label} (${remaining})`}
    >
      {label}
    </button>
  </div>
);

export default LoadMoreButton;
