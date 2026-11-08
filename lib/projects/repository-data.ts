// Hand-maintained facts about individual repositories, kept apart from the
// sync logic in githubSync.ts.

import {
  AEGISDB_PROJECT_DESCRIPTION,
  AEGISDB_PROJECT_LANGUAGES,
} from "./aegisdb-preview.ts";
import type { ProjectCategory } from "./githubSync.ts";

interface ProjectOverride {
  title?: string;
  description?: string;
  category?: ProjectCategory;
  languages?: string[];
  iconKey?: string;
}

// Verified against public repository trees, manifests, and READMEs on
// 2026-09-24. The two Softhouse showcase repos contain documentation rather
// than source, so their technologies come from their own architecture tables.
export const AUDITED_REPO_TECHNOLOGIES: Record<string, readonly string[]> = {
  "Mouaz7/AegisDB": [
    "Java", "Raft", "MVCC", "Maven", "gRPC", "Protocol Buffers",
    "OpenTelemetry", "Prometheus", "Grafana", "TLA+", "JUnit",
    "Python", "Bash", "Docker", "GitHub Actions", "CI/CD",
  ],
  "Mouaz7/auto-healing-devops-platform": [
    "Python", "Docker", "Jenkins", "MCP", "OpenAI", "Anthropic",
    "Prometheus", "Pytest", "Bandit", "Pylint", "Slack", "Jira", "CI/CD", "AI",
  ],
  "Mouaz7/team-temp-app": [
    "React", "React Native", "TypeScript", "Vite", "Tailwind CSS",
    "React Query", "Expo", "Express", "Bun", "MongoDB", "Prisma",
    "Better Auth", "Google OAuth", "Gemini AI", "Cloudinary", "Qlik",
    "Zod", "Cypress", "Google Cloud", "CI/CD", "AI",
  ],
  "Mouaz7/Move-Out": [
    "JavaScript", "EJS", "HTML5", "CSS3", "SQLite", "Jest",
    "Passport.js", "Google OAuth", "Docker", "GitHub Actions", "CI/CD",
  ],
  "Mouaz7/Campus360": [
    "Kotlin", "Java", "Android", "Jetpack Compose", "Firebase",
    "Firebase Auth", "Firestore", "Google Maps", "Gradle", "JUnit",
    "GitHub Actions", "CI/CD",
  ],
  "Mouaz7/Asm-Buffered-IO": ["Assembly", "C", "x86", "Linux"],
  "Mouaz7/Concurrency-Systems": ["C", "Linux"],
  "Mouaz7/Os_filesystem": ["C++", "Linux"],
  "Mouaz7/chess-game": [
    "C++", "SFML", "OOP", "MSBuild", "vcpkg", "PowerShell",
    "GitHub Actions", "CI/CD",
  ],
  "Mouaz7/PongPal-Showcase": [
    "React", "TypeScript", "Slack API", "Firebase Functions", "Firestore",
    "Firebase Realtime", "Python", "Google OAuth", "Raspberry Pi",
  ],
  "Mouaz7/Eshop-management-system": [
    "Node.js", "Express", "MariaDB", "MySQL", "SQL", "EJS",
    "JavaScript", "HTML5", "CSS3",
  ],
  "Mouaz7/Python-Linked-List": ["Python"],
  "Mouaz7/Python-Table-Implementations": ["Python"],
  "Mouaz7/ARM-Interrupt-UART-Display": ["Assembly", "ARM", "UART"],
  "Mouaz7/ARM-UART-Factorial": ["Assembly", "ARM", "UART"],
  "Mouaz7/Practical-Communication": ["Python", "TCP", "UDP", "HTTP"],
  "Mouaz7/network-udp-tcp-analysis": ["Python", "TCP", "UDP"],
  "Mouaz7/Python-directed-graph-bfs": ["Python", "BFS", "Graphs", "Pytest"],
  "Mouaz7/BurgerProject": [
    "Node.js", "Express", "MySQL", "SQL", "EJS", "JavaScript",
    "HTML5", "CSS3", "Security",
  ],
  "Mouaz7/typing-speed-tracker": ["Python"],
  "Mouaz7/Cpp-TransportSystem": ["C++", "OOP"],
  "Mouaz7/bsv-duplicate": ["Python", "Pytest", "GitHub Actions", "CI/CD"],
  "Mouaz7/bsv-edutask": [
    "Python", "JavaScript", "Flask", "React", "Cypress", "Pytest",
    "HTML5", "CSS3", "Docker", "MongoDB",
  ],
  "Mouaz7/quiz-game": ["C++", "OOP", "Algorithms"],
};

