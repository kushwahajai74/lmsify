import type { Request, Response } from "express";

import { Course, type ICourse } from "../models/courseModel.js";
import { storage } from "../services/storageService.js";
import { cache } from "../services/cacheService.js";
import { AppError } from "../utils/AppError.js";
import { CACHE_KEYS, R2_FOLDERS } from "../utils/constants.js";
import type {
  CreateCourseBody,
  AddLectureBody,
  DeleteLectureQuery,
  PresignPosterBody,
  PresignVideoBody,
} from "../schemas/course.schema.js";
import type { PaginationQuery } from "../schemas/common.schema.js";
import { logger } from "../utils/logger.js";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Course → list-card shape returned by GET /courses.
 *
 * - `_id` → `id` (string) per our client convention.
 * - Drops `lectures` (huge array — fetched separately via /courses/:id).
 * - Drops Mongoose internals (`__v`, `createdAt`, `updatedAt`).
 *
 * `toObject` already handles the `select("-lectures")` exclusion — the
 * lectures field simply won't be on `obj` if it was excluded at query time.
 */
function toCourseCard(course: ICourse) {
  const obj = course.toObject({ versionKey: false });
  return {
    id: String(obj._id),
    title: obj.title,
    description: obj.description,
    category: obj.category,
    createdBy: obj.createdBy,
    price: obj.price,
    poster: obj.poster,
    numberOfVideos: obj.numberOfVideos,
    views: obj.views,
  };
}

/* ------------------------------------------------------------------ *
 * Public reads
 * ------------------------------------------------------------------ */

/**
 * GET /courses   (public, cache-through)
 *
 * Query: ?keyword=&category= — validated upstream by `paginationSchema`.
 * `cacheMiddleware` is mounted BEFORE this controller in the route chain,
 * so on cache HIT the controller is never called.
 *
 * Filter rules:
 *   - `category` (exact match, regex case-insensitive)
 *   - `keyword`  (substring match across `title` OR `category`, case-insensitive)
 *   - Both empty → unfiltered list of all courses.
 */
export async function getCourses(req: Request, res: Response): Promise<void> {
  const { keyword, category } = req.validated!.query as PaginationQuery;

  const filter: Record<string, unknown> = {};

  // Treat empty-string as "no filter" so cache key + filter stay consistent
  // for `?keyword=` and the missing-keyword case.
  const cleanKeyword = keyword && keyword.trim() !== "" ? keyword : undefined;
  const cleanCategory = category && category.trim() !== "" ? category : undefined;

  if (cleanKeyword) {
    filter.$or = [
      { title: { $regex: cleanKeyword, $options: "i" } },
      { category: { $regex: cleanKeyword, $options: "i" } },
    ];
  }
  logger.debug({ filter, cleanKeyword, cleanCategory }, "getCourses filter");

  // Apply the standalone `category` filter AFTER the keyword filter so a
  // request like `?keyword=react&category=web` matches courses whose
  // category contains "react" OR title contains "react", AND category
  // matches "web" (case-insensitive).
  if (cleanCategory) {
    filter.category = { $regex: cleanCategory, $options: "i" };
  }

  const courses = await Course.find(filter).select("-lectures");
  res.status(200).json({
    success: true,
    courses: courses.map(toCourseCard),
  });
}

/**
 * GET /courses/:id   (auth + course access required upstream)
 *
 * Returns just the lectures — the frontend fetches the course card from
 * GET /courses in parallel. Cache HIT short-circuits the controller.
 *
 */
export async function getCourseLectures(req: Request, res: Response): Promise<void> {
  const course = await Course.findById(req.params.id).select("lectures");
  if (!course) throw new AppError("Course not found", 404);

  res.status(200).json({
    success: true,
    lectures: course.lectures.map((l) => ({
      id: String(l._id),
      title: l.title,
      description: l.description,
      video: l.video,
    })),
  });
}

/* ------------------------------------------------------------------ *
 * Admin — poster & video presign
 * ------------------------------------------------------------------ */

/**
 * POST /admin/courses/poster/presign   (admin)
 *
 * Body: `{contentType: "image/png" | "image/jpeg" | ...}` — what the
 * frontend will PUT to the returned uploadUrl. We bake this into the
 * presigned signature AND use it to give the R2 object a proper extension
 * (`posters/<uuid>.png`) instead of `.bin`.
 *
 * Returns `{uploadUrl, publicId, url, expiresIn}`. The frontend PUTs the
 * file to `uploadUrl` (Content-Type header MUST match what was sent here),
 * then calls POST /courses with `{poster: {publicId, url}}`.
 */
