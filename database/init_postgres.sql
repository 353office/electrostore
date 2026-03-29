--this DB is pasted in the aiven service and handled there.
DROP VIEW IF EXISTS customer_view CASCADE;
DROP VIEW IF EXISTS staff_view CASCADE;
DROP FUNCTION IF EXISTS calculate_age_from_egn(TEXT);
DROP FUNCTION IF EXISTS get_sex_from_egn(TEXT);

DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS carts CASCADE;
DROP TABLE IF EXISTS app_sessions CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;
DROP TABLE IF EXISTS shipments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customer_address CASCADE;
DROP TABLE IF EXISTS customer_email CASCADE;
DROP TABLE IF EXISTS customer CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS product CASCADE;
DROP TABLE IF EXISTS staff_education CASCADE;
DROP TABLE IF EXISTS staff_position CASCADE;
DROP TABLE IF EXISTS staff CASCADE;

CREATE OR REPLACE FUNCTION egn_birth_date(egn TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  yy INT;
  mm INT;
  dd INT;
  full_year INT;
  adj_month INT;
BEGIN
  IF egn IS NULL OR length(egn) < 6 THEN
    RETURN NULL;
  END IF;

  yy := substring(egn, 1, 2)::INT;
  mm := substring(egn, 3, 2)::INT;
  dd := substring(egn, 5, 2)::INT;

  IF mm > 40 THEN
    full_year := 2000 + yy;
    adj_month := mm - 40;
  ELSE
    full_year := 1900 + yy;
    adj_month := mm;
  END IF;

  RETURN make_date(full_year, adj_month, dd);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION calculate_age_from_egn(egn TEXT)
RETURNS INT
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN egn_birth_date($1) IS NULL THEN NULL
    ELSE EXTRACT(YEAR FROM age(current_date, egn_birth_date($1)))::INT
  END;
$$;

CREATE OR REPLACE FUNCTION get_sex_from_egn(egn TEXT)
RETURNS CHAR(1)
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN $1 IS NULL OR length($1) < 9 THEN NULL
    WHEN substring($1, 9, 1)::INT % 2 = 0 THEN 'F'
    ELSE 'M'
  END;
$$;

CREATE TABLE staff (
  egn CHAR(10) PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  middle_name VARCHAR(50),
  last_name VARCHAR(50) NOT NULL
);

CREATE TABLE staff_position (
  id BIGSERIAL PRIMARY KEY,
  position_name VARCHAR(50) NOT NULL,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT TRUE,
  egn CHAR(10) NOT NULL REFERENCES staff(egn) ON DELETE CASCADE
);

CREATE TABLE staff_education (
  id BIGSERIAL PRIMARY KEY,
  education VARCHAR(100) NOT NULL,
  institution VARCHAR(150),
  graduation_year INT,
  egn CHAR(10) NOT NULL REFERENCES staff(egn) ON DELETE CASCADE
);

CREATE TABLE product (
  barcode VARCHAR(14) PRIMARY KEY CHECK (barcode ~ '^[0-9]{8,14}$'),
  name VARCHAR(200) NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  brand VARCHAR(100),
  stock_qty INT DEFAULT 0 CHECK (stock_qty >= 0),
  category VARCHAR(50),
  model VARCHAR(100),
  release_year INT,
  release_month INT,
  managed_by_egn CHAR(10) REFERENCES staff(egn) ON DELETE SET NULL,
  image_url TEXT,
  description TEXT,
  is_featured BOOLEAN DEFAULT FALSE
);

CREATE TABLE customer (
  egn CHAR(10) PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  middle_name VARCHAR(50),
  last_name VARCHAR(50) NOT NULL,
  country VARCHAR(50),
  city VARCHAR(50),
  street VARCHAR(100),
  street_no VARCHAR(20)
);

CREATE TABLE customer_email (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  is_primary BOOLEAN DEFAULT FALSE,
  egn CHAR(10) NOT NULL REFERENCES customer(egn) ON DELETE CASCADE
);

CREATE TABLE customer_address (
  id BIGSERIAL PRIMARY KEY,
  address VARCHAR(200) NOT NULL,
  address_type VARCHAR(20),
  is_default BOOLEAN DEFAULT FALSE,
  egn CHAR(10) NOT NULL REFERENCES customer(egn) ON DELETE CASCADE
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  notes TEXT,
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  order_status VARCHAR(50),
  order_subtotal NUMERIC(10,2),
  tax_amount NUMERIC(10,2),
  shipping_cost NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  shipping_address_id BIGINT REFERENCES customer_address(id) ON DELETE SET NULL,
  billing_address_id BIGINT REFERENCES customer_address(id) ON DELETE SET NULL,
  payment_method VARCHAR(50),
  tracking_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  egn CHAR(10) REFERENCES customer(egn) ON DELETE SET NULL
);

CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  barcode VARCHAR(50) NOT NULL REFERENCES product(barcode) ON DELETE RESTRICT,
  egn CHAR(10) NOT NULL REFERENCES customer(egn) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  qty INT NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2),
  discount_amount NUMERIC(10,2) DEFAULT 0,
  UNIQUE (barcode, egn, order_id)
);

