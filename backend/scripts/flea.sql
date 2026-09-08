CREATE DATABASE  IF NOT EXISTS `flea_market_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `flea_market_db`;
-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: flea_market_db
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `applications`
--

DROP TABLE IF EXISTS `applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `applications` (
  `applicationId` int NOT NULL AUTO_INCREMENT,
  `marketId` int NOT NULL,
  `sellerId` bigint unsigned NOT NULL,
  `boothNumber` varchar(10) NOT NULL,
  `boothTypeId` int DEFAULT NULL COMMENT '판매자가 고른 부스 종류 (NULL 이면 markets.boothPrice 적용)',
  `approvedPrice` int DEFAULT NULL COMMENT '주최자 승인 시점에 확정된 부스 금액 (NULL 이면 승인 전 — 현재가 적용)',
  `itemName` varchar(100) NOT NULL,
  `itemImage` varchar(255) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'Pending',
  `productDesc` text,
  `paymentDueAt` timestamp NULL DEFAULT NULL,
  `title` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`applicationId`),
  KEY `marketId` (`marketId`),
  KEY `sellerId` (`sellerId`),
  KEY `idx_application_booth_type` (`boothTypeId`),
  CONSTRAINT `applications_ibfk_1` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE,
  CONSTRAINT `applications_ibfk_2` FOREIGN KEY (`sellerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `applications_ibfk_3` FOREIGN KEY (`boothTypeId`) REFERENCES `market_booth_types` (`boothTypeId`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `applications`
--

LOCK TABLES `applications` WRITE;
/*!40000 ALTER TABLE `applications` DISABLE KEYS */;
INSERT INTO `applications` VALUES (26,22,8,'11',NULL,NULL,'민지팝니다.','/uploads/%EB%AF%BC%EC%A7%80%EB%84%A4%20%EC%86%8C%ED%92%88%EC%83%BE/docker_logo_1788480659055.png','Paid','멋진 물건을 팝니다. 아무멋져요',NULL,'민지네 소품샾'),(27,22,8,'2',NULL,NULL,'모든 무기팝니다.',NULL,'Rejected','불법적인 물건을 살수있습니다.',NULL,'민지네 총기상점'),(28,22,8,'3',NULL,NULL,'크레이모어 팝니다.',NULL,'Refunded','개쪄는 파괴적을 가진 무기 팝니다.',NULL,'불법적인 수류탄'),(29,23,8,'1',NULL,NULL,'k2 소총',NULL,'Refunded','불법 총기류 판매합니다.',NULL,'민지네 소총샾'),(30,23,8,'2',1,NULL,'고양이',NULL,'Refunded','총기샾',NULL,'민지 왔쪄요 뿌우'),(31,24,8,'1',4,NULL,'M60 기관총',NULL,'Paid','민지내 샾에서는 강력한 M60을 판매합니다.',NULL,'민지네 소총샾'),(32,24,8,'2',4,NULL,'M1A 소총',NULL,'Refunded','민지는 M1A를 판매합니다.',NULL,'민지네 소총샾'),(33,24,8,'3',5,NULL,'크레모어 팝니다.',NULL,'Refunded','민지는 크레모어를 판매합니다.',NULL,'민지내 폭탄샾'),(34,25,8,'1',7,NULL,'고양이',NULL,'Approved','민지 팝니다.','2026-09-08 08:37:52','민지 왔쪄요 뿌우'),(35,25,8,'2',7,NULL,'민지',NULL,'Approved','민지 팝니다.','2026-09-08 08:37:52','민지의 소품샾'),(36,25,8,'3',8,NULL,'민지 무기',NULL,'Approved','불법 사제 무기','2026-09-08 08:37:52','민지네 무기샾'),(37,25,8,'4',8,NULL,'민지 무기',NULL,'Approved','민지의 폭탄','2026-09-08 08:37:52','민지네 폭탄샾'),(38,25,8,'5',9,NULL,'민지 소품',NULL,'Approved','민지 소품','2026-09-08 08:37:52','민지 소품샾'),(39,25,8,'6',9,NULL,'민지 소품샾',NULL,'Paid','민지 소품',NULL,'민지 소품샾'),(40,25,8,'12',7,NULL,'m1a1 소총 팝니다.',NULL,'Paid','불법무기 조아',NULL,'민지네 총기 샾'),(41,24,8,'33',4,NULL,'박격포 80mm',NULL,'Pending','잘나갑니다.',NULL,'민지네 박격포'),(42,27,7,'1',10,NULL,'민지네 소품',NULL,'Paid','소품 많아요',NULL,'민지네 소품샾');
/*!40000 ALTER TABLE `applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_sessions`
--

DROP TABLE IF EXISTS `auth_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_sessions` (
  `sessionId` varchar(36) NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `refreshTokenHash` char(64) NOT NULL,
  `userAgent` varchar(255) DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  `issuedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` datetime NOT NULL,
  `revokedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`sessionId`),
  UNIQUE KEY `uk_auth_sessions_refresh` (`refreshTokenHash`),
  KEY `idx_auth_sessions_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_sessions`
--

