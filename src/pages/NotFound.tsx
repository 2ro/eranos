import { useSeoMeta } from "@unhead/react";
import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAppContext } from "@/hooks/useAppContext";

const NotFound = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('notFound.title')} | ${config.appName}`,
    description: t('notFound.description'),
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <main className="flex items-center justify-center">
      <div className="text-center px-8">
        <h1 className="text-6xl font-bold mb-4 text-primary">404</h1>
        <p className="text-xl text-muted-foreground mb-6">{t('notFound.heading')}</p>
        <Link
          to="/"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-2.5 font-bold hover:bg-primary/90 transition-colors"
        >
          {t('notFound.goHome')}
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
