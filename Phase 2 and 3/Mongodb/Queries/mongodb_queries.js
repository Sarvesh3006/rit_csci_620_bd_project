// ============================================================
// CSCI 620 Project - Phase III
// Amazon Reviews 2023 (Electronics) - 5 queries and indexes
// Database: amazon_electronics_reviews
//
// How to use (mongosh):
//   1. Run the database selection and rounding helper once.
//   2. Run each query with .explain("executionStats").aggregate(...)
//      and note executionTimeMillis (timings BEFORE indexes).
//   3. Run the CREATE INDEXES section at the bottom.
//   4. Run the 5 queries again (timings AFTER indexes).
// ============================================================

db = db.getSiblingDB("amazon_electronics_reviews");

// Match MySQL's decimal rounding for our nonnegative results.
// For example, rounding 4.25 to one decimal place gives 4.3 in MySQL.
// MongoDB's $round gives 4.2 because ties use an even final digit.
// This helper keeps averages and percentages consistent across databases.
function sqlRound(value, places = 0) {
    const scale = NumberDecimal(String(10 ** places));
    return {
        $divide: [
            { $floor: { $add: [
                { $multiply: [{ $toDecimal: value }, scale] },
                NumberDecimal("0.5")
            ] } },
            scale
        ]
    };
}


// ------------------------------------------------------------
// Q1: How did reviews change over the years?
// Reviews per year, average rating, and the share of 5-star
// and 1-star reviews. BSON dates and the SQL timestamps use UTC.
// ------------------------------------------------------------
print("Q1: Reviews per year");
printjson(db.reviews.aggregate([
    { $match: { reviewed_at: { $ne: null }, rating: { $ne: null } } },
    { $group: {
        _id: { $year: { date: "$reviewed_at", timezone: "UTC" } },
        total_reviews: { $sum: 1 },
        avg_rating: { $avg: "$rating" },
        five_star: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        one_star: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } }
    } },
    { $project: {
        _id: 0,
        review_year: "$_id",
        total_reviews: 1,
        avg_rating: sqlRound("$avg_rating", 2),
        pct_5_star: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$five_star"] }, "$total_reviews"
        ] }, 1),
        pct_1_star: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$one_star"] }, "$total_reviews"
        ] }, 1)
    } },
    { $sort: { review_year: 1 } }
], { allowDiskUse: true }).toArray());


// ------------------------------------------------------------
// Q2: Do more expensive electronics get better ratings?
// Products (10+ ratings) grouped into price ranges: average
// rating, % rated below 3.5, and ratings per product.
// ------------------------------------------------------------
print("Q2: Price range vs. rating");
printjson(db.products.aggregate([
    { $match: {
        price: { $ne: null },
        average_rating: { $ne: null },
        rating_number: { $gte: 10 }
    } },
    { $group: {
        _id: { $switch: {
            branches: [
                { case: { $lt: ["$price", 25] }, then: "1. Under $25" },
                { case: { $lt: ["$price", 100] }, then: "2. $25 - $99" },
                { case: { $lt: ["$price", 500] }, then: "3. $100 - $499" }
            ],
            default: "4. $500 and up"
        } },
        total_products: { $sum: 1 },
        avg_rating: { $avg: "$average_rating" },
        low_rated: { $sum: { $cond: [
            { $lt: ["$average_rating", NumberDecimal("3.5")] }, 1, 0
        ] } },
        avg_ratings_per_product: { $avg: { $toDecimal: "$rating_number" } }
    } },
    { $project: {
        _id: 0,
        price_range: "$_id",
        total_products: 1,
        avg_rating: sqlRound("$avg_rating", 2),
        pct_low_rated: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$low_rated"] }, "$total_products"
        ] }, 1),
        avg_ratings_per_product: sqlRound("$avg_ratings_per_product")
    } },
    { $sort: { price_range: 1 } }
], { allowDiskUse: true }).toArray());


