# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-02-20

### Added

- Initial release of `better-auth-rate-limiter`
- `rateLimiter()` server plugin for [Better Auth](https://www.better-auth.com)
- `rateLimiterClient()` client-side plugin
- Three storage backends:
  - `memory` — fast in-process storage (default)
  - `database` — persists in the Better Auth database (`rateLimit` table)
  - `secondary-storage` — delegates to Better Auth's `secondaryStorage` (e.g. Redis)
- Three detection modes:
  - `ip` — rate limit by client IP (respects `x-forwarded-for`)
  - `user` — rate limit by authenticated user ID
  - `ip-and-user` — user ID when authenticated, IP as fallback
- Per-path `customRules` with `*` and `**` wildcard pattern support
- Disable rate limiting for specific paths by setting a rule to `false`
- Standard HTTP response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- `auth.api.checkRateLimit()` helper for manual enforcement in route handlers
- Full TypeScript support with strict types
