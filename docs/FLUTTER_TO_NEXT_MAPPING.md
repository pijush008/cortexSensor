# FLUTTER_TO_NEXT_MAPPING.md

> **Note:** The original Flutter app and legacy backend were removed from the repo (2026-09-05). The migration is complete — this app is now React + Next.js + Node/Prisma only. Legacy source is preserved in the backup archive (`/home/pijush/Downloads/SHM/legacy-backup-*.tar.gz`) and the MySQL dump in `database/structural_health_monitoring.sql`. This document is kept as a historical mapping of what was migrated and from where.

## Screen → Page Mapping

| Flutter Screen          | File                                                    | Next.js Page                                                        | Route                                     |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| Authentication (splash) | `auth/authentication.dart`                              | Middleware redirect                                                 | —                                         |
| Login                   | `auth/login_page.dart`                                  | `app/(auth)/login/page.tsx`                                         | `/login`                                  |
| OTP Fields              | `auth/otp_fields.dart`                                  | `app/(auth)/verify-otp/page.tsx`                                    | `/verify-otp`                             |
| Change Password         | `auth/change_password.dart`                             | `app/(auth)/forgot-password/page.tsx`                               | `/forgot-password`                        |
| Dashboard (main)        | `screen/dashboard/dashboard.dart`                       | `app/(dashboard)/[userType]/page.tsx`                               | `/:userType`                              |
| Dashboard Helper        | `screen/dashboard/dashboard_helper.dart`                | `components/dashboard/`                                             | —                                         |
| Dashboard Area          | `screen/dashboard/dashboard_area.dart`                  | `components/dashboard/`                                             | —                                         |
| Pie Chart               | `screen/dashboard/custom_pie_chart.dart/pie_chart.dart` | `components/charts/pie-chart.tsx`                                   | —                                         |
| Super Admin Table       | `screen/super_admin/super_admin.dart`                   | `app/(dashboard)/superadmin/users/page.tsx`                         | `/superadmin/users`                       |
| Admin Table             | `screen/super_admin/admin_table.dart`                   | `components/tables/admin-table.tsx`                                 | —                                         |
| Admin (main)            | `screen/Admin/admin.dart`                               | `app/(dashboard)/admin/page.tsx`                                    | `/admin`                                  |
| Contractor Table        | `screen/Admin/contractor_table.dart`                    | `app/(dashboard)/admin/contractors/page.tsx`                        | `/admin/contractors`                      |
| Authority Table         | `screen/Admin/authority_table.dart`                     | `app/(dashboard)/admin/authorities/page.tsx`                        | `/admin/authorities`                      |
| Add User                | `screen/add_user.dart`                                  | `app/(dashboard)/[userType]/users/add/page.tsx`                     | `/:userType/users/add`                    |
| Device Table            | `screen/device_table.dart`                              | `app/(dashboard)/[userType]/devices/page.tsx`                       | `/:userType/devices`                      |
| Add Device              | `screen/add_device_page.dart`                           | `app/(dashboard)/[userType]/devices/add/page.tsx`                   | `/:userType/devices/add`                  |
| Channel View            | `screen/Admin/channel_view.dart`                        | `app/(dashboard)/[userType]/devices/[deviceId]/channels/page.tsx`   | `/:userType/devices/:deviceId/channels`   |
| Sensor Table            | `screen/sensor_table.dart`                              | `app/(dashboard)/[userType]/sensors/page.tsx`                       | `/:userType/sensors`                      |
| Add Sensor              | `screen/add_sensor.dart`                                | `app/(dashboard)/[userType]/sensors/add/page.tsx`                   | `/:userType/sensors/add`                  |
| Select Sensor           | `screen/select_sensor.dart`                             | `components/forms/select-sensor.tsx`                                | —                                         |
| Select Device           | `screen/select_device.dart`                             | `components/forms/select-device.tsx`                                | —                                         |
| Project Table           | `screen/Admin/project_table.dart`                       | `app/(dashboard)/[userType]/projects/page.tsx`                      | `/:userType/projects`                     |
| Add/Edit Project        | `screen/add_project.dart`                               | `app/(dashboard)/[userType]/projects/add/page.tsx`                  | `/:userType/projects/add`                 |
| Project Dashboard       | `screen/project_dashboard.dart`                         | `app/(dashboard)/[userType]/projects/[uniqueId]/dashboard/page.tsx` | `/:userType/projects/:uniqueId/dashboard` |
| Project Drawer          | `screen/project_drawer.dart`                            | `components/layout/project-sidebar.tsx`                             | —                                         |
| Reporting Screen        | `screen/reporting_screen/reporting_screen.dart`         | `app/(dashboard)/[userType]/projects/[uniqueId]/report/page.tsx`    | `/:userType/projects/:uniqueId/report`    |
| Report Screen           | `screen/reporting_screen/report_screen.dart`            | `components/reports/report-view.tsx`                                | —                                         |
| Charts                  | `screen/reporting_screen/charts.dart`                   | `components/charts/`                                                | —                                         |
| Comparison              | `screen/reporting_screen/comparison.dart`               | `components/reports/comparison-view.tsx`                            | —                                         |
| Download Project        | `screen/download_project.dart`                          | `app/(dashboard)/[userType]/projects/[uniqueId]/export/page.tsx`    | `/:userType/projects/:uniqueId/export`    |
| Add Email to Project    | `screen/add_email_to_project.dart`                      | `app/(dashboard)/[userType]/projects/[uniqueId]/settings/page.tsx`  | `/:userType/projects/:uniqueId/settings`  |
| Profile                 | `screen/profile.dart`                                   | `app/(dashboard)/[userType]/profile/page.tsx`                       | `/:userType/profile`                      |
| User Selection          | `screen/user_selection.dart`                            | `components/forms/user-selection.tsx`                               | —                                         |
| Top Button Area         | `screen/top_button_area.dart`                           | `components/layout/project-actions.tsx`                             | —                                         |
| Calculation             | `screen/calculation.dart`                               | `lib/utils/calculations.ts`                                         | —                                         |
| Drawer Image            | `screen/drawer_image.dart`                              | `components/layout/drawer-image.tsx`                                | —                                         |

