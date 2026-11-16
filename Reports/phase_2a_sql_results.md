# Phase II(a) — SQL Queries, Indexes and Timings

Queries: [sql_queries.sql](../Phase%202%20and%203/Sql/Queries/sql_queries.sql).
Database: `amazon_electronics_reviews`.

## Functional Dependencies

The primary keys in MySQL enforce these dependencies:

| Table | Dependency |
| --- | --- |
| `products` | `parent_asin` → `title`, `average_rating`, `rating_number`, `price`, `main_category`, `store`, `categories`, `description`, `features`, `details` |
| `reviews` | `(source_id, source_line)` → `parent_asin`, `user_id`, `asin`, `rating`, `title`, `review_text`, `reviewed_at`, `helpful_vote`, `verified_purchase` |

Each primary key uniquely identifies a row, and importing duplicates doesn't change that row. Reviewers use `(source_id, source_line)` since the same line number can appear in multiple sources.

## Normalization

### First Normal Form (1NF)

Product JSON fields preserve lists and objects rather than a traditional flat structure. Separate child tables could flatten this metadata, but we retain its source structure and use `JSON_TABLE` to expand categories in Q5.

### Second Normal Form (2NF)

The product key is a single column. Review attributes depend on the full `(source_id, source_line)` key because line numbers can repeat across sources.

### Third Normal Form (3NF)

Product metadata is stored once in `products` and referenced by reviews through `parent_asin`. This avoids repeating product titles, prices, and stores in review rows and reduces inconsistent updates. These choices improve normalization.

## Timings Before and After Indexing

| Query | Question | Index | Before | After | Speedup |
| --- | --- | --- | ---: | ---: | ---: |
| Q1 | How did reviews change over the years? | `idx_reviews_time_rating (reviewed_at, rating)` | 21.759 s | 17.583 s | 1.24× |
| Q2 | Do more expensive electronics get better ratings? | `idx_products_price (price, average_rating, rating_number)` | 30.550 s | 0.191 s | 159.71× |
| Q3 | What do the most helpful reviews look like? | `idx_reviews_helpful (helpful_vote)` | 15.330 s | 0.0145 s | 1,056.95× |
| Q4 | Do verified buyers rate differently? | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 27.141 s | 20.384 s | 1.33× |
| Q5 | Which sub-categories disappoint buyers the most? | `idx_products_rating_number (rating_number, average_rating)` | 34.152 s | 32.561 s | 1.05× |

## Index Build Times

| Index | Table / collection | Build time |
| --- | --- | ---: |
| `idx_reviews_time_rating` | reviews | 116.07 s |
| `idx_products_price` | products | 9.86 s |
| `idx_reviews_helpful` | reviews | 110.86 s |
| `idx_reviews_verified` | reviews | 117.88 s |
| `idx_products_rating_number` | products | 9.90 s |
| **Total** |  | **364.57 s** |

The review indexes take far longer to build because they cover ~44M rows, compared with ~1.6M products.

## Why Each Index Helped (or Did Not)

| Query | Speedup | Explanation |
| --- | ---: | --- |
| Q1 | 1.24× | The index contains the date and rating fields used by the yearly summary. It can reduce access to large review rows, but the query still aggregates almost all eligible reviews. |
| Q2 | 159.71× | The index contains all three product fields used by the query, allowing a covering-index plan without reading descriptions or other large product fields. |
| Q3 | 1,056.95× | The helpful-vote index supports the threshold and descending order. The product primary key supports the join; only 15 joined reviews are returned. |
| Q4 | 1.33× | The index contains verification, rating, and helpful votes, allowing a covering-index plan. Counting and averaging still cover almost all eligible reviews. |
| Q5 | 1.05× | The index supports the rating-count filter. MySQL still expands categories with JSON_TABLE, groups entries, and sorts computed percentages; the observed gain was small. |

## Query Results

The full result of each query is in its exported CSV (`Q1_result.csv` to `Q5_result.csv`). The tables below summarize the MySQL exports. Full results are available in the [before-index folder](sql_results/before_indexes/) and [after-index folder](sql_results/after_indexes/).

### Q1 — Reviews per year (27 rows; first years shown)

| Year | Reviews | Avg rating | % 5-star | % 1-star |
| --- | ---: | ---: | ---: | ---: |
| 1996 | 1 | 4.00 | 0.0 | 0.0 |
| 1998 | 9 | 4.78 | 77.8 | 0.0 |
| 1999 | 419 | 4.15 | 55.4 | 6.7 |
| 2000 | 3,756 | 4.14 | 53.9 | 7.4 |
| 2001 | 6,841 | 3.97 | 49.7 | 10.5 |

Remaining years are in `Q1_result.csv`.

### Q2 — Price range vs. rating (products with 10+ ratings)

| Price range | Products | Avg rating | % rated below 3.5 | Avg ratings per product |
| --- | ---: | ---: | ---: | ---: |
| Under $25 | 182,113 | 4.27 | 4.5 | 519 |
| $25 – $99 | 97,703 | 4.19 | 6.7 | 566 |
| $100 – $499 | 45,074 | 4.16 | 7.4 | 410 |
| $500 and up | 10,682 | 4.20 | 6.1 | 167 |

Finding: higher prices do not bring higher ratings. Products under $25 have the highest average rating and the lowest share of poorly rated products, while $100–$499 products have the highest share.

### Q3 — Most helpful reviews (15 rows; top 4 shown)

| Product | Store | Rating | Helpful votes | Verified |
| --- | --- | ---: | ---: | --- |
| Fire Tablet with Alexa, 7" Display, 16 GB, Blue | Amazon | 5.00 | 46,841 | Yes |
| Fire TV Stick with Alexa Voice Remote | Amazon | 5.00 | 32,948 | Yes |
| Amazon Fire TV – 1st Generation | Amazon | 5.00 | 26,331 | Yes |
| Kindle Wireless Reading Device (6" Display) | Amazon | 1.00 | 24,261 | Yes |

Finding: the most helpful reviews in the category are about Amazon's own devices. The fourth is a 1-star warning about the Kindle, so critical reviews can earn as much trust as positive ones.

### Q4 — Verified vs. non-verified reviewers

| Reviewer | Reviews | Avg rating | % 5-star | % 1-star | Avg helpful votes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Verified buyer | 40,546,882 | 4.12 | 64.2 | 11.8 | 0.98 |
| Not verified | 3,340,060 | 3.82 | 53.5 | 16.6 | 2.46 |

Finding: non-verified reviewers are harsher than verified buyers, with a lower average rating, fewer 5-star and more 1-star reviews, and their reviews receive about 2.5 times as many helpful votes.

### Q5 — Most disappointing sub-categories (15 rows; top 5 shown)

| Category | Products | % rated below 3.5 | Avg rating | Avg price |
| --- | ---: | ---: | ---: | ---: |
| Hidden Cameras | 1,752 | 50.9 | 3.52 | $71.16 |
| Audio Docks | 1,012 | 46.2 | 3.52 | $101.51 |
| MP3 & MP4 Players | 3,175 | 41.6 | 3.56 | $133.75 |
| DVD Players & Recorders | 1,228 | 39.4 | 3.60 | $181.12 |
| Repeaters | 1,600 | 38.4 | 3.64 | $54.75 |

Finding: about half of all hidden cameras with 10+ ratings are rated below 3.5.
