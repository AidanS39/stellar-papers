import { NextResponse } from "next/server";

const BASE_URL = "https://api.openalex.org";
const EMAIL = "your@email.com"; // polite pool
const DELAY = 150; // ms between requests

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null): string | null {
    if (!invertedIndex) return null;
    const words: [number, string][] = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
            words.push([pos, word]);
        }
    }
    words.sort((a, b) => a[0] - b[0]);
    return words.map(([, w]) => w).join(" ");
}

async function fetchPapers(query: string, target: number) {
    const papers: any[] = [];
    let cursor = "*";

    while (papers.length < target && cursor) {
        const params = new URLSearchParams({
            search: query,
            per_page: "200",
            cursor,
            mailto: EMAIL,
            select: "id,doi,title,display_name,publication_year,cited_by_count,authorships,abstract_inverted_index,referenced_works,type,primary_topic",
        });

        const resp = await fetch(`${BASE_URL}/works?${params}`);
        if (!resp.ok) break;

        const data = await resp.json();
        const results = data.results || [];
        if (!results.length) break;

        papers.push(...results);
        cursor = data.meta?.next_cursor;
        await sleep(DELAY);
    }

    return papers.slice(0, target);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "large language models";
    const target = Math.min(parseInt(searchParams.get("target") || "200"), 500);

    const rawPapers = await fetchPapers(query, target);

    // Build a set of all paper IDs in our dataset
    const paperIds = new Set(rawPapers.map((p: any) => p.id));

    // Count in-degree: how many papers in our dataset reference each work
    const inDegree: Record<string, number> = {};
    const refTitles: Record<string, string> = {};

    for (const p of rawPapers) {
        for (const refId of p.referenced_works || []) {
            inDegree[refId] = (inDegree[refId] || 0) + 1;
        }
    }

    // Nodes: every paper in our dataset
    const nodes = rawPapers.map((p: any) => ({
        id: p.id,
        title: p.display_name || p.title,
        year: p.publication_year,
        citedByCount: p.cited_by_count,
        type: p.type,
        abstract: reconstructAbstract(p.abstract_inverted_index),
        doi: p.doi,
        subject: p.primary_topic?.domain?.display_name || "Unknown",
        subfield: p.primary_topic?.subfield?.display_name || null,
        authors: (p.authorships || []).slice(0, 5).map((a: any) => ({
            name: a.author?.display_name,
            institution: a.institutions?.[0]?.display_name || null,
        })),
        inDegree: inDegree[p.id] || 0,
    }));

    // Collect unique subjects for the legend
    const subjects = [...new Set(nodes.map((n: any) => n.subject))].sort();

    // Links: only where BOTH source and target are in our dataset
    const links: { source: string; target: string }[] = [];
    for (const p of rawPapers) {
        for (const refId of p.referenced_works || []) {
            if (paperIds.has(refId)) {
                links.push({ source: p.id, target: refId });
            }
        }
    }

    return NextResponse.json({
        nodes,
        links,
        meta: {
            query,
            totalPapers: nodes.length,
            totalLinks: links.length,
            maxInDegree: Math.max(...nodes.map((n: any) => n.inDegree), 0),
            subjects,
        },
    });
}
