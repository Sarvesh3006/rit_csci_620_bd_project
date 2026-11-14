# Phase II(a) — SQL Queries, Indexes and Timings

Queries: `phase2_queries.sql` (same folder).
Database: `amazon_electronics_reviews`, MySQL 8.0.46 Community Server, run in MySQL Workbench on a local Windows laptop.
Each time below is the Workbench "Duration" of a single run.

## Timings Before and After Indexing

| Query | Question | Index used | Before | After | Speedup |
| --- | --- | --- | ---: | ---: | ---: |
| Q1 | How did reviews change over the years? | `idx_reviews_time_rating (reviewed_at, rating)` | 86.94 s | 56.88 s | 1.5× |
| Q2 | Do more expensive electronics get better ratings? | `idx_products_price (price, average_rating, rating_number)` | 50.09 s | 0.61 s | ~82× |
| Q3 | What do the most helpful reviews look like? | `idx_reviews_helpful (helpful_vote)` | 73.72 s | 0.047 s | ~1,570× |
| Q4 | Do verified buyers rate differently? | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 94.78 s | 55.52 s | 1.7× |
| Q5 | Which sub-categories disappoint buyers the most? | `idx_products_rating_number (rating_number, average_rating)` | 70.11 s | 76.64 s | none |

## Index Build Times

| Index | Table | Build time |
| --- | --- | ---: |
| `idx_reviews_time_rating` | reviews | 162.28 s |
| `idx_products_price` | products | 18.89 s |
| `idx_reviews_helpful` | reviews | 271.41 s |
| `idx_reviews_verified` | reviews | 313.34 s |
| `idx_products_rating_number` | products | 20.14 s |

The review indexes take far longer to build because they cover ~44M rows, compared with ~1.6M products.

## Why Each Index Helped (or Did Not)

- **Q3, ~1,570× faster.** The index stores reviews sorted by `helpful_vote`. MySQL reads the highest values from the end of the index and stops after 15 matches, then joins only those 15 reviews to `products`. Without it, MySQL scanned all ~44M reviews.
- **Q2, ~82× faster.** The index contains every column Q2 uses (`price`, `average_rating`, `rating_number`), so MySQL answers the query from the index alone (a covering index) and never reads the large product rows with their description, feature and details JSON.
- **Q1 and Q4, 1.5–1.7× faster.** Both indexes are covering, so MySQL reads small index entries instead of review rows that include long review text. Both queries still aggregate every review, so the work cannot drop below one pass over ~44M index entries.
- **Q5, no gain.** Most products pass the `rating_number >= 10` filter, so the index skips little. MySQL must still read every remaining product row to expand its `categories` JSON array with `JSON_TABLE`, and an index cannot store that array. The extra index lookups made the run slightly slower.

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

- An earlier version of the store-ranking query joined all ~44M reviews to `products` before grouping. Without an index on `reviews.parent_asin` it ran for 1,159.75 s and was cancelled. It was replaced by Q2, which answers a different question using only the `products` table.
- Each query was timed once. The after-index runs followed the before-index runs, so part of the improvement for Q1 and Q4 may come from data already being in memory.