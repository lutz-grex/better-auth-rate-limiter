import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { rateLimiter } from ".";
import { RATE_LIMITER_ERROR_CODES } from "./error-codes";

export const rateLimiterClient = () => {
	return {
		id: "rate-limiter",
		$InferServerPlugin: {} as ReturnType<typeof rateLimiter>,
		$ERROR_CODES: RATE_LIMITER_ERROR_CODES,
	} satisfies BetterAuthClientPlugin;
};

export { RATE_LIMITER_ERROR_CODES } from "./error-codes";
