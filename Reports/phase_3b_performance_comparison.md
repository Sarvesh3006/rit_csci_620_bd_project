# Phase III(b) — MySQL and MongoDB Performance Comparison

## Result Validation

For both implementations, we used matching thresholds, UTC years, and rounding rules. SQL joins to `products.parent_asin`; MongoDB joins to `products._id`. For category expansion, we used SQL `JSON_TABLE` and MongoDB `$unwind`.

| Query | Rows per database | CSV results across databases | Before vs. after in each database |
| --- | ---: | --- | --- |
| Q1 — Reviews per year | 27 | Match | Match |
| Q2 — Price vs. rating | 4 | Match | Match |
| Q3 — Helpful reviews | 15 | Match | Match |
| Q4 — Verified reviewers | 2 | Match | Match |
| Q5 — Categories | 15 | Match | Match |

For comparison, we normalized numeric formatting and Boolean values (`1`/`0` versus `true`/`false`) and ignored row order. Sources: SQL [before](sql_results/before_indexes/) / [after](sql_results/after_indexes/); MongoDB [before](mongodb_results/before_indexes/) / [after](mongodb_results/after_indexes/).

## Measurement Method

We ran each query once per configuration. In MySQL, we measured the time from `execute()` through `fetchall()`. In MongoDB, we measured from `aggregate()` through `toArray()`. Sources: [SQL comparison](sql_results/comparison.csv), [MongoDB comparison](mongodb_results/comparison.csv), and [SQL](sql_results/after_indexes/run_info.json) / [MongoDB](mongodb_results/after_indexes/run_info.json) metadata. Seconds are rounded and we use the original milliseconds for ratios.

| Database | Baseline indexes | Added workload indexes |
| --- | --- | --- |
| MySQL | Primary keys on products and reviews | Five indexes defined in the SQL file |
| MongoDB | `_id_` on both collections; `reviews_parent_asin` | Five indexes on the same workload fields |

## Before Workload Indexes

| Query | MySQL | MongoDB | Faster database | Time advantage |
| --- | ---: | ---: | --- | ---: |
| Q1 — Reviews per year | 21.759 s | 81.753 s | MySQL | 3.76× |
| Q2 — Price vs. rating | 30.550 s | 7.227 s | MongoDB | 4.23× |
| Q3 — Helpful reviews | 15.330 s | 60.759 s | MySQL | 3.96× |
| Q4 — Verified reviewers | 27.141 s | 84.247 s | MySQL | 3.10× |
| Q5 — Categories | 34.152 s | 7.807 s | MongoDB | 4.37× |

Time advantage = slower time / faster time. MySQL led on review queries; MongoDB led on product queries.

## After Workload Indexes

| Query | MySQL | MongoDB | Faster database | Time advantage |
| --- | ---: | ---: | --- | ---: |
| Q1 — Reviews per year | 17.583 s | 18.686 s | MySQL | 1.06× |
| Q2 — Price vs. rating | 0.191 s | 0.417 s | MySQL | 2.18× |
| Q3 — Helpful reviews | 0.0145 s | 0.0230 s | MySQL | 1.58× |
| Q4 — Verified reviewers | 20.384 s | 28.682 s | MySQL | 1.41× |
| Q5 — Categories | 32.561 s | 11.495 s | MongoDB | 2.83× |

MySQL was faster on **four of the five queries** after indexing. MongoDB still finished Q5 faster. For Q3, the 1.58× ratio came from a difference of just **8.457 ms**.

## Indexing Effect

Speedup = before time / after time; below 1 indicates a slowdown.

| Query | MySQL speedup | MongoDB speedup | Interpretation |
| --- | ---: | ---: | --- |
| Q1 | 1.24× | 4.38× | Broad yearly aggregation remains; indexed times are close. |
| Q2 | 159.71× | 17.34× | Both improve; MySQL becomes faster. The index contains all three scalar query fields. |
| Q3 | 1,056.95× | 2,646.17× | Largest gains; helpful-vote ordering and product-key lookup suit indexed access. |
| Q4 | 1.33× | 2.94× | Both improve; broad review aggregation remains. |
| Q5 | 1.05× | 0.68× | MongoDB slows by 47.2%, but remains faster than MySQL. Array/JSON expansion, grouping, and sorting remain. |

These interpretations describe intended index benefits but no saved execution plans establish the actual access paths. MongoDB's category-array pipeline outperformed SQL's JSON expansion in both configurations, the timings do not isolate the cause.

## Index Construction

Sources: [MySQL](sql_results/after_indexes/index_build_times.csv) and [MongoDB](mongodb_results/after_indexes/index_build_times.csv).

| Index | MySQL build time | MongoDB build time |
| --- | ---: | ---: |
| `idx_reviews_time_rating` | 116.07 s | 92.30 s |
| `idx_products_price` | 9.86 s | 7.05 s |
| `idx_reviews_helpful` | 110.86 s | 80.46 s |
| `idx_reviews_verified` | 117.88 s | 91.03 s |
| `idx_products_rating_number` | 9.90 s | 7.14 s |
| **Total** | **364.57 s** | **277.98 s** |

MySQL took **1.31×** times longer than MongoDB. In both databases, most of that time went constructing review indexes.

## Combined Query Time

| Configuration | MySQL: sum of five queries | MongoDB: sum of five queries |
| --- | ---: | ---: |
| Before workload indexes | 128.933 s | 241.793 s |
| After workload indexes | 70.734 s | 59.303 s |

After indexing, MySQL took **1.19×** times longer than MongoDB to run all five queries. MongoDB's large advantage on Q5 outweighed its losses on Q1–Q4. These totals include one run of each query but excludes construction of index. Running some queries more often can change overall winner.

## Limits

We ran each query once per configuration and did not control the cache state. We used different clients and drivers for the two databases. We also did not record the full hardware and server setup or measure resource usage. These results describe how MySQL and MongoDB performed on our five queries under the conditions of this test.