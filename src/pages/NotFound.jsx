import { Link } from "react-router-dom";
import { t } from "../content/ui";

const NotFound = () => (
  <main className="flex min-h-screen flex-col items-center justify-center bg-[#f4f1eb] px-6 text-center text-[#1d1d1b] dark:bg-[#171716] dark:text-[#f4f1eb]">
    <p className="section-eyebrow">404</p>
    <h1 className="section-title">{t.notFound.title}</h1>
    <p className="mt-5 text-[#68645e] dark:text-[#bbb5ac]">{t.notFound.message}</p>
    <Link to="/" className="button-primary mt-8">{t.notFound.back}</Link>
  </main>
);

export default NotFound;
