import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import * as usersController from "./users.controller";

const router = Router();

router.get(
  "/user/list/:userType/:adminId",
  authenticate,
  requirePermission("VIEW_USERS"),
  usersController.adminList,
);

router.put(
  "/update/csvAccess/:userId/:csv",
  authenticate,
  superAdminOnly,
  usersController.csvAccess,
);

router.get(
  "/admin/sensor/:adminId",
  authenticate,
  usersController.assignedSensor,
);

router.get(
  "/admin/device/:adminId",
  authenticate,
  usersController.assignedDevice,
);

export default router;
