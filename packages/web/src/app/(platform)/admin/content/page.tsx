import { redirect } from 'next/navigation';

/** Content opens on courses, which is what an operator is usually looking for. */
export default function ContentIndex() {
  redirect('/admin/content/courses');
}
