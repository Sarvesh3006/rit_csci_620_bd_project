# Phase III(a) — MongoDB Aggregation Queries, Indexes and Timings

We implemented five aggregation queries over the Amazon Reviews 2023 Electronics dataset in `amazon_electronics_reviews`. They answer the same questions as the Phase II(a) SQL workload using the `products` and `reviews` collections described in the [Phase II(b) report](phase_2b_mongodb_report.md).

Queries: [mongodb_queries.js](../Phase%202%20and%203/Mongodb/Queries/mongodb_queries.js).
Requirements: [CSCI-620 project description, Phase III(a)](../CSCI-620%20Project.pdf), pages 1–2.

## Aggregation Design

| Query | Question | Collection | Main pipeline stages |
| --- | --- | --- | --- |
| Q1 | How did reviews change over the years? | `reviews` | `$match` → `$group` → `$project` → `$sort` |
| Q2 | Do more expensive electronics get better ratings? | `products` | `$match` → `$group` → `$project` → `$sort` |
| Q3 | What do the most helpful reviews look like? | `reviews`, joined to `products` | `$match` → `$sort` → `$lookup` → `$unwind` → `$limit` → `$project` |
| Q4 | Do verified buyers rate differently? | `reviews` | `$match` → `$group` → `$sort` → `$project` |
| Q5 | Which sub-categories disappoint buyers the most? | `products` | `$match` → `$unwind` → `$match` → `$group` → `$match` → `$project` → `$sort` → `$limit` |

### Q1 — Reviews per year

`$match` excludes reviews with missing dates or ratings. `$group` extracts the UTC year and calculates review counts, average ratings, and counts of 5-star and 1-star reviews. `$project` calculates the percentages and rounds the results, and `$sort` puts the years in chronological order. This query uses all four pipeline stages explicitly required by Phase III(a).

### Q2 — Price range vs. rating

The pipeline selects products with a price, an average rating, and at least 10 ratings. `$switch` assigns each product to the same four price ranges used in SQL. `$group` calculates the number of products, mean rating, share rated below 3.5, and average rating count. `$project` formats the results and `$sort` orders the price ranges.

### Q3 — Most helpful reviews and their products

The pipeline selects reviews with at least 1,000 helpful votes and sorts them from most to least helpful. `$lookup` matches `reviews.parent_asin` to `products._id`, creating an array of matching product documents. `$unwind` expands that array and removes unmatched reviews, giving the inner-join behavior of the SQL query. `$limit` retains the top 15 joined reviews. `$project` reads fields from the joined product sub-document and shortens product and review titles to 50 and 60 characters. The limit remains after the join so unmatched reviews cannot consume places in the top 15. See MongoDB's [$lookup documentation](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/).

### Q4 — Verified vs. non-verified reviewers

After excluding missing verification flags and ratings, `$group` separates verified buyers from other reviewers. It calculates review counts, average ratings, 5-star and 1-star percentages, and average helpful votes. `$sort` places verified buyers first, and `$project` adds readable group labels and rounded output values.

### Q5 — Disappointing sub-categories

