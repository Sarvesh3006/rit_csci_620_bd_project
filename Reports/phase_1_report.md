# Dataset:

**Name:** Amazon Reviews 2023

**Link:** <https://amazon-reviews-2023.github.io/>

**Download Link (Reviews):**

<https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/review_categories/Electronics.jsonl?download=true>

**Download Link (Metadata):**

<https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023/resolve/main/raw/meta_categories/meta_Electronics.jsonl?download=true>

# Dataset Profiling (100,000 sample):

## Metadata:

| Field | Observed types and counts | Missing | Empty containers |
| --- | --- | --- | --- |
| author | 22 dict; 20 null; rest absent | 99.98% | 0 |
| average_rating | 100,000 float | 0% | 0 |
| bought_together | 100,000 null | 100% | 0 |
| categories | 100,000 list | 0% | 7,621 (7.621%) |
| description | 100,000 list | 0% | 41,952 (41.952%) |
| details | 100,000 dict | 0% | 299 (0.299%) |
| features | 100,000 list | 0% | 22,430 (22.430%) |
| images | 100,000 list | 0% | 5 (0.005%) |
| main_category | 98,945 str; 1,055 null | 1.06% | 0 |
| parent_asin | 100,000 str | 0% | 0 |
| price | 41,823 float; 6 str; 58,171 null | 58.17% | 0 |
| rating_number | 100,000 int | 0% | 0 |
| store | 99,445 str; 555 null | 0.56% | 0 |
| subtitle | 33 str; 9 null; rest absent | 99.97% | 0 |
| title | 100,000 str | 0% | 0 |
| videos | 100,000 list | 0% | 58,860 (58.860%) |

## Reviews:

| Field | Observed types and counts | Missing | Empty containers |
| --- | --- | --- | --- |
| asin | 100,000 str | 0% | 0 |
| helpful_vote | 100,000 int | 0% | 0 |
| images | 100,000 list | 0% | 92,980 (92.980%) |
| parent_asin | 100,000 str | 0% | 0 |
| rating | 100,000 float | 0% | 0 |
| text | 100,000 str | 0.02% | 0 |
| timestamp | 100,000 int | 0% | 0 |
| title | 100,000 str | 0% | 0 |
| user_id | 100,000 str | 0% | 0 |
| verified_purchase | 100,000 bool | 0% | 0 |

# Schema Decisions:

## Products:

| Field | Data type | If missing or blank | Validation / handling |
| --- | --- | --- | --- |
| parent_asin | VARCHAR(20) **PRIMARY KEY** | Reject record | Must be unique |
| title | LONGTEXT | Store NULL | Must be text |
| average_rating | DECIMAL(3,2) | Store NULL | Between 1 to 5; otherwise NULL |
| rating_number | BIGINT | Store NULL | Nonnegative integer; otherwise NULL |
| price | DECIMAL(15,2) | Store NULL | Convert numeric strings; invalid, negative, or out of range values become NULL |
| main_category | TEXT | Store NULL | Must be text |
| store | TEXT | Store NULL | Must be text |
| categories | JSON | Store NULL | Must be a list; preserve [] |
| description, features, details | JSON — separate columns | Store NULL | Description/features must be lists; details must be an object. And preserve empty containers |
| images, videos | Excluded | — | |
| author, subtitle, bought_together | Excluded | — | |

## Reviews:

| Field | Data type | If missing or blank | Validation / handling |
| --- | --- | --- | --- |
| source_id, source_line | VARCHAR(100), BIGINT; **combined primary key** | NA | Combination must be unique |
| parent_asin | VARCHAR(20) NOT NULL **FOREIGN KEY** | Reject record | Import all first; delete unmatched reviews during cleanup. |
| user_id | VARCHAR(100) | Store NULL | Must be text |
| asin | VARCHAR(20) | Store NULL | Must be text |
| rating | DECIMAL(3,2) | Store NULL | Between 1 to 5; otherwise NULL |
| title | LONGTEXT | Store NULL | Must be text |
| review_text | LONGTEXT | Store NULL | Retain review even without text |
| reviewed_at | DATETIME(3) | Store NULL | Convert source timestamp milliseconds to UTC date/time; invalid values become NULL |
| helpful_vote | BIGINT | Store NULL | Nonnegative integer; otherwise NULL |
| verified_purchase | BOOLEAN | Store NULL | Only True or False |
| images | Excluded | — | |
