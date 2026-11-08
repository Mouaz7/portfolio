import { canonicalProjectIconHref } from "./icon-assets.ts";
import { AUDITED_REPO_TECHNOLOGIES, REPO_OVERRIDES } from "./repository-data.ts";

export const GITHUB_OWNER = "Mouaz7";
export const MANUAL_PORTFOLIO_URL = `https://github.com/${GITHUB_OWNER}/portfolio-`;
const EXCLUDED_REPO_NAMES = new Set(["portfolio-test", GITHUB_OWNER.toLowerCase()]);

export type ProjectCategory = "Full-Stack" | "Build" | "Systems" | "Mobile";

export const PROJECT_CATEGORY_ORDER = [
  "Full-Stack",
  "Build",
  "Mobile",
  "Systems",
] as const satisfies readonly ProjectCategory[];

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  homepage?: string | null;
  fork?: boolean;
  archived?: boolean;
  default_branch: string;
}

export interface RepoTechnologyEvidence {
  paths?: readonly string[];
  manifestText?: string;
}

interface ProjectUpsertRecord {
  title: string;
  description: string;
  category: ProjectCategory;
  github_url: string;
  languages: string[];
  cover_image_href: string;
  is_active: boolean;
  sort_order: number;
}


// Built on first use rather than at module load: a top-level `new Map(...)`
// is not tree-shakeable, so it kept the whole table in client chunks that only
// import small helpers (e.g. iconPathToKey) from this module.
let auditedRepoTechnologiesByName: Map<string, readonly string[]> | null = null;

function auditedRepoTechnologies(fullName: string) {
  auditedRepoTechnologiesByName ??= new Map(
    Object.entries(AUDITED_REPO_TECHNOLOGIES).map(([name, technologies]) => [
      name.toLocaleLowerCase("en"),
      technologies,
    ]),
  );
  return auditedRepoTechnologiesByName.get(
    fullName.trim().toLocaleLowerCase("en"),
  ) ?? [];
}

export const MANUAL_PORTFOLIO_TECHNOLOGIES = [
  "Next.js",
  "TypeScript",
  "React",
  "Node.js",
  "Tailwind CSS",
  "HTML5",
  "CSS3",
  "Supabase",
  "Vercel",
  "GitHub Actions",
  "CI/CD",
  "Bash",
  "Git",
  "GitHub",
] as const;

const PROJECT_ICON_DIR = "/project-icons";


const CATEGORY_ICON_KEYS: Record<ProjectCategory, string> = {
  Build: "githubactions",
  "Full-Stack": "category-full-stack",
  Mobile: "android",
  Systems: "category-systems",
};

// Every key has an icon file in public/project-icons/; a keyword without its
// own icon falls through to the category icon.
const ICON_KEYWORDS: Array<{ key: string; terms: string[] }> = [
  { key: "android", terms: ["android"] },
  { key: "java", terms: ["java"] },
  { key: "nextjs", terms: ["next.js", "nextjs"] },
  { key: "react", terms: ["react"] },
  { key: "typescript", terms: ["typescript"] },
  { key: "javascript", terms: ["javascript"] },
  { key: "nodejs-badge", terms: ["node.js", "nodejs"] },
  { key: "firebase", terms: ["firebase"] },
  { key: "githubactions", terms: ["github actions", "ci/cd", "pipeline"] },
  { key: "postgresql", terms: ["postgres", "postgresql"] },
  { key: "docker", terms: ["docker"] },
  { key: "python", terms: ["python"] },
  { key: "cplusplus", terms: ["c++", "cpp"] },
  { key: "c", terms: [" c ", " c,", " c.", "language c", "written in c"] },
];

const LANGUAGE_LABELS: Record<string, string> = {
  c: "C",
  "c++": "C++",
  cpp: "C++",
  css: "CSS3",
  dockerfile: "Docker",
  ejs: "EJS",
  firebase: "Firebase",
  gcp: "GCP",
  html: "HTML5",
  javascript: "JavaScript",
  java: "Java",
  jenkins: "Jenkins",
  json: "JSON",
  kotlin: "Kotlin",
  "github actions": "GitHub Actions",
  linux: "Linux",
  mysql: "MySQL",
  "next.js": "Next.js",
  nextjs: "Next.js",
  "node.js": "Node.js",
  nodejs: "Node.js",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  powershell: "PowerShell",
  python: "Python",
  react: "React",
  "react native": "React Native",
  security: "Security",
  shell: "Bash",
  supabase: "Supabase",
  swift: "Swift",
  tailwind: "Tailwind",
  typescript: "TypeScript",
  x86: "x86",
};