## Provider → Hook/Store Mapping

| Flutter Provider     | File                                      | Next.js Equivalent        | Type                       |
| -------------------- | ----------------------------------------- | ------------------------- | -------------------------- |
| `DashboardProvider`  | `provider.dart/dashboard_provider.dart`   | `hooks/useDashboard.ts`   | React Query hook           |
| `MqttProvider`       | `provider.dart/mqtt_provider.dart`        | `hooks/useMqtt.ts`        | Custom hook + context      |
| `SensorTypeProvider` | `provider.dart/sensor_type_provider.dart` | `hooks/useSensorTypes.ts` | React Query hook           |
| `AdminProvider`      | `provider.dart/admin_provider.dart`       | `hooks/useAdmins.ts`      | React Query hook           |
| `DeviceProvider`     | `provider.dart/device_provider.dart`      | `hooks/useDevices.ts`     | React Query hook           |
| `SensorProvider`     | `provider.dart/sensor_provider.dart`      | `hooks/useSensors.ts`     | React Query hook           |
| `ContractorProvider` | `provider.dart/contractor_provider.dart`  | `hooks/useContractors.ts` | React Query hook           |
| `AuthorityProvider`  | `provider.dart/authority_provider.dart`   | `hooks/useAuthorities.ts` | React Query hook           |
| `ProfileProvider`    | `provider.dart/profile_provider.dart`     | `hooks/useProfile.ts`     | React Query hook + context |
| `ProjectProvider`    | `provider.dart/project_provider.dart`     | `hooks/useProjects.ts`    | React Query hook           |

## Model → Type Mapping

