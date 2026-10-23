import { sourceFilesSchema } from '@cove/shared';

export function sourceFileNameError(name: string, files: Record<string, string>): 'file_duplicate' | 'file_invalid' | 'file_limit' | null {
  if (Object.hasOwn(files, name)) return 'file_duplicate';
  if (Object.keys(files).some(existing => existing.startsWith(name + '/') || name.startsWith(existing + '/'))) return 'file_invalid';
  if (!name.endsWith('.py') || !sourceFilesSchema.safeParse({ [name]: '' }).success) return 'file_invalid';
  if (!sourceFilesSchema.safeParse({ ...files, [name]: '' }).success) return 'file_limit';
  return null;
}
