import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProjectMonitor from "@/app/project-monitor";
import ProjectFrame from "@/app/project-frame";
import TaskApiDemo from "@/app/task-api-demo";
import CDataStructuresDemo from "@/app/c-data-structures-demo";
import { getProject, projects } from "@/app/project-data";

type ProjectPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return projects.map(({ id }) => ({ slug: id }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);

  return project ? { title: `${project.title} | Workspace` } : {};
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) {
    notFound();
  }

  const isDevOpsProject = project.id === "devops-dashboard";
  const isCppTaskApi = project.id === "cpp-task-api";
  const isCDataStructuresLab = project.id === "c-data-structures-lab";

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none">
              <path d="M5 5.5h10M5 10h10M5 14.5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="14.5" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span>workspace</span>
        </Link>
        <p className="workspace-label">My workspace</p>
        <div className="workspace-switcher">
          <span className="workspace-avatar">P</span>
          <span>
            <strong>My projects</strong>
            <small>Designed and built by me</small>
          </span>
        </div>
        <p className="sidebar-section-label">My workspace</p>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <Link className="sidebar-link" href="/#top">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <path d="M3.5 9.2 10 3.8l6.5 5.4v6.6a.7.7 0 0 1-.7.7h-3.9v-4.4H8.1v4.4H4.2a.7.7 0 0 1-.7-.7V9.2Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
            </svg>
            Overview
          </Link>
          <Link className="sidebar-link sidebar-link--active" href="/#projects" aria-current="page">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
              <rect x="3.5" y="3.5" width="5.2" height="5.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="11.3" y="3.5" width="5.2" height="5.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="3.5" y="11.3" width="5.2" height="5.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="11.3" y="11.3" width="5.2" height="5.2" rx="1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Projects
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <strong>My work, all in one place.</strong>
            <p>I built this collection so I can open each project here and return anytime.</p>
          </div>
        </div>
      </aside>

      <main className="detail-main">
        <div className="detail-topbar">
          <Link className="back-link" href="/">
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
              <path d="M15.5 10H4.5m0 0 4.2-4.2M4.5 10l4.2 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            My projects
          </Link>
          <div className="breadcrumb">
            My workspace <span aria-hidden="true">/</span> <strong>{project.title}</strong>
          </div>
        </div>

        <section className="detail-heading">
          <p className="eyebrow">
            <span className="eyebrow-mark" aria-hidden="true" />
            {project.kind}
          </p>
          <h1>{project.title}</h1>
          <p className="detail-description">{project.description}</p>
          <div className="detail-meta" aria-label="Project technologies">
            {project.tags.map((tag) => (
              <span className="project-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </section>

        <section className="viewer-card" aria-label={`${project.title} project view`}>
          <div className="viewer-toolbar">
            <span className="viewer-label">
              <span className="status-dot" aria-hidden="true" />
              Project view
            </span>
            {project.sourcePath && (
              <a
                className="source-link"
                href={`/project-source/${project.id}/`}
                target="_blank"
                rel="noreferrer"
              >
                Open project in a new tab
                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
                  <path d="M7 5.5h7.5V13M14.2 5.8 6 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
            {"repoUrl" in project && (
              <a className="source-link" href={project.repoUrl} target="_blank" rel="noreferrer">
                {project.id === "server-automation-toolkit" ? "Original scripts" : "Original source"}
                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
                  <path d="M7 5.5h7.5V13M14.2 5.8 6 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
          </div>

          {isDevOpsProject ? (
            <ProjectMonitor />
          ) : isCDataStructuresLab ? (
            <CDataStructuresDemo />
          ) : isCppTaskApi ? (
            <TaskApiDemo />
          ) : (
            <ProjectFrame
              projectId={project.id}
              title={`${project.title} interactive project`}
              src={`/project-source/${project.id}/`}
            />
          )}
        </section>
      </main>
    </div>
  );
}
