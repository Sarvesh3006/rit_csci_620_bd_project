# Amazon Electronics Reviews: Relational and Document Database Analysis

**CSCI-620 | Introduction to Big Data**

## Project Description

Amazon product reviews combine customer feedback with product metadata, including ratings, prices, categories, and purchase verification. Analyzing this data at scale requires a database model that preserves useful relationships while handling missing values, inconsistent types, and nested attributes.

This project uses the Electronics category of Amazon Reviews 2023 to explore relational and document-oriented data management. Phase 1 profiles the source files, defines a MySQL schema, and provides utilities for validating and loading records. Phase II(a) provides SQL workloads and indexing results, and Phase II(b) defines and loads a MongoDB model. Phase III will compare performance between the two database systems.

## Phase 1 — Dataset Profiling & Relational Data Loading

### Dataset

The dataset comes from McAuley Lab's **Amazon Reviews 2023** collection. The published Electronics statistics list approximately **43.9 million reviews** and **1.6 million items represented in reviews**; these are source statistics, not verified database row counts. Some reviewed items lack product metadata. [Dataset source and statistics](https://amazon-reviews-2023.github.io/).

Two JSON Lines files are used, each containing one JSON object per line:

- `Electronics.jsonl` — Customer reviews, including ratings, review titles and text, product identifiers, user identifiers, timestamps, helpful votes, and verified-purchase status.
- `meta_Electronics.jsonl` — Product metadata, including titles, average ratings, rating counts, prices, stores, categories, descriptions, features, and details.

Download the files from the links recorded in the Phase 1 report:

- [Electronics reviews](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/review_categories/Electronics.jsonl?download=true)
- [Electronics product metadata](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories/meta_Electronics.jsonl?download=true)

Place both files in `Amazon Electronics Dataset/` at the project root. The raw JSONL files are excluded from version control through `.gitignore`.

### Dataset Profiling

[profile_data.py](Phase%201/Profile%20Dataset/profile_data.py) streams each file and profiles its first **100,000 nonblank records**. It records the following for every observed top-level field:

- Observed Python types and their counts.
- Absent fields, explicit nulls, and blank strings.
- Empty lists and dictionaries.
- Missing percentage, calculated from absent fields, nulls, and blank strings among valid records.

Empty containers are reported separately and do not contribute to the missing percentage. Set `PROFILE_LIMIT = None` to scan the full files.

### Phase 1 Profiling Results

View the complete reports:

- [Metadata field profile](Reports/phase_1_metadata_profile.csv)
- [Review field profile](Reports/phase_1_reviews_profile.csv)
- Phase 1 report: [PDF](Reports/phase_1_report.pdf) · [Markdown](Reports/phase_1_report.md)

### Relational Model

[schema.sql](Phase%201/Create%20and%20Load%20Dataset/schema.sql) creates the `amazon_electronics_reviews` database with two InnoDB tables.

**Products**

| Column | MySQL type | Purpose |
| --- | --- | --- |
| `parent_asin` | `VARCHAR(20)` primary key | Product identifier shared with reviews |
| `title` | `LONGTEXT` | Product title |
| `average_rating` | `DECIMAL(3, 2)` | Average product rating |
| `rating_number` | `BIGINT` | Number of ratings |
| `price` | `DECIMAL(15, 2)` | Product price |
| `main_category`, `store` | `TEXT` | Category and store information |
| `categories`, `description`, `features` | `JSON` | Nested lists preserved from metadata |
| `details` | `JSON` | Product attributes preserved as an object |

**Reviews**

| Column | MySQL type | Purpose |
| --- | --- | --- |
| `source_id` | `VARCHAR(100)` | Dataset identifier |
| `source_line` | `BIGINT` | Original JSONL line number |
| `parent_asin` | `VARCHAR(20) NOT NULL` | Link to the product |
| `user_id` | `VARCHAR(100)` | Reviewer identifier |
| `asin` | `VARCHAR(20)` | Reviewed item or variant identifier |
| `rating` | `DECIMAL(3, 2)` | Review rating |
| `title`, `review_text` | `LONGTEXT` | Review title and body |
| `reviewed_at` | `DATETIME(3)` | Review timestamp stored in UTC |
| `helpful_vote` | `BIGINT` | Helpful-vote count |
| `verified_purchase` | `BOOLEAN` | Purchase verification flag |

