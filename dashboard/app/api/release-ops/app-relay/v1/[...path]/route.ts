// Next.js App Router Proxy/Alias Route for Release-Ops prefixed Public AppRelay API (/api/release-ops/app-relay/v1/*)
// Forwarding directly to standard public API route handlers to guarantee unified contract implementation.

export { GET, POST, DELETE, OPTIONS } from '../../../../app-relay/v1/[...path]/route';