/** Per-repository corrections to the title, text, category, languages or icon. */
export const REPO_OVERRIDES: Record<string, ProjectOverride> = {
  "Mouaz7/AegisDB": {
    title: "AegisDB",
    description: AEGISDB_PROJECT_DESCRIPTION,
    category: "Systems",
    languages: AEGISDB_PROJECT_LANGUAGES,
    iconKey: "java",
  },
  "Mouaz7/auto-healing-devops-platform": {
    title: "Auto-Healing DevOps Platform",
    description:
      "An AI-powered, self-healing CI/CD pipeline with six specialized agents, MCP microservices, a traffic-light safety system, and Prometheus metrics. Developed as a bachelor’s thesis at BTH.",
    category: "Build",
    languages: ["Python", "Jenkins", "Docker", "JSON", "AI"],
    iconKey: "python",
  },
  "Mouaz7/team-temp-app": {
    title: "Team Temp App Showcase",
    description:
      "Visual and video documentation for Team Temp App, an AI-driven employee survey platform developed for Softhouse.",
    category: "Full-Stack",
    languages: ["React", "React Native", "TypeScript", "AI", "Express", "Bun"],
    iconKey: "react",
  },
  "Mouaz7/Move-Out": {
    title: "Move-Out: Moving Box System",
    description:
      "A professional moving box management system built with Node.js, Express, and EJS, using SQLite for development and PostgreSQL/Supabase in production with robust security controls.",
    category: "Full-Stack",
    languages: ["Node.js", "Express", "PostgreSQL", "Supabase", "Security"],
    iconKey: "nodejs-badge",
  },
  "Mouaz7/Campus360": {
    description:
      "An Android campus navigation app with indoor and outdoor maps, pathfinding, and Firebase authentication, built with Kotlin, Clean Architecture, and MVVM.",
    category: "Mobile",
    languages: ["Kotlin", "Java", "Firebase", "Android"],
    iconKey: "android",
  },
  "Mouaz7/Asm-Buffered-IO": {
    title: "Buffered I/O in Assembly",
    description:
      "An Assembly and C I/O library with x86-64 routines for text and integer input/output, plus test applications in both languages.",
    category: "Systems",
    languages: ["Assembly", "C", "x86"],
    iconKey: "c",
  },
  "Mouaz7/Concurrency-Systems": {
    description:
      "Low-level systems programming in C covering multithreading, process synchronization, IPC mechanisms, and memory-management algorithms.",
    category: "Systems",
    languages: ["C", "Linux", "POSIX Threads"],
    iconKey: "c",
  },
  "Mouaz7/Os_filesystem": {
    title: "OS Filesystem",
    description:
      "A C++ implementation of a FAT-based file system with a command-line shell.",
    category: "Systems",
    languages: ["C++", "Linux"],
    iconKey: "cplusplus",
  },
  "Mouaz7/chess-game": {
    title: "Chess Game",
    description:
      "A lightweight chess game built with C++ and SFML 3.0, featuring move hints, material scores, player names, 10-minute timers, and automatically saved results.",
    category: "Systems",
    languages: ["C++", "SFML", "OOP", "MSBuild", "vcpkg"],
    iconKey: "cplusplus",
  },
  "Mouaz7/PongPal-Showcase": {
    title: "PongPal Showcase",
    description:
      "A visual showcase of the PongPal project developed at Softhouse, featuring booking, statistics, and user profile flows. The repository contains images and videos, not source code.",
    category: "Full-Stack",
    languages: ["React", "TypeScript", "Firebase", "Slack API"],
    iconKey: "typescript",
  },
  "Mouaz7/Eshop-management-system": {
    title: "E-Shop Management System",
    description:
      "A full-stack e-commerce management system built with Node.js, Express, EJS, and MariaDB, including product, category, order, and inventory management, stored procedures, triggers, and an admin interface.",
    category: "Full-Stack",
    languages: ["Node.js", "Express", "MariaDB", "MySQL", "EJS"],
    iconKey: "nodejs-badge",
  },
  "Mouaz7/Python-Linked-List": {
    title: "Linked List in Python",
    description:
      "A Python implementation of the TwoCell class for doubly linked lists.",
    category: "Systems",
    languages: ["Python", "Data Structures"],
    iconKey: "python",
  },
  "Mouaz7/Python-Table-Implementations": {
    description:
      "Implementations and performance tests for a table ADT in Python, including TableAsArray, TableAsList, and TableAsMTF.",
    category: "Systems",
    languages: ["Python", "Algorithms"],
    iconKey: "python",
  },
  "Mouaz7/ARM-Interrupt-UART-Display": {
    title: "ARM Interrupt and UART Display",
    description:
      "An ARM Cortex-A9 Assembly project that handles button interrupts, reads UART commands, and updates a seven-segment display.",
    category: "Systems",
    languages: ["Assembly", "ARM", "UART"],
    iconKey: "c",
  },
  "Mouaz7/ARM-UART-Factorial": {
    title: "ARM UART Factorial",
    description:
      "A compact ARM Assembly project that computes factorials recursively and prints the results over UART.",
    category: "Systems",
    languages: ["Assembly", "ARM", "UART"],
    iconKey: "c",
  },
  "Mouaz7/Practical-Communication": {
    title: "Practical Network Communication",
    description:
      "A practical network communication project using TCP, UDP, and a simple web browser.",
    category: "Systems",
    languages: ["Python", "TCP", "UDP"],
    iconKey: "python",
  },
  "Mouaz7/network-udp-tcp-analysis": {
    title: "UDP and TCP Analysis",
    description:
      "Analysis and implementation of UDP and TCP send-and-receive tests, including performance observations and improvements.",
    category: "Systems",
    languages: ["Python", "TCP", "UDP"],
    iconKey: "python",
  },
  "Mouaz7/Python-directed-graph-bfs": {
    title: "Directed Graph and BFS in Python",
    description:
      "A Python program that checks connectivity in directed graphs using breadth-first search (BFS).",
    category: "Systems",
    languages: ["Python", "BFS", "Graphs"],
    iconKey: "python",
  },
  "Mouaz7/BurgerProject": {
    title: "Burger Project",
    description:
      "A full-stack burger ordering app built with Node.js, MySQL, and EJS, including order customization, a kitchen view, and database integration.",
    category: "Full-Stack",
    languages: ["Node.js", "Express", "MySQL", "EJS"],
    iconKey: "nodejs-badge",
  },
  "Mouaz7/typing-speed-tracker": {
    description:
      "A Python program that measures and tracks typing speed with word lists at different difficulty levels.",
    category: "Systems",
    languages: ["Python"],
    iconKey: "python",
  },
  "Mouaz7/Cpp-TransportSystem": {
    title: "C++ Transport System",
    description:
      "A C++ project for managing transport schedules, shuttle services, and passenger bookings.",
    category: "Systems",
    languages: ["C++", "OOP"],
    iconKey: "cplusplus",
  },
  "Mouaz7/bsv-duplicate": {
    title: "BSV Duplicate",
    description:
      "A course project that detects duplicate entries in BibTeX files.",
    category: "Systems",
    languages: ["Python", "Pytest"],
    iconKey: "python",
  },
  "Mouaz7/bsv-edutask": {
    title: "BSV Edutask",
    description:
      "An educational project for the PA1417 course that applies software-testing techniques.",
    category: "Systems",
    languages: ["Python", "Flask", "React", "Cypress", "Pytest", "Testing"],
    iconKey: "python",
  },
  "Mouaz7/quiz-game": {
    title: "Quiz Game",
    description:
      "An object-oriented C++ quiz system for creating, managing, and playing quizzes, with multiple question types, players, leaderboards, file handling, and UML documentation.",
    category: "Systems",
    languages: ["C++", "OOP", "Algorithms"],
    iconKey: "cplusplus",
  },
};
