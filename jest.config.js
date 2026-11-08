const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

// next/jest already ignores node_modules and .next for test paths and
// transforms, and mocks CSS, images and fonts.
const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  collectCoverageFrom: [
    "app/**/*.{js,jsx,ts,tsx}",
    "components/**/*.{js,jsx,ts,tsx}",
    "lib/**/*.{js,jsx,ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "!**/*.d.ts",
  ],
  testPathIgnorePatterns: ["<rootDir>/tests/e2e/"],
  // Per-path floors sit ~2 points below the coverage measured when they were
  // added. Jest applies `global` only to files NOT matched by a path key, so
  // the global floor is measured over the remaining files and is lower than
  // the all-files summary printed at the end of a run.
  coverageThreshold: {
    global: {
      statements: 56,
      branches: 50,
      functions: 58,
      lines: 58,
    },
    "./lib/contact/": {
      statements: 79,
      branches: 77,
      functions: 80,
      lines: 85,
    },
    "./lib/security/": {
      statements: 75,
      branches: 76,
      functions: 74,
      lines: 77,
    },
    "./app/api/contact/": {
      statements: 81,
      branches: 74,
      // Only eight functions: each one is 12.5 points.
      functions: 85,
      lines: 88,
    },
    "./lib/i18n/": {
      statements: 84,
      branches: 80,
      functions: 63,
      lines: 84,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
