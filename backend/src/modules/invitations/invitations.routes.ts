import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { otpLimiter } from "../../middleware/rate-limit";
import * as controller from "./invitations.controller";

const router = Router();

// Administrator-facing. Authorisation is per project, not per route: which
// projects a caller may assign roles on depends on the project, so the check
// has to happen where the project id is known.
router.post(
  "/project/:projectId/invitation",
  authenticate,
  controller.createInvitationHandler,
);
router.get(
  "/project/:projectId/invitation",
  authenticate,
  controller.listInvitationsHandler,
);
router.post(
  "/project/:projectId/invitation/:invitationId/resend",
  authenticate,
  controller.resendInvitationHandler,
);
router.delete(
  "/project/:projectId/invitation/:invitationId",
  authenticate,
  controller.revokeInvitationHandler,
);

// Taking somebody OFF a project. Separate from revoking an invitation: that
// withdraws an offer nobody has taken up, this ends an assignment somebody
// accepted, and only the second has to decide what becomes of their membership.
router.delete(
  "/project/:projectId/stakeholder/:role",
  authenticate,
  controller.removeStakeholderHandler,
);

// Completing an invitation: both steps are the administrator's, addressed by
// the invitation's id under its project. There are no unauthenticated routes
// here any more — the invitee never visits the platform to be created.
router.post(
  "/project/:projectId/invitation/:invitationId/verify",
  authenticate,
  otpLimiter,
  controller.verifyInvitationHandler,
);
router.post(
  "/project/:projectId/invitation/:invitationId/complete",
  authenticate,
  controller.completeInvitationHandler,
);

export default router;
