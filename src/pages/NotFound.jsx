import { Link } from "react-router-dom";
import { t } from "../content/ui";

const NotFound = () => (
  <main className="public-page flex min-h-screen flex-col items-center justify-center px-6 text-center">
    <p className="section-eyebrow">404</p>
    <h1 className="section-title">{t.notFound.title}</h1>
    <p className="mt-5 text-muted">{t.notFound.message}</p>
    <Link to="/" className="button-primary mt-8">{t.notFound.back}</Link>
  </main>
);

export default NotFound;
