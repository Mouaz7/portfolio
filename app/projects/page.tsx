import ProjectsPage from "@/app/projects/projects-page";
import { localizedPageMetadata } from "@/lib/page-metadata";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { getProjects } from "@/lib/projects/data.server";
import { initialRepositoryStats } from "@/lib/projects/initial-stats.server";
import { logServerError } from "@/lib/security/safe-logger.server";
import { requestedProjectTechnology } from "@/lib/projects/technology-filter";
import type { Project } from "@/lib/projects/types";

export const generateMetadata = () => localizedPageMetadata("projects", "/projects");

type PageProps = {
  searchParams: Promise<{ technology?: string | string[] }>;
};

export default async function Page({ searchParams }: PageProps) {
  const initialTechnology = requestedProjectTechnology((await searchParams).technology);
  const locale = await getRequestLocale();
  let projects: Project[];
  try {
    projects = await getProjects(locale);
  } catch (error) {
    logServerError("page.projects.initial_data_failed", error, {
      route: "/projects",
    });
    return <ProjectsPage initialLoadFailed initialTechnology={initialTechnology} />;
  }
  return (
    <ProjectsPage
      initialProjects={projects}
      initialRepositoryStats={await initialRepositoryStats(projects)}
      initialTechnology={initialTechnology}
    />
  );
}