const TITLE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bCpp\b/gi, "C++"],
  [/\bOs\b/g, "OS"],
  [/\bAi\b/g, "AI"],
  [/\bCi\/Cd\b/gi, "CI/CD"],
  [/\bDevops\b/gi, "DevOps"],
  [/\bIo\b/g, "IO"],
  [/\bUdp\b/gi, "UDP"],
  [/\bTcp\b/gi, "TCP"],
  [/\bApi\b/gi, "API"],
  [/\bUi\b/gi, "UI"],
  [/\bUx\b/gi, "UX"],
];

function titleCaseWord(word: string) {
  if (!word) {
    return word;
  }

  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

export function prettifyRepoTitle(repoName: string) {
  const base = repoName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(titleCaseWord)
    .join(" ");

  return TITLE_REPLACEMENTS.reduce(
    (title, [pattern, replacement]) => title.replace(pattern, replacement),
    base,
  );
}

function normalizeLanguageLabel(language: string) {
  const normalized = language.trim();
  const mapped = LANGUAGE_LABELS[normalized.toLowerCase()];
  return mapped ?? normalized;
}

function uniqueTechnologies(...groups: readonly (readonly string[])[]) {
  const seen = new Set<string>();
  return groups.flatMap((group) => group.filter((technology) => {
    const key = technology.trim().toLocaleLowerCase("en");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function verifiedRepoTechnologies(fullName: string): string[] | null {
  const audited = auditedRepoTechnologies(fullName);
  if (audited.length === 0) return null;

  const override = Object.entries(REPO_OVERRIDES).find(
    ([name]) => name.toLowerCase() === fullName.toLowerCase(),
  )?.[1];

  return uniqueTechnologies(override?.languages ?? [], audited, ["Git", "GitHub"]);
}

export function mergeAuditedProjectTechnologies(
  fullName: string,
  current: readonly string[] = [],
) {
  return verifiedRepoTechnologies(fullName) ?? uniqueTechnologies(current, ["Git", "GitHub"]);
}

/** Prefer the reviewed stack over stale or vendored-language database tags. */
export function projectTechnologiesForDisplay(
  githubUrl: string,
  current: readonly string[] = [],
) {
  const fullName = githubUrlToFullName(githubUrl);
  const normalizedCurrent = current.map((technology) =>
    technology.trim().toLowerCase() === "tailwind" ? "Tailwind CSS" : technology,
  );

  if (fullName.toLowerCase() === `${GITHUB_OWNER.toLowerCase()}/portfolio-`) {
    return [...MANUAL_PORTFOLIO_TECHNOLOGIES];
  }

  return verifiedRepoTechnologies(fullName) ?? uniqueTechnologies(normalizedCurrent);
}

function technologiesFromEvidence(evidence: RepoTechnologyEvidence = {}) {
  const paths = (evidence.paths ?? []).map((path) => path.toLocaleLowerCase("en"));
  const manifest = evidence.manifestText?.toLocaleLowerCase("en") ?? "";
  const technologies: string[] = [];
  const hasPath = (pattern: RegExp) => paths.some((path) => pattern.test(path));
  const hasManifest = (pattern: RegExp) => pattern.test(manifest);

  if (hasPath(/^\.github\/workflows\/[^/]+\.ya?ml$/)) {
    technologies.push("GitHub Actions", "CI/CD");
  }
  if (hasPath(/(^|\/)(jenkinsfile|\.jenkinsfile)$/)) {
    technologies.push("Jenkins", "CI/CD");
  }
  if (hasPath(/(^|\/)vercel\.json$/) || hasPath(/(^|\/)\.vercel\//)) {
    technologies.push("Vercel");
  }
  if (hasPath(/(^|\/)(dockerfile(?:\.[^/]+)?|compose\.ya?ml|docker-compose\.ya?ml)$/)) {
    technologies.push("Docker");
  }
  if (hasPath(/\.(?:html?|ejs)$/)) technologies.push("HTML5");
  if (hasPath(/\.css$/)) technologies.push("CSS3");
  if (hasPath(/(^|\/)bun\.lockb?$/) || hasPath(/(^|\/)bunfig\.toml$/)) {
    technologies.push("Bun");
  }

  const manifestTechnologies: Array<[RegExp, string]> = [
    [/"next"\s*:|\bnext(?:js)?==/, "Next.js"],
    [/"react"\s*:/, "React"],
    [/"express"\s*:/, "Express"],
    [/"tailwindcss"\s*:/, "Tailwind CSS"],
    [/"cypress"\s*:/, "Cypress"],
    [/(?:^|[\s"'])flask(?:[\s"'=<~>]|$)/m, "Flask"],
    [/(?:^|[\s"'])pytest(?:[\s"'=<~>]|$)/m, "Pytest"],
    [/"(?:mongodb|mongoose)"\s*:|\bmongodb(?:[\s=<>~]|$)/m, "MongoDB"],
    [/"graphql"\s*:|\bgraphql(?:[\s=<>~]|$)/m, "GraphQL"],
    [/"firebase"\s*:/, "Firebase"],
    [/"(?:vue|@vue\/[^"']+)"\s*:/, "Vue 3"],
  ];
  for (const [pattern, technology] of manifestTechnologies) {
    if (hasManifest(pattern)) technologies.push(technology);
  }

  return uniqueTechnologies(technologies);
}

function deriveLanguages(
  repo: Pick<GitHubRepo, "name" | "description" | "language">,
  languageMap: Record<string, number> = {},
  evidence: RepoTechnologyEvidence = {},
) {
  const picked = Object.keys(languageMap)
    .sort((left, right) => languageMap[right] - languageMap[left])
    .slice(0, 5)
    .map(normalizeLanguageLabel);

  const repositoryTools = ["Git", "GitHub"];
  const evidenceTechnologies = technologiesFromEvidence(evidence);

  if (picked.length > 0) {
    return uniqueTechnologies(picked, evidenceTechnologies, repositoryTools);
  }

  const mainLanguage = repo.language ? normalizeLanguageLabel(repo.language) : null;
  if (mainLanguage) {
    return uniqueTechnologies([mainLanguage], evidenceTechnologies, repositoryTools);
  }

  const haystack = `${repo.name} ${repo.description ?? ""}`.toLowerCase();
  const fallbackMatches = [
    "React",
    "Next.js",
    "Node.js",
    "TypeScript",
    "JavaScript",
    "Python",
    "C++",
    "C",
    "MySQL",
    "Docker",
    "Firebase",
    "Supabase",
    "GitHub Actions",
    "Assembly",
  ].filter((candidate) => haystack.includes(candidate.toLowerCase()));

  return uniqueTechnologies(
    fallbackMatches.slice(0, 5),
    evidenceTechnologies,
    repositoryTools,
  );
}

function matchesAny(haystack: string, values: string[]) {
  return values.some((value) => haystack.includes(value));
}

function inferProjectCategory(
  repo: Pick<GitHubRepo, "name" | "description" | "language" | "topics">,
  languages: string[],
): ProjectCategory {
  const haystack = [
    repo.name,
    repo.description ?? "",
    repo.language ?? "",
    ...(repo.topics ?? []),
    ...languages,
  ]
    .join(" ")
    .toLowerCase();

  if (
    matchesAny(haystack, [
      "android",
      "ios",
      "react native",
      "flutter",
      "mobile",
      "swift",
      "kotlin",
      "expo",
      "apk",
    ])
  ) {
    return "Mobile";
  }

  if (
    matchesAny(haystack, [
      "devops",
      "ci/cd",
      "pipeline",
      "docker",
      "automation",
      "github actions",
      "terraform",
      "ansible",
      "infra",
      "infrastructure",
      "build",
    ])
  ) {
    return "Build";
  }

  if (
    matchesAny(haystack, [
      "assembly",
      "buffered io",
      "filesystem",
      "kernel",
      "concurrency",
      "thread",
      "pthread",
      "network",
      "socket",
      "tcp",
      "udp",
      "os ",
      "operating system",
      "linux",
      "syscall",
      "low-level",
      "x86",
      "arm",
      "c++",
      "c ",
    ])
  ) {
    return "Systems";
  }

  return "Full-Stack";
}

function buildIconPath(iconKey: string) {
  return canonicalProjectIconHref(`${PROJECT_ICON_DIR}/${iconKey}.svg`);
}

export function getProjectCategoryRank(category: ProjectCategory) {
  const index = PROJECT_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? PROJECT_CATEGORY_ORDER.length : index;
}

export function inferProjectIconKey(
  repo: Pick<GitHubRepo, "name" | "description" | "language" | "topics">,
  category: ProjectCategory,
  languages: string[],
) {
  if (languages.some((language) => language.toLowerCase() === "node.js")) {
    return "nodejs-badge";
  }

  const haystack = [
    repo.name,
    repo.description ?? "",
    repo.language ?? "",
    ...(repo.topics ?? []),
    ...languages,
  ]
    .join(" ")
    .toLowerCase();

  for (const matcher of ICON_KEYWORDS) {
    if (matchesAny(haystack, matcher.terms)) {
      return matcher.key;
    }
  }

  return CATEGORY_ICON_KEYS[category];
}

function applyRepoOverride(
  fullName: string,
  row: ProjectUpsertRecord,
) {
  const override = REPO_OVERRIDES[fullName];

  if (!override) {
    return row;
  }

  const iconKey = override.iconKey ? buildIconPath(override.iconKey) : row.cover_image_href;

  return {
    ...row,
    title: override.title ?? row.title,
    description: override.description ?? row.description,
    category: override.category ?? row.category,
    languages: override.languages
      ? uniqueTechnologies(override.languages, row.languages)
      : row.languages,
    cover_image_href: iconKey,
  };
}

export function iconPathToKey(iconPath: string) {
  return iconPath.replace(`${PROJECT_ICON_DIR}/`, "").replace(/\.svg$/i, "");
}

export function githubUrlToFullName(githubUrl: string) {
  const match = githubUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/i);
  return match?.[1] ?? "";
}

function isSyncablePublicRepo(repo: Pick<GitHubRepo, "name" | "private" | "full_name">) {
  if (repo.private) {
    return false;
  }

  if (repo.full_name.toLowerCase() === `${GITHUB_OWNER.toLowerCase()}/portfolio`) {
    return false;
  }

  if (repo.name.toLowerCase() === GITHUB_OWNER.toLowerCase()) {
    return false;
  }

  return !EXCLUDED_REPO_NAMES.has(repo.name.toLowerCase());
}

export function mapRepoToProjectRecord(
  repo: GitHubRepo,
  languageMap: Record<string, number> = {},
  sortOrder = 0,
  evidence: RepoTechnologyEvidence = {},
): ProjectUpsertRecord {
  const languages = verifiedRepoTechnologies(repo.full_name)
    ?? deriveLanguages(repo, languageMap, evidence);
  const category = inferProjectCategory(repo, languages);
  const iconKey = inferProjectIconKey(repo, category, languages);

  const baseRow = {
    title: prettifyRepoTitle(repo.name),
    description: repo.description ?? "",
    category,
    github_url: repo.html_url,
    languages,
    cover_image_href: buildIconPath(iconKey),
    is_active: true,
    sort_order: sortOrder,
  };

  return applyRepoOverride(repo.full_name, baseRow);
}

function buildManualPortfolioRecord(sortOrder = 0): ProjectUpsertRecord {
  const title = "Developer Portfolio";
  const description =
    "A multilingual developer portfolio built with Next.js, TypeScript, Tailwind CSS, and Supabase.";
  const languages = [...MANUAL_PORTFOLIO_TECHNOLOGIES];
  const category: ProjectCategory = "Full-Stack";

  return {
    title,
    description,
    category,
    github_url: MANUAL_PORTFOLIO_URL,
    languages,
    cover_image_href: buildIconPath("nextjs"),
    is_active: true,
    sort_order: sortOrder,
  };
}

export function buildSyncPayload(
  repos: GitHubRepo[],
  languageMaps: Record<string, Record<string, number>> = {},
  evidenceMaps: Record<string, RepoTechnologyEvidence> = {},
) {
  const publicRepos = repos.filter(isSyncablePublicRepo);
  const rowsByCategoryPosition = new Map<ProjectCategory, number>();
  const projectRows = publicRepos
    .map((repo, index) => ({
      sourceIndex: index,
      row: mapRepoToProjectRecord(
        repo,
        languageMaps[repo.full_name],
        index + 1,
        evidenceMaps[repo.full_name],
      ),
    }))
    .sort((left, right) => {
      const categoryDiff =
        getProjectCategoryRank(left.row.category) - getProjectCategoryRank(right.row.category);

      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      return left.sourceIndex - right.sourceIndex;
    })
    .map(({ row }) => {
      const categoryRank = getProjectCategoryRank(row.category);
      const positionInCategory = (rowsByCategoryPosition.get(row.category) ?? 0) + 1;
      rowsByCategoryPosition.set(row.category, positionInCategory);

      return {
        ...row,
        sort_order: categoryRank * 100 + positionInCategory,
      };
    });

  return {
    projectRows,
    manualPortfolioRow: buildManualPortfolioRecord(0),
  };
}
