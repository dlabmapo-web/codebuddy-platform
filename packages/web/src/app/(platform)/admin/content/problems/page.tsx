import { permanentRedirect } from 'next/navigation';

/**
 * The console had a flat list of every problem on the platform. It does not any
 * more: a problem is reached by opening the course that holds it, which is how
 * a manager reaches one and where the editor has always been mounted.
 *
 * A redirect rather than a deletion, because this address has been linkable
 * since the console shipped and turns up in support tickets. Courses is where
 * the question that used to be asked here — *which curriculum cannot grade* —
 * is now answered, in a column of its own.
 */
export default function PlatformProblemsPage() {
  permanentRedirect('/admin/content/courses');
}
