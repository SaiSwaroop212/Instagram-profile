# Query Plan & Index Performance Report

**Stage:** B — Relational Modeling and SQL  
**Database:** PostgreSQL 17.10 on x86_64  
**Artifact Path:** `docs/query-plan-report.md`

---

## 1. Executive Summary

This report evaluates query performance, optimizer cost decisions, buffer cache interactions, and index trade-offs using real `EXPLAIN (ANALYZE, BUFFERS)` execution plans on PostgreSQL 17.

We analyze two critical read queries from PRD 03:
1. **Query 1 (Home Feed):** Newest originals ordered by `(created_at DESC, id DESC) LIMIT 10`.
2. **Query 2 (Direct Replies):** Direct replies for a post ordered by `(created_at DESC, id DESC)`.

---

## 2. Query 1: Home Feed Ordering & Pagination

### SQL Statement
```sql
SELECT id, text, created_at
FROM posts
WHERE kind = 'original'
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

### 2.1 Default Plan on Seed Data (Sequential Scan + Top-N Heapsort)
```text
                                                  QUERY PLAN                                                   
---------------------------------------------------------------------------------------------------------------
 Limit  (cost=3.33..3.35 rows=10 width=101) (actual time=0.057..0.058 rows=10 loops=1)
   Buffers: shared hit=8
   ->  Sort  (cost=3.33..3.41 rows=32 width=101) (actual time=0.054..0.055 rows=10 loops=1)
         Sort Key: created_at DESC, id DESC
         Sort Method: top-N heapsort  Memory: 27kB
         Buffers: shared hit=8
         ->  Seq Scan on posts  (cost=0.00..2.64 rows=32 width=101) (actual time=0.015..0.024 rows=32 loops=1)
               Filter: ((kind)::text = 'original'::text)
               Rows Removed by Filter: 19
               Buffers: shared hit=2
 Planning Time: 0.895 ms
 Execution Time: 0.084 ms
```

### 2.2 Plan Using Candidate Index `idx_posts_feed`
Candidate Index: `CREATE INDEX idx_posts_feed ON posts (created_at DESC, id DESC) WHERE kind = 'original';`

```text
                                                           QUERY PLAN                                                            
---------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.14..5.27 rows=10 width=101) (actual time=0.012..0.016 rows=10 loops=1)
   Buffers: shared hit=2
   ->  Index Scan using idx_posts_feed on posts  (cost=0.14..16.58 rows=32 width=101) (actual time=0.009..0.012 rows=10 loops=1)
         Buffers: shared hit=2
 Planning Time: 0.992 ms
 Execution Time: 0.035 ms
```

### 2.3 Analysis of Query 1
- **Top-N Heapsort Elimination:** The Sequential Scan required reading the entire table, filtering non-originals, and executing an in-memory `top-N heapsort` (consuming 27 kB of memory). The Index Scan leverages the pre-sorted order of the B-tree leaf nodes, completely eliminating the sorting stage.
- **Buffer Reduction:** Shared buffer hits dropped from 8 blocks to 2 blocks.
- **Execution Time:** Dropped from 0.084 ms to 0.035 ms (a ~58% reduction in latency).

---

## 3. Query 2: Direct Replies Lookup

### SQL Statement
```sql
SELECT id, text, created_at
FROM posts
WHERE kind = 'reply' 
  AND reply_to_id = 'b0000000-0000-4000-8000-000000000001'
ORDER BY created_at DESC, id DESC;
```

### 3.1 Default Plan on Seed Data (Sequential Scan + Quicksort)
```text
                                                    QUERY PLAN                                                     
-------------------------------------------------------------------------------------------------------------------
 Sort  (cost=2.77..2.78 rows=1 width=101) (actual time=0.041..0.042 rows=3 loops=1)
   Sort Key: created_at DESC, id DESC
   Sort Method: quicksort  Memory: 25kB
   Buffers: shared hit=8
   ->  Seq Scan on posts  (cost=0.00..2.77 rows=1 width=101) (actual time=0.017..0.023 rows=3 loops=1)
         Filter: (((kind)::text = 'reply'::text) AND (reply_to_id = 'b0000000-0000-4000-8000-000000000001'::uuid))
         Rows Removed by Filter: 48
         Buffers: shared hit=2
 Planning Time: 1.102 ms
 Execution Time: 0.063 ms
