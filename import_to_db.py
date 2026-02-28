import json
import psycopg2
from psycopg2.extras import execute_values

# --- CONFIG ---
DB_CONFIG = {
    "dbname": "papers_db",
    "user": "bryan",       # change if needed
    "password": "",         # change if needed
    "host": "localhost",
    "port": 5432
}
JSON_FILE = "papers_with_refs.json"
BATCH_SIZE = 500

# --- CONNECT ---
conn = psycopg2.connect(**DB_CONFIG)
conn.autocommit = False
cur = conn.cursor()

# --- SCHEMA ---
cur.execute("""
    DROP TABLE IF EXISTS reference_edges CASCADE;
    DROP TABLE IF EXISTS unresolved_refs CASCADE;
    DROP TABLE IF EXISTS authors CASCADE;
    DROP TABLE IF EXISTS papers CASCADE;

    CREATE TABLE papers (
        openalex_id TEXT PRIMARY KEY,
        doi TEXT,
        title TEXT,
        year INTEGER,
        cited_by_count INTEGER,
        paper_type TEXT,
        abstract TEXT
    );

    CREATE TABLE authors (
        id SERIAL PRIMARY KEY,
        paper_id TEXT NOT NULL REFERENCES papers(openalex_id) ON DELETE CASCADE,
        name TEXT,
        institution TEXT
    );

    -- Resolved references (full metadata)
    CREATE TABLE reference_edges (
        id SERIAL PRIMARY KEY,
        source_paper_id TEXT NOT NULL REFERENCES papers(openalex_id) ON DELETE CASCADE,
        referenced_paper_id TEXT,
        referenced_doi TEXT,
        referenced_title TEXT,
        referenced_year INTEGER,
        referenced_cited_by_count INTEGER
    );

    -- Unresolved reference IDs (the ~10k that didn't get resolved)
    CREATE TABLE unresolved_refs (
        id SERIAL PRIMARY KEY,
        source_paper_id TEXT NOT NULL REFERENCES papers(openalex_id) ON DELETE CASCADE,
        referenced_openalex_id TEXT NOT NULL
    );

    CREATE INDEX idx_papers_year ON papers(year);
    CREATE INDEX idx_papers_cited ON papers(cited_by_count DESC);
    CREATE INDEX idx_authors_paper ON authors(paper_id);
    CREATE INDEX idx_authors_name ON authors(name);
    CREATE INDEX idx_refs_source ON reference_edges(source_paper_id);
    CREATE INDEX idx_refs_target ON reference_edges(referenced_paper_id);
    CREATE INDEX idx_unresolved_source ON unresolved_refs(source_paper_id);
    CREATE INDEX idx_unresolved_target ON unresolved_refs(referenced_openalex_id);
""")
conn.commit()
print("Schema created.\n")

# --- LOAD JSON ---
print(f"Loading {JSON_FILE}...")
with open(JSON_FILE, "r") as f:
    papers = json.load(f)
print(f"Loaded {len(papers)} papers.\n")

# --- INSERT PAPERS ---
print("Inserting papers...")
paper_rows = [
    (
        p.get("openalex_id"),
        p.get("doi"),
        p.get("title"),
        p.get("year"),
        p.get("cited_by_count"),
        p.get("type"),
        p.get("abstract"),
    )
    for p in papers
]

for i in range(0, len(paper_rows), BATCH_SIZE):
    execute_values(
        cur,
        """INSERT INTO papers (openalex_id, doi, title, year, cited_by_count, paper_type, abstract)
           VALUES %s ON CONFLICT (openalex_id) DO NOTHING""",
        paper_rows[i:i + BATCH_SIZE]
    )
conn.commit()
print(f"  Done: {len(paper_rows)} papers.\n")

# --- INSERT AUTHORS ---
print("Inserting authors...")
author_rows = []
for p in papers:
    pid = p.get("openalex_id")
    for a in p.get("authors", []):
        author_rows.append((pid, a.get("name"), a.get("institution")))

for i in range(0, len(author_rows), BATCH_SIZE):
    execute_values(
        cur,
        "INSERT INTO authors (paper_id, name, institution) VALUES %s",
        author_rows[i:i + BATCH_SIZE]
    )
conn.commit()
print(f"  Done: {len(author_rows)} authors.\n")

# --- INSERT RESOLVED REFERENCES ---
print("Inserting resolved references...")
ref_rows = []
for p in papers:
    pid = p.get("openalex_id")
    for ref in p.get("references", []):
        ref_id = ref.get("id") or ref.get("openalex_id")
        ref_title = ref.get("display_name") or ref.get("title")
        ref_rows.append((
            pid,
            ref_id,
            ref.get("doi"),
            ref_title,
            ref.get("publication_year") or ref.get("year"),
            ref.get("cited_by_count"),
        ))

for i in range(0, len(ref_rows), BATCH_SIZE):
    execute_values(
        cur,
        """INSERT INTO reference_edges
           (source_paper_id, referenced_paper_id, referenced_doi, referenced_title, referenced_year, referenced_cited_by_count)
           VALUES %s""",
        ref_rows[i:i + BATCH_SIZE]
    )
conn.commit()
print(f"  Done: {len(ref_rows)} resolved references.\n")

# --- INSERT UNRESOLVED REF IDS ---
# Store the ~10k ref IDs that weren't resolved (difference between referenced_work_ids and references)
print("Inserting unresolved reference IDs...")
unresolved_rows = []
for p in papers:
    pid = p.get("openalex_id")
    resolved_ids = {(r.get("id") or r.get("openalex_id")) for r in p.get("references", [])}
    for ref_id in p.get("referenced_work_ids", []):
        if ref_id not in resolved_ids:
            unresolved_rows.append((pid, ref_id))

for i in range(0, len(unresolved_rows), BATCH_SIZE):
    execute_values(
        cur,
        "INSERT INTO unresolved_refs (source_paper_id, referenced_openalex_id) VALUES %s",
        unresolved_rows[i:i + BATCH_SIZE]
    )
conn.commit()
print(f"  Done: {len(unresolved_rows)} unresolved refs.\n")

# --- STATS ---
print("=" * 40)
print("DATABASE STATS")
print("=" * 40)

cur.execute("SELECT COUNT(*) FROM papers")
print(f"Papers:              {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT name) FROM authors")
print(f"Unique authors:      {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM reference_edges")
print(f"Resolved references: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM unresolved_refs")
print(f"Unresolved ref IDs:  {cur.fetchone()[0]}")

cur.execute("SELECT MIN(year), MAX(year) FROM papers WHERE year IS NOT NULL")
row = cur.fetchone()
print(f"Year range:          {row[0]} - {row[1]}")

print("\nTop 10 most cited papers:")
cur.execute("SELECT title, cited_by_count FROM papers ORDER BY cited_by_count DESC LIMIT 10")
for row in cur.fetchall():
    print(f"  {row[1]:>6} | {row[0][:75]}")

print("\nTop 10 most referenced works:")
cur.execute("""
    SELECT referenced_title, COUNT(*) as cnt
    FROM reference_edges
    WHERE referenced_title IS NOT NULL
    GROUP BY referenced_paper_id, referenced_title
    ORDER BY cnt DESC
    LIMIT 10
""")
for row in cur.fetchall():
    print(f"  {row[1]:>4}x | {row[0][:75]}")

cur.close()
conn.close()
print("\nDone! Database ready at papers_db")