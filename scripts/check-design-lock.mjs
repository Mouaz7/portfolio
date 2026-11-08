import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

const lockedFiles = {
  "app/fonts.ts": "c6132ac9f3af551fefa720bab1edecff3dc8ccf05184e878e101979c7e5fac8c",
  "app/fonts/urbanist-latin.woff2": "ce6e0dd89c3ffa4de97bda85f9b08bcb775bea4df456b3dbb7e819c1c879be50",
  "app/global.css": "634e51e5e7f854b4538e8f283537fe70d0c2b1b29dffb45fa944c003f906f814",
  "app/home-page.module.css": "52175188a6e55dda78deff744c2e1389ebaecdec4fd93b37b0474a536ce16abf",
  "app/i18n.css": "240439d59e81ccf959c26deb0387566150596abd08f1146965f9898f0d6612c8",
  "app/styles/performance-tier.css": "c8293e67030919578c2cf2691714469b2d2a72cbc9cc7e8fe5d75e8f9451f611",
  "app/contact/contact-repository.css": "a22404b0340d97c9a6844fef76adac263a5b9420602e15927d94494d5b07b122",
  "components/brand/MouazPremiumLogo.module.css": "10e7b16344705f5739adce71f88fca565cb2222965f3735145d3d5294dca415b",
  "components/contact/ContactRepositoryHeader.tsx": "a6fcbd25d8ff9f02c15cbf31849dc2cf91965641b58f73c51866ffc89ddb84be",
  "components/contact/photo-social-container.tsx": "0705ffcb5e9a4aeff134890bfdf29d15f2028043e58b7a47105bffb41a5f7afe",
  "components/project/ProjectCard.tsx": "e784055d3949894151eba14bc2cf9c750f9d7bf5b1b1aab2c890851aceba88b2",
  "components/navigation/Header.tsx": "85086b1e2ee213d3558b9abebb8831b270d81ee050629e40ab61f897a51a1067",
  "components/skills/SkillCard.module.css": "5cdc9f3102f971dc91116ff84570726e601be967dc87b94eefe2f7aeebeaf295",
  "components/skills/SkillCard.tsx": "b96aca3f4096134c6e7597c8a2a9c442626abffad0b652fd8b96d591af7daed9",
  "components/skills/SkillIcon.tsx": "b926ebdd6bfc854009418937e4ca2f736e01aef27346dc2faacec42bb9f0ea5f",
  "public/brand/mouaz-logo.svg": "663081d638244c242715749df6066070b24a067b2b4a7e6d7f542f944b8dcb9d",
  "public/contact/check.svg": "abd410a3361f682a8bc24a2ce005bf5a4918c79ee0bb4b309eb9a508cc92495d",
  "public/contact/send-alt.svg": "6fa98ec84360d23c9359e31375abb542ee4f21afc943479dca3c19ff309420ce",
  "public/home/portfolio-cutout-1600.webp": "6964524a5ce31423595a555ac9256fe4167af40c65b56ac9acefea606990dbda",
  "public/project-icons/android.svg": "d6c8aa6c2b94c90ff02c1b7e89f9cf863d54db59b459b8b287c19bfb8e664c41",
  "public/project-icons/c.svg": "8cce48da91084256f15653e02bfd7046ccb34489d030cb1aa34dee766daad6b7",
  "public/project-icons/category-full-stack.svg": "5825b649c8c04dec13ecf01d0182401bd0ec71789d2fa06224866d882cd1515f",
  "public/project-icons/category-systems.svg": "cf50ae4a263c6142963fad3561f7cb0311d0d41cc6189eadfb34f81a8a36acb0",
  "public/project-icons/cplusplus.svg": "7ff8253551235e3a6b002a7c2bd6e3190d85113a64fcb40f2254473caeb025d4",
  "public/project-icons/docker.svg": "6d762b03f0815f114ac87e3caa3e3463c5c6ef1d39f4f5493f8ddddff7aa380b",
  "public/project-icons/firebase.svg": "8534346c6590a6414cae0e58896295592b9b2081e955be999cd0963bd1b6158c",
  "public/project-icons/githubactions.svg": "3a2524052ccf301d1a239f20cfef98d655e060c51cc29c5e94c867913899a47e",
  "public/project-icons/java.svg": "7582e518a9c02425f97155e5a3bd39d1a3a7d421b78caf9c8df7443dad3edc5d",
  "public/project-icons/javascript.svg": "0656ff65fc8eeacda5c78d7f9ffe91ec1eb919db64f56e0b7dcd460af4bbd36c",
  "public/project-icons/nextjs.svg": "d9435c4ede7133b376c0173a80226bb3856729366707cd96e9a66e39448d0288",
  "public/project-icons/nodejs-badge.svg": "e24e14ec56ccf6ff0e782a341d154cf02963abb30275ae43742470bc45142f7d",
  "public/project-icons/postgresql.svg": "d68b3da8c1ba0aa8a9ff18b0599836e00928dae10962ad479f01f82b130e393f",
  "public/project-icons/python.svg": "71493b4a732f0532b3a03a7a95da3ee11a65766367c8303b901ffbe7bf91a3a2",
  "public/project-icons/react.svg": "5825b649c8c04dec13ecf01d0182401bd0ec71789d2fa06224866d882cd1515f",
  "public/project-icons/typescript.svg": "c9191199f4049920c2fc19035b8a6664f37f4689fcd9e8434e786097e78863f0",
  "public/journey/bth-logo.webp": "3f8e7d55837dc3b5ab8d697a101575bca78a9b1d52573124db1245acdd130ad9",
  "public/journey/softhouse.webp": "a3bed70d2057d32bad63de6f04630a015a0e9716107f00042c8c531436bb5702"
};

