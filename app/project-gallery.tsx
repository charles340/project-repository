"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { projects } from "./project-data";

const filters = ["All", "React", "Web", "Shell", "Backend"] as const;
type ProjectFilter = (typeof filters)[number];

export default function ProjectGallery() {
  const [filter, setFilter] = useState<ProjectFilter>("All");
  const [query, setQuery] = useState("");

  const visibleProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      const matchesFilter = filter === "All" || project.format === filter;
      const searchableText = [
        project.title,
        project.kind,
        project.description,
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && searchableText.includes(normalizedQuery);
    });
  }, [filter, query]);

  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none">
              <path
                d="M5 5.5h10M5 10h10M5 14.5h6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
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
              <path
                d="M3.5 9.2 10 3.8l6.5 5.4v6.6a.7.7 0 0 1-.7.7h-3.9v-4.4H8.1v4.4H4.2a.7.7 0 0 1-.7-.7V9.2Z"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinejoin="round"
              />
            </svg>
            Overview
          </Link>
          <Link className="sidebar-link sidebar-link--active" href="#projects" aria-current="page">
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

      <main className="main-panel" id="top">
        <div className="topbar">
          <div className="breadcrumb">
            My workspace <span aria-hidden="true">/</span> <strong>Projects</strong>
          </div>
          <div className="collection-status">
            <span className="status-dot" aria-hidden="true" />
            My collection
          </div>
        </div>

        <section className="hero" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-mark" aria-hidden="true" />
              Projects I built
            </p>
            <h1 id="page-title">
              <span>My projects,</span>
              <br />
              ready to explore.
            </h1>
            <p className="hero-copy">
              I&apos;m the developer behind every project here. I built this
              collection to share my work. Choose any project to open it in the app.
            </p>
          </div>
          <div className="hero-count" aria-label={`${projects.length} projects`}>
            <strong>{String(projects.length).padStart(2, "0")}</strong>
            <span>projects I&apos;ve built</span>
          </div>
        </section>

        <section className="projects-section" id="projects" aria-labelledby="projects-heading">
          <div className="projects-toolbar">
            <h2 className="projects-heading" id="projects-heading">
              My projects <span>{visibleProjects.length} shown</span>
            </h2>
            <div className="project-controls">
              <label className="search-field">
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
                  <circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.4" />
                  <path d="m13.1 13.1 3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  placeholder="Search projects..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Search projects"
                />
              </label>
              <div className="filter-group" aria-label="Filter projects">
                {filters.map((option) => (
                  <button
                    className={`filter-button${filter === option ? " filter-button--active" : ""}`}
                    key={option}
                    type="button"
                    aria-pressed={filter === option}
                    onClick={() => setFilter(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="project-grid">
            {visibleProjects.map((project) => (
              <Link
                className={`project-card project-card--${project.id}`}
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <ProjectPreview projectId={project.id} />
                <div className="project-card-body">
                  <div className="project-card-top">
                    <span className="project-kind">{project.kind}</span>
                    <span className="project-open" aria-hidden="true">
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                        <path d="M5.5 14.5 14 6M6.5 6H14v7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  <h3>{project.title}</h3>
                  <p className="project-description">{project.description}</p>
                  <div className="project-tags" aria-label="Technologies">
                    {project.tags.map((tag) => (
                      <span className="project-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}

            {visibleProjects.length === 0 && (
              <div className="empty-state">
                <h3>No projects match that search</h3>
                <p>Clear the filter to browse everything I&apos;ve built.</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("All");
                  }}
                >
                  Show all projects
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProjectPreview({ projectId }: { projectId: (typeof projects)[number]["id"] }) {
  if (projectId === "devops-dashboard") {
    return (
      <div className="project-preview project-preview--devops-dashboard" aria-hidden="true">
        <div className="preview-window">
          <div className="preview-window-bar">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-dashboard">
            <div className="preview-rail">
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="preview-dashboard-main">
              <div className="preview-dashboard-title" />
              <div className="preview-metrics">
                <div className="preview-metric"><i /><strong /></div>
                <div className="preview-metric"><i /><strong /></div>
                <div className="preview-metric"><i /><strong /></div>
              </div>
              <svg className="preview-chart" viewBox="0 0 250 42" preserveAspectRatio="none">
                <path d="M0 33 25 27 47 30 71 14 93 23 119 9 143 17 166 7 191 14 216 4 250 9" fill="none" stroke="#b8e566" strokeWidth="2" />
                <path d="M0 33 25 27 47 30 71 14 93 23 119 9 143 17 166 7 191 14 216 4 250 9V42H0Z" fill="#b8e566" fillOpacity=".08" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (projectId === "interactive-calendar-2025") {
    return (
      <div className="project-preview project-preview--interactive-calendar-2025" aria-hidden="true">
        <div className="preview-calendar">
          <div className="preview-calendar-title">
            <strong>Rujan 2025</strong>
            <span>2025</span>
          </div>
          <div className="preview-calendar-days">
            {["P", "U", "S", "Č", "P", "S", "N"].map((day, index) => (
              <i key={`day-${index}`}>{day}</i>
            ))}
            {Array.from({ length: 28 }, (_, index) => (
              <b key={`date-${index + 1}`}>{index + 1}</b>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (projectId === "javascript-todo-list") {
    return (
      <div className="project-preview project-preview--todo" aria-hidden="true">
        <div className="preview-todo">
          <strong>Today</strong>
          <span><i /> Plan the week</span>
          <span><i /> Finish a quick task</span>
          <span className="preview-todo--done"><i /> Take a break</span>
        </div>
      </div>
    );
  }

  if (projectId === "javascript-calculator") {
    return (
      <div className="project-preview project-preview--calculator" aria-hidden="true">
        <div className="preview-calculator">
          <span>24 × 3</span>
          <strong>72</strong>
          <div className="preview-calculator-keys">
            {["AC", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+"].map((key) => (
              <i key={key}>{key}</i>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (projectId === "javascript-notes") {
    return (
      <div className="project-preview project-preview--notes" aria-hidden="true">
        <div className="preview-notes">
          <span>QUICK NOTES</span>
          <strong>Small ideas<br />add up.</strong>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  if (projectId === "server-automation-toolkit") {
    return (
      <div className="project-preview project-preview--automation" aria-hidden="true">
        <div className="preview-terminal">
          <div className="preview-terminal-bar"><i /><i /><i /><span>server tools</span></div>
          <p><b>$</b> ./server-report.sh</p>
          <span>Host&nbsp; online</span>
          <span>Disk&nbsp; 42% used</span>
          <span>Services&nbsp; 3 active</span>
          <p><b>$</b> _</p>
        </div>
      </div>
    );
  }

  if (projectId === "cpp-task-api") {
    return (
      <div className="project-preview project-preview--cpp-task-api" aria-hidden="true">
        <div className="preview-api">
          <div className="preview-api-top"><i /><i /><i /><span>127.0.0.1:8080</span></div>
          <p><b>GET</b> /api/tasks</p>
          <div className="preview-api-row"><i /><span>Verify backups</span><strong>high</strong></div>
          <div className="preview-api-row"><i /><span>Apply patches</span><strong>due soon</strong></div>
          <div className="preview-api-footer">C++17 · persistent · loopback only</div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-preview project-preview--sjiwp" aria-hidden="true">
      <div className="preview-site">
        <div className="preview-site-photo" />
        <div className="preview-site-copy">
          <i />
          <strong>Stories<br />and places</strong>
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