Reviews use the composite primary key **(`source_id`, `source_line`)**.

The intended relationship is one product to many reviews through `parent_asin`. 

The schema initially creates the tables without a foreign key; the loader's `cleanup_reviews()` function adds `reviews_product_fk` after loading.

Images and videos are excluded from the relational model. Product `author`, `subtitle`, and `bought_together` fields are also excluded.

### Data Validation & Loading

[util.py](Phase%201/Create%20and%20Load%20Dataset/util.py) implements the data-cleaning helpers:

- `read_json()` streams records with their original line numbers and marks malformed JSON or non-object records as invalid.
- `text()` converts missing, blank, or non-string values to `None` and cleans unsupported characters.
- `number()` validates finite, nonnegative numbers, ratings between 1 and 5, integer counts within the signed `BIGINT` range, and prices within the schema's decimal range.
- `boolean()` accepts only actual `True` and `False` values.
- `review_time()` converts Unix milliseconds into a UTC datetime.
- `json_value()` checks the expected container type, cleans nested values, and serializes lists or dictionaries for MySQL.

[load_data.py](Phase%201/Create%20and%20Load%20Dataset/load_data.py) provides product and review loaders. Both skip records without a usable `parent_asin`, insert records in **5,000-row batches**, and commit each completed batch. Invalid optional values become SQL `NULL`; empty JSON containers remain intact. Reviews can be retained even when their text is missing.

Duplicate primary keys are skipped using `ON DUPLICATE KEY UPDATE` statements that leave the existing row unchanged. UTC timestamps are stored without timezone information in `DATETIME(3)` columns.

### Running Phase 1

Run commands from the project root so the scripts can locate the dataset folder.

1. Install Python 3 and have a running MySQL server with JSON-column support and the MySQL command-line client. Install the Python connector:

   ```bash
   python3 -m pip install mysql-connector-python
   ```

2. Download and place the two source files in `Amazon Electronics Dataset/`.

3. Generate the profiling reports:

   ```bash
   python3 "Phase 1/Profile Dataset/profile_data.py"
   ```

4. Create the database and tables:

   ```bash
   mysql -u root -p < "Phase 1/Create and Load Dataset/schema.sql"
   ```

5. Update the connection settings in `load_data.py` for your local MySQL installation. The current settings use `localhost`, user `root`, an empty password, and database `amazon_electronics_reviews`.

6. For an initial full import run:

   ```bash
   python3 "Phase 1/Create and Load Dataset/load_data.py"
   ```

The foreign-key addition is a one-time step. For subsequent imports, adjust the cleanup call so it does not attempt to add the existing constraint again.

## Phase II(a) — SQL Queries, Indexes and Timings

- [SQL queries and index definitions](Phase%201/Create%20and%20Load%20Dataset/phase2_queries.sql)
- [Query results and before/after indexing timings](Reports/phase_2a_sql_results.md)

## Phase II(b) — MongoDB Schema and Dataset Loading

This implementation loads the Electronics subset of Amazon Reviews 2023 into MongoDB using two collections, `products` and `reviews`.

### Files

| File | Purpose |
| --- | --- |
| [schema_mongodb.py](Phase%202/mongodb/schema_mongodb.py) | Defines collection fields, BSON types, required keys, validation rules, and indexes. |
| [load_mongodb.py](Phase%202/mongodb/load_mongodb.py) | Streams the JSONL files, inserts cleaned documents in batches, then removes reviews without matching products. |
| [util.py](Phase%202/mongodb/util.py) | Reuses the Phase I data-cleaning helpers without changes. |

The schema file uses the version containing `PRODUCT_SCHEMA`, `REVIEW_SCHEMA`, `bsonType`, and `$jsonSchema` validation.

### Document Model

#### Products

Each document represents one product. Its `_id` stores the cleaned `parent_asin`.

| Field | BSON type | Purpose |
| --- | --- | --- |
| `_id` | String | Required product key, taken from `parent_asin` |
| `title` | String or null | Product title |
| `average_rating` | Decimal128 or null | Metadata average rating |
| `rating_number` | Int64 or null | Metadata rating count |
| `price` | Decimal128 or null | Product price |
| `main_category` | String or null | Main category |
| `store` | String or null | Store name |
| `categories` | Array or null | Embedded categories |
| `description` | Array or null | Embedded descriptions |
| `features` | Array or null | Embedded features |
| `details` | Document or null | Embedded product attributes |

