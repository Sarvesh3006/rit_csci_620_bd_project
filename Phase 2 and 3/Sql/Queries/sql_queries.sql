-- ============================================================
-- CSCI 620 Project - Phase II(a)
-- Amazon Reviews 2023 (Electronics) - 5 queries and indexes
-- Database: amazon_electronics_reviews (MySQL 8)
--
-- How to use (MySQL Workbench):
--   1. Run the USE line once.
--   2. Run each query with Ctrl + Enter and note its Duration
--      (timings BEFORE indexes).
--   3. Run the CREATE INDEX section at the bottom.
--   4. Run the 5 queries again (timings AFTER indexes).
-- ============================================================

USE amazon_electronics_reviews;


-- ------------------------------------------------------------
-- Q1: How did reviews change over the years?
-- Reviews per year, average rating, and the share of 5-star
-- and 1-star reviews.
-- ------------------------------------------------------------
SELECT
    YEAR(reviewed_at)                          AS review_year,
    COUNT(*)                                   AS total_reviews,
    ROUND(AVG(rating), 2)                      AS avg_rating,
    ROUND(100 * SUM(rating = 5) / COUNT(*), 1) AS pct_5_star,
    ROUND(100 * SUM(rating = 1) / COUNT(*), 1) AS pct_1_star
FROM reviews
WHERE reviewed_at IS NOT NULL
  AND rating IS NOT NULL
GROUP BY YEAR(reviewed_at)
ORDER BY review_year;


-- ------------------------------------------------------------
-- Q2: Do more expensive electronics get better ratings?
-- Products (10+ ratings) grouped into price ranges: average
-- rating, % rated below 3.5, and ratings per product.
-- ------------------------------------------------------------
SELECT
    CASE
        WHEN price < 25  THEN '1. Under $25'
        WHEN price < 100 THEN '2. $25 - $99'
        WHEN price < 500 THEN '3. $100 - $499'
        ELSE                  '4. $500 and up'
    END                                                  AS price_range,
    COUNT(*)                                             AS total_products,
    ROUND(AVG(average_rating), 2)                        AS avg_rating,
    ROUND(100 * SUM(average_rating < 3.5) / COUNT(*), 1) AS pct_low_rated,
    ROUND(AVG(rating_number))                            AS avg_ratings_per_product
FROM products
WHERE price IS NOT NULL
  AND average_rating IS NOT NULL
  AND rating_number >= 10
GROUP BY price_range
ORDER BY price_range;


-- ------------------------------------------------------------
-- Q3: What do the most helpful reviews look like?
-- The 15 reviews with the most helpful votes (1,000+), joined
-- with the product they are about.
-- ------------------------------------------------------------
SELECT
    LEFT(p.title, 50) AS product,
    p.store,
    r.rating,
    r.helpful_vote,
    r.verified_purchase,
    LEFT(r.title, 60) AS review_title
FROM reviews r
JOIN products p ON p.parent_asin = r.parent_asin
WHERE r.helpful_vote >= 1000
ORDER BY r.helpful_vote DESC
LIMIT 15;


-- ------------------------------------------------------------
-- Q4: Do verified buyers rate differently from non-verified
-- reviewers? Average rating, % 5-star, % 1-star, and average
-- helpful votes for each group.
-- ------------------------------------------------------------
SELECT
    CASE WHEN verified_purchase THEN 'Verified buyer' ELSE 'Not verified' END AS reviewer,
    COUNT(*)                                   AS total_reviews,
    ROUND(AVG(rating), 2)                      AS avg_rating,
    ROUND(100 * SUM(rating = 5) / COUNT(*), 1) AS pct_5_star,
    ROUND(100 * SUM(rating = 1) / COUNT(*), 1) AS pct_1_star,
    ROUND(AVG(helpful_vote), 2)                AS avg_helpful_votes
FROM reviews
WHERE verified_purchase IS NOT NULL
  AND rating IS NOT NULL
GROUP BY verified_purchase
ORDER BY verified_purchase DESC;


-- ------------------------------------------------------------
-- Q5: Which sub-categories disappoint buyers the most?
-- categories is a JSON list, e.g.
-- ["Electronics", "Camera & Photo", "Hidden Cameras"].
-- JSON_TABLE turns each list into one row per category.
-- "Electronics" is skipped because every product has it.
-- ------------------------------------------------------------
SELECT
    c.category,
    COUNT(*)                                               AS total_products,
    ROUND(100 * SUM(p.average_rating < 3.5) / COUNT(*), 1) AS pct_low_rated,
    ROUND(AVG(p.average_rating), 2)                        AS avg_rating,
    ROUND(AVG(p.price), 2)                                 AS avg_price
FROM products p,
     JSON_TABLE(
         p.categories,
         '$[*]' COLUMNS (category VARCHAR(255) PATH '$')
     ) AS c
WHERE c.category <> 'Electronics'
  AND p.average_rating IS NOT NULL
  AND p.rating_number >= 10
GROUP BY c.category
HAVING COUNT(*) >= 1000
ORDER BY pct_low_rated DESC
LIMIT 15;


-- ============================================================
-- INDEXES
-- Without them, Q1, Q3 and Q4 read all ~44M review rows
-- (including the long review text), and Q2 and Q5 read all
-- 1.6M product rows.
-- ============================================================

-- Q1: holds both columns Q1 uses, so MySQL reads this small
-- index instead of the large review rows (covering index).
CREATE INDEX idx_reviews_time_rating ON reviews (reviewed_at, rating);

-- Q2: holds price, average_rating and rating_number, so Q2 is
-- answered from the index alone (covering index).
CREATE INDEX idx_products_price ON products (price, average_rating, rating_number);

-- Q3: keeps reviews sorted by helpful votes, so MySQL jumps
-- straight to the highest ones and stops after 15, instead of
-- scanning all reviews.
CREATE INDEX idx_reviews_helpful ON reviews (helpful_vote);

-- Q4: holds verified_purchase, rating and helpful_vote, already
-- grouped by verified_purchase (covering index).
CREATE INDEX idx_reviews_verified ON reviews (verified_purchase, rating, helpful_vote);

-- Q5: lets MySQL skip products with fewer than 10 ratings.
-- Expected gain is small: MySQL must still read each remaining
-- product's categories JSON, which an index cannot hold.
CREATE INDEX idx_products_rating_number ON products (rating_number, average_rating);
