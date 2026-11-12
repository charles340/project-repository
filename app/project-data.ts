export const projects = [
  {
    id: "devops-dashboard",
    title: "DevOps Dashboard",
    kind: "API health monitor",
    format: "React",
    description:
      "A compact dashboard that checks the health of the local backend API.",
    tags: ["Next.js", "React", "Node API"],
    sourcePath: null,
  },
  {
    id: "interactive-calendar-2025",
    title: "Interactive Calendar 2025",
    kind: "Interactive calendar",
    format: "Web",
    description:
      "A Croatian 2025 calendar with month navigation and important holidays.",
    tags: ["HTML", "CSS", "JavaScript"],
    sourcePath: "interactive_calendar_hr_2025",
    repoUrl: "https://github.com/charles340/interactive_calendar_hr_2025",
  },
  {
    id: "sjiwp",
    title: "SJIWP",
    kind: "Personal website",
    format: "Web",
    description:
      "A multi-page personal website with galleries, travel, food, and car pages.",
    tags: ["HTML", "CSS", "Multi-page"],
    sourcePath: "sjiwp",
    repoUrl: "https://github.com/charles340/sjiwp",
  },
  {
    id: "javascript-todo-list",
    title: "JavaScript Todo List",
    kind: "Task manager",
    format: "Web",
    description:
      "A focused task workspace with due dates, priorities, filters, and saved tasks.",
    tags: ["HTML", "CSS", "JavaScript"],
    sourcePath: "javascript-todo-list",
  },
  {
    id: "javascript-calculator",
    title: "JavaScript Calculator",
    kind: "Everyday calculator",
    format: "Web",
    description:
      "A responsive calculator for the four basic operations, with keyboard support.",
    tags: ["HTML", "CSS", "JavaScript"],
    sourcePath: "javascript-calculator",
  },
  {
    id: "javascript-notes",
    title: "JavaScript Notes",
    kind: "Quick notes",
    format: "Web",
    description:
      "A lightweight notes pad that saves ideas in the browser as you work.",
    tags: ["HTML", "CSS", "JavaScript"],
    sourcePath: "javascript-notes",
  },
  {
    id: "cpp-task-api",
    title: "Server Maintenance Board",
    kind: "C++ maintenance API",
    format: "Backend",
    description:
      "Plan server upkeep with due dates, priorities, and persistent task tracking.",
    tags: ["C++17", "CMake", "HTTP API"],
    sourcePath: null,
  },
  {
    id: "server-automation-toolkit",
    title: "Server Automation Toolkit",
    kind: "Bash & shell",
    format: "Shell",
    description:
      "Practical Bash tools for server reports, service checks, and verified backups.",
    tags: ["Bash", "Linux", "Automation"],
    sourcePath: "server-automation-toolkit",
    repoUrl: "https://github.com/charles340/server-automation",
  },
] as const;

export type Project = (typeof projects)[number];

export function getProject(id: string) {
  return projects.find((project) => project.id === id);
}
