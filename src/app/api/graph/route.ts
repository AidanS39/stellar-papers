import neo4j from "neo4j-driver";
import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "../../../lib/neo4j";
import { toNode } from "../../../lib/transform";
import { GraphFilters, GraphResponse, GraphEdge } from "../../../types/graph";
import { LRUCache } from "lru-cache";

const graphCache = new LRUCache<string, GraphResponse>({
    max: 100,
    ttl: 1000 * 60 * 60,
});

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    const filters: GraphFilters = {
        author: searchParams.get("author") ?? undefined,
        publication_year_start: searchParams.get("publication_year_start")
            ? parseInt(searchParams.get("publication_year_start")!)
            : undefined,
        publication_year_end: searchParams.get("publication_year_end")
            ? parseInt(searchParams.get("publication_year_end")!)
            : undefined,
        institution: searchParams.get("institution") ?? undefined,
        field: searchParams.get("field") ?? undefined,
        keyword: searchParams.get("keyword") ?? undefined,
        limit: searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : 100,
    };

    try {
        const cacheKey = JSON.stringify(filters);
        const cachedResponse = graphCache.get(cacheKey);
        if (cachedResponse) {
            return NextResponse.json(cachedResponse, {
                headers: {
                    "X-Cache": "HIT",
                },
            });
        }

        const conditions: string[] = [];
        const params: Record<string, any> = {
            limit: neo4j.int(filters.limit ?? 100),
        };

        if (filters.author) {
            conditions.push("ANY(a IN p.authorships WHERE a =~ $authorRegex)");
            params.authorRegex = `(?i).*${filters.author}.*`;
        }
        if (filters.publication_year_start) {
            conditions.push("p.publication_year >= $publication_year_start");
            params.publication_year_start = filters.publication_year_start;
        }
        if (filters.publication_year_end) {
            conditions.push("p.publication_year <= $publication_year_end");
            params.publication_year_end = filters.publication_year_end;
        }
        if (filters.field) {
            conditions.push("p.field =~ $fieldRegex");
            params.fieldRegex = `(?i).*${filters.field}.*`;
        }
        if (filters.keyword) {
            conditions.push("ANY(k IN p.keywords WHERE k =~ $keywordRegex)");
            params.keywordRegex = `(?i).*${filters.keyword}.*`;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const cypherQuery = `
      MATCH (p:Paper)
      ${whereClause}
      WITH p
      ORDER BY p.cited_by_count DESC
      LIMIT $limit
      WITH collect(p) AS topNodes
      UNWIND topNodes AS node
      
      OPTIONAL MATCH (node)-[r:CITES]->(target:Paper)
      WHERE target IN topNodes
      
      RETURN 
        node AS p,
        collect({source: node.id, target: target.id, type: type(r)}) AS edges
    `;

        const records = await runQuery(cypherQuery, params);

        const nodeIds = new Set<string>();
        const nodes: any[] = [];
        const edges: GraphEdge[] = [];

        for (const record of records) {
            const p = record.p;
            if (!p) continue;

            const node = toNode(p.properties);

            if (!nodeIds.has(node.id)) {
                nodeIds.add(node.id);
                nodes.push(node);
            }

            if (record.edges) {
                for (const edge of record.edges) {
                    if (edge.source && edge.target) {
                        edges.push({
                            source: edge.source,
                            target: edge.target,
                            type: edge.type || "cites",
                            weight: 1,
                        });
                    }
                }
            }
        }

        const response: GraphResponse = {
            nodes,
            edges,
            meta: {
                total_nodes: nodes.length,
                total_edges: edges.length,
                filters_applied: filters,
            },
        };

        graphCache.set(cacheKey, response);

        return NextResponse.json(response, {
            headers: {
                "X-Cache": "MISS",
            },
        });
    } catch (error) {
        console.error("Graph API error:", error);
        return NextResponse.json({ error: "Failed to fetch graph data" }, { status: 500 });
    }
}
