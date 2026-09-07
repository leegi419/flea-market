-- =====================================================================
-- 현장 QR 체크인 — 테이블 추가 (기존 DB용)
--
--   이 파일은 "만들기"만 합니다. DROP / DELETE / TRUNCATE 가 한 줄도 없습니다.
--   IF NOT EXISTS 라서 여러 번 실행해도 기존 데이터가 바뀌지 않습니다.
--
--   실행 예 (PowerShell):
--     mysql -h 127.0.0.1 -u root -p --default-character-set=utf8mb4 flea_market_db -e "source scripts/add-checkin-tables.sql"
--
--   DB 를 새로 만드는 경우에는 이 파일이 필요 없습니다.
--   rebuild_flea_market_db.sql 에 이미 같은 테이블이 들어 있습니다.
-- =====================================================================

-- 접속 문자셋을 명시합니다.
--   이 줄이 없으면 클라이언트 기본 문자셋(환경에 따라 latin1)으로 SQL 이 전달되어
--   아래 한글 COMMENT 가 깨진 채 저장됩니다. 구조는 멀쩡해 보여서 눈치채기 어렵습니다.
--   명령줄에 --default-character-set=utf8mb4 를 빠뜨려도 이 줄이 막아 줍니다.
SET NAMES utf8mb4;

-- 체크인 세션: 마켓 × 개최일 하나당 1행 (하루 = 세션 1개)
CREATE TABLE IF NOT EXISTS `market_checkin_sessions` (
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
CREATE TABLE IF NOT EXISTS `market_checkins` (
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
-- 이미 이전 버전을 적용한 DB 를 위한 컬럼 보강
--
--   위의 CREATE TABLE 은 IF NOT EXISTS 라, 테이블이 이미 있으면 통째로 건너뜁니다.
--   그래서 예전 버전으로 테이블을 만들어 둔 DB 에는 나중에 추가된 시간 컬럼
--   (opensAt / closesAt / leadMinutes) 이 생기지 않고 조용히 넘어갑니다.
--   화면은 멀쩡해 보이는데 시간 예약만 안 되는 상태가 되므로 아래로 보강합니다.
--
--   MySQL 8 에는 `ADD COLUMN IF NOT EXISTS` 가 없어서(MariaDB 전용),
--   information_schema 로 확인한 뒤 PREPARE 로 실행합니다. 양쪽에서 모두 동작합니다.
--   이미 있으면 아무 것도 하지 않으므로 몇 번을 실행해도 안전합니다.
-- =====================================================================

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'market_checkin_sessions' AND column_name = 'opensAt');
SET @ddl := IF(@col = 0,
  "ALTER TABLE `market_checkin_sessions` ADD COLUMN `opensAt` datetime DEFAULT NULL COMMENT '이 날 체크인 시작 시각. QR 은 이보다 leadMinutes 만큼 먼저 나옵니다'",
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'market_checkin_sessions' AND column_name = 'closesAt');
SET @ddl := IF(@col = 0,
  "ALTER TABLE `market_checkin_sessions` ADD COLUMN `closesAt` datetime DEFAULT NULL COMMENT '이 날 체크인 종료 시각. 지나면 QR 이 자동으로 멈춥니다'",
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := (SELECT COUNT(*) FROM information_schema.columns
              WHERE table_schema = DATABASE()
                AND table_name = 'market_checkin_sessions' AND column_name = 'leadMinutes');
SET @ddl := IF(@col = 0,
  "ALTER TABLE `market_checkin_sessions` ADD COLUMN `leadMinutes` int NOT NULL DEFAULT 60 COMMENT 'opensAt 기준 몇 분 전부터 QR 을 띄울지 (기본 60분)'",
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- status 주석도 갱신 (scheduled 상태가 나중에 추가됐습니다). 값과 타입은 그대로입니다.
ALTER TABLE `market_checkin_sessions`
  MODIFY COLUMN `status` varchar(20) NOT NULL DEFAULT 'open'
  COMMENT 'scheduled(시간대에 맡김) | open(주최자가 직접 염) | closed(직접 닫음)';

-- 결과 확인 (두 줄이 나오면 성공)
SELECT TABLE_NAME AS '생성된 체크인 테이블', TABLE_ROWS AS '행 수'
  FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('market_checkin_sessions', 'market_checkins')
 ORDER BY TABLE_NAME;

-- 시간 컬럼 확인 (3 이 나와야 정상)
SELECT COUNT(*) AS '체크인 시간 컬럼 (3이면 정상)'
  FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'market_checkin_sessions'
   AND column_name IN ('opensAt', 'closesAt', 'leadMinutes');
