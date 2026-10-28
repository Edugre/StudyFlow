import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './styles.css';

// Loaded lazily so a missing Supabase configuration cannot blank the whole app.
const CoursesPage = lazy(() =>
  import('./features/courses/CoursesPage.js').then((module) => ({
    default: module.CoursesPage,
  })),
);
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <header>
        <Link to="/">StudyFlow</Link>
        <nav aria-label="Main navigation">
          <Link to="/courses">Courses</Link>
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
              configured ? (
                <Suspense fallback={<p>Loading your workspace…</p>}>
                  <CoursesPage />
                </Suspense>
              ) : (
                <>
                  <h1>Courses are unavailable</h1>
                  <p role="alert">
                    StudyFlow is not connected to its database. Set
                    VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, then
                    rebuild.
                  </p>
                </>
              )
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
