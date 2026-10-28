import { turtleCustomSource, turtleShapeSource, turtleProjectReadme, turtleSourceBytes } from '@cove/shared';
import { strToU8, zipSync } from 'fflate';

/** No source upload for browser projects. Exports run with native Python/Tk. */
export async function turtleProject(source: string): Promise<ArrayBuffer> {
  if (new TextEncoder().encode(source).length > turtleSourceBytes) throw new Error('SOURCE_TOO_LARGE');
  const bytes = zipSync({ 'main.py': strToU8(source), 'custom.py': strToU8(turtleCustomSource), 'shape.py': strToU8(turtleShapeSource), 'README.txt': strToU8(turtleProjectReadme) });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
