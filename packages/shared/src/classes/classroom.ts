import { z } from 'zod';
import { materialTypeSchema } from '../content/course.js';

const classroomMaterialSchema = z.object({
  id: z.uuid(), title: z.string(), type: materialTypeSchema,
});
export const classroomCourseSchema = z.object({
  id: z.uuid(), title: z.string(),
  modules: z.array(z.object({
    id: z.uuid(), title: z.string(),
    lectures: z.array(z.object({
      id: z.uuid(), title: z.string(), materials: z.array(classroomMaterialSchema),
    })),
  })),
});
export const classroomSchema = z.object({
  class: z.object({ id: z.uuid(), name: z.string() }),
  courses: z.array(classroomCourseSchema),
});
export type ClassroomCourse = z.infer<typeof classroomCourseSchema>;
export type Classroom = z.infer<typeof classroomSchema>;

/** Course order, then the stored module/lecture/material order. */
export function classroomMaterials(classroom: Classroom) {
  return classroom.courses.flatMap(course => course.modules.flatMap(module =>
    module.lectures.flatMap(lecture => lecture.materials.map(material => ({
      ...material, courseId: course.id, courseTitle: course.title,
      moduleTitle: module.title, lectureTitle: lecture.title,
    })))));
}
