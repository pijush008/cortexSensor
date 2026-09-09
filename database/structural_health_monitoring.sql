-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Sep 04, 2026 at 11:17 AM
-- Server version: 8.0.45
-- PHP Version: 8.2.4

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `structualHealthMonitoring`
--

-- --------------------------------------------------------

--
-- Table structure for table `devices`
--

CREATE TABLE `devices` (
  `id` int NOT NULL,
  `deviceName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `deviceType` int NOT NULL,
  `channelCount` int NOT NULL,
  `deviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gatewayDeviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `addedBy` int NOT NULL DEFAULT '0',
  `deviceStatus` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'inactive',
  `deviceStartDate` datetime NOT NULL,
  `assignedAdmin` int DEFAULT NULL,
  `assignSensor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `status` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1',
  `updatedBy` int DEFAULT NULL,
  `updatedAt` datetime DEFAULT NULL,
  `IsDelete` enum('true','false') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'false',
  `updateHeartBeat` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `isOngoing` tinyint NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `devices`
--

INSERT INTO `devices` (`id`, `deviceName`, `deviceType`, `channelCount`, `deviceId`, `gatewayDeviceId`, `addedBy`, `deviceStatus`, `deviceStartDate`, `assignedAdmin`, `assignSensor`, `createdAt`, `status`, `updatedBy`, `updatedAt`, `IsDelete`, `updateHeartBeat`, `isOngoing`) VALUES
(33, 'Ackcio FB8D', 1, 4, 'fb8d', 'BA92', 0, 'inactive', '2024-07-15 14:51:06', 12, '[28,29]', '2024-07-15 14:51:06', '1', 12, '2026-04-29 12:58:20', 'false', '2026-09-04 08:03:49', 0),
(40, 'Device Test', 1, 4, '124', '321', 0, 'inactive', '2026-09-04 13:13:34', 12, NULL, '2026-09-04 13:13:34', '1', NULL, NULL, 'false', '2026-09-04 07:50:00', 0);

-- --------------------------------------------------------

--
-- Table structure for table `device_channel`
--

CREATE TABLE `device_channel` (
  `id` int NOT NULL,
  `deviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `channelNumber` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `channelName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `triggerValue` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `thresholdValue` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `assignSensor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `activeStatus` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `device_channel`
--

INSERT INTO `device_channel` (`id`, `deviceId`, `channelNumber`, `channelName`, `triggerValue`, `thresholdValue`, `assignSensor`, `activeStatus`) VALUES
(145, '33', 'CH 1', 'Channel 1', '45', '80', '28', '1'),
(146, '33', 'CH 2', 'Channel 2', '25', '96', '29', '1'),
(147, '33', 'CH 3', 'Channel 3', '99', '9', NULL, '0'),
(148, '33', 'CH 4', 'Channel 4', '0', '0', NULL, '0'),
(165, '40', 'CH 1', 'Channel 1', NULL, NULL, NULL, '0'),
(166, '40', 'CH 2', 'Channel 2', NULL, NULL, NULL, '0'),
(167, '40', 'CH 3', 'Channel 3', NULL, NULL, NULL, '0'),
(168, '40', 'CH 4', 'Channel 4', NULL, NULL, NULL, '0');

-- --------------------------------------------------------

--
-- Table structure for table `device_type`
--

CREATE TABLE `device_type` (
  `id` int NOT NULL,
  `deviceType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `deviceImage` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `device_type`
--

INSERT INTO `device_type` (`id`, `deviceType`, `deviceImage`, `status`, `createdAt`) VALUES
(1, 'Ackcio', NULL, '1', '2024-01-23 14:13:53'),
(2, 'Device type 2', NULL, '1', '2024-01-23 14:13:53'),
(3, 'Device type 3', NULL, '1', '2024-01-23 14:13:53');

-- --------------------------------------------------------

--
-- Table structure for table `email`
--

CREATE TABLE `email` (
  `id` int NOT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `isEnable` tinyint NOT NULL DEFAULT '1',
  `projectId` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `email`
--

INSERT INTO `email` (`id`, `email`, `isEnable`, `projectId`) VALUES
(3, 'mdnadeem3191@gmail.com', 1, 37),
(7, 'nadeemarctano@gmail.com', 1, 37),
(8, 'rohan@arctano.com ', 1, 53),
(9, 'sales@arctano.com', 1, 53),
(10, 'pulkit@arctano.com', 1, 53),
(11, 'rohan@arctano.com ', 1, 62),
(12, 'sales@arctano.com', 1, 62),
(13, 'pulkit@arctano.com', 1, 62),
(14, 'rohan@arctano.com ', 1, 97),
(15, 'sales@arctano.com', 1, 97),
(16, 'pulkit@arctano.com', 1, 97),
(17, 'rohan@arctano.com ', 1, 99),
(18, 'sales@arctano.com', 1, 99),
(19, 'pulkit@arctano.com', 1, 99);

-- --------------------------------------------------------

--
-- Table structure for table `firebasetoken`
--

CREATE TABLE `firebasetoken` (
  `id` int NOT NULL,
  `userId` int NOT NULL,
  `token` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `firebasetoken`
--

INSERT INTO `firebasetoken` (`id`, `userId`, `token`, `status`, `createdAt`) VALUES
(1, 1, 'fdfd', '1', '2023-12-20 13:01:34'),
(2, 1, 'fdfdds', '1', '2023-12-20 13:16:38'),
(3, 11, 'fdfdds', '1', '2023-12-22 13:43:30'),
(4, 1, '', '1', '2024-01-06 12:37:40'),
(5, 11, '', '1', '2024-01-06 12:37:40'),
(6, 15, '', '1', '2024-01-06 12:37:40'),
(7, 15, 'fdfdds', '1', '2024-01-06 12:37:40'),
(8, 16, '', '1', '2024-01-24 16:26:29'),
(9, 22, '', '1', '2024-01-24 16:26:29'),
(10, 24, '', '1', '2024-01-24 16:26:29'),
(11, 13, '', '1', '2024-02-21 13:45:39'),
(12, 26, '', '1', '2024-02-21 13:45:39'),
(13, 12, '', '1', '2024-03-03 16:38:23'),
(14, 12, 'fdfdds', '1', '2024-08-05 17:09:06'),
(15, 1, 'w', '1', '2024-08-06 15:00:04');

-- --------------------------------------------------------

--
-- Table structure for table `nodeData`
--

CREATE TABLE `nodeData` (
  `id` int NOT NULL,
  `Battery` int DEFAULT NULL,
  `Temperature` float DEFAULT NULL,
  `Humidity` float DEFAULT NULL,
  `Pressure` float DEFAULT NULL,
  `GatewayDeviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `DeviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `DeviceName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ProjectName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `DeviceType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `CreatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deviceUpdatedAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `nodeData`
--

INSERT INTO `nodeData` (`id`, `Battery`, `Temperature`, `Humidity`, `Pressure`, `GatewayDeviceId`, `DeviceId`, `DeviceName`, `ProjectName`, `DeviceType`, `CreatedAt`, `deviceUpdatedAt`) VALUES
(41, 3383, 29.38, 0, 97232.8, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-07 13:20:03', '2024-06-07 13:00:00'),
(42, 3347, 29.64, 0, 97262.9, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-07 14:08:04', '2024-06-07 14:07:57'),
(43, 3364, 29.68, 0, 97293, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-07 14:31:04', '2024-06-07 14:30:02'),
(44, 3324, 30.51, 0, 97347.7, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-07 15:23:01', '2024-06-07 15:21:06'),
(45, 3452, 29.59, 0, 97517.9, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-08 06:32:03', '2024-06-08 06:31:50'),
(46, 3432, 29.4, 0, 97279.8, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-08 11:45:03', '2024-06-08 10:00:00'),
(47, 3431, 29.6, 0, 97214.2, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-08 11:45:03', '2024-06-08 11:00:00'),
(48, 3434, 29.64, 0, 97204.6, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-08 12:34:00', '2024-06-08 12:00:00'),
(49, 3432, 29.15, 0, 97081.4, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-12 13:36:01', '2024-06-12 13:33:27'),
(50, 3433, 28.61, 0, 97084.2, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-12 13:44:03', '2024-06-12 13:41:22'),
(51, 3436, 26.34, 0, 97099.2, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-12 14:11:04', '2024-06-12 14:00:00'),
(52, 3467, 27.27, 0, 97380.8, 'BA92', 'fb8d', 'arctano_1', 'Project_K', 'BEAM-AN-S4', '2024-06-13 05:04:01', '2024-06-13 05:01:44'),
(53, 3543, 23.43, 0, 98629, 'BA92', 'fb8d', 'arctano_1', 'arctano', 'BEAM-AN-S4', '2024-06-14 10:36:59', '2024-03-18 08:00:00'),
(54, 3560, 25.9, 0, 96867.5, 'BA92', 'fb8d', 'arctano_1', 'Project K', 'BEAM-AN-S4', '2024-07-27 13:00:03', '2024-07-27 12:00:00'),
(55, 3545, 26.64, 0, 96928.4, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-27 13:15:03', '2024-07-27 13:13:42'),
(56, 3546, 26.61, 0, 96925, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-27 13:19:04', '2024-07-27 13:18:39'),
(57, 3547, 25.99, 0, 96978.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-27 14:30:03', '2024-07-27 14:00:00'),
(58, 3556, 26.08, 0, 97020.6, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 07:42:04', '2024-07-29 07:41:48'),
(59, 3544, 26.11, 0, 97011.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 08:00:01', '2024-07-29 07:50:19'),
(60, 3555, 26.08, 0, 97004.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 08:00:01', '2024-07-29 07:56:07'),
(61, 3551, 26.03, 0, 96997, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 08:45:03', '2024-07-29 08:00:00'),
(62, 3548, 26.36, 0, 96956.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 09:45:00', '2024-07-29 09:00:00'),
(63, 3539, 25.93, 0, 96838.3, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 10:45:21', '2024-07-29 10:29:34'),
(64, 3537, 25.28, 0, 96830.3, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 10:47:02', '2024-07-29 10:45:09'),
(65, 3534, 25.63, 0, 96809.8, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 11:15:03', '2024-07-29 11:09:24'),
(66, 3531, 26.05, 0, 96864.1, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-07-29 12:22:01', '2024-07-29 12:20:26'),
(67, 3543, 23.43, 0, 98629, 'BA92', 'fb8d', 'arctano_1', 'arctano', 'BEAM-AN-S4', '2024-07-31 10:59:41', '2024-03-18 13:30:00'),
(68, 3585, 26.91, 0, 97716.6, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 07:31:03', '2024-08-20 07:28:53'),
(69, 3581, 26.12, 0, 97686.9, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 08:27:02', '2024-08-20 08:00:00'),
(70, 3584, 26.3, 0, 97583.6, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 09:45:01', '2024-08-20 09:00:00'),
(71, 3578, 25.72, 0, 97588.3, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 10:48:04', '2024-08-20 10:00:00'),
(72, 3570, 25.74, 0, 97481.8, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 11:16:01', '2024-08-20 11:00:00'),
(73, 3563, 25.39, 0, 97570.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 12:42:01', '2024-08-20 12:00:00'),
(74, 3557, 24.89, 0, 97583.2, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 13:06:04', '2024-08-20 13:00:00'),
(75, 3552, 24.93, 0, 97656.5, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 14:39:04', '2024-08-20 14:00:00'),
(76, 3542, 25.27, 0, 97695.2, 'BA92', 'fb8d', 'fb8d', 'Project M', 'BEAM-AN-S4', '2024-08-20 15:07:05', '2024-08-20 15:05:44');

-- --------------------------------------------------------

--
-- Table structure for table `notification`
--

CREATE TABLE `notification` (
  `id` int NOT NULL,
  `sensor_data_id` int NOT NULL,
  `min` char(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `max` char(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notification`
--

INSERT INTO `notification` (`id`, `sensor_data_id`, `min`, `max`, `createdAt`) VALUES
(79, 559, '99', NULL, '2024-08-01 13:47:47'),
(80, 560, '54', NULL, '2024-08-01 13:47:47'),
(81, 581, '99', NULL, '2024-07-30 13:14:28'),
(82, 582, '99', NULL, '2024-08-06 08:43:18'),
(83, 584, '54', NULL, '2024-08-06 08:43:18'),
(84, 848, '25', NULL, '2024-08-20 07:30:00'),
(85, 850, '45', NULL, '2024-08-20 07:35:00'),
(86, 1011, '25', NULL, '2024-08-06 08:43:18'),
(87, 1012, '25', NULL, '2024-08-06 08:43:18'),
(88, 1013, '25', NULL, '2024-08-06 08:43:18'),
(89, 1014, '25', NULL, '2024-08-06 08:43:18'),
(90, 1015, '25', NULL, '2024-08-06 08:43:18');

-- --------------------------------------------------------

--
-- Table structure for table `project`
--

CREATE TABLE `project` (
  `id` int NOT NULL,
  `projectName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `projectUniqueID` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `uniqueId` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `projectLocation` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `startDate` date NOT NULL,
  `actualStartDate` date DEFAULT NULL,
  `projectLogo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `endDate` date DEFAULT NULL,
  `contractorId` int DEFAULT NULL,
  `authorityId` int DEFAULT NULL,
  `deviceId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sensorId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `dashImage` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dashImage2` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('not_start','start','pause','end') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'not_start',
  `offset` int NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int NOT NULL,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedBy` int DEFAULT NULL,
  `projectDevice` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `csvData` int DEFAULT '0',
  `isDelete` int DEFAULT '0',
  `isRegistered` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dumping data for table `project`
--

INSERT INTO `project` (`id`, `projectName`, `projectUniqueID`, `uniqueId`, `projectLocation`, `startDate`, `actualStartDate`, `projectLogo`, `endDate`, `contractorId`, `authorityId`, `deviceId`, `sensorId`, `dashImage`, `dashImage2`, `status`, `offset`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `projectDevice`, `csvData`, `isDelete`, `isRegistered`) VALUES
(97, 'Project K', 'CGSL/12/15/16/20Aug/FY23-24/0012', 'ABC123XYZ1', 'Delhi', '2024-08-11', '2024-08-12', NULL, '2024-08-31', 15, 16, NULL, '[28,29]', 'uploads/projectImage/97_image1.jpg', 'uploads/projectImage/97_image2.jpg', 'end', 0, '2024-08-20 07:15:34', 12, '2024-08-20 07:15:34', NULL, '{\"deviceDetails\":{\"deviceName\":\"Ackcio FB8D\",\"deviceType\":1,\"channelCount\":4,\"deviceId\":\"33\",\"gatewayDeviceId\":\"BA92\",\"deviceStatus\":\"inactive\",\"deviceStartDate\":\"2024-07-15T14:51:06.000Z\",\"deviceAssignSensor\":\"[28,29]\",\"deviceCreatedAt\":\"2024-07-15T14:51:06.000Z\",\"updateHeartBeat\":\"2024-08-20T10:00:00.000Z\"},\"deviceChannels\":[{\"channelId\":145,\"channelNumber\":\"CH 1\",\"channelName\":\"Channel 1\",\"triggerValue\":\"99\",\"thresholdValue\":\"9\",\"activeStatus\":\"0\",\"assignSensor\":null,\"sensorName\":null,\"sensorCalibrationValue\":null,\"sensorTypeName\":null,\"sensorIcon\":null,\"unit\":null,\"sensorTypeCalibrationValue\":null},{\"channelId\":146,\"channelNumber\":\"CH 2\",\"channelName\":\"Channel 2\",\"triggerValue\":\"45\",\"thresholdValue\":\"85\",\"activeStatus\":\"1\",\"assignSensor\":28,\"sensorName\":\"Load Cell\",\"sensorCalibrationValue\":\"1\",\"sensorTypeName\":\"Load Cell\",\"sensorIcon\":\"http://3.111.108.94:3000/api/uploads/sensors/5.png\",\"unit\":\"uS\",\"sensorTypeCalibrationValue\":\"1\"},{\"channelId\":147,\"channelNumber\":\"CH 3\",\"channelName\":\"Channel 3\",\"triggerValue\":\"25\",\"thresholdValue\":\"96\",\"activeStatus\":\"1\",\"assignSensor\":29,\"sensorName\":\"LVDT\",\"sensorCalibrationValue\":\"0.05\",\"sensorTypeName\":\"LVDT\",\"sensorIcon\":\"http://3.111.108.94:3000/api/uploads/sensors/2.png\",\"unit\":\"mm\",\"sensorTypeCalibrationValue\":\"1\"},{\"channelId\":148,\"channelNumber\":\"CH 4\",\"channelName\":\"Channel 4\",\"triggerValue\":\"0\",\"thresholdValue\":\"0\",\"activeStatus\":\"0\",\"assignSensor\":null,\"sensorName\":null,\"sensorCalibrationValue\":null,\"sensorTypeName\":null,\"sensorIcon\":null,\"unit\":null,\"sensorTypeCalibrationValue\":null}]}', 0, 0, 1),
(99, 'Project C', 'CGSL/12/15/16/20Aug/FY23-24/0012', 'DEF456UVW2', 'Delhi', '2024-08-06', '2024-08-07', NULL, '2024-08-31', 15, 16, NULL, '[28,29]', 'uploads/projectImage/99_image1.jpg', 'uploads/projectImage/99_image2.jpg', 'start', 0, '2024-08-20 10:44:40', 12, '2024-08-20 10:44:40', NULL, '{\"machineDeviceId\":\"fb8d\",\"deviceDetails\":{\"deviceName\":\"Ackcio FB8D\",\"deviceType\":1,\"channelCount\":4,\"deviceId\":\"33\",\"gatewayDeviceId\":\"BA92\",\"deviceStatus\":\"inactive\",\"deviceStartDate\":\"2024-07-15T09:21:06.000Z\",\"deviceAssignSensor\":\"[28,29]\",\"deviceCreatedAt\":\"2024-07-15T09:21:06.000Z\",\"updateHeartBeat\":\"2026-04-29T07:28:20.000Z\"},\"deviceChannels\":[{\"channelId\":145,\"channelNumber\":\"CH 1\",\"channelName\":\"Channel 1\",\"triggerValue\":\"45\",\"thresholdValue\":\"85\",\"activeStatus\":\"1\",\"assignSensor\":28,\"sensorName\":\"Load Cell\",\"sensorCalibrationValue\":\"1\",\"sensorTypeName\":\"Load Cell\",\"sensorIcon\":\"http://192.168.1.24:3000/api/uploads/sensors/5.png\",\"unit\":\"uS\",\"sensorTypeCalibrationValue\":\"1\"},{\"channelId\":146,\"channelNumber\":\"CH 2\",\"channelName\":\"Channel 2\",\"triggerValue\":\"25\",\"thresholdValue\":\"96\",\"activeStatus\":\"1\",\"assignSensor\":29,\"sensorName\":\"LVDT\",\"sensorCalibrationValue\":\"0.055\",\"sensorTypeName\":\"LVDT\",\"sensorIcon\":\"http://192.168.1.24:3000/api/uploads/sensors/2.png\",\"unit\":\"mm\",\"sensorTypeCalibrationValue\":\"1\"},{\"channelId\":147,\"channelNumber\":\"CH 3\",\"channelName\":\"Channel 3\",\"triggerValue\":\"99\",\"thresholdValue\":\"9\",\"activeStatus\":\"0\",\"assignSensor\":null,\"sensorName\":null,\"sensorCalibrationValue\":null,\"sensorTypeName\":null,\"sensorIcon\":null,\"unit\":null,\"sensorTypeCalibrationValue\":null},{\"channelId\":148,\"channelNumber\":\"CH 4\",\"channelName\":\"Channel 4\",\"triggerValue\":\"0\",\"thresholdValue\":\"0\",\"activeStatus\":\"0\",\"assignSensor\":null,\"sensorName\":null,\"sensorCalibrationValue\":null,\"sensorTypeName\":null,\"sensorIcon\":null,\"unit\":null,\"sensorTypeCalibrationValue\":null}]}', 0, 0, 1);

-- --------------------------------------------------------

--
-- Table structure for table `sensor`
--

CREATE TABLE `sensor` (
  `id` int NOT NULL,
  `sensorName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sensorTypeID` int NOT NULL,
  `assignedAdmin` int DEFAULT NULL,
  `calibrationValue` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `unit` char(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT '1',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sensor`
--

INSERT INTO `sensor` (`id`, `sensorName`, `sensorTypeID`, `assignedAdmin`, `calibrationValue`, `unit`, `status`, `createdAt`) VALUES
(28, 'Load Cell', 5, 12, '1', 'kN', '1', '2026-04-29 12:49:56'),
(29, 'LVDT', 2, 12, '0.055', 'mm', '1', '2026-04-29 12:49:56'),
(32, 'TESt', 1, 12, '1', 'C', '1', '2026-09-04 13:22:11'),
(33, 'A', 1, 12, '1', 'F', '1', '2026-09-04 13:26:22');

-- --------------------------------------------------------

--
-- Table structure for table `sensor_data`
--

CREATE TABLE `sensor_data` (
  `id` int NOT NULL,
  `projectId` int DEFAULT NULL,
  `device_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sensor_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sensor_data` float NOT NULL,
  `createdAt` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sensor_data`
--

INSERT INTO `sensor_data` (`id`, `projectId`, `device_id`, `sensor_id`, `sensor_data`, `createdAt`) VALUES
(63, NULL, 'fb8d', '29', 425, '2024-07-26 08:59:05'),
(69, NULL, 'fb8d', '29', 632.6, '2024-07-26 13:30:01'),
(70, NULL, 'fb8d', '28', 0.01, '2024-07-26 19:30:01'),
(71, NULL, 'fb8d', '29', 632.1, '2024-07-27 15:45:02'),
(72, NULL, 'fb8d', '28', 0.004, '2024-07-26 20:35:17'),
(73, NULL, 'fb8d', '29', 627.9, '2024-07-27 21:00:03'),
(74, NULL, 'fb8d', '28', 0.0045, '2024-07-27 18:00:03'),
(75, NULL, 'fb8d', '29', 622.6, '2024-07-28 04:30:01'),
(76, NULL, 'fb8d', '29', 522.6, '2024-07-28 15:13:35'),
(77, NULL, 'fb8d', '29', 465, '2024-07-28 17:30:01'),
(78, NULL, 'fb8d', '29', 565, '2024-07-28 22:30:01'),
(79, NULL, 'fb8d', '29', 587, '2024-07-29 03:30:01'),
(80, NULL, 'fb8d', '29', 620, '2024-07-29 11:14:20'),
(81, NULL, 'fb8d', '29', 668, '2024-07-29 16:30:01'),
(82, NULL, 'fb8d', '29', 723, '2024-07-29 17:30:01'),
(90, NULL, 'fb8d', '29', 778, '2024-07-29 18:26:01'),
(91, NULL, 'fb8d', '29', 627.6, '2024-07-29 13:11:11'),
(92, NULL, 'fb8d', '28', 0.0053, '2024-07-27 20:30:00'),
(93, NULL, 'fb8d', '28', 0.056, '2024-07-28 15:00:03'),
(94, NULL, 'fb8d', '28', 0.06, '2024-07-28 22:00:03'),
(95, NULL, 'fb8d', '28', 0.08, '2024-07-29 05:00:03'),
(96, NULL, 'fb8d', '28', 0.07, '2024-07-29 15:00:03'),
(97, NULL, 'fb8d', '28', 0.05, '2024-07-29 18:00:03'),
(98, NULL, 'fb8d', '28', 0.042, '2024-07-29 19:00:03'),
(99, NULL, 'fb8d', '29', 0.6, '2024-07-29 13:45:01'),
(100, NULL, 'fb8d', '28', 0.004, '2024-07-29 13:45:01'),
(101, NULL, 'fb8d', '29', 566.9, '2024-07-29 14:00:02'),
(102, NULL, 'fb8d', '28', 0.056, '2024-07-29 14:00:02'),
(103, NULL, 'fb8d', '29', 564, '2024-07-29 14:15:03'),
(104, NULL, 'fb8d', '28', 0.028, '2024-07-29 14:15:03'),
(105, NULL, 'fb8d', '29', 563.8, '2024-07-29 14:30:03'),
(106, NULL, 'fb8d', '28', 0.028, '2024-07-29 14:30:03'),
(107, NULL, 'fb8d', '29', 563.8, '2024-07-29 14:45:04'),
(108, NULL, 'fb8d', '28', 0.028, '2024-07-29 14:45:04'),
(109, NULL, 'fb8d', '29', 0.5, '2024-07-29 14:57:27'),
(110, NULL, 'fb8d', '28', 0.015, '2024-07-29 14:57:27'),
(111, NULL, 'fb8d', '29', 563.8, '2024-07-29 15:00:04'),
(112, NULL, 'fb8d', '28', 0.029, '2024-07-29 15:00:04'),
(113, NULL, 'fb8d', '29', 560.7, '2024-07-29 15:15:00'),
(114, NULL, 'fb8d', '28', 0.028, '2024-07-29 15:15:00'),
(115, NULL, 'fb8d', '29', 560.6, '2024-07-29 15:30:01'),
(116, NULL, 'fb8d', '28', 0.028, '2024-07-29 15:30:01'),
(117, NULL, 'fb8d', '29', 0.6, '2024-07-29 15:45:01'),
(118, NULL, 'fb8d', '28', 0.027, '2024-07-29 15:45:01'),
(119, NULL, 'fb8d', '29', 0.6, '2024-07-29 16:00:02'),
(120, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:00:02'),
(121, NULL, 'fb8d', '29', 0.6, '2024-07-29 16:15:17'),
(122, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:15:17'),
(123, NULL, 'fb8d', '29', 267, '2024-07-29 16:30:03'),
(124, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:30:03'),
(125, NULL, 'fb8d', '29', 190.9, '2024-07-29 16:45:03'),
(126, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:45:03'),
(127, NULL, 'fb8d', '29', 248.1, '2024-07-29 16:49:04'),
(128, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:49:04'),
(129, NULL, 'fb8d', '29', 247.6, '2024-07-29 16:52:04'),
(130, NULL, 'fb8d', '28', 0.025, '2024-07-29 16:52:04'),
(131, NULL, 'fb8d', '29', 0.6, '2024-07-29 16:57:04'),
(132, NULL, 'fb8d', '28', 0.026, '2024-07-29 16:57:04'),
(133, NULL, 'fb8d', '29', 0.6, '2024-07-29 17:02:00'),
(134, NULL, 'fb8d', '28', 0.026, '2024-07-29 17:02:00'),
(135, NULL, 'fb8d', '29', 0.6, '2024-07-29 17:09:00'),
(136, NULL, 'fb8d', '28', 0.026, '2024-07-29 17:09:00'),
(137, NULL, 'fb8d', '29', 0.6, '2024-07-29 17:13:00'),
(138, NULL, 'fb8d', '28', 0.026, '2024-07-29 17:13:00'),
(139, NULL, 'fb8d', '29', 0.6, '2024-07-29 17:19:01'),
(140, NULL, 'fb8d', '28', 0.025, '2024-07-29 17:19:01'),
(141, NULL, 'fb8d', '29', 998.5, '2024-07-29 17:22:03'),
(142, NULL, 'fb8d', '28', 0.025, '2024-07-29 17:22:03'),
(143, NULL, 'fb8d', '29', 0.003, '2024-07-29 17:28:06'),
(144, NULL, 'fb8d', '28', 0.026, '2024-07-29 17:28:07'),
(145, NULL, 'fb8d', '29', 4.9925, '2024-07-29 17:34:03'),
(146, NULL, 'fb8d', '28', 0.025, '2024-07-29 17:34:03'),
(147, NULL, 'fb8d', '29', 23.78, '2024-07-29 17:37:05'),
(148, NULL, 'fb8d', '28', 0.017, '2024-07-29 17:37:05'),
(149, NULL, 'fb8d', '29', 49.925, '2024-07-29 17:43:00'),
(150, NULL, 'fb8d', '28', 0.048, '2024-07-29 17:43:00'),
(151, NULL, 'fb8d', '29', 0.03, '2024-07-29 17:47:00'),
(152, NULL, 'fb8d', '28', 0.023, '2024-07-29 17:47:00'),
(153, NULL, 'fb8d', '29', 0.03, '2024-07-29 17:58:01'),
(154, NULL, 'fb8d', '28', 0.026, '2024-07-29 17:58:01'),
(155, NULL, 'fb8d', '29', 0.03, '2024-07-29 18:04:01'),
(156, NULL, 'fb8d', '28', 0.026, '2024-07-29 18:04:01'),
(157, NULL, 'fb8d', '29', 0.03, '2024-07-29 18:07:01'),
(158, NULL, 'fb8d', '28', 0.026, '2024-07-29 18:07:01'),
(159, NULL, 'fb8d', '29', 0.03, '2024-07-29 18:15:02'),
(160, NULL, 'fb8d', '28', 0.026, '2024-07-29 18:15:02'),
(161, NULL, 'fb8d', '29', 0.025, '2024-07-29 19:36:58'),
(162, NULL, 'fb8d', '28', 0.015, '2024-07-29 19:36:58'),
(163, NULL, 'fb8d', '29', 0.025, '2024-06-13 14:20:00'),
(164, NULL, 'fb8d', '28', 0.015, '2024-06-13 14:20:00'),
(165, NULL, 'fb8d', '29', 0.025, '2024-06-13 14:20:00'),
(166, NULL, 'fb8d', '28', 0.015, '2024-06-13 14:20:00'),
(167, NULL, 'fb8d', '29', 0.025, '2024-06-13 14:20:00'),
(168, NULL, 'fb8d', '28', 0.015, '2024-06-13 14:20:00'),
(169, NULL, 'fb8d', '29', 0.025, '2024-07-29 19:49:12'),
(170, NULL, 'fb8d', '28', 0.015, '2024-07-29 19:49:12'),
(171, NULL, 'fb8d', '29', 0.025, '2024-06-13 14:20:00'),
(172, NULL, 'fb8d', '28', 0.015, '2024-06-13 14:20:00'),
(173, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(174, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(175, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(176, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(177, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(178, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(179, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(180, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(181, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(182, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(183, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(184, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(185, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(186, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(187, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(188, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(189, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(190, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(191, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(192, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(193, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(194, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(195, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(196, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(197, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(198, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(199, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(200, NULL, 'fb8d', '28', -1.049, '2024-07-30 18:44:28'),
(201, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(202, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(203, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(204, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(205, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(206, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(207, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(208, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(209, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(210, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(211, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(212, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(213, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(214, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(215, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(216, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(217, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(218, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(219, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(220, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(221, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(222, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(223, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(224, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(225, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(226, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(227, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(228, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(229, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(230, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(231, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(232, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(233, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(234, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(235, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(482, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(483, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(484, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(485, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(486, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(487, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(488, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(489, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(490, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(491, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(492, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(493, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(494, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(495, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(496, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(497, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(498, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(499, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(500, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(501, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(502, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(503, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(504, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(505, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(506, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(507, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(508, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(509, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(510, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(511, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(512, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(513, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(514, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(515, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(516, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(517, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(518, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(519, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(520, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(521, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(522, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(523, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(524, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(525, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(526, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(527, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(528, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(529, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(530, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(531, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(532, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(533, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(534, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(535, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(536, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(537, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(538, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(539, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(540, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(541, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(542, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(543, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(544, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(545, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(546, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(547, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(548, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(549, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(550, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(551, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(552, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(553, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(554, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(555, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(556, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(557, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(558, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(559, NULL, 'fb8d', '29', 0.025, '2024-08-01 13:47:47'),
(560, NULL, 'fb8d', '28', 0.015, '2024-08-01 13:47:47'),
(561, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(562, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(563, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(564, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(565, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(566, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(567, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(568, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(569, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(570, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(571, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(572, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(573, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(574, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(575, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(576, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(577, NULL, 'fb8d', '29', 0.025, '2024-07-30 18:44:28'),
(578, NULL, 'fb8d', '28', 0.015, '2024-07-30 18:44:28'),
(579, NULL, 'fb8d', '29', 0.025, '2024-08-06 14:13:18'),
(580, NULL, 'fb8d', '28', 0.015, '2024-08-06 14:13:18'),
(581, NULL, 'fb8d', '28', 0.015, '2024-08-09 14:13:18'),
(582, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(583, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(584, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(585, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(586, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(587, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(588, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(589, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(590, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(591, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(640, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(641, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(642, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(643, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(644, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(645, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(646, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(647, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(648, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(649, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(650, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(651, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(652, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(653, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(654, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(655, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(656, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(657, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(658, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(659, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(660, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(661, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(662, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(663, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(664, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(665, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(666, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(667, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(668, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(669, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(670, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(671, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(672, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(673, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(674, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(675, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(676, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(677, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(678, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(679, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(680, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(681, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(682, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(683, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(684, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(685, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(686, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(687, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(688, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(689, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(690, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(691, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(692, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(693, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(694, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(695, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(696, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(697, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(698, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(699, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(700, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(701, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(702, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(703, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(704, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(705, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(706, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(707, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(708, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(709, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(710, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(711, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(712, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(713, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(714, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(715, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(716, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(717, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(814, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(815, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(816, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(817, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(818, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(819, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(820, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(821, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(822, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(823, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(824, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(825, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(826, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(827, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(828, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(829, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(832, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(833, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(834, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(835, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(836, NULL, '33', '28', 0.015, '2024-08-06 14:13:18'),
(837, NULL, '33', '28', 0.015, '2024-08-09 14:13:18'),
(838, 47, '33', '28', 0.015, '2024-08-06 14:13:18'),
(839, 47, '33', '28', 0.015, '2024-08-09 14:13:18'),
(840, 47, '33', '28', 0.015, '2024-08-06 14:13:18'),
(841, 47, '33', '28', 0.01578, '2024-08-09 14:13:18'),
(842, 94, '33', '28', 0.015, '2024-08-06 14:13:18'),
(843, 94, '33', '28', 0.015, '2024-08-09 14:13:18'),
(844, 95, '33', '28', 0.015, '2024-08-06 14:13:18'),
(845, 95, '33', '28', 0.015, '2024-08-09 14:13:18'),
(846, 96, '33', '28', 0.015, '2024-08-06 14:13:18'),
(847, 96, '33', '28', 0.015, '2024-08-09 14:13:18'),
(848, 97, 'fb8d', '29', 12.565, '2024-08-20 07:30:00'),
(849, 97, 'fb8d', '29', 10.39, '2024-08-20 07:35:00'),
(850, 97, 'fb8d', '28', 0.036, '2024-08-20 07:35:00'),
(851, 97, 'fb8d', '29', 13.15, '2024-08-20 07:40:00'),
(852, 97, 'fb8d', '28', -0.062, '2024-08-20 07:40:00'),
(853, 97, 'fb8d', '29', 13.46, '2024-08-20 07:45:00'),
(854, 97, 'fb8d', '28', -0.074, '2024-08-20 07:45:00'),
(855, 97, 'fb8d', '29', 13.195, '2024-08-20 07:50:00'),
(856, 97, 'fb8d', '28', -0.04, '2024-08-20 07:50:00'),
(857, 97, 'fb8d', '29', 13.22, '2024-08-20 07:55:00'),
(858, 97, 'fb8d', '28', -0.107, '2024-08-20 07:55:00'),
(859, 97, 'fb8d', '29', 13.29, '2024-08-20 08:00:00'),
(860, 97, 'fb8d', '28', -0.087, '2024-08-20 08:00:00'),
(861, 97, 'fb8d', '29', 13.165, '2024-08-20 08:05:00'),
(862, 97, 'fb8d', '28', -0.138, '2024-08-20 08:05:00'),
(863, 97, 'fb8d', '29', 13.06, '2024-08-20 08:10:00'),
(864, 97, 'fb8d', '28', -0.159, '2024-08-20 08:10:00'),
(865, 97, 'fb8d', '29', 13.445, '2024-08-20 08:15:00'),
(866, 97, 'fb8d', '28', -0.175, '2024-08-20 08:15:00'),
(867, 97, 'fb8d', '29', 13.26, '2024-08-20 08:20:00'),
(868, 97, 'fb8d', '28', -0.166, '2024-08-20 08:20:00'),
(869, 97, 'fb8d', '29', 13.44, '2024-08-20 08:25:00'),
(870, 97, 'fb8d', '28', -0.177, '2024-08-20 08:25:00'),
(871, 97, 'fb8d', '29', 13.025, '2024-08-20 08:30:00'),
(872, 97, 'fb8d', '28', -0.171, '2024-08-20 08:30:00'),
(873, 97, 'fb8d', '29', 13.095, '2024-08-20 08:35:00'),
(874, 97, 'fb8d', '28', -0.22, '2024-08-20 08:35:00'),
(875, 97, 'fb8d', '29', 13.27, '2024-08-20 08:40:00'),
(876, 97, 'fb8d', '28', -0.191, '2024-08-20 08:40:00'),
(877, 97, 'fb8d', '29', 13.095, '2024-08-20 08:45:00'),
(878, 97, 'fb8d', '28', -0.095, '2024-08-20 08:45:00'),
(879, 97, 'fb8d', '29', 13.195, '2024-08-20 08:50:00'),
(880, 97, 'fb8d', '28', -0.101, '2024-08-20 08:50:00'),
(881, 97, 'fb8d', '29', 13.155, '2024-08-20 08:55:00'),
(882, 97, 'fb8d', '28', -0.072, '2024-08-20 08:55:00'),
(883, 97, 'fb8d', '29', 13.355, '2024-08-20 09:00:00'),
(884, 97, 'fb8d', '28', -0.133, '2024-08-20 09:00:00'),
(885, 97, 'fb8d', '29', 13.28, '2024-08-20 09:05:00'),
(886, 97, 'fb8d', '28', -0.138, '2024-08-20 09:05:00'),
(887, 97, 'fb8d', '29', 13.61, '2024-08-20 09:10:00'),
(888, 97, 'fb8d', '28', -0.17, '2024-08-20 09:10:00'),
(889, 97, 'fb8d', '29', 13.42, '2024-08-20 09:15:00'),
(890, 97, 'fb8d', '28', -0.168, '2024-08-20 09:15:00'),
(891, 97, 'fb8d', '29', 13.345, '2024-08-20 09:20:00'),
(892, 97, 'fb8d', '28', -0.166, '2024-08-20 09:20:00'),
(893, 97, 'fb8d', '29', 13.125, '2024-08-20 09:25:00'),
(894, 97, 'fb8d', '28', -0.215, '2024-08-20 09:25:00'),
(895, 97, 'fb8d', '29', 10.425, '2024-08-20 09:30:00'),
(896, 97, 'fb8d', '28', -0.21, '2024-08-20 09:30:00'),
(897, 97, 'fb8d', '29', 13.435, '2024-08-20 09:35:00'),
(898, 97, 'fb8d', '28', -0.225, '2024-08-20 09:35:00'),
(899, 97, 'fb8d', '29', 13.065, '2024-08-20 09:40:00'),
(900, 97, 'fb8d', '28', -0.217, '2024-08-20 09:40:00'),
(901, 97, 'fb8d', '29', 13.115, '2024-08-20 09:45:00'),
(902, 97, 'fb8d', '28', -0.213, '2024-08-20 09:45:00'),
(903, 97, 'fb8d', '29', 13.245, '2024-08-20 09:50:00'),
(904, 97, 'fb8d', '28', -0.215, '2024-08-20 09:50:00'),
(905, 97, 'fb8d', '29', 13.055, '2024-08-20 09:55:00'),
(906, 97, 'fb8d', '28', -0.214, '2024-08-20 09:55:00'),
(907, 97, 'fb8d', '29', 13.515, '2024-08-20 10:00:00'),
(908, 97, 'fb8d', '28', -0.212, '2024-08-20 10:00:00'),
(909, 97, 'fb8d', '29', 13.07, '2024-08-20 10:05:00'),
(910, 97, 'fb8d', '28', -0.218, '2024-08-20 10:05:00'),
(911, 97, 'fb8d', '29', 13.325, '2024-08-20 10:10:00'),
(912, 97, 'fb8d', '28', -0.211, '2024-08-20 10:10:00'),
(913, 97, 'fb8d', '29', 13.05, '2024-08-20 10:15:00'),
(914, 97, 'fb8d', '28', -0.204, '2024-08-20 10:15:00'),
(915, 97, 'fb8d', '29', 13.055, '2024-08-20 10:20:00'),
(916, 97, 'fb8d', '28', -0.198, '2024-08-20 10:20:00'),
(917, 97, 'fb8d', '29', 13.395, '2024-08-20 10:25:00'),
(918, 97, 'fb8d', '28', -0.203, '2024-08-20 10:25:00'),
(919, 97, 'fb8d', '29', 13.345, '2024-08-20 10:30:00'),
(920, 97, 'fb8d', '28', -0.201, '2024-08-20 10:30:00'),
(921, 97, 'fb8d', '29', 13.1, '2024-08-20 10:35:00'),
(922, 97, 'fb8d', '28', -0.2, '2024-08-20 10:35:00'),
(923, 99, 'fb8d', '29', 49.91, '2024-08-20 11:25:00'),
(924, 99, 'fb8d', '28', 34319.2, '2024-08-20 11:25:00'),
(925, 99, 'fb8d', '28', 34319.2, '2024-08-20 11:30:00'),
(926, 99, 'fb8d', '29', 49.91, '2024-08-20 11:30:00'),
(927, 99, 'fb8d', '29', 49.91, '2024-08-20 11:35:00'),
(928, 99, 'fb8d', '28', 34320, '2024-08-20 11:35:00'),
(929, 99, 'fb8d', '29', 49.91, '2024-08-20 11:40:00'),
(930, 99, 'fb8d', '28', 34319.7, '2024-08-20 11:40:00'),
(931, 99, 'fb8d', '29', 49.91, '2024-08-20 11:45:00'),
(932, 99, 'fb8d', '28', 34318.6, '2024-08-20 11:45:00'),
(933, 99, 'fb8d', '29', 49.91, '2024-08-20 11:50:00'),
(934, 99, 'fb8d', '28', 34319.2, '2024-08-20 11:50:00'),
(935, 99, 'fb8d', '29', 35.88, '2024-08-20 11:55:00'),
(936, 99, 'fb8d', '28', 34319.3, '2024-08-20 11:55:00'),
(937, 99, 'fb8d', '29', 35.88, '2024-08-20 12:00:00'),
(938, 99, 'fb8d', '28', 34319.1, '2024-08-20 12:00:00'),
(939, 99, 'fb8d', '29', 12.23, '2024-08-20 12:05:00'),
(940, 99, 'fb8d', '28', 34319, '2024-08-20 12:05:00'),
(941, 99, 'fb8d', '29', 0.03, '2024-08-20 12:10:00'),
(942, 99, 'fb8d', '28', 34320.3, '2024-08-20 12:10:00'),
(943, 99, 'fb8d', '29', 0.03, '2024-08-20 12:15:00'),
(944, 99, 'fb8d', '28', 34320, '2024-08-20 12:15:00'),
(945, 99, 'fb8d', '29', 0.03, '2024-08-20 12:20:00'),
(946, 99, 'fb8d', '28', 34319.4, '2024-08-20 12:20:00'),
(947, 99, 'fb8d', '29', 43.98, '2024-08-20 12:25:00'),
(948, 99, 'fb8d', '28', 0.012, '2024-08-20 12:25:00'),
(949, 99, 'fb8d', '29', 43.48, '2024-08-20 12:30:00'),
(950, 99, 'fb8d', '28', 0.012, '2024-08-20 12:30:00'),
(951, 99, 'fb8d', '29', 27.05, '2024-08-20 12:35:00'),
(952, 99, 'fb8d', '28', 0.011, '2024-08-20 12:35:00'),
(953, 99, 'fb8d', '29', 26.695, '2024-08-20 12:40:00'),
(954, 99, 'fb8d', '28', 0.011, '2024-08-20 12:40:00'),
(955, 99, 'fb8d', '29', 26.695, '2024-08-20 12:45:00'),
(956, 99, 'fb8d', '28', 0.011, '2024-08-20 12:45:00'),
(957, 99, 'fb8d', '29', 26.52, '2024-08-20 12:50:00'),
(958, 99, 'fb8d', '28', 0.011, '2024-08-20 12:50:00'),
(959, 99, 'fb8d', '29', 26.52, '2024-08-20 12:55:00'),
(960, 99, 'fb8d', '28', 0.011, '2024-08-20 12:55:00'),
(961, 99, 'fb8d', '29', 22.65, '2024-08-20 13:00:00'),
(962, 99, 'fb8d', '28', 0.011, '2024-08-20 13:00:00'),
(963, 99, 'fb8d', '29', 22.65, '2024-08-20 13:05:00'),
(964, 99, 'fb8d', '28', 0.011, '2024-08-20 13:05:00'),
(965, 99, 'fb8d', '29', 22.65, '2024-08-20 13:10:00'),
(966, 99, 'fb8d', '28', 0.011, '2024-08-20 13:10:00'),
(967, 99, 'fb8d', '29', 22.65, '2024-08-20 13:15:00'),
(968, 99, 'fb8d', '28', 0.011, '2024-08-20 13:15:00'),
(969, 99, 'fb8d', '29', 22.65, '2024-08-20 13:20:00'),
(970, 99, 'fb8d', '28', 0.01, '2024-08-20 13:20:00'),
(971, 99, 'fb8d', '29', 22.65, '2024-08-20 13:25:00'),
(972, 99, 'fb8d', '28', 0.011, '2024-08-20 13:25:00'),
(973, 99, 'fb8d', '29', 453, '2024-08-20 13:30:00'),
(974, 99, 'fb8d', '28', 0.01, '2024-08-20 13:30:00'),
(975, 99, 'fb8d', '29', 998.5, '2024-08-20 13:35:00'),
(976, 99, 'fb8d', '28', 0.009, '2024-08-20 13:35:00'),
(977, 99, 'fb8d', '29', 0.6, '2024-08-20 13:40:00'),
(978, 99, 'fb8d', '28', 0.009, '2024-08-20 13:40:00'),
(979, 99, 'fb8d', '29', 801.7, '2024-08-20 13:45:00'),
(980, 99, 'fb8d', '28', 0.009, '2024-08-20 13:45:00'),
(981, 99, 'fb8d', '29', 0.033, '2024-08-20 13:50:00'),
(982, 99, 'fb8d', '28', 0.01, '2024-08-20 13:50:00'),
(983, 99, 'fb8d', '29', 26218.5, '2024-08-20 13:55:00'),
(984, 99, 'fb8d', '28', 0.01, '2024-08-20 13:55:00'),
(985, 99, 'fb8d', '29', 23309, '2024-08-20 14:00:00'),
(986, 99, 'fb8d', '28', 0.01, '2024-08-20 14:00:00'),
(987, 99, 'fb8d', '29', 23.309, '2024-08-20 14:05:00'),
(988, 99, 'fb8d', '28', 0.01, '2024-08-20 14:05:00'),
(989, 99, 'fb8d', '29', 23.1935, '2024-08-20 14:10:00'),
(990, 99, 'fb8d', '28', 0.009, '2024-08-20 14:10:00'),
(991, 99, 'fb8d', '29', 23.1, '2024-08-20 14:15:00'),
(992, 99, 'fb8d', '28', 0.009, '2024-08-20 14:15:00'),
(993, 99, 'fb8d', '29', 13.4695, '2024-08-20 14:20:00'),
(994, 99, 'fb8d', '28', 0.01, '2024-08-20 14:20:00'),
(995, 99, 'fb8d', '28', 0.01, '2024-08-20 14:25:00'),
(996, 99, 'fb8d', '29', 13.585, '2024-08-20 14:30:00'),
(997, 99, 'fb8d', '28', 0, '2024-08-20 14:30:00'),
(998, 99, 'fb8d', '29', 13.431, '2024-08-20 14:35:00'),
(999, 99, 'fb8d', '28', 0.01, '2024-08-20 14:35:00'),
(1000, 99, 'fb8d', '29', 14.4155, '2024-08-20 14:40:00'),
(1001, 99, 'fb8d', '28', 0.009, '2024-08-20 14:40:00'),
(1002, 99, 'fb8d', '29', 24.4255, '2024-08-20 14:45:00'),
(1003, 99, 'fb8d', '28', 0.009, '2024-08-20 14:45:00'),
(1004, 99, 'fb8d', '29', 0.033, '2024-08-20 14:50:00'),
(1005, 99, 'fb8d', '28', 0.01, '2024-08-20 14:50:00'),
(1006, 99, 'fb8d', '28', 0.008, '2024-08-20 14:55:00'),
(1007, 99, 'fb8d', '28', 0.009, '2024-08-20 15:00:00'),
(1008, 99, 'fb8d', '28', 0.009, '2024-08-20 15:10:00'),
(1009, 99, 'fb8d', '28', 0.009, '2024-08-20 15:15:00'),
(1010, 99, 'fb8d', '28', 0.009, '2024-08-20 15:20:00'),
(1011, 99, 'fb8d', '29', 0.0275, '2024-08-06 08:43:18'),
(1012, 99, 'fb8d', '29', 0.0275, '2024-08-06 08:43:18'),
(1013, 99, 'fb8d', '29', 0.0275, '2024-08-06 08:43:18'),
(1014, 99, 'fb8d', '29', 0.0275, '2024-08-06 08:43:18'),
(1015, 99, 'fb8d', '29', 0.0275, '2024-08-06 08:43:18');

-- --------------------------------------------------------

--
-- Table structure for table `sensor_type`
--

CREATE TABLE `sensor_type` (
  `id` int NOT NULL,
  `sensorType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sensorIcon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `calibrationValue` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status` enum('1','0') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `unit` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sensor_type`
--

INSERT INTO `sensor_type` (`id`, `sensorType`, `sensorIcon`, `calibrationValue`, `status`, `unit`) VALUES
(1, 'Temperature', 'uploads/sensors/1.png', '1', '1', '°C'),
(2, 'LVDT', 'uploads/sensors/2.png', '1', '1', 'mm'),
(3, 'Accelerometer', 'uploads/sensors/3.png', '1', '1', 'm/s²'),
(4, 'Strain Gauge', 'uploads/sensors/4.png', '1', '1', 'uS'),
(5, 'Load Cell', 'uploads/sensors/5.png', '1', '1', 'uS'),
(6, 'Inclinometer', 'uploads/sensors/6.png', '1', '1', '°'),
(7, 'Crack meter', 'uploads/sensors/7.png', '1', '1', 'mm'),
(8, 'Torque Sensor', 'uploads/sensors/8.png', '1', '1', 'Nm'),
(9, 'Humidity Sensor', 'uploads/sensors/9.png', '1', '1', '%');

-- --------------------------------------------------------

--
-- Table structure for table `temp_otp`
--

CREATE TABLE `temp_otp` (
  `id` int NOT NULL,
  `userId` int NOT NULL,
  `otp` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `temp_otp`
--

INSERT INTO `temp_otp` (`id`, `userId`, `otp`, `createdAt`) VALUES
(13, 1, 'SQ5490', '2024-01-06 12:37:40'),
(36, 11, 'JL7101', '2024-01-08 15:33:36');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `userType` enum('superadmin','admin','contractor','authority') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `parentId` int NOT NULL,
  `firstName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `lastName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `emailId` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `phoneNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `isMailVerified` enum('true','false') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'false',
  `isUserVerified` enum('true','false') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'false',
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `profileImage` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `status` enum('true','false') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `csv` int DEFAULT '0',
  `createdAt` datetime DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL,
  `IsDelete` enum('true','false') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'false'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `userType`, `parentId`, `firstName`, `lastName`, `emailId`, `phoneNo`, `isMailVerified`, `isUserVerified`, `password`, `profileImage`, `status`, `csv`, `createdAt`, `updatedAt`, `IsDelete`) VALUES
(1, 'superadmin', 0, 'Arctano', 'Solution', 'info@arctano.com', '9999', 'true', 'true', '$2b$10$5oKH0.k6C03nzhpNGvyJeuNFK7CXMZYhv2coeyZt7U9cNuzhORIUS', 'uploads/users/Super_14e0ad7f-369c-424c-9579-7cca89aad095.jpg', 'true', 1, '2023-12-12 13:50:57', '2023-12-12 09:20:24', 'false'),
(12, 'admin', 0, 'Pulkit', 'Arctano', 'pulkit@arctano.com', '8448461402', 'true', 'true', '$2b$10$vEVEZQ3GQmUNMehYjebrg.8ePIsnVFBMiJ1tfIkyzprG05rrfhuW2', 'uploads/users/Pulkit_228d3882-293a-409e-b31b-95723fe7c448.jpg', 'true', 1, '2023-12-22 14:01:40', '0000-00-00 00:00:00', 'false'),
(15, 'contractor', 12, 'Arctano', 'Sales', 'sales@arctano.com', '9874563210', 'true', 'true', '$2b$10$mhi6GBsCoEXTSsZcqHdrquIbX8epwqOKhXLWNUEKBTMOJjNhmZUKm', 'uploads/users/Arctano_05a9f5f5-6b2c-42b2-baad-5adcc9dc89c3.jpg', 'true', 0, '2024-01-04 16:22:49', '0000-00-00 00:00:00', 'false'),
(16, 'authority', 12, 'Rohan', 'Kamra', 'rohan@arctano.com ', '9874563210', 'true', 'true', '$2b$10$LWSiG3bkCiqCESfg90PrqeYbtpI16lLSUl2zH3cL4IgMO5qUy0BN.', 'uploads/users/Rohan_0735af9a-ae9b-47f0-9c87-a4d864ef3563.jpg', 'true', 1, '2024-01-18 13:17:28', NULL, 'false');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `devices`
--
ALTER TABLE `devices`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `device_channel`
--
ALTER TABLE `device_channel`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `device_type`
--
ALTER TABLE `device_type`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `email`
--
ALTER TABLE `email`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `firebasetoken`
--
ALTER TABLE `firebasetoken`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `nodeData`
--
ALTER TABLE `nodeData`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `notification`
--
ALTER TABLE `notification`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `project`
--
ALTER TABLE `project`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sensor`
--
ALTER TABLE `sensor`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sensor_data`
--
ALTER TABLE `sensor_data`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sensor_type`
--
ALTER TABLE `sensor_type`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `temp_otp`
--
ALTER TABLE `temp_otp`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `devices`
--
ALTER TABLE `devices`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT for table `device_channel`
--
ALTER TABLE `device_channel`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=169;

--
-- AUTO_INCREMENT for table `device_type`
--
ALTER TABLE `device_type`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `email`
--
ALTER TABLE `email`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `firebasetoken`
--
ALTER TABLE `firebasetoken`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `nodeData`
--
ALTER TABLE `nodeData`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=77;

--
-- AUTO_INCREMENT for table `notification`
--
ALTER TABLE `notification`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=91;

--
-- AUTO_INCREMENT for table `project`
--
ALTER TABLE `project`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=100;

--
-- AUTO_INCREMENT for table `sensor`
--
ALTER TABLE `sensor`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=34;

--
-- AUTO_INCREMENT for table `sensor_data`
--
ALTER TABLE `sensor_data`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1016;

--
-- AUTO_INCREMENT for table `sensor_type`
--
ALTER TABLE `sensor_type`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `temp_otp`
--
ALTER TABLE `temp_otp`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=62;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
