# Phase III(b) — MySQL and MongoDB Performance Comparison

We compared the five Phase II(a) SQL queries with the five Phase III(a) MongoDB aggregation queries over Amazon Reviews 2023 Electronics. The workload covers yearly review statistics, price bands, helpful reviews joined to products, purchase verification, and embedded product categories. This addresses the execution-performance comparison required by the [project description, Phase III(b)](../CSCI-620%20Project.pdf), page 2.

Implementations: [SQL queries](../Phase%202%20and%203/Sql/Queries/sql_queries.sql) and [MongoDB pipelines](../Phase%202%20and%203/Mongodb/Queries/mongodb_queries.js).
Detailed results: [Phase II(a) SQL report](phase_2a_sql_results.md) and [Phase III(a) MongoDB report](phase_3a_mongodb_results.md).

## Workload Equivalence and Result Validation

The two implementations use corresponding product and review records, the same thresholds, and the same output measures. SQL joins `reviews.parent_asin` to `products.parent_asin`; MongoDB joins the review reference to `products._id`. SQL expands the categories JSON list using `JSON_TABLE`; MongoDB expands the embedded array using `$unwind`. Both use UTC review years and matching rounding rules for the nonnegative averages and percentages.

We compared all exported rows before and after indexing and across the two databases. Numeric values were normalized so formatting such as `4.00` and `4` did not count as a difference. SQL purchase flags `1` and `0` were matched to MongoDB `true` and `false`, and row order was ignored when comparing result sets.

| Query | Returned rows in each database | Result comparison |
| --- | ---: | --- |
| Q1 | 27 | All exported values match. |
| Q2 | 4 | All exported values match. |
| Q3 | 15 | All exported values match after Boolean normalization. |
| Q4 | 2 | All exported values match. |
| Q5 | 15 | All exported values match. |

All five queries returned matching results across MySQL and MongoDB after normalizing numeric and Boolean formatting. Within each database, all five queries also returned the same result values before and after indexing.

Validation sources: SQL [before](sql_results/before_indexes/) and [after](sql_results/after_indexes/) exports; MongoDB [before](mongodb_results/before_indexes/) and [after](mongodb_results/after_indexes/) exports.

## Measurement Method and Index Configurations

Each query was timed once before and once after creating five additional query indexes. MySQL timings cover the Python connector's `execute()` and `fetchall()`. MongoDB timings cover standalone `mongosh`'s `aggregate()` and `toArray()`. Both measurements include execution and result retrieval and exclude writing result files. They are client elapsed times, rather than identical server-side timer measurements.

MySQL's baseline had only the product and review primary-key indexes. MongoDB's baseline had the two automatic `_id_` indexes and the existing `reviews_parent_asin` index. Therefore, “before indexing” means before adding the five workload indexes, rather than a database without any indexes. Both systems then received indexes on the same workload fields: `(reviewed_at, rating)`, `(price, average_rating, rating_number)`, `(helpful_vote)`, `(verified_purchase, rating, helpful_vote)`, and `(rating_number, average_rating)`.

Measurement sources: [SQL comparison](sql_results/comparison.csv) and [MongoDB comparison](mongodb_results/comparison.csv). The [SQL run metadata](sql_results/after_indexes/run_info.json) and [MongoDB run metadata](mongodb_results/after_indexes/run_info.json) record the timing methods. Displayed times are rounded seconds; ratios are calculated from the unrounded millisecond measurements.

## Performance Before Adding the Query Indexes

| Query | MySQL | MongoDB | Faster database | Time advantage |
| --- | ---: | ---: | --- | ---: |
| Q1 — Reviews per year | 21.759 s | 81.753 s | MySQL | 3.76× |
| Q2 — Price range vs. rating | 30.550 s | 7.227 s | MongoDB | 4.23× |
| Q3 — Most helpful reviews | 15.330 s | 60.759 s | MySQL | 3.96× |
| Q4 — Verified reviewers | 27.141 s | 84.247 s | MySQL | 3.10× |
| Q5 — Disappointing categories | 34.152 s | 7.807 s | MongoDB | 4.37× |

The time advantage is the slower elapsed time divided by the faster elapsed time. Before the workload indexes, MySQL was faster for all three review-based queries, while MongoDB was faster for both product-based queries.

## Performance After Adding the Query Indexes