#### Reviews

Each document represents one review source record. Its `_id` combines `source_id` and `source_line`, constructed in that order, matching the composite identity used in MySQL.

| Field | BSON type | Purpose |
| --- | --- | --- |
| `_id` | Document | Required composite review key |
| `_id.source_id` | String | Required dataset identifier, `amazon2023-electronics` |
| `_id.source_line` | Int64 | Required original JSONL line number |
| `parent_asin` | String | Required reference to `products._id` |
| `user_id` | String or null | Reviewer identifier |
| `asin` | String or null | Reviewed item or variant identifier |
| `rating` | Decimal128 or null | Review rating |
| `title` | String or null | Review title |
| `review_text` | String or null | Review body |
| `reviewed_at` | Date or null | UTC review timestamp |
| `helpful_vote` | Int64 or null | Helpful-vote count |
| `verified_purchase` | Boolean or null | Verified-purchase status |

The loader writes optional fields as null when values are missing or invalid. The schema permits optional fields to be absent or null. Valid empty arrays and objects are preserved, and nested values follow Phase I cleaning.

#### Embedding and References

Categories, descriptions, features, and details are embedded in product documents. Reviews are stored separately because the number of reviews per product can grow substantially. Keeping reviews separate avoids an unbounded review array inside each product document.

The relationship uses `reviews.parent_asin` and `products._id`. Schema validation checks document structure and types; it does not enforce a foreign key between collections.

Images, videos, product author, subtitle, and bought_together are excluded, matching the Phase I model.

#### Indexes and Validation

MongoDB automatically creates a unique `_id` index on each collection. The schema script also creates the nonunique `reviews_parent_asin` index on `reviews.parent_asin`. The loader requests the same index after loading and cleanup, so it also supports running independently.

For a new database, the schema script creates the collections with `$jsonSchema` validation. For existing collections, it applies the rules using `collMod`. Validation uses `strict` with action `error`, checking future inserts and updates. Applying these rules does not retroactively validate existing documents.

### Setup and Execution

Run the following commands in a terminal from the project root. Start your local MongoDB server first. Place both `Electronics.jsonl` and `meta_Electronics.jsonl` inside `Amazon Electronics Dataset` at the project root. Keep all three Python files together in `Phase 2/mongodb`.

#### Install PyMongo

```bash
python3 -m pip install pymongo
```

#### Small Validation Run

Create the test database schema, then load the first 1,000 physical lines of each source file and clean the sample reviews.

```bash
python3 "Phase 2/mongodb/schema_mongodb.py" --database amazon_electronics_test

python3 "Phase 2/mongodb/load_mongodb.py" \
  --database amazon_electronics_test \
  --data-folder "Amazon Electronics Dataset" \
  --limit 1000
```

Blank lines are ignored in the scanned total but retain their position in source-line numbering. Rerunning the same import skips existing IDs. Identical review content on different source lines remains separate records.

Open `mongosh` and inspect the sample.

```javascript
use amazon_electronics_test

db.products.countDocuments({})
db.reviews.countDocuments({})
db.products.findOne()
db.reviews.findOne()
db.products.getIndexes()
db.reviews.getIndexes()
```

The original sample import, before cleanup was added, contained 1,000 documents in each collection. With cleanup enabled, the sample review count may be lower because the first 1,000 metadata lines may not contain every product referenced by the sampled reviews. This sample checks loader behavior rather than representing a complete product-matched dataset.

#### Full Import

Run the schema script first, then run the loader without `--limit`. The loader loads products, loads reviews, and then calls `cleanup_reviews()` to delete unmatched reviews in batches of 5,000.

```bash
python3 "Phase 2/mongodb/schema_mongodb.py"

python3 "Phase 2/mongodb/load_mongodb.py" \
  --data-folder "Amazon Electronics Dataset"
```

Both scripts use `mongodb://localhost:27017` and the database `amazon_electronics_reviews` by default. They also accept `--uri` and `--database` arguments.

#### Cleanup for an Existing Import

If the dataset is already loaded, use the updated loader to run cleanup without rereading the JSONL files. Keep other imports and collection edits stopped during cleanup, and ensure product loading is complete. The script refuses cleanup if either collection is absent or the product collection is empty.

First count unmatched reviews without deleting them.

