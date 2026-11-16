# Phase II(a) — SQL Queries, Indexes and Timings

Queries: [sql_queries.sql](../Phase%202%20and%203/Sql/Queries/sql_queries.sql).
Database: `amazon_electronics_reviews`.

## Functional Dependencies

The primary keys in [schema.sql](../Phase%201/Create%20and%20Load%20Dataset/schema.sql) enforce these dependencies:

| Table | Dependency |
| --- | --- |
| `products` | `parent_asin` → `title`, `average_rating`, `rating_number`, `price`, `main_category`, `store`, `categories`, `description`, `features`, `details` |
| `reviews` | `(source_id, source_line)` → `parent_asin`, `user_id`, `asin`, `rating`, `title`, `review_text`, `reviewed_at`, `helpful_vote`, `verified_purchase` |

Each key identifies one stored row; duplicate-key imports retain the existing row. Review line numbers can overlap across sources, so `source_line` alone is not the intended global key. A product key determines its metadata, not individual review ratings or text.

## Normalization

### First Normal Form (1NF)

Scalar columns contain single values. The JSON fields retain lists (`categories`, `description`, `features`) and an object (`details`), so the complete model does not follow traditional flattened 1NF. We preserve this product metadata together; Q5 expands categories with `JSON_TABLE`. A flattened alternative would use child tables linked by `parent_asin`, with entry positions preserving array order and duplicates.

### Second Normal Form (2NF)

Under the stated dependencies, the scalar relations meet 2NF. The product key is a single attribute. Review attributes depend on the full `(source_id, source_line)` identity; neither component alone identifies a review across sources. No partial dependency is defined. This assessment does not resolve the nested JSON fields' 1NF limitation.

### Third Normal Form (3NF) and BCNF

Separating product metadata avoids the transitive dependency `review key` → `parent_asin` → `product metadata` within reviews. Under the documented dependencies, the scalar product relation meets 3NF and BCNF because its determinant is the product key.

If the sample-observed `asin` → `parent_asin` holds globally, reviews contain `review key` → `asin` → `parent_asin`. Under the declared keys, this violates 3NF and BCNF: `asin` is not a review key, and `parent_asin` is non-prime. A separate ASIN-to-parent table would remove that redundancy. The current model retains both identifiers for direct product joins.

We do not claim full-schema BCNF: nested JSON and the potential ASIN dependency qualify the normalization assessment.

## Timings Before and After Indexing

| Query | Question | Index used | Before | After | Speedup |
| --- | --- | --- | ---: | ---: | ---: |
| Q1 | How did reviews change over the years? | `idx_reviews_time_rating (reviewed_at, rating)` | 21.759 s | 17.583 s | 1.24× |
| Q2 | Do more expensive electronics get better ratings? | `idx_products_price (price, average_rating, rating_number)` | 30.550 s | 0.191 s | 159.71× |
| Q3 | What do the most helpful reviews look like? | `idx_reviews_helpful (helpful_vote)` | 15.330 s | 0.0145 s | 1,056.95× |
| Q4 | Do verified buyers rate differently? | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 27.141 s | 20.384 s | 1.33× |
| Q5 | Which sub-categories disappoint buyers the most? | `idx_products_rating_number (rating_number, average_rating)` | 34.152 s | 32.561 s | 1.05× |

## Index Build Times

| Index | Table | Build time |
| --- | --- | ---: |
| `idx_reviews_time_rating` | reviews | 116.07 s |
| `idx_products_price` | products | 9.86 s |
| `idx_reviews_helpful` | reviews | 110.86 s |
| `idx_reviews_verified` | reviews | 117.88 s |
| `idx_products_rating_number` | products | 9.90 s |

The review indexes take far longer to build because they cover ~44M rows, compared with ~1.6M products.

## Why Each Index Helped (or Did Not)

- **Q3, 1,056.95× faster.** The index stores reviews sorted by `helpful_vote`. MySQL reads the highest values from the end of the index and stops after 15 matches, then joins only those 15 reviews to `products`. Without it, MySQL scanned all ~44M reviews.
- **Q2, 159.71× faster.** The index contains every column Q2 uses (`price`, `average_rating`, `rating_number`), so MySQL answers the query from the index alone (a covering index) and never reads the large product rows with their description, feature and details JSON.
- **Q1 and Q4, 1.24× and 1.33× faster, respectively.** Both indexes are covering, so MySQL reads small index entries instead of review rows that include long review text. Both queries still aggregate every review, so the work cannot drop below one pass over ~44M index entries.
- **Q5, 1.05× faster (small gain).** Most products pass the `rating_number >= 10` filter, so the index skips little. MySQL must still read every remaining product row to expand its `categories` JSON array with `JSON_TABLE`, and an index cannot store that array. The measured improvement was small.

## Query Results

The full result of each query is in its exported CSV (`Q1_result.csv` to `Q5_result.csv`). The rows below are those shown in Workbench.

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

## Notes

- Each query was timed once. The after-index runs followed the before-index runs, so part of the improvement for Q1 and Q4 may come from data already being in memory.