| Query | MySQL | MongoDB | Faster database | Time advantage |
| --- | ---: | ---: | --- | ---: |
| Q1 — Reviews per year | 17.583 s | 18.686 s | MySQL | 1.06× |
| Q2 — Price range vs. rating | 0.191 s | 0.417 s | MySQL | 2.18× |
| Q3 — Most helpful reviews | 0.0145 s | 0.0230 s | MySQL | 1.58× |
| Q4 — Verified reviewers | 20.384 s | 28.682 s | MySQL | 1.41× |
| Q5 — Disappointing categories | 32.561 s | 11.495 s | MongoDB | 2.83× |

MySQL was faster for four of the five indexed queries. MongoDB retained an advantage for the category-array workload, Q5. Q1's indexed times were close, while Q3 completed in approximately 14.5 ms in MySQL and 23.0 ms in MongoDB; its relative advantage corresponds to a small absolute difference.

## Effect of Indexing

| Query | MySQL speedup | MongoDB speedup | Observed effect |
| --- | ---: | ---: | --- |
| Q1 | 1.24× | 4.38× | MongoDB closed most of the baseline gap. |
| Q2 | 159.71× | 17.34× | Both improved substantially; MySQL became faster. |
| Q3 | 1,056.95× | 2,646.17× | Both changed from seconds to milliseconds. |
| Q4 | 1.33× | 2.94× | Both improved; MySQL remained faster. |
| Q5 | 1.05× | 0.68× | MySQL improved slightly; MongoDB took 1.47× as long after indexing. |

Q3 benefited most in both systems. Its helpful-vote predicate, descending order, and small output limit suit an ordered helpful-vote index, while product keys support the join. Q1 and Q4 still aggregate nearly the full eligible review population, so adding indexes does not remove their counting and averaging work. Q2 uses only three scalar product fields, which makes compact index access a useful design choice.

Q5 illustrates a different pattern. MongoDB processes the category array already embedded in each product, whereas MySQL expands a JSON column with `JSON_TABLE`. The array-oriented MongoDB pipeline was faster in both configurations in this experiment. However, its proposed rating-count index did not improve the measured time: the pipeline still needs category expansion, grouping, and sorting. This supports evaluating indexes against the actual workload rather than assuming every added index will reduce elapsed time.

These explanations follow the query structures and intended index benefits. No saved execution plans establish the exact access paths or prove that a particular storage-model feature caused the timing differences. MongoDB's [aggregation optimization documentation](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/) describes when early filters and sorts can use indexes.

## Index Construction Cost

| Index | MySQL build time | MongoDB build time |
| --- | ---: | ---: |
| `idx_reviews_time_rating` | 116.07 s | 92.30 s |
| `idx_products_price` | 9.86 s | 7.05 s |
| `idx_reviews_helpful` | 110.86 s | 80.46 s |
| `idx_reviews_verified` | 117.88 s | 91.03 s |
| `idx_products_rating_number` | 9.90 s | 7.14 s |
| **Total** | **364.57 s** | **277.98 s** |

MongoDB's total measured index-construction time was lower; MySQL took approximately 1.31 times as long. Both systems spent most of that time building the three review indexes. These are construction costs and are separate from the query-execution timings.

Sources: [MySQL index-build times](sql_results/after_indexes/index_build_times.csv) and [MongoDB index-build times](mongodb_results/after_indexes/index_build_times.csv).

## Combined Workload and Interpretation

| Configuration | Sum of five MySQL query times | Sum of five MongoDB query times |
| --- | ---: | ---: |
| Before query indexes | 128.933 s | 241.793 s |
| After query indexes | 70.734 s | 59.303 s |

For one execution of each indexed query, MongoDB's summed elapsed time was lower by approximately 1.19×, despite MySQL winning four individual queries. The reason is that MongoDB's large absolute advantage on Q5 outweighs its disadvantages on the other four. These sums exclude index construction and represent this particular equal-count workload, not a general database ranking.

For workloads dominated by these indexed scalar summaries and top-review lookups, the observed results favor MySQL on a per-query basis. For the category-array aggregation, the results favor MongoDB. Indexing changed the comparison substantially, especially for Q2 and Q3, so evaluating only the baseline would give an incomplete view.

## Limits of the Comparison

Each configuration has only one timing per query. The after-index runs followed baseline queries and index construction, and cache state was not controlled. The clients use different language runtimes and drivers, and the saved metadata does not record complete hardware, server-version, memory, or configuration information. Execution plans, disk reads, CPU usage, and memory consumption were not measured.

The measured performance differences are observations from these runs. Repeated trials, controlled cache conditions, and saved execution plans would strengthen a later comparison without changing the findings reported here.
