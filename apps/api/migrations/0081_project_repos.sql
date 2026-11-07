-- A project's other repos (2026-11-07). A project is a product, and a product can be built from
-- several repos (a web app, its API, its mobile app); `project.repo` held one, so work from the
-- others never reached the project or its README. `project.repo` stays the main one, shown first;
-- these are the rest, as people and agents wrote them (claims.repoKey compares them).
CREATE TABLE project_repo (
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  repo TEXT NOT NULL,
  added_by TEXT NOT NULL DEFAULT '',
  added TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, repo)
);
