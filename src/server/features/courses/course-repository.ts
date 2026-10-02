import type { Course, CourseInput } from '../../../shared/course.js';

/** All SQL in the eventual adapter must constrain records by trusted ownerId. */
export interface CourseRepository {
  create(ownerId: string, input: CourseInput): Course;
  findById(ownerId: string, courseId: string): Course | null;
  listBySemester(ownerId: string, semester: string): Course[];
  update(ownerId: string, courseId: string, input: CourseInput): Course | null;
  delete(ownerId: string, courseId: string): boolean;
}