LOCK TABLES `auth_sessions` WRITE;
/*!40000 ALTER TABLE `auth_sessions` DISABLE KEYS */;
INSERT INTO `auth_sessions` VALUES ('00bead9a-5311-4856-83dc-849e3b761762',8,'3db09df6c0b8983d90c51721c0b19d01e51af12478e6a6369f13cdeb54070334','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 13:16:42','2026-09-07 15:16:18','2026-09-21 15:16:18',NULL),('0af8b3d2-45bb-4513-be02-1fccda32f0d8',8,'5965aad8cdb31183995deca78cae1d16f398f064515c4f9d4a2f2ab339eaf409','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:46:44','2026-09-08 10:46:44','2026-09-22 10:46:44',NULL),('1398f613-1ac2-40ac-a925-74fdf018c7a3',8,'b24625e6b16d1ac27bbfdcd4674af8f8687ac502dee424fb290272e6238e3ed3','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:25:03','2026-09-08 10:25:03','2026-09-22 10:25:03',NULL),('172e335d-a497-4698-bed4-a598292846f0',8,'9d85c93249e9653a6ef007c8f0b0e3b4120e66b99f5c33bc287e9dd1656f294a','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 09:10:16','2026-09-04 09:10:16','2026-09-18 09:10:17','2026-09-04 09:12:22'),('19e03bdf-c37e-4837-bc51-c7de9b2d883b',7,'ebc67c200ba99dd75909f55f0ad3e8d3389fc49f7ba0d366a64d1488e24367cf','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 17:08:44','2026-09-04 17:08:44','2026-09-18 17:08:45','2026-09-07 14:32:56'),('1c4b3889-056a-472b-afe7-72bbf5da914c',7,'c7ecccc4d787c4a9539aef0571efcb375073863c98f6affec5dfc543fb155bd1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-03 10:20:52','2026-09-03 16:40:31','2026-09-17 16:40:32','2026-09-07 14:32:56'),('46a759e9-abfc-488d-927a-b4c5efaa4027',8,'19853aa3a5cb705b7cc90ab77b1218f23483f7e9ade4f4298737488cbef2ac50','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:52:45','2026-09-08 10:52:45','2026-09-22 10:52:45',NULL),('64582d87-7e02-47e7-b3b4-a0a01f839eeb',8,'37c54d68d10a3ae5bd36a87662ba80e5e47c6aff52a65e80c66022400c6f5766','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 17:07:18','2026-09-04 17:07:18','2026-09-18 17:07:19','2026-09-04 17:08:35'),('64cf427a-c476-4314-8ecb-17593ca39ffe',7,'6d863fcd408e0237d439af4a52d4a349019e4a153b1693f85900722a5b14a875','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 17:08:33','2026-09-07 17:08:33','2026-09-21 17:08:33','2026-09-08 10:09:20'),('6598f2e5-ea96-4410-a4ca-1993b889b9f5',7,'e5f4b91ac725447f423f9c552d3f0a9a3dd4a3560baaccad8a88d2e56cafda80','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:59:57','2026-09-07 16:59:57','2026-09-21 16:59:57','2026-09-08 10:09:34'),('693205ec-cd2d-42ba-8c94-61233f6ade39',8,'e132ce01b880ec0536dbd8b29ad89200b5a51f3861e07d4f161d9205ac7496c6','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 09:00:51','2026-09-08 09:00:51','2026-09-22 09:00:52',NULL),('6e51e551-ca5f-4ab6-be64-a19bf7063797',8,'fd1e207badfd90dd3584a73ea7cedc46ebb7ccc0d0611a8220b07e977752b552','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:32:40','2026-09-08 10:32:40','2026-09-22 10:32:41',NULL),('72014651-ed75-4e3e-b770-c7b8bb3a175f',7,'e5e9ca3f244289649d54e55613f2533203c1712bc8da1666ba3aea9ba6c8334f','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:25:37','2026-09-07 16:25:37','2026-09-21 16:25:37',NULL),('74275ebb-cbd6-48a8-baa5-36874202bbb5',8,'e032f2d4d7a4dda037c8b3e1eb3f3055d4fb056bab1b83bdb1ed0341aeec6130','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:58:33','2026-09-07 16:58:33','2026-09-21 16:58:34',NULL),('7a53b96f-6d86-4a4d-87d6-83ddee3d1453',8,'2309a6b89d71193d76a6e46ee3b80e0542059f92def7c078d475bf1a4bea633d','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 17:08:45','2026-09-07 17:08:45','2026-09-21 17:08:46',NULL),('7e81e34b-a968-48f7-ab64-116f2a31cc45',7,'a6a3fb376dc3c6535cea7eeb22cfdec4d12717c772e38956141c41779f7b33e1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:24:48','2026-09-08 10:24:48','2026-09-22 10:24:48',NULL),('805aec13-f06e-4bd1-86be-2d0d35a2c6b2',7,'b03a66649008f5486648ad5bfb1595bcb37bcabc4fae55fc3e72161867c8e5e9','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','::1','2026-08-28 09:32:53','2026-08-28 09:32:53','2026-09-11 09:32:53','2026-09-07 14:32:56'),('89312e72-8cad-4d4b-af82-8b647c0cda46',7,'02b34039104e59a06c8726923a768d66dd30eba871ec2ab83ec5e11b4f7f42b5','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36','::1','2026-08-28 09:32:30','2026-08-28 09:32:30','2026-09-11 09:32:31','2026-09-07 14:32:56'),('9c60a63e-36c8-49b3-953c-3d6584a7ce3f',7,'b3aff03f208bdb925fffe303a88c5eb764d5ef768399193cddf088540ee3e88f','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:59:28','2026-09-07 16:59:28','2026-09-21 16:59:28',NULL),('a8a815f3-6380-4897-8b29-920241c0b150',8,'d16e4d46d987aa9581e2b943d4a184057f7488c13a5c783a168cd621476c7a4c','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 09:10:06','2026-09-04 09:10:06','2026-09-18 09:10:07',NULL),('aa759733-ec93-4eb2-ad8c-177b61f0b5f6',8,'373f6b7a75cf890bc1b943e6586197470d3d5bfc64009414cb5fff2b1c636070','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 17:00:08','2026-09-07 17:00:08','2026-09-21 17:00:08',NULL),('ac5b24f4-611b-4d42-8113-6fd69e07a336',7,'ab996772d5692c40d9885387f8933103448183255a117dacc7f36199ea8c6acb','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:32:32','2026-09-08 10:32:32','2026-09-22 10:32:32',NULL),('acbf8707-6cce-421e-b057-4ca103c20f58',7,'49a0efcd804082216e43f49f7b4155e5139640da98e70f5a059530a15ecaf942','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:58:21','2026-09-07 16:58:21','2026-09-21 16:58:22',NULL),('b8786879-4ebd-461c-9f67-66762602f66a',7,'fcea27bfa1e350c800d087fb609d7e181d744b47fd921685bef4bc2fa394e82c','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 09:06:14','2026-09-04 09:06:14','2026-09-18 09:06:14','2026-09-04 09:09:01'),('baec87d8-73e9-4f3f-a6b3-d3aa65194fdd',8,'729aa3ce17c167eb586211db04466cb44adec93ed463914c072842d637876076','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 16:25:46','2026-09-07 16:25:46','2026-09-21 16:25:47',NULL),('c30aeb1c-c5b9-4b35-bb37-d55d3706bf4e',7,'f30f3cdc0b591b3102aba43d2206fd961a358a17ee79bbc58a26ac657a17a295','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 09:00:41','2026-09-08 09:00:41','2026-09-22 09:00:42',NULL),('c8e098bc-1e5a-4b80-9fed-e69c91926b64',7,'c3d02b94fc3b13d0eec266a78b0d9f5cf7f453ca6efc143f6b4b003945b1c700','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:52:34','2026-09-08 10:52:34','2026-09-22 10:52:35','2026-09-08 11:36:58'),('d670028f-8a6f-4375-9b2d-ac059594dfbc',7,'31ac0961d11914ef8a6c4100904da756ccb69b8644aa1d7e7a0296a9fc7ca42d','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-08 10:46:21','2026-09-08 10:46:21','2026-09-22 10:46:21',NULL),('e06a347a-1b22-4be9-b86f-5e1fe1dedd52',7,'9a61e15680569cdef6e7b8a13f71ff723f6820e5311ad23f0816f8c423de671e','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-07 13:13:04','2026-09-07 13:13:04','2026-09-21 13:13:04',NULL),('f2ce5b77-7413-479b-8217-82ad7ce38d1c',7,'7d033c0ed6e874e6fdb938a1b91aa16411e82cc8e48a7938532615a4c8bf16c9','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36','::1','2026-09-04 09:12:32','2026-09-04 16:49:36','2026-09-18 16:49:36','2026-09-04 17:06:58');
/*!40000 ALTER TABLE `auth_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `comments`
--

DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `commentId` int NOT NULL AUTO_INCREMENT,
  `targetType` varchar(20) NOT NULL,
  `targetId` int NOT NULL,
  `userId` bigint unsigned NOT NULL,
  `content` varchar(500) NOT NULL,
  `visibility` varchar(20) NOT NULL DEFAULT 'public' COMMENT 'public | host_only(주최자만 열람) | seller_only(지정 판매자만 열람)',
  `counterpartId` bigint unsigned DEFAULT NULL COMMENT 'seller_only 일 때 열람 가능한 판매자 userId',
  `parentId` int DEFAULT NULL COMMENT '대댓글이면 부모 댓글의 commentId, 최상위 댓글이면 NULL',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT NULL COMMENT '수정된 적이 있으면 마지막 수정 시각, 없으면 NULL',
  PRIMARY KEY (`commentId`),
  KEY `userId` (`userId`),
  KEY `target` (`targetType`,`targetId`),
  KEY `parentId` (`parentId`),
  KEY `idx_comments_visibility` (`targetType`,`targetId`,`visibility`),
  CONSTRAINT `comments_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `comments_ibfk_2` FOREIGN KEY (`parentId`) REFERENCES `comments` (`commentId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `comments`
--

LOCK TABLES `comments` WRITE;
/*!40000 ALTER TABLE `comments` DISABLE KEYS */;
INSERT INTO `comments` VALUES (11,'market',24,7,'좋음','public',NULL,NULL,'2026-09-07 06:02:57',NULL),(12,'market',24,8,'뭐가 좋나요?','host_only',NULL,11,'2026-09-07 07:27:54',NULL);
/*!40000 ALTER TABLE `comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `market_booth_types`
--

DROP TABLE IF EXISTS `market_booth_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `market_booth_types` (
  `boothTypeId` int NOT NULL AUTO_INCREMENT,
  `marketId` int NOT NULL,
  `name` varchar(50) NOT NULL COMMENT '부스 종류 이름 (예: A타입, B타입)',
  `price` int NOT NULL DEFAULT '0' COMMENT '이 종류의 부스 가격',
  `capacity` int NOT NULL DEFAULT '0' COMMENT '종류별 정원, 0이면 제한 없음',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '주최자가 정한 노출 순서',
  `isActive` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 신청 화면에서 숨김',
  `priceOrigin` int DEFAULT NULL COMMENT '이 등급을 처음 등록했을 때의 금액. 한 번 정해지면 바뀌지 않습니다',
  `pricePrev` int DEFAULT NULL COMMENT '바로 직전 금액. 가격을 고칠 때마다 갱신됩니다',
  PRIMARY KEY (`boothTypeId`),
  KEY `idx_booth_types_market` (`marketId`),
  CONSTRAINT `market_booth_types_ibfk_1` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `market_booth_types`
--

LOCK TABLES `market_booth_types` WRITE;
/*!40000 ALTER TABLE `market_booth_types` DISABLE KEYS */;
INSERT INTO `market_booth_types` VALUES (1,23,'스탠다드',10000,5,0,1,10000,NULL),(2,23,'프리미엄',20000,5,1,1,20000,NULL),(3,23,'스페셜',30000,5,2,1,30000,NULL),(4,24,'스탠다드',1000,2,0,1,1000,NULL),(5,24,'프리미엄',2000,2,1,1,2000,NULL),(6,24,'스페셜',3000,2,2,1,3000,NULL),(7,25,'스탠다드',3000,2,0,1,3000,NULL),(8,25,'프리미엄',5000,2,1,1,5000,NULL),(9,25,'스페셜',6000,2,2,0,6000,NULL),(10,27,'스탠다드',10000,20,0,1,10000,NULL),(11,27,'프리미엄',12000,20,1,1,12000,NULL),(12,27,'스페셜',15000,10,2,1,15000,NULL);
/*!40000 ALTER TABLE `market_booth_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `market_checkin_sessions`
--

DROP TABLE IF EXISTS `market_checkin_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `market_checkin_sessions` (
  `sessionId` int NOT NULL AUTO_INCREMENT,
  `marketId` int NOT NULL,
  `eventDate` date NOT NULL COMMENT '이 세션이 담당하는 개최일 하루',
  `status` varchar(20) NOT NULL DEFAULT 'open' COMMENT 'scheduled(시간대에 맡김) | open(주최자가 직접 염) | closed(직접 닫음)',
  `secret` char(64) NOT NULL COMMENT 'QR 서명 키. 다시 열 때마다 교체되어 캡처된 옛 QR 을 무효화. 외부 노출 금지',
  `openedBy` bigint unsigned NOT NULL COMMENT '체크인을 시작한 주최자 userId',
  `openedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` datetime DEFAULT NULL,
  `opensAt` datetime DEFAULT NULL COMMENT '이 날 체크인 시작 시각. QR 은 이보다 leadMinutes 만큼 먼저 나옵니다',
  `closesAt` datetime DEFAULT NULL COMMENT '이 날 체크인 종료 시각. 지나면 QR 이 자동으로 멈춥니다',
  `leadMinutes` int NOT NULL DEFAULT '60' COMMENT 'opensAt 기준 몇 분 전부터 QR 을 띄울지 (기본 60분)',
  PRIMARY KEY (`sessionId`),
  UNIQUE KEY `uk_checkin_session_day` (`marketId`,`eventDate`),
  CONSTRAINT `fk_checkin_session_market` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=102 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `market_checkin_sessions`
--

LOCK TABLES `market_checkin_sessions` WRITE;
/*!40000 ALTER TABLE `market_checkin_sessions` DISABLE KEYS */;
INSERT INTO `market_checkin_sessions` VALUES (1,22,'2026-09-10','scheduled','08957128a45624e76b61a7d1d8f5cca65e9286389cbb9b1937de64b97f667cf9',7,'2026-09-07 05:05:04',NULL,'2026-09-10 09:00:00','2026-09-10 17:00:00',60),(2,22,'2026-09-11','scheduled','a44997abd4e09f862597588f1d66daedea2cea3d1bf293520e7ef7bdf2ea6efe',7,'2026-09-07 05:05:04',NULL,'2026-09-11 09:00:00','2026-09-11 17:00:00',60),(3,22,'2026-09-12','scheduled','42aa4a6972a4ce3b015297514f80c58ce17966c0191dd467c48fc71ae646f9af',7,'2026-09-07 05:05:04',NULL,'2026-09-12 09:00:00','2026-09-12 17:00:00',60),(4,22,'2026-09-13','scheduled','90df5357fa3cdcf6def99da6859730eca8ccf7e69dc061800b05cfab38f95f04',7,'2026-09-07 05:05:04',NULL,'2026-09-13 09:00:00','2026-09-13 17:00:00',60),(5,22,'2026-09-14','scheduled','17b9b247895403500db7e60162267d3d6707f31b7951033e8573c34c0cce23dc',7,'2026-09-07 05:05:04',NULL,'2026-09-14 09:00:00','2026-09-14 17:00:00',60),(6,22,'2026-09-15','scheduled','ba396a4e12d62c9d0d570b0eb3d56e17824c42aebf5ed0b55d93988689056c89',7,'2026-09-07 05:05:04',NULL,'2026-09-15 09:00:00','2026-09-15 17:00:00',60),(7,22,'2026-09-16','scheduled','caad89e76161ab7c2f66e036856a688744cf397114b74571a9bfe047ec7dc637',7,'2026-09-07 05:05:04',NULL,'2026-09-16 09:00:00','2026-09-16 17:00:00',60),(8,22,'2026-09-17','scheduled','0ce10b346a8cc4ac9b9db23ed0dfa5de637e169ba9ad1c84297f80d78abab809',7,'2026-09-07 05:05:04',NULL,'2026-09-17 09:00:00','2026-09-17 17:00:00',60),(9,22,'2026-09-18','scheduled','319ade397294ed2c75482afb5fd644266bc190cdcbad7e6840fe4419a6fffa17',7,'2026-09-07 05:05:04',NULL,'2026-09-18 09:00:00','2026-09-18 17:00:00',60),(10,22,'2026-09-19','scheduled','645d473d8b31efcc9eb9c288f50fda2c970c735ca33a9f06196889d05c41a685',7,'2026-09-07 05:05:04',NULL,'2026-09-19 09:00:00','2026-09-19 17:00:00',60),(11,22,'2026-09-20','scheduled','3eaaaaffa7b015c2b027c1e82ca63397cf5bdb9d40a4e802936be4a4d33976ea',7,'2026-09-07 05:05:04',NULL,'2026-09-20 09:00:00','2026-09-20 17:00:00',60),(12,22,'2026-09-21','scheduled','9658145198a8f834d1bc143da0d697b38f6fbdced9f4403f680ba95933971d12',7,'2026-09-07 05:05:04',NULL,'2026-09-21 09:00:00','2026-09-21 17:00:00',60),(13,22,'2026-09-22','scheduled','9e0d73f82f1ef8d6d6186834adf3b24f945de37c2a09178c22f42dc775afe604',7,'2026-09-07 05:05:04',NULL,'2026-09-22 09:00:00','2026-09-22 17:00:00',60),(14,22,'2026-09-23','scheduled','7ec5cecef02a176eabd3a1234626729c4a676cec92766ce4e4300cd08659387d',7,'2026-09-07 05:05:04',NULL,'2026-09-23 09:00:00','2026-09-23 17:00:00',60),(15,22,'2026-09-24','scheduled','4760357ab9e639574da2d631fc81c64fe29d5ccba61a04d35cfaacc8cee111ae',7,'2026-09-07 05:05:04',NULL,'2026-09-24 09:00:00','2026-09-24 17:00:00',60),(16,22,'2026-09-25','scheduled','2d3c027f74589679272a54fc96cb2fe788032fe2860f13085e96592ddffa050f',7,'2026-09-07 05:05:04',NULL,'2026-09-25 09:00:00','2026-09-25 17:00:00',60),(17,22,'2026-09-26','scheduled','0b98c89bfcf292edd0ef89721fc03fd2dd546c27e2091aa10e6fd1a9ed389044',7,'2026-09-07 05:05:04',NULL,'2026-09-26 09:00:00','2026-09-26 17:00:00',60),(18,22,'2026-09-27','scheduled','5dece7a455b9d7cf7c305140dda2a09ed44c82011995afc2d5ad741cdd10b7ef',7,'2026-09-07 05:05:04',NULL,'2026-09-27 09:00:00','2026-09-27 17:00:00',60),(19,22,'2026-09-28','scheduled','377ed9c0813a9b20ec8a195c8ad261d294c8b69604715ab48aaf0d095381b700',7,'2026-09-07 05:05:04',NULL,'2026-09-28 09:00:00','2026-09-28 17:00:00',60),(20,22,'2026-09-29','scheduled','e52c05d72a30b41f9dc135d84e3da581b46ca001b998fdd4841d04905d6b480d',7,'2026-09-07 05:05:04',NULL,'2026-09-29 09:00:00','2026-09-29 17:00:00',60),(21,22,'2026-09-30','scheduled','af3a57d03eab260e51563fac6612fc5740a022f057461c1a8603012b8e7da09e',7,'2026-09-07 05:05:04',NULL,'2026-09-30 09:00:00','2026-09-30 17:00:00',60),(22,22,'2026-10-01','scheduled','ac538d8d4cd5ac0472d421150d5ccca2813945fa5440893fbde88b6d13edd293',7,'2026-09-07 05:05:04',NULL,'2026-10-01 09:00:00','2026-10-01 17:00:00',60),(23,22,'2026-10-02','scheduled','4784ee6c5c4242e5821f029fa2309bbc355c38e4869a544f4424f77185bd1836',7,'2026-09-07 05:05:04',NULL,'2026-10-02 09:00:00','2026-10-02 17:00:00',60),(24,22,'2026-10-03','scheduled','86d4ae6b79cc6868923935f1b925219a61cf0b1fee0d8009b7271cf576811861',7,'2026-09-07 05:05:04',NULL,'2026-10-03 09:00:00','2026-10-03 17:00:00',60),(25,22,'2026-10-04','scheduled','abcbf6891b4f80dca76f7bded85f40433c8d40287e0cb57e6fe95c8f984a7302',7,'2026-09-07 05:05:04',NULL,'2026-10-04 09:00:00','2026-10-04 17:00:00',60),(26,22,'2026-10-05','scheduled','3f8127472acd5496cb0f3efa5818950c74e07c904b48f632c5d00619b57d7dc1',7,'2026-09-07 05:05:04',NULL,'2026-10-05 09:00:00','2026-10-05 17:00:00',60),(27,22,'2026-10-06','scheduled','ee873a51df05db3225f65e500ee50f73a78699758120aa148a87fcc7787e46f5',7,'2026-09-07 05:05:04',NULL,'2026-10-06 09:00:00','2026-10-06 17:00:00',60),(28,23,'2026-09-22','scheduled','0ab2d5b13245d48f1fef44bbfef5d8f7ddb37404c7cb4a0f0571aa548cedda7a',7,'2026-09-07 05:29:39',NULL,'2026-09-22 10:00:00','2026-09-22 17:00:00',60),(29,23,'2026-09-23','scheduled','387a0050eeedfaa35b487aa90a43729006550aec725c7f026dbe3bf92ad33975',7,'2026-09-07 05:29:39',NULL,'2026-09-23 10:00:00','2026-09-23 17:00:00',60),(30,23,'2026-09-24','scheduled','2f51110de01cad25851095668d4afc1865d7294dc543e588209ccb055bf155d1',7,'2026-09-07 05:29:39',NULL,'2026-09-24 10:00:00','2026-09-24 17:00:00',60),(31,23,'2026-09-25','scheduled','3822e6e87f0c4bd008a77e5361c02b0c98f569a784aba9da5829ccca55607bee',7,'2026-09-07 05:29:39',NULL,'2026-09-25 10:00:00','2026-09-25 17:00:00',60),(32,23,'2026-09-26','scheduled','c72e4bc33b6de24e6cc937b3ac0c64858b1c5685b10160c5364cec422a541673',7,'2026-09-07 05:29:39',NULL,'2026-09-26 10:00:00','2026-09-26 17:00:00',60),(33,23,'2026-09-27','scheduled','c5b3219e9860dff9adfaef6af533e8bcb515841751432f6e405fa10e6b55dbf9',7,'2026-09-07 05:29:39',NULL,'2026-09-27 10:00:00','2026-09-27 17:00:00',60),(34,23,'2026-09-28','scheduled','78d691d8b1e5859ad9dcddea3e9fcdd095ced617a2f9213dcfe4ba4b4e50cad8',7,'2026-09-07 05:29:39',NULL,'2026-09-28 10:00:00','2026-09-28 17:00:00',60),(35,23,'2026-09-29','scheduled','41e44bcec878d7f121dfe5c2d4f984854b11abc7724f491e806103f849277b08',7,'2026-09-07 05:29:39',NULL,'2026-09-29 10:00:00','2026-09-29 17:00:00',60),(36,23,'2026-09-30','scheduled','267bdcb08c9a36c6fae9e72e96a5f1a1b2ffa8c647bb583caeffb4d0d001a2aa',7,'2026-09-07 05:29:39',NULL,'2026-09-30 10:00:00','2026-09-30 17:00:00',60),(64,24,'2026-09-16','scheduled','b026241ad9b56eba4c6548d1f9c7f7c4634879e4e2194b319dea8c2154207828',7,'2026-09-07 07:28:39',NULL,'2026-09-16 10:00:00','2026-09-16 17:00:00',60),(65,24,'2026-09-17','scheduled','06a1e87f624462ff6393323614ecc7dae3a32667b784fe235708c3205c0a4148',7,'2026-09-07 07:28:39',NULL,'2026-09-17 10:00:00','2026-09-17 17:00:00',60),(66,24,'2026-09-18','scheduled','f05c628589b27f0474f9139544432bc8ef60b5ecfbc1b6ec924af876d17988c9',7,'2026-09-07 07:28:39',NULL,'2026-09-18 10:00:00','2026-09-18 17:00:00',60),(67,24,'2026-09-19','scheduled','288b30dcfbf994bea1289cb18403c614c0ad2cedf35c562469b6a94db5ff6e70',7,'2026-09-07 07:28:39',NULL,'2026-09-19 10:00:00','2026-09-19 17:00:00',60),(68,24,'2026-09-20','scheduled','482755767c566b58430854904485a8a87ba233ad2b59fc951b50919cd7f75c35',7,'2026-09-07 07:28:39',NULL,'2026-09-20 10:00:00','2026-09-20 17:00:00',60),(69,24,'2026-09-21','scheduled','82422f21d1de6a673dfa1f0856166210f5d0c2acac2fdc2b6e1589cc4217fbcb',7,'2026-09-07 07:28:39',NULL,'2026-09-21 10:00:00','2026-09-21 17:00:00',60),(70,24,'2026-09-22','scheduled','475bf7663c3f484358d07b4cc6b01f6206de7094eaf5d7fad30e9c6cb9f1a8d9',7,'2026-09-07 07:28:39',NULL,'2026-09-22 10:00:00','2026-09-22 17:00:00',60),(71,24,'2026-09-23','scheduled','ca5d68ee164a69750c1a2c936d2f3431fa40a12811a01906c6076e17f22c3bbf',7,'2026-09-07 07:28:39',NULL,'2026-09-23 10:00:00','2026-09-23 17:00:00',60),(72,22,'2026-09-08','scheduled','c1dd95fbaa26781b36fd07a2eb43ac1b59efb70b07ec21a701bb6f24590b365c',7,'2026-09-08 00:31:35',NULL,'2026-09-08 09:00:00','2026-09-08 17:00:00',60),(73,22,'2026-09-09','scheduled','d8e06fe5f392c8cc2a0896a24969d74f8ccac1f82114f1aac557e9fba0a5d5ba',7,'2026-09-08 00:31:35',NULL,'2026-09-09 09:00:00','2026-09-09 17:00:00',60),(101,25,'2026-09-08','closed','629b790073f6e1b45c3f45754a99273d774f8c3be6920aa46ae01265b606503b',7,'2026-09-08 00:34:15','2026-09-08 09:48:00',NULL,NULL,60);
/*!40000 ALTER TABLE `market_checkin_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `market_checkins`
--

DROP TABLE IF EXISTS `market_checkins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `market_checkins` (
  `checkinId` int NOT NULL AUTO_INCREMENT,
  `sessionId` int NOT NULL,
  `marketId` int NOT NULL,
  `applicationId` int NOT NULL,
  `sellerId` bigint unsigned NOT NULL,
  `method` varchar(10) NOT NULL DEFAULT 'qr' COMMENT 'qr(스캔) | code(6자리 숫자) | manual(명단에서 직접)',
  `checkedBy` bigint unsigned DEFAULT NULL COMMENT '처리한 주최자 userId',
  `checkedInAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`checkinId`),
  UNIQUE KEY `uk_checkin_once` (`sessionId`,`applicationId`) COMMENT '같은 날 같은 부스를 두 번 찍어도 1건만 남습니다',
  KEY `idx_checkin_market_seller` (`marketId`,`sellerId`),
  KEY `fk_checkin_application` (`applicationId`),
  CONSTRAINT `fk_checkin_application` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE,
  CONSTRAINT `fk_checkin_session` FOREIGN KEY (`sessionId`) REFERENCES `market_checkin_sessions` (`sessionId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `market_checkins`
--

LOCK TABLES `market_checkins` WRITE;
/*!40000 ALTER TABLE `market_checkins` DISABLE KEYS */;
INSERT INTO `market_checkins` VALUES (1,101,25,34,8,'qr',7,'2026-09-08 00:35:00'),(2,101,25,35,8,'qr',7,'2026-09-08 00:35:00'),(3,101,25,36,8,'qr',7,'2026-09-08 00:35:00'),(4,101,25,37,8,'qr',7,'2026-09-08 00:35:00'),(5,101,25,38,8,'qr',7,'2026-09-08 00:35:00'),(6,101,25,39,8,'qr',7,'2026-09-08 00:35:00'),(7,101,25,40,8,'qr',7,'2026-09-08 00:35:00');
/*!40000 ALTER TABLE `market_checkins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `market_reviews`
--

DROP TABLE IF EXISTS `market_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `market_reviews` (
  `reviewId` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL COMMENT '평가 대상 부스 신청(승인된 건)',
  `marketId` int NOT NULL,
  `sellerId` bigint unsigned NOT NULL,
  `rating` tinyint NOT NULL COMMENT '0~5 사이의 별점',
  `comment` varchar(200) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reviewId`),
  UNIQUE KEY `uniq_application_review` (`applicationId`),
  KEY `marketId` (`marketId`),
  KEY `sellerId` (`sellerId`),
  CONSTRAINT `market_reviews_ibfk_1` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE,
  CONSTRAINT `market_reviews_ibfk_2` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE,
  CONSTRAINT `market_reviews_ibfk_3` FOREIGN KEY (`sellerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `chk_market_reviews_rating` CHECK ((`rating` between 0 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `market_reviews`
--

LOCK TABLES `market_reviews` WRITE;
/*!40000 ALTER TABLE `market_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `market_reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `markets`
--

DROP TABLE IF EXISTS `markets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `markets` (
  `marketId` int NOT NULL AUTO_INCREMENT,
  `hostId` bigint unsigned NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `marketImage` varchar(255) DEFAULT NULL,
  `locationName` varchar(255) NOT NULL,
  `region` varchar(50) DEFAULT NULL,
  `boothPrice` int NOT NULL DEFAULT '0',
  `latitude` float NOT NULL,
  `longitude` float NOT NULL,
  `isExpired` tinyint(1) DEFAULT '0',
  `maxParticipants` int NOT NULL DEFAULT '0' COMMENT 'count',
  `allowOvercapacity` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1이면 정원이 차도 행사 시작 전까지는 초과 신청/결제를 허용',
  `allowDuplicateApplication` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 같은 판매자가 이 마켓에 부스를 중복 신청할 수 없음 (기본값 1=허용)',
  `eventDate_min` date NOT NULL,
  `eventDate_max` date NOT NULL,
  `recruitmentDate_min` date DEFAULT NULL,
  `recruitmentDate_max` date DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `boothPrice_origin` int DEFAULT NULL,
  `cancelReasonCode` varchar(30) DEFAULT NULL COMMENT '취소 사유 코드 (weather/venue/low_signup/host_issue/safety/other)',
  `cancelReason` varchar(300) DEFAULT NULL COMMENT '취소 사유 문구. 목록에서 고른 문구 또는 기타 직접 입력',
  `cancelledAt` datetime DEFAULT NULL COMMENT '취소한 시각. 사유와 함께 기록으로 남습니다',
  `addressBase` varchar(255) DEFAULT NULL COMMENT '우편번호 검색으로 받은 도로명(지번) 주소',
  `addressDetail` varchar(255) DEFAULT NULL COMMENT '주최자가 직접 입력한 상세주소 (동/호수 등)',
  `postcode` varchar(10) DEFAULT NULL COMMENT '우편번호',
  PRIMARY KEY (`marketId`),
  KEY `hostId` (`hostId`),
  CONSTRAINT `markets_ibfk_1` FOREIGN KEY (`hostId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=28 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `markets`
--

LOCK TABLES `markets` WRITE;
/*!40000 ALTER TABLE `markets` DISABLE KEYS */;
INSERT INTO `markets` VALUES (21,7,'연남동 플리마켓','','/uploads/플리마켓 이미지1_1787877247096.png','서울 강남구 가로수길 5 12321호','서울',100000,37.5182,127.023,2,10,0,1,'2026-09-08','2026-09-16','2026-08-28','2026-09-02','2026-09-08 00:28:05',100000,'weather','기상 악화 (우천·강풍·폭염 등)','2026-09-04 09:08:31','서울 강남구 가로수길 5 12321호',NULL,NULL),(22,7,'강남대로 자동차 플리마켓','시작시간 09:00\n종료시간 18:00\n\n아침부터 시작합니다. 부스장비 전부 있습니다.','/uploads/수원 왕갈비 통닭_1788398572471.png','서울 강남구 강남대로 238 100호','서울',10000,37.485,127.035,0,1,1,1,'2026-09-08','2026-10-06','2026-09-01','2026-09-03','2026-09-08 00:28:05',10000,NULL,NULL,NULL,'서울 강남구 강남대로 238 100호',NULL,NULL),(23,7,'연남동 플리마켓','운영시간\n시작 10:00\n종료 18:00','/uploads/보성 녹차_1788754559591.jpg','충남 천안시 동남구 풍세면 가송로 89-110 1000','충남',10000,36.7308,127.131,2,18,1,1,'2026-09-08','2026-09-30','2026-09-07','2026-09-15','2026-09-08 00:28:05',10000,'weather','기상 악화 (우천·강풍·폭염 등) — 태풍이 불어서 개최를 안합니다.','2026-09-07 14:31:15','충남 천안시 동남구 풍세면 가송로 89-110 1000',NULL,NULL),(24,7,'강남 불법무기 플리마켓','운영시간 \n시작시간 10:00\n종료시간 18:00','/uploads/총기류_1788829443118.jpg','서울 서초구 강남대로 231-2 1235 1500','서울',1000,37.4841,127.034,0,6,0,1,'2026-09-07','2026-09-20','2026-09-04','2026-09-06','2026-09-08 01:04:03',1000,NULL,NULL,NULL,'서울 서초구 강남대로 231-2 1235','1500',NULL),(25,7,'제주 한라봉 플리마켓','오픈시간 10:00\n마감시간 18:00','/uploads/한라봉 플리마켓_1788829530476.png','광주광역시 남구 제중로 11 여기는 저장이 됩니다.','광주',3000,35.1362,126.914,0,6,1,1,'2026-09-07','2026-09-13','2026-08-27','2026-09-06','2026-09-08 01:05:30',3000,NULL,NULL,NULL,'광주광역시 남구 제중로 11','여기는 저장이 됩니다.','61664'),(26,7,'서초구 플리마켓','서초구 플리마켓\n\n오픈시간 10:00\n종료시간 17:00',NULL,'서울 서초구 강남대로 45-2 서초구','서울',10000,37.4686,127.04,0,1,0,1,'2026-09-08','2026-09-16','2026-09-06','2026-09-08','2026-09-08 00:28:05',10000,NULL,NULL,NULL,'서울 서초구 강남대로 45-2','서초구','06774'),(27,8,'부산 어묵 플리마켓','운영시간 \n10:00\n18:00',NULL,'충남 서산시 음암면 서령로 320-49 1200','충남',10000,36.8017,126.48,0,50,1,1,'2026-09-23','2026-09-23','2026-09-08','2026-09-16','2026-09-08 01:55:41',10000,NULL,NULL,NULL,'충남 서산시 음암면 서령로 320-49','1200','31938');
/*!40000 ALTER TABLE `markets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_regions`
--

DROP TABLE IF EXISTS `notification_regions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_regions` (
  `regionId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `region` varchar(50) NOT NULL COMMENT '알림 받을 지역명. 행이 없으면 모든 지역',
  PRIMARY KEY (`regionId`),
  UNIQUE KEY `uk_user_region` (`userId`,`region`),
  CONSTRAINT `fk_notif_region_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_regions`
--

LOCK TABLES `notification_regions` WRITE;
/*!40000 ALTER TABLE `notification_regions` DISABLE KEYS */;
INSERT INTO `notification_regions` VALUES (2,7,'서울');
/*!40000 ALTER TABLE `notification_regions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_sent_log`
--

DROP TABLE IF EXISTS `notification_sent_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_sent_log` (
  `logId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `kind` varchar(40) NOT NULL COMMENT '예약 알림 종류 (recruit_closing / payment_due)',
  `targetType` varchar(20) NOT NULL COMMENT 'market | application',
  `targetId` int NOT NULL,
  `sentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`logId`),
  UNIQUE KEY `uk_sent_once` (`userId`,`kind`,`targetType`,`targetId`) COMMENT '같은 대상에 같은 알림은 한 번만',
  KEY `idx_sent_at` (`sentAt`)
) ENGINE=InnoDB AUTO_INCREMENT=29 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_sent_log`
--

LOCK TABLES `notification_sent_log` WRITE;
/*!40000 ALTER TABLE `notification_sent_log` DISABLE KEYS */;
INSERT INTO `notification_sent_log` VALUES (1,7,'recruit_closing','market',25,'2026-09-07 07:47:48'),(2,8,'recruit_closing','market',26,'2026-09-07 08:21:33'),(3,7,'recruit_closing','market',26,'2026-09-07 08:21:33'),(28,7,'recruit_closing','market',24,'2026-09-07 23:57:55');
/*!40000 ALTER TABLE `notification_sent_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_settings`
--

DROP TABLE IF EXISTS `notification_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_settings` (
  `settingId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `category` varchar(40) NOT NULL COMMENT '알림 묶음 (application/payment/comment/market_change/new_market/deadline)',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 이 묶음의 알림을 받지 않음',
  `leadHours` int NOT NULL DEFAULT '1' COMMENT '마감 몇 시간 전에 알릴지 (1~24). deadline 묶음에서만 사용',
  `notifyHour` int NOT NULL DEFAULT '10' COMMENT '이 시각(0~23)에 통지. attendance 묶음에서만 사용',
  `role` varchar(10) NOT NULL DEFAULT 'seller' COMMENT '이 설정이 적용되는 역할 (host = 주최자 알림, seller = 판매자 알림)',
  PRIMARY KEY (`settingId`),
  UNIQUE KEY `uk_user_role_category` (`userId`,`role`,`category`),
  CONSTRAINT `fk_notif_setting_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_settings`
--

LOCK TABLES `notification_settings` WRITE;
/*!40000 ALTER TABLE `notification_settings` DISABLE KEYS */;
INSERT INTO `notification_settings` VALUES (1,7,'application',1,1,10,'seller'),(2,7,'payment',1,1,10,'seller'),(3,7,'comment',1,1,10,'seller'),(4,7,'deadline',1,1,10,'seller'),(5,7,'attendance',1,1,10,'seller'),(6,7,'new_market',1,1,10,'seller'),(7,7,'application',1,1,10,'host'),(8,7,'payment',1,1,10,'host'),(9,7,'comment',1,1,10,'host'),(10,7,'deadline',1,1,10,'host'),(11,7,'attendance',1,1,10,'host'),(12,7,'new_market',1,1,10,'host'),(14,7,'host_application',1,1,10,'host'),(15,7,'host_payment',1,1,10,'host'),(16,7,'host_comment',1,1,10,'host'),(17,7,'seller_application',1,1,10,'seller'),(18,7,'seller_payment',1,1,10,'seller'),(19,7,'seller_comment',1,1,10,'seller'),(20,7,'seller_deadline',1,1,10,'seller'),(21,7,'seller_attendance',1,1,10,'seller'),(22,7,'seller_new_market',1,1,10,'seller');
/*!40000 ALTER TABLE `notification_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notificationId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL COMMENT '알림을 받는 사람',
  `audience` enum('host','seller') NOT NULL COMMENT '클릭 시 이동할 화면 (host=내 마켓 관리, seller=내 부스 관리)',
  `type` varchar(40) NOT NULL COMMENT '알림 종류 (application_received, payment_completed 등)',
  `title` varchar(100) NOT NULL,
  `message` varchar(255) NOT NULL,
  `marketId` int DEFAULT NULL,
  `applicationId` int DEFAULT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notificationId`),
  KEY `idx_user_created` (`userId`,`createdAt`),
  KEY `idx_user_unread` (`userId`,`isRead`),
  KEY `notifications_ibfk_2` (`marketId`),
  KEY `notifications_ibfk_3` (`applicationId`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE SET NULL,
  CONSTRAINT `notifications_ibfk_3` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=231 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (134,7,'host','application_received','새 부스 신청','\"강남대로 자동차 플리마켓\" 마켓 11번 부스에 새로운 신청이 도착했습니다. (민지팝니다.)',22,26,1,'2026-09-04 00:10:59'),(135,7,'host','application_received','새 부스 신청','\"강남대로 자동차 플리마켓\" 마켓 2번 부스에 새로운 신청이 도착했습니다. (모든 무기팝니다.)',22,27,1,'2026-09-04 00:11:35'),(136,8,'seller','application_duplicate','같은 마켓 중복 신청','\"강남대로 자동차 플리마켓\" 마켓에 총 2건 신청 중입니다. (11번, 2번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',22,27,1,'2026-09-04 00:11:35'),(137,7,'host','application_duplicate','중복 부스 신청','\"강남대로 자동차 플리마켓\" 마켓에 test2 판매자가 부스 2건을 신청했습니다. (11번, 2번)',22,27,1,'2026-09-04 00:11:35'),(138,7,'host','application_received','새 부스 신청','\"강남대로 자동차 플리마켓\" 마켓 3번 부스에 새로운 신청이 도착했습니다. (크레이모어 팝니다.)',22,28,1,'2026-09-04 00:12:11'),(139,8,'seller','application_duplicate','같은 마켓 중복 신청','\"강남대로 자동차 플리마켓\" 마켓에 총 3건 신청 중입니다. (11번, 2번, 3번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',22,28,1,'2026-09-04 00:12:11'),(140,7,'host','application_duplicate','중복 부스 신청','\"강남대로 자동차 플리마켓\" 마켓에 test2 판매자가 부스 3건을 신청했습니다. (11번, 2번, 3번)',22,28,1,'2026-09-04 00:12:11'),(141,8,'seller','application_approved','부스 신청 승인','\"강남대로 자동차 플리마켓\" 마켓 3번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (크레이모어 팝니다.)',22,28,1,'2026-09-04 02:57:34'),(142,8,'seller','application_rejected','부스 신청 반려','\"강남대로 자동차 플리마켓\" 마켓 2번 부스 신청이 반려되었습니다. (모든 무기팝니다.)',22,27,1,'2026-09-04 02:57:38'),(143,8,'seller','application_approved','부스 신청 승인','\"강남대로 자동차 플리마켓\" 마켓 11번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지팝니다.)',22,26,1,'2026-09-04 02:57:41'),(144,7,'host','payment_completed','부스 결제 완료','\"강남대로 자동차 플리마켓\" 마켓 3번 부스(크레이모어 팝니다.) 결제가 완료되었습니다. (10,000원)',22,28,1,'2026-09-04 08:08:03'),(145,7,'host','payment_completed','부스 결제 완료','\"강남대로 자동차 플리마켓\" 마켓 11번 부스(민지팝니다.) 결제가 완료되었습니다. (10,000원)',22,26,1,'2026-09-04 08:08:31'),(146,8,'seller','refund_completed','환불 완료','\"강남대로 자동차 플리마켓\" 마켓 3번 부스(크레이모어 팝니다.) 환불이 완료되었습니다. (10,000원)',22,28,1,'2026-09-04 08:09:12'),(147,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「강남대로 자동차 플리마켓」 행사 시작일 2026-09-23 → 2026-09-11 · 행사 종료일 2026-09-30 → 2026-10-07',22,NULL,1,'2026-09-04 08:30:55'),(148,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「강남대로 자동차 플리마켓」 행사 시작일 2026-09-11 → 2026-09-10 · 행사 종료일 2026-10-07 → 2026-10-06',22,NULL,1,'2026-09-04 08:31:12'),(149,8,'seller','new_market','관심 지역에 새 마켓이 열렸어요','「연남동 플리마켓」 · 2026-09-22 ~ 2026-09-30 · 충남 천안시 동남구 풍세면 가송로 89-110 1000',23,NULL,1,'2026-09-07 04:15:59'),(150,7,'host','application_received','새 부스 신청','\"연남동 플리마켓\" 마켓 1번 부스에 새로운 신청이 도착했습니다. (k2 소총)',23,29,1,'2026-09-07 04:17:07'),(151,8,'seller','application_approved','부스 신청 승인','\"연남동 플리마켓\" 마켓 1번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (k2 소총)',23,29,1,'2026-09-07 05:02:37'),(152,7,'host','application_received','새 부스 신청','\"연남동 플리마켓\" 마켓 2번 부스에 새로운 신청이 도착했습니다. (고양이)',23,30,1,'2026-09-07 05:02:54'),(153,8,'seller','application_duplicate','같은 마켓 중복 신청','\"연남동 플리마켓\" 마켓에 총 2건 신청 중입니다. (1번, 2번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',23,30,1,'2026-09-07 05:02:54'),(154,7,'host','application_duplicate','중복 부스 신청','\"연남동 플리마켓\" 마켓에 test2 판매자가 부스 2건을 신청했습니다. (1번, 2번)',23,30,1,'2026-09-07 05:02:54'),(155,8,'seller','application_approved','부스 신청 승인','\"연남동 플리마켓\" 마켓 2번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (고양이)',23,30,1,'2026-09-07 05:03:02'),(156,7,'host','payment_completed','부스 결제 완료','\"연남동 플리마켓\" 마켓 2번 부스(고양이) 결제가 완료되었습니다. (10,000원)',23,30,1,'2026-09-07 05:03:52'),(157,7,'host','payment_completed','부스 결제 완료','\"연남동 플리마켓\" 마켓 1번 부스(k2 소총) 결제가 완료되었습니다. (10,000원)',23,29,1,'2026-09-07 05:04:19'),(158,7,'host','refund_requested','환불 요청','\"연남동 플리마켓\" 마켓 2번 부스(고양이)에 환불 요청이 접수되었습니다. (예정 금액: 10,000원)',23,30,1,'2026-09-07 05:05:55'),(159,8,'seller','market_cancelled','참가 예정 마켓이 취소됐어요','「연남동 플리마켓」이(가) 취소됐어요. 사유: 기상 악화 (우천·강풍·폭염 등) — 태풍이 불어서 개최를 안합니다. · 결제하신 20,000원은 전액 환불됩니다.',23,29,1,'2026-09-07 05:31:18'),(160,8,'seller','new_market','관심 지역에 새 마켓이 열렸어요','「강남 플리마켓」 · 2026-09-16 ~ 2026-09-23 · 서울 서초구 강남대로 231-2 1235',24,NULL,0,'2026-09-07 05:51:36'),(161,7,'host','application_received','새 부스 신청','\"강남 플리마켓\" 마켓 1번 부스에 새로운 신청이 도착했습니다. (M60 기관총)',24,31,1,'2026-09-07 05:52:26'),(162,7,'host','application_received','새 부스 신청','\"강남 플리마켓\" 마켓 2번 부스에 새로운 신청이 도착했습니다. (M1A 소총)',24,32,1,'2026-09-07 05:52:52'),(163,8,'seller','application_duplicate','같은 마켓 중복 신청','\"강남 플리마켓\" 마켓에 총 2건 신청 중입니다. (1번, 2번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',24,32,0,'2026-09-07 05:52:52'),(164,7,'host','application_duplicate','중복 부스 신청','\"강남 플리마켓\" 마켓에 test2 판매자가 부스 2건을 신청했습니다. (1번, 2번)',24,32,1,'2026-09-07 05:52:52'),(165,7,'host','application_received','새 부스 신청','\"강남 플리마켓\" 마켓 3번 부스에 새로운 신청이 도착했습니다. (크레모어 팝니다.)',24,33,1,'2026-09-07 05:53:21'),(166,8,'seller','application_duplicate','같은 마켓 중복 신청','\"강남 플리마켓\" 마켓에 총 3건 신청 중입니다. (1번, 2번, 3번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',24,33,0,'2026-09-07 05:53:21'),(167,7,'host','application_duplicate','중복 부스 신청','\"강남 플리마켓\" 마켓에 test2 판매자가 부스 3건을 신청했습니다. (1번, 2번, 3번)',24,33,1,'2026-09-07 05:53:21'),(168,8,'seller','application_approved','부스 신청 승인','\"강남 플리마켓\" 마켓 3번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (크레모어 팝니다.)',24,33,0,'2026-09-07 05:54:18'),(169,8,'seller','application_approved','부스 신청 승인','\"강남 플리마켓\" 마켓 2번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (M1A 소총)',24,32,0,'2026-09-07 05:54:18'),(170,8,'seller','application_approved','부스 신청 승인','\"강남 플리마켓\" 마켓 1번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (M60 기관총)',24,31,0,'2026-09-07 05:54:18'),(171,7,'host','payment_completed','부스 결제 완료','\"강남 플리마켓\" 마켓 3번 부스(크레모어 팝니다.) 결제가 완료되었습니다. (1,000원)',24,33,1,'2026-09-07 05:55:03'),(172,7,'host','payment_completed','부스 결제 완료','\"강남 플리마켓\" 마켓 2번 부스(M1A 소총) 결제가 완료되었습니다. (1,000원)',24,32,1,'2026-09-07 05:55:29'),(173,7,'host','payment_completed','부스 결제 완료','\"강남 플리마켓\" 마켓 1번 부스(M60 기관총) 결제가 완료되었습니다. (1,000원)',24,31,1,'2026-09-07 05:55:54'),(174,8,'seller','refund_completed','환불 완료','\"강남 플리마켓\" 마켓 3번 부스(크레모어 팝니다.) 환불이 완료되었습니다. (1,000원)',24,33,0,'2026-09-07 07:14:14'),(175,8,'seller','refund_completed','환불 완료','\"강남 플리마켓\" 마켓 2번 부스(M1A 소총) 환불이 완료되었습니다. (1,000원)',24,32,0,'2026-09-07 07:14:14'),(176,7,'host','comment_reply_received','댓글에 답글이 달렸습니다','\"강남 플리마켓\" 마켓에서 test2님이 회원님의 댓글에 답글을 남겼습니다. (뭐가 좋나요?)',24,NULL,1,'2026-09-07 07:27:54'),(177,8,'seller','new_market','관심 지역에 새 마켓이 열렸어요','「제주 한라봉 플리마켓」 · 2026-09-15 ~ 2026-09-22 · 제주특별자치도 서귀포시 가가로 15',25,NULL,0,'2026-09-07 07:44:38'),(178,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 1번 부스에 새로운 신청이 도착했습니다. (고양이)',25,34,1,'2026-09-07 07:45:10'),(179,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 2번 부스에 새로운 신청이 도착했습니다. (민지)',25,35,1,'2026-09-07 07:45:32'),(180,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 2건 신청 중입니다. (1번, 2번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,35,0,'2026-09-07 07:45:32'),(181,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 2건을 신청했습니다. (1번, 2번)',25,35,1,'2026-09-07 07:45:32'),(182,7,'seller','recruit_closing','모집 마감 하루 전이에요','「제주 한라봉 플리마켓」 부스 모집이 2026-09-08에 마감돼요. 신청하시려면 서둘러 주세요.',25,NULL,1,'2026-09-07 07:47:48'),(183,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-15 → 2026-09-14 · 행사 종료일 2026-09-22 → 2026-09-21 · 장소 제주특별자치도 서귀포시 가가로 15 → 제주특별자치도 서귀포시 가가로 15 1000',25,NULL,0,'2026-09-07 07:50:29'),(184,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 3번 부스에 새로운 신청이 도착했습니다. (민지 무기)',25,36,1,'2026-09-07 07:53:47'),(185,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 3건 신청 중입니다. (1번, 2번, 3번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,36,0,'2026-09-07 07:53:47'),(186,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 3건을 신청했습니다. (1번, 2번, 3번)',25,36,1,'2026-09-07 07:53:47'),(187,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 4번 부스에 새로운 신청이 도착했습니다. (민지 무기)',25,37,1,'2026-09-07 07:54:14'),(188,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 4건 신청 중입니다. (1번, 2번, 3번, 4번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,37,0,'2026-09-07 07:54:14'),(189,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 4건을 신청했습니다. (1번, 2번, 3번, 4번)',25,37,1,'2026-09-07 07:54:14'),(190,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 5번 부스에 새로운 신청이 도착했습니다. (민지 소품)',25,38,1,'2026-09-07 07:54:33'),(191,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 5건 신청 중입니다. (1번, 2번, 3번, 4번, 5번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,38,0,'2026-09-07 07:54:33'),(192,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 5건을 신청했습니다. (1번, 2번, 3번, 4번, 5번)',25,38,1,'2026-09-07 07:54:33'),(193,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 6번 부스에 새로운 신청이 도착했습니다. (민지 소품샾)',25,39,1,'2026-09-07 07:54:51'),(194,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 6건 신청 중입니다. (1번, 2번, 3번, 4번, 5번 외 1건) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,39,0,'2026-09-07 07:54:51'),(195,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 6건을 신청했습니다. (1번, 2번, 3번, 4번, 5번 외 1건)',25,39,1,'2026-09-07 07:54:51'),(196,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-14 → 2026-09-13 · 행사 종료일 2026-09-21 → 2026-09-20 · 장소 제주특별자치도 서귀포시 가가로 15 1000 → 제주특별자치도 서귀포시 가가로 15 1000 100',25,NULL,0,'2026-09-07 07:55:45'),(197,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-13 → 2026-09-12 · 행사 종료일 2026-09-20 → 2026-09-19 · 장소 제주특별자치도 서귀포시 가가로 15 1000 100 → 제주특별자치도 서귀포시 가가로 15 1000 100 1500',25,NULL,0,'2026-09-07 07:56:07'),(198,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-12 → 2026-09-11 · 행사 종료일 2026-09-19 → 2026-09-18 · 장소 제주특별자치도 서귀포시 가가로 15 1000 100 1500 → 제주특별자치도 서귀포시 가가로 15 1000 100 1500 여기가 저장이 안되고 있음',25,NULL,0,'2026-09-07 08:07:58'),(199,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-11 → 2026-09-10 · 행사 종료일 2026-09-18 → 2026-09-17',25,NULL,0,'2026-09-07 08:09:16'),(200,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-10 → 2026-09-14 · 행사 종료일 2026-09-17 → 2026-09-16',25,NULL,0,'2026-09-07 08:10:16'),(201,7,'host','application_received','새 부스 신청','\"제주 한라봉 플리마켓\" 마켓 12번 부스에 새로운 신청이 도착했습니다. (m1a1 소총 팝니다.)',25,40,1,'2026-09-07 08:10:53'),(202,8,'seller','application_duplicate','같은 마켓 중복 신청','\"제주 한라봉 플리마켓\" 마켓에 총 7건 신청 중입니다. (1번, 2번, 3번, 4번, 5번 외 2건) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',25,40,0,'2026-09-07 08:10:53'),(203,7,'host','application_duplicate','중복 부스 신청','\"제주 한라봉 플리마켓\" 마켓에 test2 판매자가 부스 7건을 신청했습니다. (1번, 2번, 3번, 4번, 5번 외 2건)',25,40,1,'2026-09-07 08:10:53'),(204,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-14 → 2026-09-13 · 행사 종료일 2026-09-16 → 2026-09-15 · 장소 제주특별자치도 서귀포시 가가로 15 1000 100 1500 여기가 저장이 안되고 있음 → 제주특별자치도 서귀포시 가가로 15 1000 100 1500 여기가 저장이 안되고 있음 여기는 저장이 됩니다.',25,NULL,0,'2026-09-07 08:16:44'),(205,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-13 → 2026-09-12 · 행사 종료일 2026-09-15 → 2026-09-14 · 장소 제주특별자치도 서귀포시 가가로 15 1000 100 1500 여기가 저장이 안되고 있음 여기는 저장이 됩니다. → 제주특별자치도 서귀포시 가가로 14 여기는 저장이 됩니다.',25,NULL,0,'2026-09-07 08:17:07'),(206,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-12 → 2026-09-11 · 행사 종료일 2026-09-14 → 2026-09-13 · 장소 제주특별자치도 서귀포시 가가로 14 여기는 저장이 됩니다. → 전남광주통합특별시 남구 제중로 11 여기는 저장이 됩니다.',25,NULL,0,'2026-09-07 08:17:28'),(207,8,'seller','new_market','관심 지역에 새 마켓이 열렸어요','「서초구 플리마켓」 · 2026-09-16 ~ 2026-09-17 · 서울 서초구 강남대로 45-2 서초구',26,NULL,0,'2026-09-07 08:19:19'),(208,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-11 → 2026-09-14 · 행사 종료일 2026-09-13 → 2026-09-14',25,NULL,0,'2026-09-07 08:20:05'),(209,8,'seller','recruit_closing','모집 마감 하루 전이에요','「서초구 플리마켓」 부스 모집이 2026-09-08에 마감돼요. 신청하시려면 서둘러 주세요.',26,NULL,0,'2026-09-07 08:21:33'),(210,7,'seller','recruit_closing','모집 마감 하루 전이에요','「서초구 플리마켓」 부스 모집이 2026-09-08에 마감돼요. 신청하시려면 서둘러 주세요.',26,NULL,1,'2026-09-07 08:21:33'),(211,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 12번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (m1a1 소총 팝니다.)',25,40,0,'2026-09-07 08:37:52'),(212,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 6번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지 소품샾)',25,39,0,'2026-09-07 08:37:52'),(213,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 5번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지 소품)',25,38,0,'2026-09-07 08:37:52'),(214,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 4번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지 무기)',25,37,0,'2026-09-07 08:37:52'),(215,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 2번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지)',25,35,0,'2026-09-07 08:37:52'),(216,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 3번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지 무기)',25,36,0,'2026-09-07 08:37:52'),(217,8,'seller','application_approved','부스 신청 승인','\"제주 한라봉 플리마켓\" 마켓 1번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (고양이)',25,34,0,'2026-09-07 08:37:52'),(218,7,'seller','recruit_closing','모집 마감 하루 전이에요','「강남 플리마켓」 부스 모집이 2026-09-09에 마감돼요. 신청하시려면 서둘러 주세요.',24,NULL,1,'2026-09-07 23:57:55'),(219,7,'host','application_received','새 부스 신청','\"강남 플리마켓\" 마켓 33번 부스에 새로운 신청이 도착했습니다. (박격포 80mm)',24,41,1,'2026-09-08 00:01:24'),(220,8,'seller','application_duplicate','같은 마켓 중복 신청','\"강남 플리마켓\" 마켓에 총 2건 신청 중입니다. (1번, 33번) 실수로 여러 번 신청한 게 아닌지 확인해 주세요.',24,41,0,'2026-09-08 00:01:24'),(221,7,'host','application_duplicate','중복 부스 신청','\"강남 플리마켓\" 마켓에 test2 판매자가 부스 2건을 신청했습니다. (1번, 33번)',24,41,1,'2026-09-08 00:01:24'),(222,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「강남 플리마켓」 행사 시작일 2026-09-16 → 2026-09-15 · 행사 종료일 2026-09-23 → 2026-09-22 · 장소 서울 서초구 강남대로 231-2 1235 → 서울 서초구 강남대로 231-2 1235 1500',24,NULL,0,'2026-09-08 00:02:46'),(223,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「강남 불법무기 플리마켓」 행사 시작일 2026-09-15 → 2026-09-14 · 행사 종료일 2026-09-22 → 2026-09-21',24,NULL,0,'2026-09-08 00:24:27'),(224,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「강남 불법무기 플리마켓」 행사 시작일 2026-09-08 → 2026-09-07 · 행사 종료일 2026-09-21 → 2026-09-20',24,NULL,0,'2026-09-08 01:04:03'),(225,8,'seller','market_changed','참가 예정 마켓 정보가 바뀌었어요','「제주 한라봉 플리마켓」 행사 시작일 2026-09-08 → 2026-09-07 · 행사 종료일 2026-09-14 → 2026-09-13',25,NULL,0,'2026-09-08 01:05:30'),(226,7,'host','payment_completed','부스 결제 완료','\"제주 한라봉 플리마켓\" 마켓 12번 부스(m1a1 소총 팝니다.) 결제가 완료되었습니다. (3,000원)',25,40,0,'2026-09-08 01:13:58'),(227,7,'host','payment_completed','부스 결제 완료','\"제주 한라봉 플리마켓\" 마켓 6번 부스(민지 소품샾) 결제가 완료되었습니다. (3,000원)',25,39,0,'2026-09-08 01:35:37'),(228,8,'host','application_received','새 부스 신청','\"부산 어묵 플리마켓\" 마켓 1번 부스에 새로운 신청이 도착했습니다. (민지네 소품)',27,42,0,'2026-09-08 01:56:12'),(229,7,'seller','application_approved','부스 신청 승인','\"부산 어묵 플리마켓\" 마켓 1번 부스 신청이 승인되었습니다. 기한 내에 결제를 완료해 주세요. (민지네 소품)',27,42,0,'2026-09-08 01:56:18'),(230,8,'host','payment_completed','부스 결제 완료','\"부산 어묵 플리마켓\" 마켓 1번 부스(민지네 소품) 결제가 완료되었습니다. (10,000원)',27,42,0,'2026-09-08 01:56:50');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payments`
--

DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `paymentId` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `amount` int NOT NULL DEFAULT '0',
  `status` varchar(20) NOT NULL DEFAULT 'Pending',
  `paymentKey` varchar(255) DEFAULT NULL,
  `paidAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `refundReason` varchar(255) DEFAULT NULL,
  `refundAmount` int DEFAULT NULL,
  PRIMARY KEY (`paymentId`),
  KEY `applicationId` (`applicationId`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=32 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payments`
--

LOCK TABLES `payments` WRITE;
/*!40000 ALTER TABLE `payments` DISABLE KEYS */;
INSERT INTO `payments` VALUES (22,28,10000,'Refunded','application-28-1788509244434','2026-09-04 08:08:03','오지마세요',NULL),(23,26,10000,'Paid','application-26-1788509290249','2026-09-04 08:08:30',NULL,NULL),(24,30,10000,'Canceled','application-30-1788757407751','2026-09-07 05:03:52','마켓 취소: 기상 악화 (우천·강풍·폭염 등) — 태풍이 불어서 개최를 안합니다.',10000),(25,29,10000,'Canceled','application-29-1788757442263','2026-09-07 05:04:19','마켓 취소: 기상 악화 (우천·강풍·폭염 등) — 태풍이 불어서 개최를 안합니다.',10000),(26,33,1000,'Refunded','application-33-1788760487710','2026-09-07 05:55:03','주최자 요청에 의한 일괄 환불',NULL),(27,32,1000,'Refunded','application-32-1788760507813','2026-09-07 05:55:29','주최자 요청에 의한 일괄 환불',NULL),(28,31,1000,'Paid','application-31-1788760533277','2026-09-07 05:55:54',NULL,NULL),(29,40,3000,'Paid','application-40-1788829990576','2026-09-08 01:13:58',NULL,NULL),(30,39,3000,'Paid','application-39-1788831290343','2026-09-08 01:35:37',NULL,NULL),(31,42,10000,'Paid','application-42-1788832585206','2026-09-08 01:56:50',NULL,NULL);
/*!40000 ALTER TABLE `payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `seller_reviews`
--

DROP TABLE IF EXISTS `seller_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `seller_reviews` (
  `reviewId` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL COMMENT '평가 대상 부스 신청(승인+결제완료 건)',
  `marketId` int NOT NULL,
  `sellerId` bigint unsigned NOT NULL COMMENT '평가받는 판매자',
  `hostId` bigint unsigned NOT NULL COMMENT '평가하는 주최자',
  `rating` tinyint NOT NULL COMMENT '0~5 사이의 별점',
  `comment` varchar(200) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reviewId`),
  UNIQUE KEY `uniq_application_seller_review` (`applicationId`),
  KEY `marketId` (`marketId`),
  KEY `sellerId` (`sellerId`),
  KEY `seller_reviews_ibfk_4` (`hostId`),
  CONSTRAINT `seller_reviews_ibfk_1` FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE,
  CONSTRAINT `seller_reviews_ibfk_2` FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE,
  CONSTRAINT `seller_reviews_ibfk_3` FOREIGN KEY (`sellerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `seller_reviews_ibfk_4` FOREIGN KEY (`hostId`) REFERENCES `users` (`userId`) ON DELETE CASCADE,
  CONSTRAINT `chk_seller_reviews_rating` CHECK ((`rating` between 0 and 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `seller_reviews`
--

LOCK TABLES `seller_reviews` WRITE;
/*!40000 ALTER TABLE `seller_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `seller_reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `userId` bigint unsigned NOT NULL AUTO_INCREMENT,
  `userType` tinyint NOT NULL COMMENT '0: 판매자, 1: 주최자',
  `nickname` varchar(30) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `email` varchar(100) NOT NULL,
  `region` varchar(50) NOT NULL,
  `profileImage` varchar(255) DEFAULT NULL,
  `introText` varchar(150) DEFAULT NULL,
  `bioText` text,
  `bioImage` varchar(255) DEFAULT NULL,
  `activeRole` varchar(10) DEFAULT NULL,
  PRIMARY KEY (`userId`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `nickname` (`nickname`),
  UNIQUE KEY `nickname_2` (`nickname`),
  UNIQUE KEY `nickname_3` (`nickname`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (7,1,'테스트','$2b$10$NsEH2PABp.96E8duzEAC9eRqL6rPdgOszHessrlSn4GcUr7MAzv/2','010-1111-1111','test9@test.com','경기도 서울특별시 강남구','/uploads/7/cat-mascot-feline_24877-83979_1787877150784.jpg','나는나의 라임 오렌지 나무',NULL,NULL,'host'),(8,1,'test2','$2b$10$ikwLc4vf82MlSpmWCI1V7.QQ8seNziTo0ppmAaxHKg/82LbQqdo32','010-5222-1124','test8@test.com','경기도 파주시','/uploads/8/docker_logo_1788480606524.png','야호 야호',NULL,NULL,'host');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-08 12:15:12
