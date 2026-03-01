import gzip
import json
from dotenv import load_dotenv
import os
from neo4j import GraphDatabase

load_dotenv()

db_url      = os.environ["NEO4J_URI"]
db_username = os.environ["NEO4J_USER"]
db_password = os.environ["NEO4J_PASSWORD"]


driver = GraphDatabase.driver(db_url, auth=(db_username, db_password))

file_name = "sample.gz"

print("===============================================")
print("Calculating # of lines...")
print("===============================================")

line_count = 0
with gzip.open(file_name, 'rb') as f:
# Use sum and a generator for memory efficiency
    line_count = sum(1 for line in f)

with driver.session() as session:

    with gzip.open(file_name, "rt") as f:
        print("===============================================")
        print("Importing works...")
        print("===============================================")
        i = 0
        for line in f:
            work = json.loads(line)

            if type(work) == None:
                print(work)
            else:
                id = work["id"]
                title = work["title"]
                cited_by_count = work["cited_by_count"]
                domain = ((work.get("primary_topic") or {}).get("domain") or {}).get("display_name", "Unknown")
                publication_year = work["publication_year"]

            # Create nodes
            session.run("""
                MERGE (p:Paper {id: $id})
                SET p.title = $title,
                    p.cited_by_count = $cited_by_count,
                    p.domain = $domain,
                    p.publication_year = $publication_year
            """, 
                id=id,
                title=title,
                cited_by_count=cited_by_count,
                domain=domain,
                publication_year=publication_year
            )
            i += 1
            if i % 10 == 0:
                print(f"{(i/line_count)*100}% complete.")
            

    print("===============================================")
    print("Works imported successfully. Importing edges...")
    print("===============================================")
    with gzip.open(file_name, "rt") as f:
        i = 0
        for line in f:
            work = json.loads(line)   
            # Create edges
            for ref_id in work["referenced_works"]:
                session.run("""
                    MATCH (a:Paper {id: $source})
                    MATCH (b:Paper {id: $target})
                    MERGE (a)-[:CITES]->(b)
                """, source=work["id"], target=ref_id)

            i += 1
            if i % 10 == 0:
                print(f"{(i/line_count)*100}% complete.")

    print("===============================================")
    print("Edges imported successfully.")
    print("===============================================")

# with gzip.open("sample.gz", "rt") as f:
#     for line in f:
#         work = json.loads(line)