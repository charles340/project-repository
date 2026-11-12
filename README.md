# Workspace

A React and Next.js portfolio for browsing and opening projects in one place. The gallery includes a DevOps dashboard, an interactive calendar, SJIWP, JavaScript utilities, a server automation toolkit, and a C++ server-maintenance board.

## Run locally

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

Standalone projects are in `projects/`. The web projects can also be opened directly from their `index.html` files. The calendar and SJIWP are served from their public GitHub repositories when their sibling folders are not available locally.

The C++ Server Maintenance Board lives in `projects/cpp-task-api/`. Build and run its API before opening the live demo; tasks, due dates, priorities, and completion status are saved to a local data file. See its README for build instructions, API examples, and storage details.
