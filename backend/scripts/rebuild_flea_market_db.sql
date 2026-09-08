-- =====================================================================
-- flea_market_db 전체 재생성 스크립트 (구조만, 데이터 없음)
--   기존 flea_market_db 를 통째로 삭제하고 최신 스키마로 다시 만듭니다.
--   ⚠️ 실행하면 flea_market_db 안의 모든 데이터가 사라집니다.
--   실행:  mysql -u root -p < rebuild_flea_market_db.sql
-- =====================================================================

DROP DATABASE IF EXISTS `flea_market_db`;

CREATE DATABASE  IF NOT EXISTS `flea_market_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `flea_market_db`;
-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: flea_market_db2
-- ------------------------------------------------------
-- Server version	8.4.10

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
  CONSTRAINT `applications_ibfk_2` FOREIGN KEY (`sellerId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
  `addressBase` varchar(255) DEFAULT NULL COMMENT '우편번호 검색으로 받은 도로명(지번) 주소',
  `addressDetail` varchar(255) DEFAULT NULL COMMENT '주최자가 직접 입력한 상세주소 (동/호수 등)',
  `postcode` varchar(10) DEFAULT NULL COMMENT '우편번호',
  `region` varchar(50) DEFAULT NULL,
  `boothPrice` int NOT NULL DEFAULT '0',
  `latitude` float NOT NULL,
  `longitude` float NOT NULL,
  `isExpired` tinyint(1) DEFAULT '0',
  `maxParticipants` int NOT NULL DEFAULT '0' COMMENT 'count',
  `allowOvercapacity` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1이면 정원이 차도 행사 시작 전까지는 초과 신청/결제를 허용',
  `allowDuplicateApplication` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 같은 판매자가 이 마켓에 부스를 중복 신청할 수 없음 (기본값 1=허용)',
  `cancelReasonCode` varchar(30) DEFAULT NULL COMMENT '취소 사유 코드 (weather/venue/low_signup/host_issue/safety/other)',
  `cancelReason` varchar(300) DEFAULT NULL COMMENT '취소 사유 문구. 목록에서 고른 문구 또는 기타 직접 입력',
  `cancelledAt` datetime DEFAULT NULL COMMENT '취소한 시각. 사유와 함께 기록으로 남습니다',
  `eventDate_min` date NOT NULL,
  `eventDate_max` date NOT NULL,
  `recruitmentDate_min` date DEFAULT NULL,
  `recruitmentDate_max` date DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `boothPrice_origin` int DEFAULT NULL,
  PRIMARY KEY (`marketId`),
  KEY `hostId` (`hostId`),
  CONSTRAINT `markets_ibfk_1` FOREIGN KEY (`hostId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-28  8:42:18

-- =====================================================================
-- ⚠️ 여기서부터는 mysqldump 가 만든 부분이 아니라 사람이 덧붙인 영역입니다.
--
--   위쪽 덤프 구간은 테이블마다 `SET character_set_client = utf8mb4` 로 감싸고
--   끝나면 원래 값으로 되돌립니다. 그래서 이 아래부터는 접속 기본 문자셋으로 돌아가 있고,
--   클라이언트가 utf8mb4 로 접속하지 않았으면 한글 COMMENT 가 깨진 채 저장됩니다.
--   (실제로 market_booth_types 의 한글 주석 5개가 이 문제로 깨져 있었습니다.
--    테이블 구조는 멀쩡해 보여서 DESC 로 열어보기 전엔 드러나지 않습니다)
--
--   아래 한 줄이 그것을 막아 줍니다. 새 테이블을 덧붙일 때 이 줄보다 아래에 쓰세요.
-- =====================================================================
SET NAMES utf8mb4;

-- =====================================================================
-- [보강] market_booth_types — 원본 덤프에 빠져 있던 테이블
--   backend/utills/boothTypes.js, marketCancellation.js 가 사용합니다.
--   없으면 부스 종류(A/B/C) 기능이 통째로 비활성화됩니다.
-- =====================================================================
USE `flea_market_db`;

DROP TABLE IF EXISTS `market_booth_types`;
CREATE TABLE `market_booth_types` (
  `boothTypeId` int NOT NULL AUTO_INCREMENT,
  `marketId` int NOT NULL,
  `name` varchar(50) NOT NULL COMMENT '부스 종류 이름 (예: A타입, B타입)',
  `price` int NOT NULL DEFAULT '0' COMMENT '이 종류의 부스 가격',
  `capacity` int NOT NULL DEFAULT '0' COMMENT '종류별 정원, 0이면 제한 없음',
  `priceOrigin` int DEFAULT NULL COMMENT '이 등급을 처음 등록했을 때의 금액. 한 번 정해지면 바뀌지 않습니다',
  `pricePrev` int DEFAULT NULL COMMENT '바로 직전 금액. 가격을 고칠 때마다 갱신됩니다',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '주최자가 정한 노출 순서',
  `isActive` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 신청 화면에서 숨김',
  PRIMARY KEY (`boothTypeId`),
  KEY `idx_booth_types_market` (`marketId`),
  CONSTRAINT `market_booth_types_ibfk_1`
    FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- applications.boothTypeId 가 실제 부스 종류를 가리키도록 FK 연결
ALTER TABLE `applications`
  ADD CONSTRAINT `applications_ibfk_3`
  FOREIGN KEY (`boothTypeId`) REFERENCES `market_booth_types` (`boothTypeId`)
  ON DELETE SET NULL;

-- =====================================================================
-- 현장 QR 체크인
--   판매자가 폰에 QR 을 띄우고, 주최자가 그것을 찍어 출석을 확인합니다.
--   노쇼는 별도 컬럼에 쌓지 않고 아래 두 테이블에서 계산합니다.
--   (그날 체크인을 못 받은 판매자 = 날짜가 지나면 그 마켓에 대해 노쇼 1회)
-- =====================================================================

-- 체크인 세션: 마켓 × 개최일 하나당 1행 (하루 = 세션 1개)
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
  `leadMinutes` int NOT NULL DEFAULT 60 COMMENT 'opensAt 기준 몇 분 전부터 QR 을 띄울지 (기본 60분)',
  PRIMARY KEY (`sessionId`),
  UNIQUE KEY `uk_checkin_session_day` (`marketId`, `eventDate`),
  CONSTRAINT `fk_checkin_session_market`
    FOREIGN KEY (`marketId`) REFERENCES `markets` (`marketId`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 출석 기록: 세션 × 신청 하나당 1행
--   QR 문자열 자체는 저장하지 않습니다. 90초마다 새로 만들어지는 값이라
--   저장하면 쓸모없는 행만 쌓이고, 저장된 토큰은 유출 시 그대로 쓸 수 있습니다.
--   위 secret 으로 그때그때 계산해서 발급합니다.
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
  UNIQUE KEY `uk_checkin_once` (`sessionId`, `applicationId`)
    COMMENT '같은 날 같은 부스를 두 번 찍어도 1건만 남습니다',
  KEY `idx_checkin_market_seller` (`marketId`, `sellerId`),
  CONSTRAINT `fk_checkin_session`
    FOREIGN KEY (`sessionId`) REFERENCES `market_checkin_sessions` (`sessionId`) ON DELETE CASCADE,
  CONSTRAINT `fk_checkin_application`
    FOREIGN KEY (`applicationId`) REFERENCES `applications` (`applicationId`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 알림 설정 (묶음별 on/off · 관심 지역 · 예약 알림 중복 방지)
-- =====================================================================

CREATE TABLE `notification_settings` (
  `settingId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `role` varchar(10) NOT NULL DEFAULT 'seller' COMMENT '이 설정이 적용되는 역할 (host = 주최자 알림, seller = 판매자 알림)',
  `category` varchar(40) NOT NULL COMMENT '알림 묶음 (host_application / seller_deadline 등, 접두어가 역할)',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0이면 이 묶음의 알림을 받지 않음',
  `leadHours` int NOT NULL DEFAULT '1' COMMENT '마감 몇 시간 전에 알릴지 (1~24). deadline 묶음에서만 사용',
  `notifyHour` int NOT NULL DEFAULT '10' COMMENT '이 시각(0~23)에 통지. attendance 묶음에서만 사용',
  PRIMARY KEY (`settingId`),
  UNIQUE KEY `uk_user_role_category` (`userId`,`role`,`category`),
  CONSTRAINT `fk_notif_setting_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE `notification_regions` (
  `regionId` int NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `region` varchar(50) NOT NULL COMMENT '알림 받을 지역명. 행이 없으면 모든 지역',
  PRIMARY KEY (`regionId`),
  UNIQUE KEY `uk_user_region` (`userId`,`region`),
  CONSTRAINT `fk_notif_region_user` FOREIGN KEY (`userId`) REFERENCES `users` (`userId`) ON DELETE CASCADE
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- =====================================================================
-- 결과 확인
-- =====================================================================
SELECT TABLE_NAME AS '생성된 테이블'
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'flea_market_db'
 ORDER BY TABLE_NAME;
