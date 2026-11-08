/**
 * Combines the three independently loaded sources of the Skills page. Each
 * degrades on its own: failing projects must not throw away skills and
 * categories that loaded fine (the grid would otherwise fetch everything
 * again from the browser behind a loader). Without categories or skills there
 * is nothing to render on the server.
 */
export function combineSkillsData<Category, Skill, Project>(
  categories: PromiseSettledResult<Category[]>,
  skills: PromiseSettledResult<Skill[]>,
  projects: PromiseSettledResult<Project[]>,
): { categories: Category[]; skills: Skill[]; projects: Project[] } | undefined {
  if (categories.status !== "fulfilled" || skills.status !== "fulfilled") return undefined;
  return {
    categories: categories.value,
    skills: skills.value,
    projects: projects.status === "fulfilled" ? projects.value : [],
  };
}
