import { defineErrorCodes } from "@better-auth/core/utils/error-codes";

export const RATE_LIMITER_ERROR_CODES = defineErrorCodes({
	RATE_LIMITED: "Too many requests. Please try again later.",
});
