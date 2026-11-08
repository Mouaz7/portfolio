import SkillsPage from "@/app/skills/skills-page";
import { localizedPageMetadata } from "@/lib/page-metadata";
import { getRequestLocale } from "@/lib/i18n/request-locale";
import { getSkillCategories, getSkills } from "@/lib/skills/data.server";
import { getProjects } from "@/lib/projects/data.server";
import { linkedSkillNames } from "@/lib/projects/technology-filter";
import { logServerError } from "@/lib/security/safe-logger.server";
import { combineSkillsData } from "@/lib/skills/initial-data";

export const generateMetadata = () => localizedPageMetadata("skills", "/skills");

type PageProps = {
  searchParams: Promise<{ audit?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const performanceAudit = (await searchParams).audit === "performance";
  const locale = await getRequestLocale();
  const [categories, skills, projects] = await Promise.allSettled([
    getSkillCategories(locale),
    getSkills(),
    getProjects(locale),
  ]);
  for (const result of [categories, skills, projects]) {
    if (result.status === "rejected") {
      logServerError("page.skills.initial_data_failed", result.reason, {
        route: "/skills",
      });
    }
  }
  const initialData = combineSkillsData(categories, skills, projects);

  return (
    <>
      <link
        rel="preload"
        href="/skill-icons/devops-pytest.svg"
        as="image"
        type="image/svg+xml"
        fetchPriority="high"
      />
      <SkillsPage
        initialCategories={initialData?.categories}
        initialSkills={initialData?.skills}
        initialProjectSkillNames={initialData
          ? linkedSkillNames(initialData.skills, initialData.projects)
          : []}
        performanceAudit={performanceAudit}
      />
    </>
  );
}