| Flutter Model                 | File                                                           | TypeScript Type      |
| ----------------------------- | -------------------------------------------------------------- | -------------------- |
| `LoginResponse`               | `modal/res_model/login_response.dart`                          | `types/auth.ts`      |
| `OtpResponse`                 | `modal/res_model/otp_response.dart`                            | `types/auth.ts`      |
| `CommonResponseResponse`      | `modal/res_model/common_response.dart`                         | `types/api.ts`       |
| `UserListResponse`            | `modal/res_model/admin_list_response.dart`                     | `types/users.ts`     |
| `ProfileUpdateResponse`       | `modal/res_model/profile_response.dart`                        | `types/users.ts`     |
| `DeviceListResponse`          | `modal/res_model/device_list_response.dart`                    | `types/devices.ts`   |
| `DeviceTypeResponse`          | `modal/res_model/device_type_response.dart`                    | `types/devices.ts`   |
| `SensorTypeResponse`          | `modal/res_model/sensor_type.dart`                             | `types/sensors.ts`   |
| `SensorListResponse`          | `modal/res_model/senor_list_response.dart`                     | `types/sensors.ts`   |
| `ProjectListResponse`         | `modal/res_model/project_list_response.dart`                   | `types/projects.ts`  |
| `ProjectDetailResponse`       | `modal/res_model/project_detail.dart`                          | `types/projects.ts`  |
| `ProjectCreateResponse`       | `modal/res_model/project_creation_id_response.dart`            | `types/projects.ts`  |
| `ProjectEmailResponse`        | `modal/res_model/project_email_response.dart`                  | `types/projects.ts`  |
| `DashboardResponse`           | `modal/res_model/dashboard_response.dart`                      | `types/dashboard.ts` |
| `ReportDataResponse`          | `modal/res_model/report_response.dart`                         | `types/reports.ts`   |
| `ReportSensorDataResponse`    | `modal/res_model/report_sensor_data.dart`                      | `types/reports.ts`   |
| `SensorChannelResponse`       | `modal/res_model/get_sensor_channel_from_device_response.dart` | `types/channels.ts`  |
| `AssignSensorToDeviceRequest` | `modal/req_modal/req.dart`                                     | `types/channels.ts`  |
| `CreateProjectRequest`        | `modal/req_modal/create_project_request.dart`                  | `types/projects.ts`  |
| `UpdateProjectResponse`       | `modal/req_modal/create_project_response.dart`                 | `types/projects.ts`  |
| `DeviceAddRequest`            | `modal/req_modal/device_update_req.dart`                       | `types/devices.ts`   |
| `AddSensorRequest`            | `modal/req_modal/req.dart`                                     | `types/sensors.ts`   |
| `ChannelUpdateRequest`        | `modal/req_modal/channel_update_request.dart`                  | `types/channels.ts`  |
| `SignUpRequest`               | `modal/req_modal/sign_up_req.dart`                             | `types/auth.ts`      |
| `ProfileUpdateRequest`        | `modal/req_modal/profile_update_req.dart`                      | `types/users.ts`     |
| `ChangeOtpRequest`            | `modal/req_modal/change_password.dart`                         | `types/auth.ts`      |
| `ProjectEmailRequest`         | `modal/req_modal/project_email_req.dart`                       | `types/projects.ts`  |
| `GenerateProjectIdReq`        | `modal/req_modal/project_id_creation_req.dart`                 | `types/projects.ts`  |

## Widget → Component Mapping

| Flutter Widget     | File                              | Next.js Component                       |
| ------------------ | --------------------------------- | --------------------------------------- |
| CustomScaffold     | `widget/custom_scaffold.dart`     | `components/layout/app-layout.tsx`      |
| CustomAppBar       | `widget/custom_app_bar.dart`      | `components/layout/header.tsx`          |
| LoadingOverlay     | `widget/loading_overlay.dart`     | `components/ui/loading-overlay.tsx`     |
| AlertPopUpFunction | `widget/alert_response.dart`      | `components/ui/alert-dialog.tsx`        |
| AlertWidget        | `widget/alert_widget.dart`        | `components/ui/alert.tsx`               |
| CustomText         | `widget/custom_text.dart`         | `components/ui/typography.tsx`          |
| TextFieldCustom    | `widget/text_field_custom.dart`   | `components/ui/input.tsx`               |
| GraphWidget        | `widget/graph.dart`               | `components/charts/line-chart.tsx`      |
| GraphView          | `widget/graph_view.dart`          | `components/charts/chart-container.tsx` |
| TopSearchAreas     | `widget/top_search_areas.dart`    | `components/ui/search-bar.tsx`          |
| WebPagination      | `widget/web_pagination.dart`      | `components/ui/pagination.tsx`          |
| FilterWidget       | `widget/filter.dart`              | `components/ui/filter-panel.tsx`        |
| ShimmerEffect      | `widget/shimmer_effect.dart`      | `components/ui/skeleton.tsx`            |
| DownloadPdf        | `widget/download_pdf.dart`        | `components/ui/download-button.tsx`     |
| CustomCsv          | `widget/custom_csv.dart`          | `lib/api/csv.ts`                        |
| CompanyLogo        | `widget/company_logo.dart`        | `components/layout/logo.tsx`            |
| AddButton          | `widget/add_button.dart`          | `components/ui/button.tsx`              |
| ScrollRowBox       | `widget/scroll_row_box.dart`      | `components/ui/scroll-container.tsx`    |
| PopUpMenuButton    | `widget/pop_up_menu_button.dart`  | `components/ui/dropdown-menu.tsx`       |
| ExistDrawerButton  | `widget/exist_drawer_button.dart` | `components/ui/sidebar-item.tsx`        |
| NavigateRoute      | `widget/navigate_route.dart`      | Next.js `useRouter()`                   |
| AdaptiveIndicator  | `widget/adaptive_indicator.dart`  | `components/ui/spinner.tsx`             |
| DatePicker         | `widget/date_format.dart`         | `components/ui/date-picker.tsx`         |
| SavedPreferences   | `widget/saved_preferences.dart`   | `lib/utils/storage.ts`                  |
| CustomSlideMenu    | `widget/custom_slide_menu.dart`   | `components/ui/sheet.tsx`               |
| UrlToUint8         | `widget/url_to_uint8.dart`        | `lib/utils/image.ts`                    |
| CameraFunction     | `widget/camera_function.dart`     | `components/ui/file-upload.tsx`         |
| Debugging          | `widget/debugging.dart`           | `lib/utils/logger.ts`                   |

