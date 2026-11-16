# Phase II(a) — SQL Queries, Indexes and Timings

Queries: [sql_queries.sql](../Phase%202%20and%203/Sql/Queries/sql_queries.sql).
Database: `amazon_electronics_reviews`.

## Functional Dependencies

The Phase I model separates product metadata from individual reviews. A functional dependency means that one value, or combination of values, determines another value within a table.

| Table | Dependency | Explanation |
| --- | --- | --- |
| `products` | `parent_asin` → `title`, `average_rating`, `rating_number`, `price`, `main_category`, `store`, `categories`, `description`, `features`, `details` | The product primary key identifies one stored metadata row and therefore determines all its other fields. |
| `reviews` | `(source_id, source_line)` → `parent_asin`, `user_id`, `asin`, `rating`, `title`, `review_text`, `reviewed_at`, `helpful_vote`, `verified_purchase` | The combined primary key identifies one review record by its source file and original line number. |

These dependencies are enforced by the primary keys in [schema.sql](../Phase%201/Create%20and%20Load%20Dataset/schema.sql). The loader keeps the existing row when the same key appears again. Product titles, stores, and user identifiers are not declared unique. A product can have many reviews, so `parent_asin` does not determine an individual review's rating or text.

We also checked the first **100,000 nonblank review source records**, using the Phase I text-cleaning rules and excluding missing identifiers from each check. All 100,000 records had usable `asin` and `parent_asin` values.

| Relationship checked | Sample result | Interpretation |
| --- | --- | --- |
| `asin` → `parent_asin` | 66,260 distinct ASINs; none mapped to more than one parent. | The dependency holds in this sample. It is not enforced by the schema or established for the full dataset. |
| `user_id` → `parent_asin` | 10,714 of the 15,322 distinct users reviewed more than one parent product. | This dependency does not hold. A reviewer can review several products. |

The loader assigns the same `source_id` to this import. Although line numbers distinguish records within that file, the combined key also supports other sources whose line numbers may overlap. Uniqueness within one imported file does not establish `source_line` as a key across multiple sources.

## Normalization

### First Normal Form (1NF)

The scalar fields store one value per column, and the primary keys distinguish rows. However, `categories`, `description`, and `features` preserve lists, while `details` preserves an object inside a JSON column. MySQL stores each as one JSON value, but the contents remain nested or multivalued. The complete model therefore does not follow the traditional flattened 1NF design for those attributes.

We kept these fields together because they describe the same product and preserve the source metadata without creating several additional tables. Q5 expands categories with `JSON_TABLE` when individual category entries are needed. A fully flattened alternative would use separate tables for category entries, descriptions, features, and detail attributes, linked by `parent_asin`. Entry positions could preserve array order and repeated values.

### Second Normal Form (2NF)

For the scalar part of `products`, the primary key has one field, so there is no proper subset of that key on which an attribute could partially depend. For `reviews`, the intended identity is the full `(source_id, source_line)` combination: the source identifies the file, and the line identifies the record within it. Review attributes are attached to that full identity. The model does not define a dependency from either key component alone to a non-key review attribute across multiple sources.

This supports 2NF for the scalar relations under the stated key dependencies. It does not remove the separate 1NF limitation of the nested product JSON fields.

### Third Normal Form (3NF) and BCNF

Keeping product metadata in `products` avoids repeating titles, prices, and stores in every review. If those fields were stored in `reviews`, the review key would determine `parent_asin`, which would then determine the product metadata. Separating the tables avoids that transitive dependency and the need to update the same metadata in many review rows.

For the scalar product fields, the documented dependency has the product key as its determinant. Under that dependency set, the scalar product relation meets 3NF and BCNF. This is a statement about the identified dependencies, rather than proof that no additional business dependencies exist.

The sample observation `asin` → `parent_asin` needs separate attention in `reviews`. If it holds as a rule throughout the dataset, the review key determines `asin`, which determines `parent_asin`. Since `asin` is not a review key and `parent_asin` is not part of the declared key, this would violate 3NF and BCNF. A normalized alternative would keep an ASIN-to-parent mapping in a separate table and obtain the parent through that mapping. Our current design retains both identifiers in each review to support direct product joins.

We therefore describe the model as separating product and review facts while intentionally retaining nested product metadata and both review identifiers. We do not claim that the entire schema is fully normalized or in BCNF; the JSON structure and the sample-observed ASIN dependency require these qualifications.

## Timings Before and After Indexing

| Query | Question | Index used | Before | After | Speedup |
| --- | --- | --- | ---: | ---: | ---: |
| Q1 | How did reviews change over the years? | `idx_reviews_time_rating (reviewed_at, rating)` | 21.759 s | 17.583 s | 1.24× |
| Q2 | Do more expensive electronics get better ratings? | `idx_products_price (price, average_rating, rating_number)` | 30.550 s | 0.191 s | 159.71× |
| Q3 | What do the most helpful reviews look like? | `idx_reviews_helpful (helpful_vote)` | 15.330 s | 0.0145 s | 1,056.95× |
| Q4 | Do verified buyers rate differently? | `idx_reviews_verified (verified_purchase, rating, helpful_vote)` | 27.141 s | 20.384 s | 1.33× |
| Q5 | Which sub-categories disappoint buyers the most? | `idx_products_rating_number (rating_number, average_rating)` | 34.152 s | 32.561 s | 1.05× |

## Index Build Times

Source: [measured index-build times](sql_results/after_indexes/index_build_times.csv). All five indexes were created during this run.

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
