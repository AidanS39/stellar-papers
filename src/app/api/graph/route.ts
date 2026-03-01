import neo4j from "neo4j-driver";
import { NextRequest, NextResponse } from "next/server";
import { runQuery } from "../../../lib/neo4j";
import { toNode } from "../../../lib/transform";
import { GraphFilters, GraphResponse, GraphEdge } from "../../../types/graph";

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
    domain: searchParams.get("domain") ?? undefined,
    keyword: searchParams.get("keyword") ?? undefined,
    limit: searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : 100,
  };

  try {
    const conditions: string[] = [];
    const params: Record<string, any> = {
      limit: neo4j.int(filters.limit ?? 100),
    };

    if (filters.author) {
      conditions.push(
        "ANY(a IN p.authorships WHERE toLower(a) CONTAINS toLower($author))",
      );
      params.author = filters.author;
    }
    if (filters.publication_year_start) {
      conditions.push("p.publication_year >= $publication_year_start");
      params.publication_year_start = filters.publication_year_start;
    }
    if (filters.publication_year_end) {
      conditions.push("p.publication_year <= $publication_year_end");
      params.publication_year_end = filters.publication_year_end;
    }
    if (filters.domain) {
      conditions.push("toLower(p.domain) CONTAINS toLower($domain)");
      params.domain = filters.domain;
    }
    if (filters.keyword) {
      conditions.push(
        "ANY(k IN p.keywords WHERE toLower(k) CONTAINS toLower($keyword))",
      );
      params.keyword = filters.keyword;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const nodeCypher = `
      MATCH (p:Paper)
      ${whereClause}
      WITH p
      ORDER BY p.cited_by_count DESC
      RETURN p
      LIMIT $limit
    `;

    const nodeRecords = await runQuery(nodeCypher, params);
    const nodeIds = new Set<string>();
    const nodes = nodeRecords.map((record) => {
      const node = toNode(record.p.properties);
      nodeIds.add(node.id);
      return node;
    });

    const edgeCypher = `
      MATCH (a:Paper)-[r:CITES]->(b:Paper)
      WHERE a.id IN $nodeIds AND b.id IN $nodeIds
      RETURN a.id AS source, b.id AS target, type(r) AS rel_type
    `;

    const edgeRecords = await runQuery(edgeCypher, {
      nodeIds: Array.from(nodeIds),
    });


    const edges: GraphEdge[] = edgeRecords.map((record) => ({
      source: record.source,
      target: record.target,
      type: "cites",
      weight: 1,
    }));

    const response: GraphResponse = {
      nodes,
      edges,
      meta: {
        total_nodes: nodes.length,
        total_edges: edges.length,
        filters_applied: filters,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Graph API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch graph data" },
      { status: 500 },
    );
  }
}
