# Phase II(b) — MongoDB Design and Comparison with MySQL

We created two collections in MongoDB containing the 2023 Electronic Amazon Reviews dataset. This gave us **1610012 products** and **43886944 reviews**.

## Collection Structures

We represented each product by one document in the `products` collection. The field named `_id` contains the clean `parent_asin` value from the original data.

| Fields | BSON type | Purpose |
| --- | --- | --- |
| `_id` | String | Required product key (`parent_asin`) |
| `title`, `main_category`, `store` | String or null | Product name, category, and store |
| `average_rating`, `price` | Decimal128 or null | Metadata average rating and price |
| `rating_number` | Int64 or null | Metadata rating count |
| `categories`, `description`, `features` | Array or null | Embedded product information |
| `details` | Document or null | Embedded attributes, such as manufacturer and color |

Also, the review from the source is represented by one document in the `reviews` collection. Equivalent to the primary keys we have in MySQL, in MongoDB we have `_id` field with an embedded document where `source_id` and `source_line` are combined.

| Fields | BSON type | Purpose |
| --- | --- | --- |
| `_id` | Document | Required combined review key |
| `_id.source_id` | String | Required dataset identifier |
| `_id.source_line` | Int64 | Required original JSONL line number |
| `parent_asin` | String | Required reference to `products._id` |
| `user_id`, `asin` | String or null | Reviewer and reviewed item identifiers |
| `title`, `review_text` | String or null | Review title and body |
| `rating` | Decimal128 or null | Review rating |
| `reviewed_at` | Date or null | UTC review timestamp |
| `helpful_vote` | Int64 or null | Helpful-vote count |
| `verified_purchase` | Boolean or null | Purchase verification flag |

If optional fields are missing or invalid, it produces null values. If the array of document is valid and empty, it is left as null. The fields like images, videos, author, subtitle and bought_together are not included as in phase I.

## Design Decisions and Loading

We embedded arrays and details within the product collection as they describe the same product. There can be many reviews per product, so we kept reviews separately. Document size can exceed the 16MiB limit if all reviews are nested within product documents. So by having separate reviews, and referencing products via `parent_asin`, we avoid duplicating information.

The schema specifies the data type of each field, primary keys, and indexes. Using PyMongo, the data was loaded by applying the same cleaning methods as phase I. Reviews were batched in 5000 lines, and products were loaded before reviews. Duplicate entries from reruns were skipped. Clean-up was performed. This checked foreign keys in products. 43886944 reviews were checked. 0 had un-matched foreign keys. 0 entries were removed.
The data type of each field, primary keys, and indexes are specified by the schema. The cleaning functions from phase I are used by PyMango loader to read the JSONL files in batches of 5000 and loads products before reviews. We skip duplicate entries from reruns. After loading, we perform clean-up to check product references. We checked 43886944 reviews. 0 had un-matched foreign keys. 0 entries were removed.

## Comparison with Phase I MySQL

In MySQL, we used two tables. The product key is `parent_asin`, and the review key combines `source_id` and `source_line`. In MongoDB, we used the same keys in the `_id` fields of the two collections. We kept the nested product information in JSON columns in MySQL and in BSON arrays and embedded documents in MongoDB. MySQL defines data types in the table columns, and our MongoDB schema checks field types when documents are inserted or updated. After loading the data, we check the product references during cleanup.

MongoDB automatically creates a unique index on `_id` in each collection. We also added the `reviews_parent_asin` index on `reviews.parent_asin` so we can quickly find reviews for a product. When a query needs both review data and product details, we can join them in MySQL with a SQL join and in MongoDB with `$lookup`. We can also use `$unwind` in MongoDB to work with each category in a product's category array. In Phase III, we will compare how long the equivalent queries take in both databases.