```

### 3.2 Plan Using Candidate Index `idx_posts_replies`
Candidate Index: `CREATE INDEX idx_posts_replies ON posts (reply_to_id, created_at DESC, id DESC) WHERE kind = 'reply';`

```text
                                                        QUERY PLAN                                                         
---------------------------------------------------------------------------------------------------------------------------
 Index Scan using idx_posts_replies on posts  (cost=0.14..8.15 rows=1 width=101) (actual time=0.012..0.013 rows=3 loops=1)
   Index Cond: (reply_to_id = 'b0000000-0000-4000-8000-000000000001'::uuid)
   Buffers: shared hit=2
 Planning Time: 1.657 ms
 Execution Time: 0.034 ms
```

### 3.3 Analysis of Query 2
- **Direct B-Tree Key Traversal:** In the sequential scan, PostgreSQL scanned all 51 rows in the table, rejecting 48 rows that did not match the `reply_to_id` filter, followed by an in-memory quicksort.
- **Index Seek:** With `idx_posts_replies`, the engine directly sought the 3 matching tuples via B-tree index condition, reading only 2 buffer pages and avoiding sorting entirely.
- **Execution Time:** Dropped from 0.063 ms to 0.034 ms.

---

## 4. Why Small Seeds Correctly Favor Sequential Scans

A common misconception is that an index scan is always faster than a sequential scan. In our seed dataset of 51 rows:
1. **Total Heap Footprint:** The entire `posts` table occupies only **two 8KB pages** in the PostgreSQL buffer pool (`Buffers: shared hit=2`).
2. **Cost Estimation Formula:**
   $$\text{Seq Scan Cost} = (\text{pages} \times \text{seq\_page\_cost}) + (\text{rows} \times \text{cpu\_tuple\_cost})$$
   $$\text{Index Scan Cost} = (\text{index pages} \times \text{random\_page\_cost}) + (\text{index tuples} \times \text{cpu\_index\_tuple\_cost}) + (\text{heap pages} \times \text{random\_page\_cost})$$
3. Because reading 2 contiguous memory pages sequentially has almost zero overhead, the PostgreSQL cost optimizer calculates that traversing the B-tree root page, reading index leaf pages, and then jumping via random pointer to the heap page has a higher estimated cost (16.58) than simply scanning 2 pages in memory (2.64).
4. **Conclusion:** Favoring a sequential scan on small tables is mathematically correct behavior by PostgreSQL's cost-based optimizer, not a defect or missing index.

---

## 5. Behavior on Scaled Production Datasets (100k+ Rows)

When the table grows beyond hundreds of pages:
- **Sequential Scan Degrades to $O(N)$:** Scanning 500,000 posts requires reading 40,000+ disk blocks (~320 MB) into memory and sorting all matching rows using external disk merge sort (`work_mem` spill), causing queries to jump from sub-millisecond to several seconds.
- **B-Tree Index Scan Remains $O(\log N) + \text{limit}$:** B-tree depth remains at 3 levels. Fetching the top 10 rows requires reading 3 index pages + 10 heap pages, maintaining sub-millisecond response times regardless of total table volume.

---

## 6. Write and Storage Cost vs. Read Benefit

| Resource / Action | Impact of Adding Candidate Indexes | Architectural Consideration |
|---|---|---|
| **Read Latency** | High Improvement (Eliminates CPU sorts, enables keyset seeks) | Crucial for feed and reply list endpoints serving high concurrent traffic. |
| **Write Latency** | Moderate Penalty | Every `INSERT`, `UPDATE`, or `DELETE` on `posts` must update the primary key, `uq_posts_id_kind`, `idx_posts_feed`, and `idx_posts_replies`. |
| **Write Amplification (WAL)**| Increased | Additional WAL records generated for modified B-tree leaf pages. |
| **HOT Updates** | Partially mitigated | Updates that do not modify indexed columns (`text`, `updated_at`) can still qualify for Heap-Only Tuple (HOT) optimization, avoiding index churn. |
| **Disk Storage** | ~20-35% table size overhead | Filtered partial indexes (`WHERE kind = 'original'`) drastically save space by only indexing a subset of rows. |
