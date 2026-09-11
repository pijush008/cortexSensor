import { Router } from "express";
import { authenticate, superAdminOnly } from "../../middleware/auth";
import { requirePermission } from "../../middleware/permissions";
import { ensureDeviceAccess } from "../../middleware/tenant";
import * as projectsController from "./projects.controller";

const router = Router();

router.post(
  "/project",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.createNewProject,
);
router.put(
  "/project",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.updateProject,
);

router.get(
  "/projects/:adminId",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  projectsController.getProjectListHandler,
);

router.get(
  "/project/:projectId",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  projectsController.getProjectDetailHandler,
);
router.patch(
  "/project/:projectId",
  authenticate,
  projectsController.updateProjectDetail,
);
router.delete(
  "/project/:projectId",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.deleteProjectByIdHandler,
);

router.get(
  "/projectStatus/:projectId",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  projectsController.getProjectStatusHandler,
);
router.get(
  "/projectStart/:projectId",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.projectStartHandler,
);

router.post(
  "/projectCode/:projectId",
  authenticate,
  projectsController.projectCodeCreation,
);
router.put(
  "/projectSetup/:projectId",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.projectSetupHandler,
);

// BEFORE "/project/:projectId/:offset", which would otherwise swallow this
// path and try to parse "device" as a timezone offset.
router.put(
  "/project/:projectId/device",
  authenticate,
  requirePermission("MANAGE_PROJECTS"),
  projectsController.setProjectDeviceHandler,
);
router.get(
  "/project/:projectId/device-options",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  projectsController.projectDeviceOptionsHandler,
);

router.put(
  "/project/:projectId/:offset",
  authenticate,
  projectsController.projectOffsetByIdHandler,
);

router.get(
  "/dashboard/:uniqueId",
  authenticate,
  requirePermission("VIEW_PROJECTS"),
  projectsController.dashboardDataHandler,
);

router.get(
  "/channelList/:deviceId",
  authenticate,
  ensureDeviceAccess,
  projectsController.channelListByDeviceIdHandler,
);
router.patch(
  "/channelList",
  authenticate,
  projectsController.channelListUpdateHandler,
);
router.put("/channelSwap", authenticate, projectsController.channelSwapHandler);
router.delete(
  "/removeSensorFromChannel/:id",
  authenticate,
  projectsController.removeSensorFromChannelHandler,
);

router.patch(
  "/emailSetting",
  authenticate,
  projectsController.updateEmailListHandler,
);
router.get(
  "/getEmailSetting/:uniqueId",
  authenticate,
  projectsController.getEmailListHandler,
);

router.post(
  "/project_analysis",
  authenticate,
  superAdminOnly,
  projectsController.projectAnalysisHandler,
);

export default router;
