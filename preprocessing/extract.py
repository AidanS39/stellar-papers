import gzip
import json
from dotenv import load_dotenv
import os
from neo4j import GraphDatabase
import time

load_dotenv()

db_url      = os.environ["NEO4J_URI"]
db_username = os.environ["NEO4J_USER"]
db_password = os.environ["NEO4J_PASSWORD"]

MAX_NODES = 200_000
file_name = "sample.gz"

driver = GraphDatabase.driver(db_url, auth=(db_username, db_password))

print("===============================================")
print("Calculating # of lines...")
print("===============================================")

line_count = 0
with gzip.open(file_name, 'rb') as f:
# Use sum and a generator for memory efficiency
    line_count = sum(1 for line in f)

with driver.session() as session:
    
    session.run("CREATE INDEX paper_id IF NOT EXISTS FOR (p:Paper) ON (p.id)")

    with gzip.open(file_name, "rt") as f:
        print("===============================================")
        print("Importing works...")
        print("===============================================")
        i = 1
        batch_size = 2000
        papers_batch = []

        start_time = time.time()

        for line in f:
            if i <= MAX_NODES:
                work = json.loads(line)
                
                if type(work) == None:
                    continue

                # field extraction
                paper_id = work.get("id")
                title = work.get("title")
                publication_date = work.get("publication_date")
                type_ = work.get("type")
                cited_by_count = work.get("cited_by_count")
                cited_by_api_url = work.get("cited_by_api_url")
                citation_normalized_percentile = (work.get("citation_normalized_percentile") or {}).get("value")
                referenced_works_count = work.get("referenced_works_count", 0)
                primary_topic = work.get("primary_topic")
                primary_topic_display = (primary_topic or {}).get("display_name") if primary_topic else None
                keywords = [a.get("display_name") for a in work.get("keywords", [])]
                domain = ((primary_topic or {}).get("domain") or {}).get("display_name", "Unknown")
                publication_year = work.get("publication_year")
                primary_location_source = ((work.get("primary_location") or {}).get("source") or {}).get("display_name", "Unknown")
                authorships = [a.get("author", {}).get("display_name") for a in work.get("authorships", []) if a.get("author")]

                papers_batch.append({
                    "id": paper_id,
                    "title": title,
                    "publication_date": publication_date,
                    "type": type_,
                    "authorships": authorships,
                    "primary_location_source": primary_location_source,
                    "cited_by_count": cited_by_count,
                    "cited_by_api_url": cited_by_api_url,
                    "citation_normalized_percentile": citation_normalized_percentile,
                    "referenced_works_count": referenced_works_count,
                    "primary_topic": primary_topic_display,
                    "keywords": keywords,
                    "domain": domain,
                    "publication_year": publication_year
                })
                
                if len(papers_batch) == batch_size:
                    session.run("""
                        UNWIND $papers as paper
                        MERGE (p:Paper {id: paper.id})
                        SET p.title = paper.title,
                            p.publication_date = paper.publication_date,
                            p.type = paper.type,
                            p.authorships = paper.authorships,
                            p.primary_location_source = paper.primary_location_source,
                            p.cited_by_count = paper.cited_by_count,
                            p.cited_by_api_url = paper.cited_by_api_url,
                            p.citation_normalized_percentile = paper.citation_normalized_percentile,
                            p.referenced_works_count = paper.referenced_works_count,
                            p.primary_topic = paper.primary_topic,
                            p.keywords = paper.keywords,
                            p.domain = paper.domain,
                            p.publication_year = paper.publication_year
                    """, papers=papers_batch)
                    papers_batch = []
                    
                    print(f"Batch complete: {time.time() - start_time} seconds per batch.")
                    print(f"{(i/line_count)*100}% complete.", flush=True)
                    start_time = time.time()
            i += 1

        # Flush remaining papers
        # if papers_batch:
        #     session.run("""
        #         UNWIND $papers as paper
        #         MERGE (p:Paper {id: paper.id})
        #         SET p.title = paper.title,
        #             p.publication_date = paper.publication_date,
        #             p.type = paper.type,
        #             p.authorships = paper.authorships,
        #             p.primary_location_source = paper.primary_location_source,
        #             p.cited_by_count = paper.cited_by_count,
        #             p.cited_by_api_url = paper.cited_by_api_url,
        #             p.citation_normalized_percentile = paper.citation_normalized_percentile,
        #             p.referenced_works_count = paper.referenced_works_count,
        #             p.primary_topic = paper.primary_topic,
        #             p.keywords = paper.keywords,
        #             p.domain = paper.domain,
        #             p.publication_year = paper.publication_year
        #     """, papers=papers_batch)

    print("===============================================")
    print("Works imported successfully. Importing/Creating edges...")
    print("===============================================")

    print("Importing CITED edges...")
    with gzip.open(file_name, "rt") as f:
        i = 0
        edges_batch = []

        start_time = time.time()
        for line in f:
            if i <= MAX_NODES:
                work = json.loads(line)
                
                for ref_id in work["referenced_works"]:
                    edges_batch.append({
                        "source": work["id"],
                        "target": ref_id
                    })
                
                if len(edges_batch) >= batch_size:
                    session.run("""
                        UNWIND $edges as edge
                        MATCH (a:Paper {id: edge.source})
                        MATCH (b:Paper {id: edge.target})
                        MERGE (a)-[:CITES]->(b)
                    """, edges=edges_batch)
                    edges_batch = []
                    
                    print(f"Batch complete: {time.time() - start_time} seconds per batch.")
                    print(f"{(i/line_count)*100}% complete.", flush=True)
                    start_time = time.time()
                
                i += 1

            # Flush remaining edges
            # if edges_batch:
            #     session.run("""
            #         UNWIND $edges as edge
            #         MATCH (a:Paper {id: edge.source})
            #         MATCH (b:Paper {id: edge.target})
            #         MERGE (a)-[:CITES]->(b)
            #     """, edges=edges_batch)
    print("Creating SHARES_AUTHOR edges...")
    session.run("""
        MATCH (a:Paper), (b:Paper)
        WHERE a <> b
        AND ANY(author IN a.authors WHERE author IN b.authors)
        MERGE (a)-[:SHARES_AUTHOR]->(b)
    """)
    print("Creating SHARES_DOMAIN edges...")
    session.run("""
        MATCH (a:Paper), (b:Paper)
        WHERE a <> b
        AND a.domain = b.domain
        AND a.domain IS NOT NULL
        MERGE (a)-[:SHARES_DOMAIN]->(b)
    """)
    print("Creating CO_CITED edges...")
    session.run("""
        MATCH (a:Paper)<-[:CITES]-(c:Paper)-[:CITES]->(b:Paper)
        WHERE a <> b
        MERGE (a)-[:CO_CITED]->(b)
    """)

    print("===============================================")
    print("Edges imported successfully.")
    print("===============================================")

# with gzip.open("sample.gz", "rt") as f:
#     for line in f:
#         work = json.loads(line)