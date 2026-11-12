import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const projectRoots: Record<string, string> = {
  "interactive-calendar-2025": resolve(process.cwd(), "..", "interactive_calendar_hr_2025"),
  sjiwp: resolve(process.cwd(), "..", "sjiwp"),
  "javascript-todo-list": resolve(process.cwd(), "projects", "javascript-todo-list"),
  "javascript-calculator": resolve(process.cwd(), "projects", "javascript-calculator"),
  "javascript-notes": resolve(process.cwd(), "projects", "javascript-notes"),
  "c-data-structures-lab": resolve(process.cwd(), "projects", "c-data-structures-lab"),
  "server-automation-toolkit": resolve(process.cwd(), "projects", "server-automation-toolkit"),
};

const remoteProjectRoots: Record<string, string> = {
  "interactive-calendar-2025":
    "https://raw.githubusercontent.com/charles340/interactive_calendar_hr_2025/main",
  sjiwp: "https://raw.githubusercontent.com/charles340/sjiwp/main",
};

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".conf": "text/plain; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jfif": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".sh": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

type ProjectSourceContext = {
  params: Promise<{ project: string; path?: string[] }>;
};

function hasErrorCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isInsideRoot(root: string, candidate: string) {
  const relativePath = relative(root, candidate);

  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

async function findRealPath(path: string) {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT") || hasErrorCode(error, "ENOTDIR")) {
      return null;
    }

    throw error;
  }
}

export async function GET(_request: Request, { params }: ProjectSourceContext) {
  const { project, path = [] } = await params;
  const projectRoot = projectRoots[project];
  const remoteRoot = remoteProjectRoots[project];

  if (
    (!projectRoot && !remoteRoot) ||
    path.some((segment) => segment.startsWith(".") || /[\\/]/.test(segment))
  ) {
    return new Response("Project asset not found.", { status: 404 });
  }

  const fileSegments = path.length === 0 ? ["index.html"] : path;
  const extension = extname(fileSegments[fileSegments.length - 1]).toLowerCase();
  const contentType = contentTypes[extension];
  if (!contentType) {
    return new Response("Project asset not found.", { status: 404 });
  }

  let file: Uint8Array | null = null;
  if (projectRoot) {
    const root = await findRealPath(projectRoot);
    if (root) {
      const requestedPath = resolve(root, ...fileSegments);
      const filePath = await findRealPath(requestedPath);

      if (filePath && isInsideRoot(root, filePath)) {
        const fileStats = await stat(/*turbopackIgnore: true*/ filePath);
        if (fileStats.isFile()) {
          file = new Uint8Array(await readFile(/*turbopackIgnore: true*/ filePath));
        }
      }
    }
  }

  if (!file && remoteRoot) {
    const remotePath = fileSegments.map(encodeURIComponent).join("/");
    const response = await fetch(`${remoteRoot}/${remotePath}`, { cache: "no-store" });

    if (response.status === 404) {
      return new Response("Project asset not found.", { status: 404 });
    }
    if (!response.ok) {
      return new Response("Project source could not be fetched.", { status: 502 });
    }

    file = new Uint8Array(await response.arrayBuffer());
  }

  if (!file) {
    return new Response("Project asset not found.", { status: 404 });
  }

  const isHtml = extension === ".html";
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });

  let responseBody = new Uint8Array(file);
  if (isHtml) {
    const directoryPath = fileSegments.slice(0, -1).map(encodeURIComponent).join("/");
    const basePath = `/project-source/${encodeURIComponent(project)}/${directoryPath ? `${directoryPath}/` : ""}`;
    const html = new TextDecoder().decode(file);
    responseBody = new TextEncoder().encode(
      html.replace(/<head\b[^>]*>/i, (head) => `${head}<base href="${basePath}">`),
    );
    headers.set(
      "Content-Security-Policy",
      "sandbox allow-scripts allow-forms allow-popups",
    );
  }

  return new Response(responseBody, { headers });
}
