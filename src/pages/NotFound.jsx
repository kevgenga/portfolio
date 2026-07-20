import { Link } from "react-router-dom";
import { t } from "../content/ui";

const NotFound = () => (
  <main className="flex min-h-screen flex-col items-center justify-center bg-light-background px-6 text-center text-light-text dark:bg-dark-background dark:text-dark-text">
    <h1 className="text-4xl font-bold">{t.notFound.title}</h1>
    <p className="mt-4">{t.notFound.message}</p>
    <Link
      to="/"
      className="mt-6 inline-block rounded-md bg-gray-700 px-6 py-2 text-white hover:bg-gray-500"
    >
      {t.notFound.back}
    </Link>
  </main>
);

export default NotFound;