## Enum → Constant/Type Mapping

| Flutter Enum          | File                               | TypeScript                                       |
| --------------------- | ---------------------------------- | ------------------------------------------------ | ------- | ------------ | ------------ |
| `UserTypeEnum`        | `enum/user_type_enum.dart`         | `types/enums.ts` → `type UserType = 'superadmin' | 'admin' | 'contractor' | 'authority'` |
| `LoginStatusEnum`     | `enum/login_enum.dart`             | `types/enums.ts`                                 |
| `PasswordEnum`        | `enum/pass_enum.dart`              | `types/enums.ts`                                 |
| `ProfileEnum`         | `enum/profile_enum.dart`           | `types/enums.ts`                                 |
| `ProjectStatusEnum`   | `enum/project_enum.dart`           | `types/enums.ts`                                 |
| `DeviceStatusEnum`    | `enum/device_enum.dart`            | `types/enums.ts`                                 |
| `SensorTypeEnum`      | `enum/sensor_enum.dart`            | `types/enums.ts`                                 |
| `ContractorEnum`      | `enum/contractor_enum.dart`        | `types/enums.ts`                                 |
| `FrequencyEnum`       | `enum/frequency_enum.dart`         | `types/enums.ts`                                 |
| `GraphIntervalEnum`   | `enum/graph_interval_enum.dart`    | `types/enums.ts`                                 |
| `FilterTypeEnum`      | `enum/project_enum.dart`           | `types/enums.ts`                                 |
| `ChannelPopupAction`  | `enum/channel_fun_popup.dart`      | `types/enums.ts`                                 |
| `ActionEnum`          | `enum/action.dart`                 | `types/enums.ts`                                 |
| `StatusEnum`          | `enum/status_enum.dart`            | `types/enums.ts`                                 |
| `SuperAdminSlideEnum` | `enum/super_admin_slide_enum.dart` | `types/enums.ts`                                 |

## Routing Mapping

| Flutter Route (GoRouter) | Path                                       | Next.js Route                                     |
| ------------------------ | ------------------------------------------ | ------------------------------------------------- |
| `initialPath`            | `/`                                        | Middleware → redirect to `/:userType` or `/login` |
| `login`                  | `/login`                                   | `/login`                                          |
| `dashboard`              | `/:userType/dashboard`                     | `/:userType`                                      |
| `adminTable`             | `/:userType/admin_table`                   | `/:userType/users/admin`                          |
| `contractorTable`        | `/:userType/contractor_table`              | `/:userType/users/contractor`                     |
| `authorityTable`         | `/:userType/authority_table`               | `/:userType/users/authority`                      |
| `addUser`                | `/admin/add/:slideEnum`                    | `/:userType/users/add`                            |
| `deviceTable`            | `/:userType/device_table`                  | `/:userType/devices`                              |
| `sensorTable`            | `/:userType/sensor_table`                  | `/:userType/sensors`                              |
| `projectTable`           | `/:userType/project_table`                 | `/:userType/projects`                             |
| `changePassword`         | `/:userType/:passwordEnum`                 | `/forgot-password`                                |
| `projectDashboard`       | `/:userType/project_dashboard/:uniqueId`   | `/:userType/projects/:uniqueId/dashboard`         |
| `reportScreen`           | `/:userType/report_screen/:uniqueId`       | `/:userType/projects/:uniqueId/report`            |
| `projectDownload`        | `/project_download/:projectName/:uniqueId` | `/:userType/projects/:uniqueId/export`            |
| `deviceChannelView`      | `/device_channel_view`                     | `/:userType/devices/:deviceId/channels`           |
| `addProject`             | `/admin_add_project`                       | `/:userType/projects/add`                         |
| `profile`                | `/:userType/profile`                       | `/:userType/profile`                              |
| `verifyPage`             | `/verify/:email/:userId`                   | `/verify-otp`                                     |

## MQTT Configuration

| Setting         | Current Value                | Target                         |
| --------------- | ---------------------------- | ------------------------------ |
| Broker URL      | `ws://your-mqtt-broker:9001` | Same (or configurable via env) |
| Client ID       | Random 6-char                | Random UUID                    |
| Username        | `shm`                        | Same (via env)                 |
| Password        | `your-mqtt-password`         | Same (via env)                 |
| Subscribe Topic | `devices/#`                  | Same                           |
| Publish Topic   | `sensors/<sensorId>`         | Same                           |
| Keep Alive      | 30s                          | Same                           |
| QoS             | At least once                | Same                           |
| Auto Reconnect  | Yes                          | Yes                            |
