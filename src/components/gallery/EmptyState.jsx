const EmptyState = ({ message }) => (
  <p
    className="mx-auto my-12 max-w-xl border border-gray-300 p-6 text-center text-gray-600 dark:border-gray-700 dark:text-gray-300"
    role="status"
  >
    {message}
  </p>
);

export default EmptyState;
