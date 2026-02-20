export interface RateLimitRule {
	window: number;
	max: number;
}

export interface RateLimiterOptions {
	/**
	 * Default time window in seconds.
	 * @default 60
	 */
	window?: number;
	/**
	 * Default maximum number of requests per window.
	 * @default 100
	 */
	max?: number;
	/**
	 * Storage backend for rate limit data.
	 *
	 * - `"memory"` — in-process Map (default, not shared across instances)
	 * - `"database"` — persisted to the database using the `rateLimit` model
	 * - `"secondary-storage"` — uses the configured secondary storage (e.g. Redis)
	 *
	 * @default "memory"
	 */
	storage?: "memory" | "database" | "secondary-storage";
	/**
	 * How to identify the requester for rate limiting.
	 *
	 * - `"ip"` — rate limit by IP address (default). Works for all requests.
	 * - `"user"` — rate limit by authenticated user ID. Unauthenticated
	 *   requests are not rate limited.
	 * - `"ip-and-user"` — rate limit by user ID when authenticated,
	 *   falls back to IP for unauthenticated requests.
	 *
	 * @default "ip"
	 */
	detection?: "ip" | "user" | "ip-and-user";
	/**
	 * Custom per-path rate limit rules.
	 *
	 * Keys are path patterns (supports `*` and `**` wildcards).
	 * Values are either a `{ window, max }` override or `false` to disable
	 * rate limiting for that path.
	 *
	 * @example
	 * ```ts
	 * customRules: {
	 *   "/api/ai/*": { window: 60, max: 10 },
	 *   "/api/health": false,
	 * }
	 * ```
	 */
	customRules?: Record<string, RateLimitRule | false>;
}

export interface RateLimitEntry {
	key: string;
	count: number;
	/**
	 * Timestamp (ms) of when the current rate-limit window started.
	 * The window resets when `Date.now() - lastRequest > windowMs`.
	 */
	lastRequest: number;
}

export interface CheckRateLimitResponse {
	success: boolean;
	limit: number;
	remaining: number;
	retryAfter?: number;
	resetAt?: number;
	message?: string;
}
