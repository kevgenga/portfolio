const EmptyState = ({ message }) => (
  <p
    className="my-12 max-w-xl border border-black/10 bg-[#faf8f4] p-6 text-[#68645e] dark:border-white/10 dark:bg-[#1d1d1b] dark:text-[#bbb5ac]"
    role="status"
  >
    {message}
  </p>
);

export default EmptyState;
