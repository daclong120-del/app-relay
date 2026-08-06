// Next.js App Router Catch-All Route for Internal Worker Gateway v1 (/api/internal/worker/v1/*)
// Re-exports worker route handler from release-ops worker endpoint for canonical internal routing.

export { POST, OPTIONS } from '../../../../release-ops/worker/v1/[...path]/route';