The pipeline selects products with an average rating and at least 10 ratings. `$unwind` processes the embedded `categories` array, producing one pipeline document for each category entry. It excludes `Electronics` and null categories, then groups the remaining entries by category. A second group-level filter retains categories with at least 1,000 entries. The final stages calculate low-rating percentages and averages, sort by the low-rating percentage, and return the top 15. Products can contribute to more than one category, matching SQL's `JSON_TABLE` expansion. See MongoDB's [$unwind documentation](https://www.mongodb.com/docs/manual/reference/operator/aggregation/unwind/).

These queries satisfy the five-query requirement, the required multi-stage aggregation, the secondary-collection join, and array manipulation. Q3 also accesses fields inside the product sub-documents produced by `$lookup`.

## Measurement Method

The standalone `mongosh` runner executed each pipeline once before creating the five query indexes and once afterward. It measured client elapsed time from `aggregate()` through completion of `toArray()`, excluding CSV and JSON export. These are elapsed measurements, rather than explain's `executionTimeMillis`. All pipelines used `allowDiskUse: true`; this option does not establish that a query actually spilled to disk.

The baseline retained the automatic `_id_` indexes on both collections and the existing `reviews_parent_asin` index. The five additional query indexes were created between the baseline and indexed runs. Their definitions are included in [mongodb_queries.js](../Phase%202%20and%203/Mongodb/Queries/mongodb_queries.js), and their creation times are recorded in the [index-build measurements](mongodb_results/after_indexes/index_build_times.csv).

Sources: [before timings](mongodb_results/before_indexes/timings.csv), [after timings](mongodb_results/after_indexes/timings.csv), and [timing comparison](mongodb_results/comparison.csv). Times below are converted from milliseconds to seconds; speedups use the unrounded elapsed measurements.

## Timings Before and After Indexing

| Query | Index proposed | Before | After | Speedup (before / after) |
| --- | --- | ---: | ---: | ---: |
| Q1 | `idx_reviews_time_rating (reviewed_at, rating)` | 81.753 s | 18.686 s | 4.38× |
| Q2 | `idx_products_price (price, average_rating, rating_number)` | 7.227 s | 0.417 s | 17.34× |
| Q3 | `idx_reviews_helpful (helpful_vote)` | 60.759 s | 0.0230 s | 2,646.17× |
| Q4 | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 84.247 s | 28.682 s | 2.94× |
| Q5 | `idx_products_rating_number (rating_number, average_rating)` | 7.807 s | 11.495 s | 0.68× |

A speedup below 1 means the indexed run was slower. Q5 took **1.47× as long**, an increase of approximately **47.2%**.

## Index Build Times

Source: [index-build measurements](mongodb_results/after_indexes/index_build_times.csv).

| Index | Collection | Build time |
| --- | --- | ---: |
| `idx_reviews_time_rating` | reviews | 92.30 s |
| `idx_products_price` | products | 7.05 s |
| `idx_reviews_helpful` | reviews | 80.46 s |
| `idx_reviews_verified` | reviews | 91.03 s |
| `idx_products_rating_number` | products | 7.14 s |
| **Total** | | **277.98 s** |

The three review indexes took substantially longer to build than the two product indexes, consistent with the much larger review collection.

## Why the Indexed Configuration Helped or Did Not Help

The following explanations describe the intended benefits of the indexed fields. The query file provides the index definitions, and the saved results record elapsed times, but no execution plans were saved. They therefore do not confirm which index or access method the optimizer selected. MongoDB documents that early `$match` and eligible `$sort` stages can benefit from indexes in its [aggregation optimization guidance](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/).

- **Q3, 2,646.17× faster.** The helpful-vote index supports the initial threshold and descending order. The existing `products._id_` index supports product matching during `$lookup`. This combination can avoid scanning and sorting the entire review collection before producing the top joined reviews.
- **Q2, 17.34× faster.** The proposed compound index contains the three numeric fields needed for filtering and aggregation. Its field coverage offers a way to reduce access to large product documents containing descriptions and other embedded data.
- **Q1 and Q4, 4.38× and 2.94× faster.** Their compound indexes contain the scalar fields used in filtering and aggregation. Both workloads still calculate statistics over almost the entire review population, so they retain substantial aggregation work.
- **Q5, 0.68× speedup.** The proposed index addresses the rating-count filter, but the pipeline must still expand category arrays, group category entries, and sort computed percentages. The indexed configuration was slower in this run. Additional document lookups and cache or execution variation are possible explanations; the timings alone do not identify the cause.

## Query Results

The before- and after-index exports contain the same result values for every MongoDB query. The returned row counts were 27, 4, 15, 2, and 15 for Q1–Q5, respectively. Full CSV and Extended JSON outputs are saved in the [before-index folder](mongodb_results/before_indexes/) and [after-index folder](mongodb_results/after_indexes/). Values below are formatted for readability.

### Q1 — Reviews per year (first five years)

| Year | Reviews | Avg rating | % 5-star | % 1-star |
| --- | ---: | ---: | ---: | ---: |
| 1996 | 1 | 4.00 | 0.0 | 0.0 |
| 1998 | 9 | 4.78 | 77.8 | 0.0 |
| 1999 | 419 | 4.15 | 55.4 | 6.7 |
| 2000 | 3,756 | 4.14 | 53.9 | 7.4 |
| 2001 | 6,841 | 3.97 | 49.7 | 10.5 |

Across all 27 years, this query includes **43,886,942 reviews** with usable dates and ratings.

### Q2 — Price range vs. rating

| Price range | Products | Avg rating | % rated below 3.5 | Avg ratings per product |
| --- | ---: | ---: | ---: | ---: |
| Under $25 | 182,113 | 4.27 | 4.5 | 519 |
| $25 – $99 | 97,703 | 4.19 | 6.7 | 566 |
| $100 – $499 | 45,074 | 4.16 | 7.4 | 410 |
| $500 and up | 10,682 | 4.20 | 6.1 | 167 |

Products under $25 have the highest average rating and lowest low-rating percentage. Higher prices do not correspond to higher average ratings in these groups. The results match the SQL output, as discussed in the [Phase III(b) report](phase_3b_performance_comparison.md).

### Q3 — Most helpful reviews (top four; product names shortened)

| Product | Store | Rating | Helpful votes | Verified |
| --- | --- | ---: | ---: | --- |
| Fire Tablet with Alexa, 7-inch display | Amazon | 5.00 | 46,841 | Yes |
| Fire TV Stick with Alexa Voice Remote | Amazon | 5.00 | 32,948 | Yes |
| Amazon Fire TV – 1st Generation | Amazon | 5.00 | 26,331 | Yes |
| Kindle Wireless Reading Device | Amazon | 1.00 | 24,261 | Yes |

The highest-voted reviews concern Amazon devices. The fourth review is a 1-star review, showing that critical reviews can also receive substantial helpful-vote support.

### Q4 — Verified vs. non-verified reviewers

| Reviewer | Reviews | Avg rating | % 5-star | % 1-star | Avg helpful votes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Verified buyer | 40,546,882 | 4.12 | 64.2 | 11.8 | 0.98 |
| Not verified | 3,340,060 | 3.82 | 53.5 | 16.6 | 2.46 |

Non-verified reviewers give lower average ratings and have a larger 1-star share. Their reviews receive approximately 2.5 times as many helpful votes on average.

### Q5 — Most disappointing sub-categories (top five)

| Category | Products | % rated below 3.5 | Avg rating | Avg price |
| --- | ---: | ---: | ---: | ---: |
| Hidden Cameras | 1,752 | 50.9 | 3.52 | $71.16 |
| Audio Docks | 1,012 | 46.2 | 3.52 | $101.51 |
| MP3 & MP4 Players | 3,175 | 41.6 | 3.56 | $133.75 |
| DVD Players & Recorders | 1,228 | 39.4 | 3.60 | $181.12 |
| Repeaters | 1,600 | 38.4 | 3.64 | $54.75 |

Hidden Cameras has the largest low-rating percentage among the reported categories: 50.9% of qualifying product entries are rated below 3.5.

## Measurement Limits

Each query was measured once per configuration, with the indexed run following the baseline and index creation. Cache effects and run-to-run variation were not isolated. The results establish the observed timings for this workload; repeated trials and execution plans would be needed to distinguish the optimizer's behavior from other influences on elapsed time.
