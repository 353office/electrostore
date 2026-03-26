USE electronics_store6;
-- insert staff
INSERT INTO STAFF (EGN, first, second, last) VALUES
('9005123456', 'Ivan', 'Petrov', 'Georgiev'),      -- Male, born 1990-05-12
('8511204578', 'Maria', 'Ivanova', 'Dimitrova'),   -- Female, born 1985-11-20
('9203155892', 'Georgi', 'Todorov', 'Stoyanov'),   -- Male, born 1992-03-15
('8807308764', 'Elena', 'Angelova', 'Petrova');    -- Female, born 1988-07-30

-- insert staff positions
INSERT INTO STAFF_POSITION (position, start_date, end_date, is_current, EGN) VALUES
('Store Manager', '2020-01-15', NULL,  TRUE, '9005123456'),
('Sales Associate', '2018-06-01', NULL,  TRUE, '8511204578'),
('Inventory Manager', '2021-03-10', NULL, TRUE, '9203155892'),
('Warehouse Supervisor', '2019-05-20', '2021-03-09', FALSE, '9203155892'), -- Previous position
('Customer Service', '2022-08-15', NULL,  TRUE, '8807308764');

-- insert staff education
INSERT INTO STAFF_EDUCATION (education, institution, graduation_year, EGN) VALUES
('Bachelor in Business Administration', 'Sofia University', 2012, '9005123456'),
('MBA in Management', 'AUBG', 2015, '9005123456'),
('High School Diploma', 'Plovdiv High School', 2003, '8511204578'),
('Bachelor in Logistics', 'Technical University', 2014, '9203155892'),
('Associate Degree in Communication', 'New Bulgarian University', 2008, '8807308764');

-- insert products
INSERT INTO PRODUCT (barcode, name, price, brand, stock_qty, category, model, year, month, EGN) VALUES
('5901234123457', 'Laptop Dell XPS 15', 2499.99, 'Dell', 15, 'Computers', 'XPS 15 9530', 2024, 1, '9203155892'),
('4006381333931', 'iPhone 15 Pro', 1999.99, 'Apple', 25, 'Smartphones', 'iPhone 15 Pro', 2024, 9, '9203155892'),
('8806094934427', 'Samsung 55" QLED TV', 1299.99, 'Samsung', 10, 'TVs', 'QN55Q80C', 2024, 3, '9203155892'),
('0887276567143', 'Sony WH-1000XM5 Headphones', 399.99, 'Sony', 30, 'Audio', 'WH-1000XM5', 2023, 5, '9203155892'),
('0195949105852', 'MacBook Air M3', 1899.99, 'Apple', 12, 'Computers', 'MacBook Air 15"', 2024, 6, '9203155892'),
('8806092042506', 'Samsung Galaxy S24', 1199.99, 'Samsung', 20, 'Smartphones', 'Galaxy S24', 2024, 1, '9203155892'),
('5397184680957', 'LG 27" Gaming Monitor', 599.99, 'LG', 18, 'Monitors', '27GL83A-B', 2023, 8, '9203155892'),
('4548736141698', 'Canon EOS R6 Camera', 2499.99, 'Canon', 8, 'Cameras', 'EOS R6 Mark II', 2024, 2, '9203155892');

-- insert customers
INSERT INTO CUSTOMER (EGN, first, second, last, country, city, street, street_No) VALUES
('9512084523', 'Dimitar', 'Hristov', 'Nikolov', 'Bulgaria', 'Sofia', 'Vitosha Blvd', '125'),     -- Male, born 1995-12-08
('9208257846', 'Ana', 'Georgieva', 'Ivanova', 'Bulgaria', 'Plovdiv', 'Tsar Boris III', '42'),    -- Female, born 1992-08-25
('8805193671', 'Petar', 'Kirilov', 'Vasilev', 'Bulgaria', 'Varna', 'Slivnitsa Blvd', '89'),      -- Male, born 1988-05-19
('0042156738', 'Viktoria', 'Todorova', 'Marinova', 'Bulgaria', 'Burgas', 'Alexandrovska', '15'); -- Female, born 2000-02-15

-- insert customer emails
INSERT INTO CUSTOMER_EMAIL (email, is_primary, EGN) VALUES
('dimitar.nikolov@email.bg', TRUE, '9512084523'),
('d.nikolov@work.bg', FALSE, '9512084523'), -- Secondary email
('ana.ivanova@gmail.com', TRUE, '9208257846'),
('petar.vasilev@abv.bg', TRUE, '8805193671'),
('p.vasilev@company.com', FALSE, '8805193671'), -- Work email
('viktoria.marinova@yahoo.com', TRUE, '0042156738');

-- insert customer addresses
INSERT INTO CUSTOMER_ADDRESS (address, address_type, is_default, EGN) VALUES
('125 Vitosha Blvd, Sofia 1000, Bulgaria', 'Home', TRUE, '9512084523'),
('89 Business Park, Sofia 1234, Bulgaria', 'Work', FALSE, '9512084523'),
('42 Tsar Boris III, Plovdiv 4000, Bulgaria', 'Home', TRUE, '9208257846'),
('89 Slivnitsa Blvd, Varna 9000, Bulgaria', 'Home', TRUE, '8805193671'),
('33 Marina Street, Varna 9002, Bulgaria', 'Shipping', FALSE, '8805193671'),
('15 Alexandrovska, Burgas 8000, Bulgaria', 'Home', TRUE, '0042156738');

-- insert orders
INSERT INTO ORDERS (notes, order_status, order_subtotal, tax_amount, shipping_cost, total_amount, payment_method, tracking_number, EGN) VALUES
('Gift wrapping requested', 'Completed', 2899.98, 579.99, 15.00, 3494.97, 'Credit Card', 'TRK001234567', '9512084523'),
('Deliver after 6 PM', 'Shipped', 1299.99, 259.99, 20.00, 1579.98, 'PayPal', 'TRK001234568', '9208257846'),
('Fragile - Handle with care', 'Processing', 999.98, 199.99, 10.00, 1209.97, 'Debit Card', NULL, '8805193671'),
('Customer pickup', 'Pending', 1899.99, 379.99, 0.00, 2279.98, 'Cash', NULL, '0042156738');

-- insert order items
INSERT INTO ORDER_ITEMS (barcode, EGN, order_id, qty, unit_price, subtotal, discount_amount) VALUES
('5901234123457', '9512084523', 1, 1, 2499.99, 2499.99, 0),
('0887276567143', '9512084523', 1, 1, 399.99, 399.99, 0),
('8806092042506', '9208257846', 2, 1, 1199.99, 1199.99, 100.00),
('5397184680957', '8805193671', 3, 1, 599.99, 599.99, 0),
('0887276567143', '8805193671', 3, 1, 399.99, 399.99, 0),
('0195949105852', '0042156738', 4, 1, 1899.99, 1899.99, 0);

-- insert shipments
INSERT INTO SHIPMENTS (tracking_number, carrier, shipping_method, shipped_date, estimated_delivery_date, shipment_status, order_id) VALUES
('TRK001234567', 'Speedy', 'Standard', '2026-01-15 10:30:00', '2026-01-18 17:00:00', 'Delivered', 1),
('TRK001234568', 'Econt', 'Express', '2026-01-18 14:00:00', '2026-01-21 18:00:00', 'In Transit', 2);

-- insert inventory
INSERT INTO INVENTORY (cost, name, years, months, EGN) VALUES
(2000.00, 'Main Warehouse - Sofia', 5, 6, '9203155892'),
(1500.00, 'Secondary Warehouse - Plovdiv', 3, 2, '9203155892');