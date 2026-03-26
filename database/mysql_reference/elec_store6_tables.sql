CREATE DATABASE IF NOT EXISTS electronics_store6;
USE electronics_store6;

-- STAFF table
CREATE TABLE STAFF (
    EGN CHAR(10) PRIMARY KEY,
    first VARCHAR(50) NOT NULL,
    second VARCHAR(50),
    last VARCHAR(50) NOT NULL,
    year INT GENERATED ALWAYS AS (
        1900 + CAST(SUBSTRING(EGN, 1, 2) AS UNSIGNED) + 
        (CASE WHEN CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) > 40 THEN 100 ELSE 0 END)
    ) STORED,
    months INT GENERATED ALWAYS AS (
        CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) % 40
    ) STORED,
    birth_date DATE GENERATED ALWAYS AS (
        STR_TO_DATE(
            CONCAT(
                1900 + CAST(SUBSTRING(EGN, 1, 2) AS UNSIGNED) + 
                (CASE WHEN CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) > 40 THEN 100 ELSE 0 END),
                '-',
                LPAD(CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) % 40, 2, '0'),
                '-',
                SUBSTRING(EGN, 5, 2)
            ),
            '%Y-%m-%d'
        )
    ) STORED,
    sex CHAR(1) GENERATED ALWAYS AS (
        CASE WHEN CAST(SUBSTRING(EGN, 9, 1) AS UNSIGNED) % 2 = 0 THEN 'F' ELSE 'M' END
    ) STORED
);

-- STAFF_POSITION table
CREATE TABLE STAFF_POSITION (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    position VARCHAR(50) NOT NULL,
    start_date DATE,
    end_date DATE,
    is_current BOOLEAN DEFAULT TRUE,
    EGN CHAR(10) NOT NULL,
    FOREIGN KEY (EGN) REFERENCES STAFF(EGN) ON DELETE CASCADE
);

-- STAFF_EDUCATION table
CREATE TABLE STAFF_EDUCATION (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    education VARCHAR(100) NOT NULL,
    institution VARCHAR(150),
    graduation_year INT,
    EGN CHAR(10) NOT NULL,
    FOREIGN KEY (EGN) REFERENCES STAFF(EGN) ON DELETE CASCADE
);

-- PRODUCT table
CREATE TABLE PRODUCT (
    barcode VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    brand VARCHAR(100),
    stock_qty INT DEFAULT 0,
    category VARCHAR(50),
    model VARCHAR(100),
    year INT,
    month INT,
    EGN CHAR(10),
    FOREIGN KEY (EGN) REFERENCES STAFF(EGN) ON DELETE SET NULL
);

-- CUSTOMER table
CREATE TABLE CUSTOMER (
    EGN CHAR(10) PRIMARY KEY,
    first VARCHAR(50) NOT NULL,
    second VARCHAR(50),
    last VARCHAR(50) NOT NULL,
    country VARCHAR(50),
    city VARCHAR(50),
    street VARCHAR(100),
    street_No VARCHAR(20),
    birth_date DATE GENERATED ALWAYS AS (
        STR_TO_DATE(
            CONCAT(
                1900 + CAST(SUBSTRING(EGN, 1, 2) AS UNSIGNED) + 
                (CASE WHEN CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) > 40 THEN 100 ELSE 0 END),
                '-',
                LPAD(CAST(SUBSTRING(EGN, 3, 2) AS UNSIGNED) % 40, 2, '0'),
                '-',
                SUBSTRING(EGN, 5, 2)
            ),
            '%Y-%m-%d'
        )
    ) STORED,
    sex CHAR(1) GENERATED ALWAYS AS (
        CASE WHEN CAST(SUBSTRING(EGN, 9, 1) AS UNSIGNED) % 2 = 0 THEN 'F' ELSE 'M' END
    ) STORED
);

-- CUSTOMER_EMAIL table
CREATE TABLE CUSTOMER_EMAIL (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(100) NOT NULL UNIQUE,
    is_primary BOOLEAN DEFAULT FALSE,
    EGN CHAR(10) NOT NULL,
    FOREIGN KEY (EGN) REFERENCES CUSTOMER(EGN) ON DELETE CASCADE
);

