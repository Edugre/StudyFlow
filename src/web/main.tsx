import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { CoursesPage } from './features/courses/CoursesPage.js';
import './styles.css';

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
          <Route path="/courses" element={<CoursesPage />} />
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
