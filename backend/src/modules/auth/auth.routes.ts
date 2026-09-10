import { Router } from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../../config/redisStore";
import { config } from "../../config";
import { authenticate, optionalAuth, superAdminOnly } from "../../middleware/auth";
import * as authController from "./auth.controller";
import * as mfaController from "./mfa.controller";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status_code: 429, message: "Too many login attempts. Please try again later." },
  skipSuccessfulRequests: true,
  store: rateLimitStore("login"),
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status_code: 429, message: "Too many OTP requests. Please try again later." },
  store: rateLimitStore("otp"),
});

/**
 * Registering an ORGANIZATION is rate limited; adding a member is not.
 *
 * This route is unauthenticated and now writes an uploaded logo to disk, so it
 * needs a ceiling — every other unauthenticated auth route already has one.
 *
 * `skipSuccessfulRequests` is deliberately absent, unlike loginLimiter. There a
 * successful request is cheap; here the SUCCESSFUL one is what writes the file.
 *
 * The skip matters: the same endpoint is how an admin adds contractors and
 * authorities from the users page, and a handful per hour would break onboarding
 * a team. Signing up a company is a once-ever act; adding colleagues is not.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.registerRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status_code: 429,
    message: "Too many registration attempts. Please try again later.",
  },
  store: rateLimitStore("register"),
  skip: (req) => req.params.userType !== "admin",
});

router.post("/commonLogin", loginLimiter, authController.authLogin);
// Same limiter as the password step: the code is six digits, and without a
// limit here the second factor could simply be enumerated.
router.post("/commonLogin/otp", loginLimiter, authController.authLoginOtp);
router.post("/forgotPassword", otpLimiter, authController.forgotPassword);
router.post("/validateOTP", otpLimiter, authController.validateOTP);
// Completing a reset is rate limited like requesting one: the token is 32
// random bytes, but an unlimited endpoint invites guessing anyway.
router.post("/resetPassword", otpLimiter, authController.resetPassword);
router.post("/changePassword", optionalAuth, authController.changeUserPassword);
router.post("/refresh", authController.refresh);

// Multi-factor enrolment. Rate limited with the OTP limiter: these verify a
// 6-digit code, so they are brute-forceable without one.
router.post("/mfa/enrol", authenticate, otpLimiter, mfaController.beginEnrolment);
router.post("/mfa/confirm", authenticate, otpLimiter, mfaController.confirmEnrolment);
router.post("/mfa/disable", authenticate, otpLimiter, mfaController.disable);
router.post("/logout", authController.logout);

/**
 * One route, two very different operations.
 *
 * `admin` is self-service organization sign-up and must stay open to strangers.
 * `contractor` and `authority` add somebody INTO an existing organization, and
 * were open to strangers too — with the target tenant named by an `admin_id`
 * taken straight from the request body. Anyone could therefore self-provision an
 * active VIEWER membership inside any organization by guessing a small integer.
 *
 * `optionalAuth` rather than `authenticate` because the admin branch has no
 * session to authenticate; the controller requires one for the member branches.
 */
router.post(
  "/register/:userType",
  registerLimiter,
  optionalAuth,
  authController.registerAll,
);

router.get("/verify/:emailId", authController.sendVerificationLink);
router.get("/verify/:id", authController.verifyPrimaryUser);
router.get("/verifyUser/:id", authController.verifyPrimaryUser);

router.delete(
  "/user/:userId",
  authenticate,
  authController.userDelete,
);
router.get(
  "/user/:userId",
  authenticate,
  authController.getUserDetail,
);

router.get(
  "/delete/admin/:adminId",
  authenticate,
  superAdminOnly,
  authController.adminDeleteSoft,
);
router.get(
  "/deactivate/admin/:adminId",
  authenticate,
  superAdminOnly,
  authController.adminDeactivate,
);
router.get(
  "/delete/device/:adminId",
  authenticate,
  superAdminOnly,
  authController.adminDeleteSoft,
);

router.get(
  "/verify/user/:userId/:verifyType",
  authenticate,
  superAdminOnly,
  authController.superAdminVerifyUser,
);

router.patch(
  "/register/:userType/:userId",
  authenticate,
  authController.UpdateAllUserType,
);

export default router;
