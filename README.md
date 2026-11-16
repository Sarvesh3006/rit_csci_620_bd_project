# Amazon Electronics Reviews: MySQL and MongoDB Analysis

**CSCI-620 | Introduction to Big Data**

This project uses Amazon Reviews 2023 Electronics to study product ratings, prices, helpful reviews, purchase verification, and categories. We load the data into MySQL and MongoDB, run five equivalent workloads, and compare performance before and after adding indexes.

## Dataset

[Amazon Reviews 2023](https://amazon-reviews-2023.github.io/) provides two source files: `Electronics.jsonl` for reviews and `meta_Electronics.jsonl` for product metadata. The documented MongoDB import contains **43,886,944 reviews** and **1,610,012 products**, approximately **45.5 million records** in total.

The [Phase I report](Reports/phase_1_report.md) contains download links, field descriptions, and cleaning decisions. Place the source files in `Amazon Electronics Dataset/` locally. They are excluded from version control and must not be included in the submission.

## How the Project Requirements Are Addressed

The requirements are defined in [CSCI-620 Project.pdf](CSCI-620%20Project.pdf).

| Phase | Requirement and implementation | Main files |
| --- | --- | --- |
| I | Select and describe a large dataset, define a relational model, and load it. We profile 100,000 records from each source and load cleaned products and reviews into two MySQL tables. | [Profile program](Phase%201/Profile%20Dataset/profile_data.py), [SQL schema](Phase%201/Create%20and%20Load%20Dataset/schema.sql), [SQL loader](Phase%201/Create%20and%20Load%20Dataset/load_data.py), [report](Reports/phase_1_report.md) |
| II(a) | Implement five SQL queries, explain indexes, measure before/after times, and discuss functional dependencies and normalization. The report includes key dependencies, sample checks, and the tradeoffs of retaining JSON fields. | [SQL queries and indexes](Phase%202%20and%203/Sql/Queries/sql_queries.sql), [report](Reports/phase_2a_sql_results.md) |
| II(b) | Define and load a document model and compare it with the relational model. Product arrays and details are embedded; reviews remain separate and reference products through `parent_asin`. The report describes both collections and the design decisions. | [MongoDB schema](Phase%202%20and%203/Mongodb/Create%20and%20Load%20Dataset/schema_mongodb.py), [MongoDB loader](Phase%202%20and%203/Mongodb/Create%20and%20Load%20Dataset/load_mongodb.py), [report](Reports/phase_2b_mongodb_report.md) |
| III(a) | Implement five MongoDB aggregation queries using document features. Q1 includes `$match`, `$group`, `$project`, and `$sort`; Q3 uses `$lookup` and joined sub-documents; Q5 processes category arrays with `$unwind`. | [MongoDB queries and indexes](Phase%202%20and%203/Mongodb/Queries/mongodb_queries.js), [report](Reports/phase_3a_mongodb_results.md) |
| III(b) | Compare equivalent SQL and MongoDB workloads. We compare their outputs, before/after query times, and index-build times. All five exported results match after numeric and Boolean formatting is normalized. | [Comparison report](Reports/phase_3b_performance_comparison.md), [SQL timings](Reports/sql_results/comparison.csv), [MongoDB timings](Reports/mongodb_results/comparison.csv) |

## Where Things Are

```text
Phase 1/
  Profile Dataset/                  Dataset profiling program
  Create and Load Dataset/          MySQL schema, loader, and cleaning helpers
Phase 2 and 3/
  Sql/Queries/                      Five SQL queries and index definitions
  Mongodb/Create and Load Dataset/  MongoDB schema, loader, and cleaning helpers
  Mongodb/Queries/                  Five aggregation pipelines and indexes
Reports/
  phase_1_report.md                 Dataset and relational model
  phase_2a_sql_results.md           SQL analysis and normalization
  phase_2b_mongodb_report.md        MongoDB model and loading
  phase_3a_mongodb_results.md       MongoDB queries and results
  phase_3b_performance_comparison.md  Cross-database comparison
  sql_results/                     Saved SQL results and timings
  mongodb_results/                 Saved MongoDB results and timings
```

The field profiles are [metadata_fields_phase_1.csv](Reports/metadata_fields_phase_1.csv) and [reviews_fields_phase_1.csv](Reports/reviews_fields_phase_1.csv).

## Setup

Use Python 3, MySQL 8, and a running MongoDB server with `mongosh`. Install the loader dependencies:

```bash
python3 -m pip install mysql-connector-python pymongo
```

Run the profiling and loading programs from the project root. Create each database's schema before running its loader. Set your MySQL connection details in `load_data.py`; the MongoDB programs accept `--uri` and `--database`. Both models use the database name `amazon_electronics_reviews`.

## Running the Queries

### SQL — MySQL Workbench

Open [sql_queries.sql](Phase%202%20and%203/Sql/Queries/sql_queries.sql) and follow its instructions:

1. Run the `USE` line once.
2. Run each query with **Ctrl + Enter** and note its **Duration** (timings BEFORE indexes).
3. Run the **CREATE INDEX** section at the bottom.
4. Run the five queries again (timings AFTER indexes).

### MongoDB — mongosh

Open [mongodb_queries.js](Phase%202%20and%203/Mongodb/Queries/mongodb_queries.js). Start a shell connected to your server:

```bash
mongosh "mongodb://localhost:27017"
```

1. Run the database selection and rounding helper once.
2. Run each query with `.explain("executionStats").aggregate(...)` and note `executionTimeMillis` (timings BEFORE indexes).
3. Run the **CREATE INDEXES** section at the bottom.
4. Run the five queries again (timings AFTER indexes).

For the explain version, keep the pipeline unchanged and remove the final `.toArray()`. To display the result rows, use the original `.aggregate(...).toArray()` form from the file.

## Saved Results

| Database | Before indexes | After indexes | Timing comparison |
| --- | --- | --- | --- |
| MySQL | [Results](Reports/sql_results/before_indexes/) | [Results](Reports/sql_results/after_indexes/) | [comparison.csv](Reports/sql_results/comparison.csv) |
| MongoDB | [Results](Reports/mongodb_results/before_indexes/) | [Results](Reports/mongodb_results/after_indexes/) | [comparison.csv](Reports/mongodb_results/comparison.csv) |

Each result folder contains `Q1_result.csv` through `Q5_result.csv`, matching JSON files, `timings.csv`, and `run_info.json`. The after-index folders also contain `index_build_times.csv`. Detailed timings, findings, and measurement limits are explained in the reports.

> AI assistance was used in generating this README file.
