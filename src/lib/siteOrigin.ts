// The public origin the visitor used (e.g. https://talkninja.app or
// http://localhost:3000). Behind the host's proxy, request.url is the internal
// bind address (http://0.0.0.0:10000), so read the forwarded headers instead.
export function getSiteOrigin(request: Request): string {
  const fallback = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0].trim() ||
    request.headers.get('host') ||
    fallback.host;
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    fallback.protocol.replace(':', '');
  return `${proto}://${host}`;
}
