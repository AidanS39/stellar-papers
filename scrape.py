from dotenv import load_dotenv
from os import getenv
import requests, time, json

load_dotenv()

API_KEY = getenv("OPENALEX_API_KEY")
EMAIL = "your@email.com"  # gets you in the polite pool even without a key
BASE_URL = "https://api.openalex.org"
DELAY = 0.15  # OpenAlex is generous

def get_headers():
    h = {}
    if API_KEY:
        h["Authorization"] = f"Bearer {API_KEY}"
    return h

def reconstruct_abstract(inverted_index):
    """OpenAlex stores abstracts as inverted indexes."""
    if not inverted_index:
        return None
    words = []
    for word, positions in inverted_index.items():
        for pos in positions:
            words.append((pos, word))
    words.sort()
    return " ".join(w for _, w in words)

def harvest_papers(query, target=1000):
    papers = []
    cursor = "*"

    while len(papers) < target and cursor:
        resp = requests.get(
            f"{BASE_URL}/works",
            headers=get_headers(),
            params={
                "search": query,
                "per_page": 200,  # max allowed
                "cursor": cursor,
                "mailto": EMAIL,
                "select": "id,doi,title,display_name,publication_year,cited_by_count,"
                          "authorships,abstract_inverted_index,referenced_works,type"
            }
        )
        print(f"  Status: {resp.status_code} | Collected: {len(papers)}")

        if resp.status_code == 429:
            print("  Rate limited, waiting 10s...")
            time.sleep(10)
            continue

        if resp.status_code != 200:
            print(f"  Error: {resp.text[:300]}")
            break

        data = resp.json()
        results = data.get("results", [])
        if not results:
            break

        papers.extend(results)
        cursor = data.get("meta", {}).get("next_cursor")
        time.sleep(DELAY)

    return papers[:target]

def resolve_references(ref_ids, batch_size=50):
    """Resolve OpenAlex work IDs to metadata in batches."""
    all_refs = []

    for i in range(0, len(ref_ids), batch_size):
        batch = ref_ids[i:i + batch_size]
        ids_filter = "|".join(batch)
        resp = requests.get(
            f"{BASE_URL}/works",
            headers=get_headers(),
            params={
                "filter": f"openalex:{ids_filter}",
                "per_page": batch_size,
                "mailto": EMAIL,
                "select": "id,doi,title,display_name,publication_year,cited_by_count,authorships,type"
            }
        )
        if resp.status_code == 200:
            all_refs.extend(resp.json().get("results", []))
        elif resp.status_code == 429:
            print("  Rate limited on refs, waiting 10s...")
            time.sleep(10)
            i -= batch_size  # retry
        time.sleep(DELAY)

    return all_refs

def clean_paper(paper):
    """Flatten into a cleaner format."""
    return {
        "openalex_id": paper.get("id"),
        "doi": paper.get("doi"),
        "title": paper.get("display_name"),
        "year": paper.get("publication_year"),
        "cited_by_count": paper.get("cited_by_count"),
        "type": paper.get("type"),
        "abstract": reconstruct_abstract(paper.get("abstract_inverted_index")),
        "authors": [
            {
                "name": a.get("author", {}).get("display_name"),
                "institution": (a.get("institutions") or [{}])[0].get("display_name") if a.get("institutions") else None
            }
            for a in paper.get("authorships", [])
        ],
        "referenced_work_ids": paper.get("referenced_works", []),
        "references": []  # filled in later
    }

# === MAIN ===

# 1. Harvest papers
print("=== Harvesting papers ===")
raw_papers = harvest_papers("large language models", target=1000)
print(f"Collected {len(raw_papers)} papers.\n")

if not raw_papers:
    print("No papers found. Check your query/connection.")
    exit()

papers = [clean_paper(p) for p in raw_papers]

# 2. Resolve references
print("=== Resolving references ===")
RESOLVE_REFS = True  # set False to skip (saves time, you already have the IDs)

if RESOLVE_REFS:
    for i, paper in enumerate(papers):
        ref_ids = paper["referenced_work_ids"]
        if ref_ids:
            paper["references"] = resolve_references(ref_ids)
        if i % 25 == 0:
            ref_count = len(paper["references"])
            print(f"  [{i}/{len(papers)}] '{paper['title'][:50]}...' -> {ref_count} refs resolved")

# 3. Save
with open("papers_with_refs.json", "w") as f:
    json.dump(papers, f, indent=2)

total_refs = sum(len(p["references"]) for p in papers)
print(f"\nDone! {len(papers)} papers, {total_refs} resolved references.")
print(f"Saved to papers_with_refs.json")