```bash
python3 "Phase 2/mongodb/load_mongodb.py" --cleanup-only --count-only
```

Then delete reviews whose `parent_asin` has no matching product `_id`.

```bash
python3 "Phase 2/mongodb/load_mongodb.py" --cleanup-only
```

Each pass scans reviews in batches and prints `checked`, `unmatched`, and `deleted` totals. Count-only mode reports zero deletions. Cleanup is restricted to reviews from `amazon2023-electronics`, matching the MySQL loader's source scope. It uses the existing `_id` index to advance through source records and checks product keys once per batch. A completed cleanup can be rerun, and an interrupted cleanup can be restarted to recheck remaining reviews.

If schema validation has not yet been applied, run `schema_mongodb.py` once. Applying the schema and performing cleanup are separate operations.

Verify the full import in `mongosh`.

```javascript
use amazon_electronics_reviews

db.products.countDocuments({})
db.reviews.countDocuments({})
db.products.getIndexes()
db.reviews.getIndexes()
```

### Confirmed Import Results Before Cleanup

The original full import produced the following results before unmatched reviews were removed. These counts were confirmed using `countDocuments()` in mongosh.

| Collection | Scanned records | Inserted documents |
| --- | ---: | ---: |
| `products` | 1,610,012 | 1,610,012 |
| `reviews` | 43,886,944 | 43,886,944 |

Both collections reported zero duplicate keys, missing parent identifiers, and malformed or non-object records. These counts do not establish that every optional source field was valid; invalid optional values may have become null.

The confirmed indexes are `products._id_`, `reviews._id_`, and `reviews.reviews_parent_asin`.

The cleanup deletion count and final retained review count are pending the local cleanup run. Record both from the cleanup summary and `db.reviews.countDocuments({})`. Cleanup affects reviews only, so the product count remains 1,610,012. For a stable database containing only this review source, the final review count should equal 43,886,944 minus the total reviews deleted across cleanup runs.

### Missing Product Metadata and MySQL Comparability

The updated MongoDB loader follows the same inclusion policy as the MySQL cleanup. It first loads records, then deletes reviews whose `parent_asin` has no matching product. The original MongoDB import retained these reviews, so the existing database requires the cleanup-only run described above.

In the team's MySQL version, only the `ALTER TABLE` foreign-key addition was commented out. The preceding unmatched-review deletion remains active when `cleanup_reviews()` runs. MongoDB cleanup implements that same record-selection rule without installing a foreign key.

The loader still supports `--require-product` to filter unmatched reviews during insertion. The standard workflow documented here loads first and performs cleanup afterward. The insertion counter `unmatched_product` records only insertion-time filtering, while the separate cleanup summary records unmatched reviews found after loading.

Once cleanup completes, both implementations are intended to contain reviews with matching product metadata. Exact population equivalence still requires checking the actual MySQL counts, retained identities, and cleaned values. MySQL collation and identifier-length constraints can affect which keys match. A reported cleanup policy alone does not prove that the actual database runs produced identical records.

### Loading Behavior

- Reads one JSONL record at a time and inserts in batches of 5,000.
- Loads products, loads reviews, then removes unmatched reviews in batches. If `--limit` is provided, cleanup is restricted to this source through that physical review line number.
- Keeps the first product record for each product key and skips existing review IDs on reruns. A full rerun can reinsert previously deleted unmatched reviews before cleanup removes them again.
- Converts invalid optional values using the Phase I cleaning rules.
- Stores ratings and prices as Decimal128 with two decimal places, using half-up rounding. Confirm decimal parity with the actual MySQL import before benchmarking.
- Stores timestamps as UTC BSON dates with millisecond precision.
- Reports cleanup totals separately from insertion totals.
- Reports `scanned`, `inserted`, `duplicate`, `missing_parent`, `invalid`, and `unmatched_product` counts. The `invalid` counter covers malformed JSON and non-object records. Blank lines are ignored.
- Stops on unexpected BSON encoding errors, oversized documents, or database errors. Previously completed writes remain saved.

Reruns use the original source identities, so keep source files unchanged and run one loader per target database. Phase II(b) documents the model and its design comparison with MySQL. Equivalent-query performance measurements belong to Phase III.

[Phase II(b) MongoDB report](Reports/phase_2b_mongodb_report.md) provides the accompanying design report.

---

> **Note:** AI assistance was used in generating code comments and documentation throughout this project.
