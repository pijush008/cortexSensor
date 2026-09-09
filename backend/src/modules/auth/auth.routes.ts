import { Router } from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../../config/redisStore";
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
  store: rateLimitStore(),
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status_code: 429, message: "Too many OTP requests. Please try again later." },
  store: rateLimitStore(),
});

router.post("/commonLogin", loginLimiter, authController.authLogin);
router.post("/forgotPassword", otpLimiter, authController.forgotPassword);
router.post("/validateOTP", otpLimiter, authController.validateOTP);
router.post("/changePassword", optionalAuth, authController.changeUserPassword);
router.post("/refresh", authController.refresh);

// Multi-factor enrolment. Rate limited with the OTP limiter: these verify a
// 6-digit code, so they are brute-forceable without one.
router.post("/mfa/enrol", authenticate, otpLimiter, mfaController.beginEnrolment);
router.post("/mfa/confirm", authenticate, otpLimiter, mfaController.confirmEnrolment);
router.post("/mfa/disable", authenticate, otpLimiter, mfaController.disable);
router.post("/logout", authController.logout);

router.post("/register/:userType", authController.registerAll);

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