-- CUSTOMER_ADDRESS table
CREATE TABLE CUSTOMER_ADDRESS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    address VARCHAR(200) NOT NULL,
    address_type VARCHAR(20), -- 'Home', 'Work', 'Billing', 'Shipping'
    is_default BOOLEAN DEFAULT FALSE,
    EGN CHAR(10) NOT NULL,
    FOREIGN KEY (EGN) REFERENCES CUSTOMER(EGN) ON DELETE CASCADE
);

-- ORDERS table
CREATE TABLE ORDERS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    notes TEXT,
    order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    order_status VARCHAR(50),
    order_subtotal DECIMAL(10, 2),
    tax_amount DECIMAL(10, 2),
    shipping_cost DECIMAL(10, 2),
    total_amount DECIMAL(10, 2),
    shipping_address_id VARCHAR(200),
    billing_address_id VARCHAR(200),
    payment_method VARCHAR(50),
    tracking_number VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    EGN CHAR(10),
    FOREIGN KEY (EGN) REFERENCES CUSTOMER(EGN) ON DELETE SET NULL
);

-- ORDER_ITEMS table
CREATE TABLE ORDER_ITEMS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    barcode VARCHAR(50) NOT NULL,
    EGN CHAR(10) NOT NULL,
    order_id INT NOT NULL,
    qty INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    FOREIGN KEY (barcode) REFERENCES PRODUCT(barcode) ON DELETE CASCADE,
    FOREIGN KEY (EGN) REFERENCES CUSTOMER(EGN) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES ORDERS(ID) ON DELETE CASCADE,
    UNIQUE KEY unique_order_item (barcode, EGN, order_id)
);

-- SHIPMENTS table
CREATE TABLE SHIPMENTS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    tracking_number VARCHAR(100) UNIQUE,
    carrier VARCHAR(100),
    shipping_method VARCHAR(50),
    shipped_date DATETIME,
    estimated_delivery_date DATETIME,
    shipment_status VARCHAR(50),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    order_id INT,
    FOREIGN KEY (order_id) REFERENCES ORDERS(ID) ON DELETE CASCADE
);

-- INVENTORY table
CREATE TABLE INVENTORY (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    cost DECIMAL(10, 2),
    name VARCHAR(200),
    years INT,
    months INT,
    EGN CHAR(10),
    FOREIGN KEY (EGN) REFERENCES STAFF(EGN) ON DELETE SET NULL
);

-- view for STAFF with calcualted age
CREATE VIEW STAFF_VIEW AS
SELECT 
    EGN,
    first,
    second,
    last,
    year,
    months,
    birth_date,
    sex,
    TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) AS age
FROM STAFF;

-- view for CUSTOMER with calculated age
CREATE VIEW CUSTOMER_VIEW AS
SELECT 
    EGN,
    first,
    second,
    last,
    country,
    city,
    street,
    street_No,
    birth_date,
    sex,
    TIMESTAMPDIFF(YEAR, birth_date, CURDATE()) AS age
FROM CUSTOMER;

-- function for age
DELIMITER //
CREATE FUNCTION calculate_age_from_egn(egn CHAR(10))
RETURNS INT
DETERMINISTIC
BEGIN
    DECLARE birth_year INT;
    DECLARE birth_month INT;
    DECLARE birth_day INT;
    DECLARE birth_date DATE;
    
    SET birth_year = 1900 + CAST(SUBSTRING(egn, 1, 2) AS UNSIGNED) + 
                     (CASE WHEN CAST(SUBSTRING(egn, 3, 2) AS UNSIGNED) > 40 THEN 100 ELSE 0 END);
    SET birth_month = CAST(SUBSTRING(egn, 3, 2) AS UNSIGNED) % 40;
    SET birth_day = CAST(SUBSTRING(egn, 5, 2) AS UNSIGNED);
    
    SET birth_date = STR_TO_DATE(CONCAT(birth_year, '-', LPAD(birth_month, 2, '0'), '-', LPAD(birth_day, 2, '0')), '%Y-%m-%d');
    
    RETURN TIMESTAMPDIFF(YEAR, birth_date, CURDATE());
END//

-- function for sex
CREATE FUNCTION get_sex_from_egn(egn CHAR(10))
RETURNS CHAR(1)
DETERMINISTIC
BEGIN
    RETURN CASE WHEN CAST(SUBSTRING(egn, 9, 1) AS UNSIGNED) % 2 = 0 THEN 'F' ELSE 'M' END;
END//

DELIMITER ;