import pyalex
from pyalex import Works, Fields
from neo4j import GraphDatabase
import os
from dotenv import load_dotenv

load_dotenv("../.env")

OPENALEX_API_KEY = os.environ["OPENALEX_API_KEY"]
NEO4J_URI        = os.environ["NEO4J_URI"]
NEO4J_USER       = os.environ["NEO4J_USER"]
NEO4J_PASSWORD   = os.environ["NEO4J_PASSWORD"]

pyalex.config.api_key = OPENALEX_API_KEY


driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))

with driver.session() as session:
    session.run("CREATE INDEX paper_id IF NOT EXISTS FOR (p:Paper) ON (p.id)")

def save_papers_batch(papers_batch):
    if not papers_batch:
        return
    with driver.session() as session:
        session.run("""
            UNWIND $papers AS paper
            MERGE (p:Paper {id: paper.id})
            SET p.title = paper.title,
                p.publication_date = paper.publication_date,
                p.type = paper.type,
                p.cited_by_count = paper.cited_by_count,
                p.cited_by_api_url = paper.cited_by_api_url,
                p.citation_normalized_percentile = paper.citation_normalized_percentile,
                p.referenced_works_count = paper.referenced_works_count,
                p.primary_topic = paper.primary_topic_display,
                p.keywords = paper.keywords,
                p.domain = paper.domain,
                p.field = paper.field,
                p.publication_year = paper.publication_year,
                p.primary_location_source = paper.primary_location_source,
                p.authorships = paper.authorships
        """, papers=papers_batch)

def save_edges_batch(edges_batch):
    if not edges_batch:
        return
    with driver.session() as session:
        session.run("""
            UNWIND $edges AS edge
            MATCH (a:Paper {id: edge.source})
            MERGE (b:Paper {id: edge.target})
            MERGE (a)-[:CITES]->(b)
        """, edges=edges_batch)

def extract_paper_data(work):
    primary_topic = work.get("primary_topic") or {}
    domain = (primary_topic.get("domain") or {}).get("display_name", "Unknown")
    field = (primary_topic.get("field") or {}).get("display_name", "Unknown")

    return {
        "id": work.get("id"),
        "title": work.get("title"),
        "publication_date": work.get("publication_date"),
        "type": work.get("type"),
        "cited_by_count": work.get("cited_by_count"),
        "cited_by_api_url": work.get("cited_by_api_url"),
        "citation_normalized_percentile": (work.get("citation_normalized_percentile") or {}).get("value"),
        "referenced_works_count": work.get("referenced_works_count", 0),
        "primary_topic_display": primary_topic.get("display_name"),
        "keywords": [a.get("display_name") for a in work.get("keywords", [])],
        "domain": domain,
        "field": field,
        "publication_year": work.get("publication_year"),
        "primary_location_source": ((work.get("primary_location") or {}).get("source") or {}).get("display_name", "Unknown"),
        "authorships": [a.get("author", {}).get("display_name") for a in work.get("authorships", []) if a.get("author")]
    }

def get_seeds():
    # get all fields
    fields = Fields().get(per_page=50)
    all_seeds = []

    # seed top 10 most referenced papers of each field
    for field in fields:
        field_id = field["id"][21:]
        results = Works().filter(
            primary_topic={"field": {"id": field_id}}
        ).select(
            ["id", "title", "cited_by_count"]
        ).sort(
            cited_by_count="desc"
        ).get(
            per_page=10
        )
        
        field_seeds = [paper["id"] for paper in results]
        all_seeds += field_seeds
    
    return all_seeds

# seeds db by traversing works using bfs and their references from set seed works from each discipline/field
def seed_db(seed_ids, max_depth=2, min_citations=50):
    visited = set()
    queue = [(seed_id, 0) for seed_id in seed_ids]
    
    papers_batch = []
    edges_batch = []
    batch_size = 1000

    while len(queue) > 0:
        work_id, depth = queue.pop(0)

        if work_id in visited or depth > max_depth:
            continue

        visited.add(work_id)
        print(f"Fetching {work_id} (depth {depth}, {len(visited)} visited)")

        try:
            work = Works()[work_id]
        except Exception as e:
            print(f"Failed to fetch {work_id}: {e}")
            continue

        if work.get("cited_by_count", 0) < min_citations:
            continue

        # Extract and batch paper data
        paper_data = extract_paper_data(work)
        papers_batch.append(paper_data)
        
        # Extract and batch edges
        refs = work.get("referenced_works", [])
        for ref_id in refs:
            edges_batch.append({"source": work_id, "target": ref_id})
        
        # Flush batches when full
        if len(papers_batch) >= batch_size:
            save_papers_batch(papers_batch)
            papers_batch = []
        
        if len(edges_batch) >= batch_size * 2:
            save_edges_batch(edges_batch)
            edges_batch = []

        if depth < max_depth:
            for ref_id in refs:
                if ref_id not in visited:
                    queue.append((ref_id, depth + 1))
    
    # Flush any remaining batches
    save_papers_batch(papers_batch)
    save_edges_batch(edges_batch)


seeds = get_seeds()
print(f"\nStarting BFS from {len(seeds)} seeds...")
seed_db(seeds, max_depth=2, min_citations=50)