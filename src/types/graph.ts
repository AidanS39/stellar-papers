export interface PaperNode {
    id: string;
    label: string;
    type: "paper";
    metadata: {
        title: string;
        authorships: string[];
        publication_year: number | null;
        publication_date?: string | null;
        institution: string | null;
        field: string | null;
        cited_by_count: number | null;
        citation_normalized_percentile?: number | null;
        referenced_works_count?: number | null;
        primary_topic?: string | null;
        primary_location_source?: string | null;
        keywords?: string[];
        doi: string | null;
        open_alex_id: string | null;
    };
}

export interface GraphEdge {
    source: string;
    target: string;
    type: "cites" | "related" | "shares_author" | "shares_domain" | "co_cited";
    weight?: number;
}

export interface GraphResponse {
    nodes: PaperNode[];
    edges: GraphEdge[];
    meta: {
        total_nodes: number;
        total_edges: number;
        filters_applied: GraphFilters;
    };
}

export interface GraphFilters {
    author?: string;
    publication_year_start?: number;
    publication_year_end?: number;
    institution?: string;
    field?: string;
    keyword?: string;
    limit?: number;
}