// ------------------------------------------------------------
// Q3: What do the most helpful reviews look like?
// The 15 reviews with the most helpful votes (1,000+), joined
// with the product they are about. $lookup joins 
// reviews.parent_asin to products._id. $unwind drops unmatched
// reviews, matching SQL's INNER JOIN.
// ------------------------------------------------------------
print("Q3: Most helpful reviews");
printjson(db.reviews.aggregate([
    { $match: { helpful_vote: { $gte: 1000 } } },
    { $sort: { helpful_vote: -1 } },
    { $lookup: {
        from: "products",
        localField: "parent_asin",
        foreignField: "_id",
        as: "product"
    } },
    { $unwind: "$product" },
    { $limit: 15 },
    { $project: {
        _id: 0,
        product: { $cond: [
            { $eq: [{ $ifNull: ["$product.title", null] }, null] },
            null,
            { $substrCP: ["$product.title", 0, 50] }
        ] },
        store: { $ifNull: ["$product.store", null] },
        rating: { $ifNull: ["$rating", null] },
        helpful_vote: 1,
        verified_purchase: { $ifNull: ["$verified_purchase", null] },
        review_title: { $cond: [
            { $eq: [{ $ifNull: ["$title", null] }, null] },
            null,
            { $substrCP: ["$title", 0, 60] } // Truncate long titles to match SQL's LEFT(title, 60)
        ] }
    } }
], { allowDiskUse: true }).toArray());


// ------------------------------------------------------------
// Q4: Do verified buyers rate differently from non-verified
// reviewers? Average rating, % 5-star, % 1-star, and average
// helpful votes for each group.
// ------------------------------------------------------------
print("Q4: Verified vs. non-verified reviewers");
printjson(db.reviews.aggregate([
    { $match: { verified_purchase: { $ne: null }, rating: { $ne: null } } },
    { $group: {
        _id: "$verified_purchase",
        total_reviews: { $sum: 1 },
        avg_rating: { $avg: "$rating" },
        five_star: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
        one_star: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        avg_helpful_votes: { $avg: { $toDecimal: "$helpful_vote" } }
    } },
    { $sort: { _id: -1 } },
    { $project: {
        _id: 0,
        reviewer: { $cond: ["$_id", "Verified buyer", "Not verified"] },
        total_reviews: 1,
        avg_rating: sqlRound("$avg_rating", 2),
        pct_5_star: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$five_star"] }, "$total_reviews"
        ] }, 1),
        pct_1_star: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$one_star"] }, "$total_reviews"
        ] }, 1),
        avg_helpful_votes: sqlRound("$avg_helpful_votes", 2)
    } }
], { allowDiskUse: true }).toArray());


// ------------------------------------------------------------
// Q5: Which sub-categories disappoint buyers the most?
// $unwind expands categories like JSON_TABLE, see SQL 
// implementation for details.
// ------------------------------------------------------------
print("Q5: Most disappointing sub-categories");
printjson(db.products.aggregate([
    { $match: { average_rating: { $ne: null }, rating_number: { $gte: 10 } } },
    { $unwind: "$categories" },
    { $match: { categories: { $nin: ["Electronics", null] } } },
    { $group: {
        _id: "$categories",
        total_products: { $sum: 1 },
        low_rated: { $sum: { $cond: [
            { $lt: ["$average_rating", NumberDecimal("3.5")] }, 1, 0
        ] } },
        avg_rating: { $avg: "$average_rating" },
        avg_price: { $avg: "$price" }
    } },
    { $match: { total_products: { $gte: 1000 } } },
    { $project: {
        _id: 0,
        category: "$_id",
        total_products: 1,
        pct_low_rated: sqlRound({ $divide: [
            { $multiply: [NumberDecimal("100"), "$low_rated"] }, "$total_products"
        ] }, 1),
        avg_rating: sqlRound("$avg_rating", 2),
        avg_price: sqlRound("$avg_price", 2)
    } },
    { $sort: { pct_low_rated: -1 } },
    { $limit: 15 }
], { allowDiskUse: true }).toArray());


// ============================================================
// CREATE INDEXES
// Same indexed fields as the SQL file.
// ============================================================

db.reviews.createIndex(
    { reviewed_at: 1, rating: 1 },
    { name: "idx_reviews_time_rating" }
);

db.products.createIndex(
    { price: 1, average_rating: 1, rating_number: 1 },
    { name: "idx_products_price" }
);

db.reviews.createIndex(
    { helpful_vote: 1 },
    { name: "idx_reviews_helpful" }
);

db.reviews.createIndex(
    { verified_purchase: 1, rating: 1, helpful_vote: 1 },
    { name: "idx_reviews_verified" }
);

db.products.createIndex(
    { rating_number: 1, average_rating: 1 },
    { name: "idx_products_rating_number" }
);
