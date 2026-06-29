import { Router } from "express";

import { validate } from "../middlewares/validate.js";
import { cacheMiddleware } from "../middlewares/cache.js";
import {
  isAuthenticated,
  authorizeAdmin,
  authorizeCourseAccess,
} from "../middlewares/auth.js";
import { paginationSchema } from "../schemas/common.schema.js";
import {
  createCourseSchema,
  addLectureSchema,
  deleteLectureQuerySchema,
  courseIdParamSchema,
  presignPosterSchema,
  presignVideoSchema,
} from "../schemas/course.schema.js";
import { CACHE_TTL } from "../utils/constants.js";
import {
  getCourses,
  getCourseLectures,
  presignCoursePoster,
  presignLectureVideo,
  createCourse,
  addLectures,
  deleteCourse,
  deleteLectures,
} from "../controllers/courseController.js";

/**
 * Mounted at `/api/v1` in `app.ts`. Route map:
 *
 *   GET    /courses                                  — public, cached list
 *   GET    /courses/:id                              — auth + course access, cached detail
 *
 *   POST   /admin/courses/poster/presign             — admin, presign poster
 *   POST   /admin/courses/:id/lectures/video/presign — admin, presign video
 *
 *   POST   /courses                                  — admin, create course
 *   POST   /courses/:id                              — admin, add lecture
 *   DELETE /courses/:id                              — admin, cascade-delete course
 *   DELETE /lectures                                 — admin, drop one lecture
 *
 * The mixed admin + public namespace is fine because admin gates are
 * attached at the route level, not the router level.
 */
export const courseRouter = Router();

/* ---- Public reads ---- */

// validate() runs BEFORE cacheMiddleware so the cache key sees a clean,
// typed query shape (not raw ParsedQs — duplicate-param URLs would otherwise
// produce unstable keys). The middleware stashes the parsed result on
// `req.validated.query`, which is what the key builder reads below.
courseRouter.get(
  "/courses",
  validate(paginationSchema, "query"),
  cacheMiddleware(
    (req) => {
      const { keyword, category } = req.validated!.query as { keyword?: string; category?: string };
      return `courses:${keyword ?? ""}:${category ?? ""}`;
    },
    CACHE_TTL.coursesList,
  ),
  getCourses,
);

courseRouter.get(
  "/courses/:id",
  validate(courseIdParamSchema, "params"),
  isAuthenticated,
  authorizeCourseAccess,
  cacheMiddleware((req) => `course:${req.params.id}`, CACHE_TTL.course),
  getCourseLectures,
);

/* ---- Admin presign ---- */

courseRouter.post(
  "/admin/courses/poster/presign",
  isAuthenticated,
  authorizeAdmin,
  validate(presignPosterSchema),
  presignCoursePoster,
);

courseRouter.post(
  "/admin/courses/:id/lectures/video/presign",
  validate(courseIdParamSchema, "params"),
  isAuthenticated,
  authorizeAdmin,
  validate(presignVideoSchema),
  presignLectureVideo,
);

/* ---- Admin mutations ---- */

courseRouter.post(
  "/courses",
  isAuthenticated,
  authorizeAdmin,
  validate(createCourseSchema),
  createCourse,
);

courseRouter.post(
  "/courses/:id",
  validate(courseIdParamSchema, "params"),
  isAuthenticated,
  authorizeAdmin,
  validate(addLectureSchema),
  addLectures,
);

courseRouter.delete(
  "/courses/:id",
  validate(courseIdParamSchema, "params"),
  isAuthenticated,
  authorizeAdmin,
  deleteCourse,
);

courseRouter.delete(
  "/lectures",
  isAuthenticated,
  authorizeAdmin,
  validate(deleteLectureQuerySchema, "query"),
  deleteLectures,
);