const splitFileParts = {
  "app/global.css": [
    "app/global.css",
    "app/styles/home-and-skills.css",
    "app/styles/projects-and-contact.css",
    "app/styles/adaptive-and-motion.css",
  ],
  "app/contact/contact-repository.css": [
    "app/contact/contact-repository.css",
    "app/contact/contact-repository-adaptive.css",
  ],
};

const byteIdenticalAssetAliases = {
  "public/project-icons/android.svg": "public/skill-icons/mobile-android.svg",
  "public/project-icons/category-systems.svg": "public/skill-icons/devops-linux.svg",
  "public/project-icons/cplusplus.svg": "public/skill-icons/backend-c-plus-plus.svg",
  "public/project-icons/githubactions.svg": "public/skill-icons/devops-ci-cd.svg",
  "public/project-icons/java.svg": "public/skill-icons/backend-java.svg",
  "public/project-icons/javascript.svg": "public/skill-icons/frontend-javascript.svg",
  "public/project-icons/python.svg": "public/skill-icons/backend-python.svg",
  "public/project-icons/react.svg": "public/project-icons/category-full-stack.svg",
  "public/project-icons/typescript.svg": "public/skill-icons/frontend-typescript.svg",
};

const changed = [];
for (const [file, expected] of Object.entries(lockedFiles)) {
  const sharedAsset = byteIdenticalAssetAliases[file];
  if (sharedAsset) {
    // Keep legacy URLs valid until their database references and deployed
    // replacements have been verified. Both files must retain approved bytes.
    for (const asset of [file, sharedAsset]) {
      const actual = createHash("sha256").update(await readFile(asset)).digest("hex");
      if (actual !== expected) changed.push(`${asset}: expected ${expected}, received ${actual}`);
    }
    continue;
  }
  const contents = await Promise.all(
    (splitFileParts[file] ?? [file])
      .map((part) => readFile(part)),
  );
  const actual = createHash("sha256").update(Buffer.concat(contents)).digest("hex");
  if (actual !== expected) changed.push(`${file}: expected ${expected}, received ${actual}`);
}

const skillManifestFile = "docs/skill-icon-sources.json";
const skillManifest = await readFile(skillManifestFile);
const skillManifestHash = createHash("sha256").update(skillManifest).digest("hex");
const expectedSkillManifestHash = "24b0b8a96f82830a33be1275992919e61a42df5079f55b41d562146385a528cb";
if (skillManifestHash !== expectedSkillManifestHash) {
  changed.push(`${skillManifestFile}: expected ${expectedSkillManifestHash}, received ${skillManifestHash}`);
}

const skillSources = JSON.parse(skillManifest.toString("utf8"));
const expectedSkillFiles = new Set();
for (const source of skillSources) {
  for (const [pathKey, digestKey] of [["localPath", "primary"], ["localPathLight", "light"]]) {
    const publicPath = source[pathKey];
    const digest = source[digestKey]?.sha256;
    if (!publicPath || !digest) continue;
    const file = join("public", publicPath.replace(/^\//, ""));
    expectedSkillFiles.add(basename(file));
    const actual = createHash("sha256").update(await readFile(file)).digest("hex");
    if (actual !== digest) changed.push(`${file}: expected ${digest}, received ${actual}`);
  }
}

const actualSkillFiles = new Set(await readdir("public/skill-icons"));
for (const file of actualSkillFiles) {
  if (!expectedSkillFiles.has(file)) changed.push(`public/skill-icons/${file}: unexpected asset`);
}
for (const file of expectedSkillFiles) {
  if (!actualSkillFiles.has(file)) changed.push(`public/skill-icons/${file}: missing asset`);
}
if (changed.length > 0) {
  throw new Error(`Design lock failed:\n${changed.join("\n")}`);
}
console.log(
  `Design lock passed for ${Object.keys(lockedFiles).length} files and ${expectedSkillFiles.size} skill icons.`,
);
