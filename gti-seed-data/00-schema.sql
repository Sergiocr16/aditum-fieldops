-- ============================================================
-- Schema de los catálogos fiscales para la integración GTI
-- Origen: BD `aditum` (aditum-jh), MySQL 8, charset utf8mb4
-- Ejecutar ANTES de importar los dumps 01-04 si las tablas no existen.
-- ============================================================

CREATE TABLE IF NOT EXISTS `electronic_bill_identification_type` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fiscal_code` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fiscal_activity_code` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `activity_code` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `description` longtext,
  `country` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `fiscal_territorial_division` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `fiscal_id` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `territorial_type` varchar(255) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `belongs_to_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_fiscal_territorial_division_belongs_to_id` (`belongs_to_id`),
  CONSTRAINT `fk_fiscal_territorial_division_belongs_to_id` FOREIGN KEY (`belongs_to_id`) REFERENCES `fiscal_territorial_division` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `cabys_code` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category_code` varchar(255) DEFAULT NULL,
  `description` longtext,
  `is_final_category` bit(1) DEFAULT NULL,
  `tax` decimal(10,2) DEFAULT NULL,
  `country` varchar(255) DEFAULT NULL,
  `superior_category_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_cabys_code_superior_category_id` (`superior_category_id`),
  CONSTRAINT `fk_cabys_code_superior_category_id` FOREIGN KEY (`superior_category_id`) REFERENCES `cabys_code` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