export async function presignCoursePoster(req: Request, res: Response): Promise<void> {
  const { contentType } = req.validated!.body as PresignPosterBody;
  const presigned = await storage.presignPut(R2_FOLDERS.posters, { contentType });
  res.status(200).json({ success: true, ...presigned });
}

/**
 * POST /admin/courses/:id/lectures/video/presign   (admin)
 *
 * Same flow as the poster presign but targets the videos folder and accepts
 * video MIME types (`video/mp4`, etc.).
 */
export async function presignLectureVideo(req: Request, res: Response): Promise<void> {
  const { contentType } = req.validated!.body as PresignVideoBody;
  const presigned = await storage.presignPut(R2_FOLDERS.videos, { contentType });
  res.status(200).json({ success: true, ...presigned });
}

/* ------------------------------------------------------------------ *
 * Admin — mutations
 * ------------------------------------------------------------------ */

/**
 * POST /courses   (admin)
 *
 * Stamps `createdBy` from the authenticated admin's name. Invalidates the
 * list cache so the new course appears on next GET. Per-course detail
 * cache doesn't exist for this id yet — no-op there.
 */
export async function createCourse(req: Request, res: Response): Promise<void> {
  const { title, description, category, price, poster } = req.validated!.body as CreateCourseBody;

  const course = await Course.create({
    title,
    description,
    category,
    createdBy: req.user!.name, // server-stamped, never trust the body
    price,
    poster,
  });

  await cache.del(CACHE_KEYS.coursesList);

  res.status(201).json({
    success: true,
    message: "Course created successfully",
    courseId: String(course._id),
  });
}

/**
 * POST /courses/:id   (admin) — append a lecture to an existing course.
 *
 * Invalidates BOTH caches: the detail cache (new lecture is now visible)
 * and the list cache (`numberOfVideos` changed on the card).
 */
export async function addLectures(req: Request, res: Response): Promise<void> {
  const { title, description, video } = req.validated!.body as AddLectureBody;

  const course = await Course.findById(req.params.id);
  if (!course) throw new AppError("Course not found", 404);

  course.lectures.push({ title, description, video });
  course.numberOfVideos = course.lectures.length;
  await course.save();

  const courseId = String(course._id);
  await Promise.all([
    cache.del(CACHE_KEYS.course(courseId)),
    cache.del(CACHE_KEYS.coursesList),
  ]);

  const newLecture = course.lectures[course.lectures.length - 1];
  res.status(201).json({
    success: true,
    message: "Lecture added successfully",
    lectureId: String(newLecture._id),
  });
}

/**
 * DELETE /courses/:id   (admin)
 *
 * Cascade deletes R2 objects (poster + every lecture video) before
 * dropping the Mongo doc. R2 deletes are best-effort (`storage.delete`
 * swallows errors) so a flaky R2 still lets the doc go away.
 *
 * Cache invalidation: list AND detail, in parallel.
 */
export async function deleteCourse(req: Request, res: Response): Promise<void> {
  const course = await Course.findById(req.params.id);
  if (!course) throw new AppError("Course not found", 404);

  const courseId = String(course._id);

  // Fire all R2 deletes in parallel — they're independent and best-effort.
  await Promise.all([
    storage.delete(course.poster.publicId),
    ...course.lectures.map((l) => storage.delete(l.video.publicId)),
  ]);

  await course.deleteOne();

  await Promise.all([
    cache.del(CACHE_KEYS.coursesList),
    cache.del(CACHE_KEYS.course(courseId)),
  ]);

  res.status(200).json({
    success: true,
    message: "Course deleted successfully",
  });
}

/**
 * DELETE /lectures?courseId=...&lectureId=...   (admin)
 *
 * Removes ONE lecture sub-document, cleans its R2 object, decrements
 * `numberOfVideos`. Only invalidates the detail cache — list cardinality
 * (count of courses) didn't change.
 */
export async function deleteLectures(req: Request, res: Response): Promise<void> {
  const { courseId, lectureId } = req.validated!.query as DeleteLectureQuery;

  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);

  const lecture = course.lectures.id(lectureId);
  if (!lecture) throw new AppError("Lecture not found", 404);

  // Best-effort R2 cleanup. Don't block the delete on this.
  await storage.delete(lecture.video.publicId);

  // `lecture` is a Mongoose subdoc — `.deleteOne()` removes it from the array.
  await lecture.deleteOne();

  course.numberOfVideos = course.lectures.length;
  await course.save();

  await cache.del(CACHE_KEYS.course(courseId));

  res.status(200).json({
    success: true,
    message: "Lecture deleted successfully",
  });
}