import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../config/redisStore";
import { config } from "../config";

/**
 * Rate limiters shared by more than one module.
 *
 * `otpLimiter` began as a module-local constant in auth.routes. Project
 * invitations need the same ceiling on the same kind of endpoint — an
 * unauthenticated route that accepts a short numeric code — and a second copy
 * of the config would be free to drift from the first. One definition means a
 * change to the window applies everywhere codes are guessed at.
 */
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.otpRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status_code: 429,
    message: "Too many OTP requests. Please try again later.",
  },
  store: rateLimitStore("otp"),
});
