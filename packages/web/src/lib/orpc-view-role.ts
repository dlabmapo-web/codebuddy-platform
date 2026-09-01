/** Console-native administration always uses the platform Manager view. */
export function shouldForwardViewRole(pathname?: string): boolean {
  const current =
    pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname);
  return current !== '/admin' && !current.startsWith('/admin/');
}
