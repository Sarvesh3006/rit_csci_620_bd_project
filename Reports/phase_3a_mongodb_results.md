# Phase III(a) — MongoDB Aggregation Queries, Indexes and Timings

## Query Design

| Query | Selection and calculation | Pipeline stages |
| --- | --- | --- |
| Q1 — Reviews per year | Reviews with dates and ratings; counts, mean rating, and 5-star/1-star shares by UTC year. | `$match` → `$group` → `$project` → `$sort` |
| Q2 — Price vs. rating | Products with known price/rating and at least 10 ratings; `$switch` assigns four price bands. | `$match` → `$group` → `$project` → `$sort` |
| Q3 — Helpful reviews | At least 1,000 helpful votes; join `reviews.parent_asin` to `products._id`; return the top 15. | `$match` → `$sort` → `$lookup` → `$unwind` → `$limit` → `$project` |
| Q4 — Verified reviewers | Reviews with known verification and rating; compare counts, ratings, star shares, and helpful votes. | `$match` → `$group` → `$sort` → `$project` |
| Q5 — Disappointing categories | Products with a rating and at least 10 ratings; expand categories, exclude `Electronics`/null, retain groups with at least 1,000 entries, and return the top 15 by low-rating share. | `$match` → `$unwind` → `$match` → `$group` → `$match` → `$project` → `$sort` → `$limit` |

Q1 supplies the four required stages. Q3 uses joined product sub-documents; `$unwind` removes unmatched joins before the limit. Q5 processes an embedded array, counting repeated entries separately, as SQL's `JSON_TABLE` does. Product and review titles in Q3 are limited to 50 and 60 characters.

## Timings Before and After Indexing

One execution per query before and after creating five indexes. Client elapsed time covers `aggregate()` through `toArray()`, excluding file export; it is not explain's `executionTimeMillis`. Every pipeline uses `allowDiskUse: true`.

Baseline indexes: `_id_` on both collections and `reviews_parent_asin` on reviews. Sources: [before timings](mongodb_results/before_indexes/timings.csv), [after timings](mongodb_results/after_indexes/timings.csv), and [comparison](mongodb_results/comparison.csv). Displayed seconds are rounded; ratios use the original milliseconds.

| Query | Question | Index | Before | After | Speedup |
| --- | --- | --- | ---: | ---: | ---: |
| Q1 | How did reviews change over the years? | `idx_reviews_time_rating (reviewed_at, rating)` | 81.753 s | 18.686 s | 4.38× |
| Q2 | Do more expensive electronics get better ratings? | `idx_products_price (price, average_rating, rating_number)` | 7.227 s | 0.417 s | 17.34× |
| Q3 | What do the most helpful reviews look like? | `idx_reviews_helpful (helpful_vote)` | 60.759 s | 0.0230 s | 2,646.17× |
| Q4 | Do verified buyers rate differently? | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 84.247 s | 28.682 s | 2.94× |
| Q5 | Which sub-categories disappoint buyers the most? | `idx_products_rating_number (rating_number, average_rating)` | 7.807 s | 11.495 s | 0.68× |

## Index Build Times

| Index | Table / collection | Build time |
| --- | --- | ---: |
| `idx_reviews_time_rating` | reviews | 92.30 s |
| `idx_products_price` | products | 7.05 s |
| `idx_reviews_helpful` | reviews | 80.46 s |
| `idx_reviews_verified` | reviews | 91.03 s |
| `idx_products_rating_number` | products | 7.14 s |
| **Total** |  | **277.98 s** |

## Why Each Index Helped (or Did Not)

| Query | Speedup | Explanation |
| --- | ---: | --- |
| Q1 | 4.38× | The index contains the date and rating fields used by the yearly summary. It can reduce access to large review documents, but the pipeline still aggregates almost all eligible reviews. |
| Q2 | 17.34× | The index contains all three product fields used by the pipeline, potentially reducing access to descriptions and other large product fields. |
| Q3 | 2,646.17× | The helpful-vote index supports the threshold and descending order. The product _id_ index supports $lookup; only 15 joined reviews are returned. |
| Q4 | 2.94× | The index contains verification, rating, and helpful votes, potentially reducing document access. Counting and averaging still cover almost all eligible reviews. |
| Q5 | 0.68× | The index supports the rating-count filter. MongoDB still expands categories with $unwind, groups entries, and sorts computed percentages; the indexed run was slower. |

## Query Results

The full result of each query is in its exported CSV (`Q1_result.csv` to `Q5_result.csv`). The tables below summarize the MongoDB exports. Full results are available in the [before-index folder](mongodb_results/before_indexes/) and [after-index folder](mongodb_results/after_indexes/).

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
