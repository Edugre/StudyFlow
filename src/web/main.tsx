import React, { lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './styles.css';

// Loaded lazily so a missing Supabase configuration cannot blank the whole app.
const CoursesPage = lazy(() =>
  import('./features/courses/CoursesPage.js').then((module) => ({
    default: module.CoursesPage,
  })),
);
const TasksPage = lazy(() =>
  import('./features/assignments/TasksPage.js').then((module) => ({
    default: module.TasksPage,
  })),
);
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

/** A page that needs the database, or an explanation when it is not set up. */
function Workspace({ name, children }: { name: string; children: ReactNode }) {
  return configured ? (
    <Suspense fallback={<p>Loading your workspace…</p>}>{children}</Suspense>
  ) : (
    <>
      <h1>{name} are unavailable</h1>
      <p role="alert">
        StudyFlow is not connected to its database. Set VITE_SUPABASE_URL and
        VITE_SUPABASE_PUBLISHABLE_KEY, then rebuild.
      </p>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <header>
        <Link to="/">StudyFlow</Link>
        <nav aria-label="Main navigation">
          <Link to="/courses">Courses</Link>
          <Link to="/tasks">Tasks</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>Your academic work, in one place.</h1>
                <p>
                  Organize courses, assignments, and study time with StudyFlow.
                </p>
                <Link to="/courses">Course workspace</Link>
              </>
            }
          />
          <Route
            path="/courses"
            element={
              <Workspace name="Courses">
                <CoursesPage />
              </Workspace>
            }
          />
          <Route
            path="/tasks"
            element={
              <Workspace name="Tasks">
                <TasksPage />
              </Workspace>
            }
          />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/">Return home</Link>
              </>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  </React.StrictMode>,
);
