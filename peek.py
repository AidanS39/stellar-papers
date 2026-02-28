import json
from collections import Counter

with open("papers_with_refs.json", "r") as f:
    papers = json.load(f)

# Count how many times each reference appears across all papers
ref_counter = Counter()
ref_titles = {}

for p in papers:
    for ref in p.get("references", []):
        ref_id = ref.get("id") or ref.get("openalex_id")
        if ref_id:
            ref_counter[ref_id] += 1
            ref_titles[ref_id] = ref.get("display_name") or ref.get("title")

# Shared references (appear in 2+ papers)
shared = {k: v for k, v in ref_counter.items() if v >= 2}
print(f"Total unique references: {len(ref_counter)}")
print(f"References shared by 2+ papers: {len(shared)}")

print("\n=== TOP 20 MOST SHARED REFERENCES ===")
for ref_id, count in ref_counter.most_common(20):
    title = ref_titles.get(ref_id, "Unknown")[:80]
    print(f"  {count:>4}x | {title}")

# Show an example pair of papers sharing a reference
print("\n=== EXAMPLE: TWO PAPERS SHARING A REFERENCE ===")
top_ref_id = ref_counter.most_common(1)[0][0]
top_ref_title = ref_titles[top_ref_id]
matching_papers = [p for p in papers if any(
    (r.get("id") or r.get("openalex_id")) == top_ref_id for r in p.get("references", [])
)]

print(f"\nShared reference: {top_ref_title}")
print(f"Referenced by {len(matching_papers)} papers, including:\n")
for mp in matching_papers[:5]:
    print(f"  - {mp['title'][:80]}")