CREATE TABLE shipments (
  id BIGSERIAL PRIMARY KEY,
  tracking_number VARCHAR(100) UNIQUE,
  carrier VARCHAR(100),
  shipping_method VARCHAR(50),
  shipped_date TIMESTAMP,
  estimated_delivery_date TIMESTAMP,
  shipment_status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE inventory (
  id BIGSERIAL PRIMARY KEY,
  cost NUMERIC(10,2),
  name VARCHAR(200),
  years INT,
  months INT,
  egn CHAR(10) REFERENCES staff(egn) ON DELETE SET NULL
);

-- App-specific additions
CREATE TABLE app_users (
  id UUID PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'customer')),
  customer_egn CHAR(10) REFERENCES customer(egn) ON DELETE SET NULL,
  staff_egn CHAR(10) REFERENCES staff(egn) ON DELETE SET NULL,
  display_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE app_sessions (
  token UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE carts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cart_items (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGINT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  barcode VARCHAR(50) NOT NULL REFERENCES product(barcode) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  UNIQUE (cart_id, barcode)
);

CREATE VIEW staff_view AS
SELECT
  s.egn,
  s.first_name,
  s.middle_name,
  s.last_name,
  EXTRACT(YEAR FROM egn_birth_date(s.egn))::INT AS year,
  EXTRACT(MONTH FROM egn_birth_date(s.egn))::INT AS month,
  egn_birth_date(s.egn) AS birth_date,
  get_sex_from_egn(s.egn) AS sex,
  calculate_age_from_egn(s.egn) AS age
FROM staff s;

CREATE VIEW customer_view AS
SELECT
  c.egn,
  c.first_name,
  c.middle_name,
  c.last_name,
  c.country,
  c.city,
  c.street,
  c.street_no,
  egn_birth_date(c.egn) AS birth_date,
  get_sex_from_egn(c.egn) AS sex,
  calculate_age_from_egn(c.egn) AS age
FROM customer c;

-- Staff
INSERT INTO staff (egn, first_name, middle_name, last_name) VALUES
('9005123456', 'Ivan', 'Petrov', 'Georgiev'),
('8511204578', 'Maria', 'Ivanova', 'Dimitrova'),
('9203155892', 'Georgi', 'Todorov', 'Stoyanov'),
('8807308764', 'Elena', 'Angelova', 'Petrova');

INSERT INTO staff_position (position_name, start_date, end_date, is_current, egn) VALUES
('Store Manager', '2020-01-15', NULL, TRUE, '9005123456'),
('Sales Associate', '2018-06-01', NULL, TRUE, '8511204578'),
('Inventory Manager', '2021-03-10', NULL, TRUE, '9203155892'),
('Warehouse Supervisor', '2019-05-20', '2021-03-09', FALSE, '9203155892'),
('Customer Service', '2022-08-15', NULL, TRUE, '8807308764');

INSERT INTO staff_education (education, institution, graduation_year, egn) VALUES
('Bachelor in Business Administration', 'Sofia University', 2012, '9005123456'),
('MBA in Management', 'AUBG', 2015, '9005123456'),
('High School Diploma', 'Plovdiv High School', 2003, '8511204578'),
('Bachelor in Logistics', 'Technical University', 2014, '9203155892'),
('Associate Degree in Communication', 'New Bulgarian University', 2008, '8807308764');

-- Products
INSERT INTO product (barcode, name, price, brand, stock_qty, category, model, release_year, release_month, managed_by_egn, image_url, description, is_featured) VALUES
('5901234123457', 'Laptop Dell XPS 15', 2499.99, 'Dell', 15, 'Computers', 'XPS 15 9530', 2024, 1, '9203155892', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=80', 'Premium 15-inch performance laptop with high-resolution display.', TRUE),
('4006381333931', 'iPhone 15 Pro', 1999.99, 'Apple', 25, 'Smartphones', 'iPhone 15 Pro', 2024, 9, '9203155892', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=80', 'Flagship smartphone with powerful camera system and titanium body.', TRUE),
('8806094934427', 'Samsung 55" QLED TV', 1299.99, 'Samsung', 10, 'TVs', 'QN55Q80C', 2024, 3, '9203155892', 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=900&q=80', '55-inch QLED television for vivid home entertainment.', TRUE),
('0887276567143', 'Sony WH-1000XM5 Headphones', 399.99, 'Sony', 30, 'Audio', 'WH-1000XM5', 2023, 5, '9203155892', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80', 'Industry-leading wireless noise-canceling headphones.', TRUE),
('0195949105852', 'MacBook Air M3', 1899.99, 'Apple', 12, 'Computers', 'MacBook Air 15"', 2024, 6, '9203155892', 'https://images.unsplash.com/photo-1517336714739-489689fd1ca8?auto=format&fit=crop&w=900&q=80', 'Thin and light Apple laptop powered by the M3 chip.', FALSE),
('8806092042506', 'Samsung Galaxy S24', 1199.99, 'Samsung', 20, 'Smartphones', 'Galaxy S24', 2024, 1, '9203155892', 'https://images.unsplash.com/photo-1510557880182-3b1d0ec76574?auto=format&fit=crop&w=900&q=80', 'Compact Android flagship with bright display and strong battery life.', FALSE),
('5397184680957', 'LG 27" Gaming Monitor', 599.99, 'LG', 18, 'Monitors', '27GL83A-B', 2023, 8, '9203155892', 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80', '27-inch gaming monitor with fast refresh and sharp IPS panel.', FALSE),
('4548736141698', 'Canon EOS R6 Camera', 2499.99, 'Canon', 8, 'Cameras', 'EOS R6 Mark II', 2024, 2, '9203155892', 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80', 'Full-frame mirrorless camera for photo and video creators.', FALSE);

-- Customers
INSERT INTO customer (egn, first_name, middle_name, last_name, country, city, street, street_no) VALUES
('9512084523', 'Dimitar', 'Hristov', 'Nikolov', 'Bulgaria', 'Sofia', 'Vitosha Blvd', '125'),
('9208257846', 'Ana', 'Georgieva', 'Ivanova', 'Bulgaria', 'Plovdiv', 'Tsar Boris III', '42'),
('8805193671', 'Petar', 'Kirilov', 'Vasilev', 'Bulgaria', 'Varna', 'Slivnitsa Blvd', '89'),
('0042156738', 'Viktoria', 'Todorova', 'Marinova', 'Bulgaria', 'Burgas', 'Alexandrovska', '15');

INSERT INTO customer_email (email, is_primary, egn) VALUES
('dimitar.nikolov@email.bg', TRUE, '9512084523'),
('d.nikolov@work.bg', FALSE, '9512084523'),
('ana.ivanova@gmail.com', TRUE, '9208257846'),
('petar.vasilev@abv.bg', TRUE, '8805193671'),
('p.vasilev@company.com', FALSE, '8805193671'),
('viktoria.marinova@yahoo.com', TRUE, '0042156738');

INSERT INTO customer_address (address, address_type, is_default, egn) VALUES
('125 Vitosha Blvd, Sofia 1000, Bulgaria', 'Home', TRUE, '9512084523'),
('89 Business Park, Sofia 1234, Bulgaria', 'Work', FALSE, '9512084523'),
('42 Tsar Boris III, Plovdiv 4000, Bulgaria', 'Home', TRUE, '9208257846'),
('89 Slivnitsa Blvd, Varna 9000, Bulgaria', 'Home', TRUE, '8805193671'),
('33 Marina Street, Varna 9002, Bulgaria', 'Shipping', FALSE, '8805193671'),
('15 Alexandrovska, Burgas 8000, Bulgaria', 'Home', TRUE, '0042156738');

INSERT INTO orders (notes, order_status, order_subtotal, tax_amount, shipping_cost, total_amount, payment_method, tracking_number, egn, shipping_address_id, billing_address_id) VALUES
('Gift wrapping requested', 'Completed', 2899.98, 579.99, 15.00, 3494.97, 'Credit Card', 'TRK001234567', '9512084523', 1, 1),
('Deliver after 6 PM', 'Shipped', 1299.99, 259.99, 20.00, 1579.98, 'PayPal', 'TRK001234568', '9208257846', 3, 3),
('Fragile - Handle with care', 'Processing', 999.98, 199.99, 10.00, 1209.97, 'Debit Card', NULL, '8805193671', 4, 4),
('Customer pickup', 'Pending', 1899.99, 379.99, 0.00, 2279.98, 'Cash', NULL, '0042156738', 6, 6);

INSERT INTO order_items (barcode, egn, order_id, qty, unit_price, subtotal, discount_amount) VALUES
('5901234123457', '9512084523', 1, 1, 2499.99, 2499.99, 0),
('0887276567143', '9512084523', 1, 1, 399.99, 399.99, 0),
('8806092042506', '9208257846', 2, 1, 1199.99, 1199.99, 100.00),
('5397184680957', '8805193671', 3, 1, 599.99, 599.99, 0),
('0887276567143', '8805193671', 3, 1, 399.99, 399.99, 0),
('0195949105852', '0042156738', 4, 1, 1899.99, 1899.99, 0);

INSERT INTO shipments (tracking_number, carrier, shipping_method, shipped_date, estimated_delivery_date, shipment_status, order_id) VALUES
('TRK001234567', 'Speedy', 'Standard', '2026-01-15 10:30:00', '2026-01-18 17:00:00', 'Delivered', 1),
('TRK001234568', 'Econt', 'Express', '2026-01-18 14:00:00', '2026-01-21 18:00:00', 'In Transit', 2);

INSERT INTO inventory (cost, name, years, months, egn) VALUES
(2000.00, 'Main Warehouse - Sofia', 5, 6, '9203155892'),
(1500.00, 'Secondary Warehouse - Plovdiv', 3, 2, '9203155892');

-- App users
INSERT INTO app_users (id, email, password_hash, role, customer_egn, staff_egn, display_name) VALUES
('11111111-1111-1111-1111-111111111111', 'admin@electrostore.bg', 'plain:admin123', 'admin', NULL, '9005123456', 'ElectroStore Admin'),
('22222222-2222-2222-2222-222222222222', 'dimitar.nikolov@email.bg', 'plain:customer123', 'customer', '9512084523', NULL, 'Dimitar Nikolov'),
('33333333-3333-3333-3333-333333333333', 'ana.ivanova@gmail.com', 'plain:customer123', 'customer', '9208257846', NULL, 'Ana Ivanova');

INSERT INTO carts (user_id, status) VALUES
('22222222-2222-2222-2222-222222222222', 'active'),
('33333333-3333-3333-3333-333333333333', 'active');

CREATE INDEX idx_product_category ON product(category);
CREATE INDEX idx_product_brand ON product(brand);
CREATE INDEX idx_customer_email_egn ON customer_email(egn);
CREATE INDEX idx_orders_egn ON orders(egn);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_cart_items_cart_id ON cart_items(cart_id);
