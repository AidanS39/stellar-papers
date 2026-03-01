"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import type { PaperNode, GraphEdge, GraphResponse } from "../../types/graph";
import AuthButtons from "./AuthButtons";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false,
});

// Internal node type for the force graph (flat properties for rendering)
interface GraphNode extends PaperNode {
    x?: number;
    y?: number;
    inDegree: number;
}

// Curated color palette for domain labels
const DOMAIN_COLORS: Record<string, string> = {
    "Physical Sciences": "#60a5fa",
    "Life Sciences": "#34d399",
    "Social Sciences": "#fbbf24",
    "Health Sciences": "#f472b6",
    Engineering: "#fb923c",
    "Computer Science": "#a78bfa",
    Mathematics: "#2dd4bf",
    "Arts and Humanities": "#e879f9",
    "Environmental Science": "#4ade80",
    Unknown: "#6b7280",
};

const FALLBACK_COLORS = [
    "#f87171",
    "#38bdf8",
    "#c084fc",
    "#facc15",
    "#a3e635",
    "#fb7185",
    "#22d3ee",
    "#818cf8",
    "#fca5a1",
    "#86efac",
];

function getDomainColor(domain: string, allDomains: string[]): string {
    if (DOMAIN_COLORS[domain]) return DOMAIN_COLORS[domain];
    const idx = allDomains.indexOf(domain);
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

export default function PaperGraph() {
    const [graphData, setGraphData] = useState<GraphResponse | null>(null);
    const [selected, setSelected] = useState<GraphNode | null>(null);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Search / filter inputs
    const [inputVal, setInputVal] = useState("");
    const [limitVal, setLimitVal] = useState(200);
    const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

    const graphRef = useRef<any>(null);
    const maxInDegree = useRef(1);
    const domainsRef = useRef<string[]>([]);

    // Filter panel state
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [enabledDomains, setEnabledDomains] = useState<Set<string>>(new Set());
    const [yearRange, setYearRange] = useState<[number, number]>([1900, 2030]);
    const [minCitations, setMinCitations] = useState(0);
    const [minInDegree, setMinInDegree] = useState(0);

    const fetchGraph = useCallback(async (filters: Record<string, string>, limit: number) => {
        setLoading(true);
        setSelected(null);
        try {
            const params = new URLSearchParams({ limit: String(limit) });
            for (const [key, value] of Object.entries(filters)) {
                if (value) params.set(key, value);
            }
            const resp = await fetch(`/api/graph?${params.toString()}`);
            const data: GraphResponse = await resp.json();

            // Compute in-degree for each node
            const inDegreeMap = new Map<string, number>();
            for (const edge of data.edges || []) {
                inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1);
            }

            // Attach inDegree to nodes
            const nodesWithDegree: GraphNode[] = data.nodes.map((n) => ({
                ...n,
                inDegree: inDegreeMap.get(n.id) || 0,
            }));

            const maxDeg = Math.max(...nodesWithDegree.map((n) => n.inDegree), 1);
            maxInDegree.current = maxDeg;

            // Collect unique domains
            const domains = [
                ...new Set(nodesWithDegree.map((n) => n.metadata.field || "Unknown")),
            ];
            domainsRef.current = domains;
            setEnabledDomains(new Set(domains));

            // Auto-detect year range
            const years = nodesWithDegree
                .map((n) => n.metadata.publication_year)
                .filter((y): y is number => y != null);
            if (years.length) {
                setYearRange([Math.min(...years), Math.max(...years)]);
            }
            setMinCitations(0);
            setMinInDegree(0);

            setGraphData({
                ...data,
                nodes: nodesWithDegree,
            });
        } catch (e) {
            console.error("Failed to fetch graph:", e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (hasSearched) {
            fetchGraph(activeFilters, limitVal);
        }
    }, [activeFilters, limitVal, hasSearched, fetchGraph]);

    // Cast nodes to GraphNode for internal use
    const graphNodes = (graphData?.nodes || []) as GraphNode[];

    // Filtered graph data
    const filteredGraphData = useMemo(() => {
        if (!graphData) return null;

        const filteredNodes = graphNodes.filter((n) => {
            const domain = n.metadata.field || "Unknown";
            if (!enabledDomains.has(domain)) return false;
            const year = n.metadata.publication_year;
            if (year != null && (year < yearRange[0] || year > yearRange[1])) return false;
            if ((n.metadata.cited_by_count || 0) < minCitations) return false;
            if ((n.inDegree || 0) < minInDegree) return false;
            return true;
        });

        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        const filteredEdges = (graphData.edges || []).filter(
            (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
        );

        return {
            nodes: filteredNodes,
            links: filteredEdges.map((e) => ({ source: e.source, target: e.target })),
        };
    }, [graphData, graphNodes, enabledDomains, yearRange, minCitations, minInDegree]);

    // Year bounds from raw data
    const yearBounds = useMemo(() => {
        const years = graphNodes
            .map((n) => n.metadata.publication_year)
            .filter((y): y is number => y != null);
        if (!years.length) return [1900, 2030];
        return [Math.min(...years), Math.max(...years)];
    }, [graphNodes]);

    const getNodeSize = useCallback((node: GraphNode) => {
        if (maxInDegree.current === 0) return 4;
        const normalized = node.inDegree / maxInDegree.current;
        return 3 + normalized * 20;
    }, []);

    const getNodeColor = useCallback((node: GraphNode) => {
        return getDomainColor(node.metadata.field || "Unknown", domainsRef.current);
    }, []);

    const handleNodeClick = useCallback((node: any) => {
        setSelected(node as GraphNode);
        graphRef.current?.centerAt(node.x, node.y, 500);
        graphRef.current?.zoom(3, 500);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const filters: Record<string, string> = {};
        if (inputVal) filters.keyword = inputVal;
        setActiveFilters(filters);
        setHasSearched(true);
    };

    const toggleDomain = (domain: string) => {
        setEnabledDomains((prev) => {
            const next = new Set(prev);
            if (next.has(domain)) next.delete(domain);
            else next.add(domain);
            return next;
        });
    };

    const toggleAllDomains = () => {
        if (enabledDomains.size === domainsRef.current.length) {
            setEnabledDomains(new Set());
        } else {
            setEnabledDomains(new Set(domainsRef.current));
        }
    };

    // Legend entries
    const legendEntries = useMemo(() => {
        return domainsRef.current.map((d) => ({
            label: d,
            color: getDomainColor(d, domainsRef.current),
        }));
    }, [graphData]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="relative w-full h-screen bg-gray-100 dark:bg-gray-950">
            {/* Auth buttons */}
            <div className="absolute top-4 right-4 z-20">
                <AuthButtons />
            </div>

            {/* Search bar */}
            <form onSubmit={handleSubmit} className="absolute top-4 left-4 z-10 flex gap-2">
                <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="Search by keyword..."
                    className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm w-96 focus:outline-none focus:border-blue-500"
                />
                <select
                    value={limitVal}
                    onChange={(e) => setLimitVal(parseInt(e.target.value))}
                    className="px-2 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none"
                >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={400}>400</option>
                    <option value={1000}>1000</option>
                    <option value={5000}>5000</option>
                </select>
                <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white text-sm font-medium"
                >
                    Search
                </button>
                <button
                    type="button"
                    onClick={() => setFiltersOpen((v) => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        filtersOpen
                            ? "bg-blue-600 border-blue-500 text-white"
                            : "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
                    }`}
                >
                    ⚙ Filters
                </button>
            </form>

            {/* Filter panel */}
            {filtersOpen && graphData && (
                <div className="absolute top-16 left-4 z-10 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-gray-900 dark:text-white shadow-2xl space-y-4 max-h-[75vh] overflow-y-auto">
                    {/* Domain toggles */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                Domains
                            </p>
                            <button
                                onClick={toggleAllDomains}
                                className="text-xs text-blue-400 hover:underline"
                            >
                                {enabledDomains.size === domainsRef.current.length
                                    ? "Deselect all"
                                    : "Select all"}
                            </button>
                        </div>
                        <div className="space-y-1">
                            {domainsRef.current.map((d) => (
                                <label
                                    key={d}
                                    className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabledDomains.has(d)}
                                        onChange={() => toggleDomain(d)}
                                        className="accent-blue-500 w-3.5 h-3.5"
                                    />
                                    <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{
                                            backgroundColor: getDomainColor(d, domainsRef.current),
                                        }}
                                    />
                                    {d}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Year range */}
                    <div>
                        <p className="text-xs font-medium text-gray-300 mb-2">
                            Year Range: {yearRange[0]} – {yearRange[1]}
                        </p>
                        <div className="flex gap-2 items-center">
                            <input
                                type="range"
                                min={yearBounds[0]}
                                max={yearBounds[1]}
                                value={yearRange[0]}
                                onChange={(e) =>
                                    setYearRange([
                                        Math.min(parseInt(e.target.value), yearRange[1]),
                                        yearRange[1],
                                    ])
                                }
                                className="w-full accent-blue-500"
                            />
                            <input
                                type="range"
                                min={yearBounds[0]}
                                max={yearBounds[1]}
                                value={yearRange[1]}
                                onChange={(e) =>
                                    setYearRange([
                                        yearRange[0],
                                        Math.max(parseInt(e.target.value), yearRange[0]),
                                    ])
                                }
                                className="w-full accent-blue-500"
                            />
                        </div>
                    </div>

                    {/* Min citations */}
                    <div>
                        <p className="text-xs font-medium text-gray-300 mb-2">
                            Min Citations: {minCitations}
                        </p>
                        <input
                            type="range"
                            min={0}
                            max={Math.max(
                                ...graphNodes.map((n) => n.metadata.cited_by_count || 0),
                                100,
                            )}
                            step={1}
                            value={minCitations}
                            onChange={(e) => setMinCitations(parseInt(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>

                    {/* Min in-degree */}
                    <div>
                        <p className="text-xs font-medium text-gray-300 mb-2">
                            Min In-Degree: {minInDegree}
                        </p>
                        <input
                            type="range"
                            min={0}
                            max={maxInDegree.current}
                            step={1}
                            value={minInDegree}
                            onChange={(e) => setMinInDegree(parseInt(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>

                    {/* Filter stats */}
                    <p className="text-xs text-gray-500 pt-1 border-t border-gray-700">
                        Showing {filteredGraphData?.nodes.length || 0} of {graphNodes.length} papers
                    </p>
                </div>
            )}

            {/* Empty state */}
            {!hasSearched && !loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center max-w-md">
                        <p className="text-4xl mb-4">🔬</p>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            Explore Academic Research
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                            Search any topic to visualize the citation network of academic papers.
                            Try keywords like <em>quantum computing</em>,{" "}
                            <em>CRISPR gene editing</em>, <em>transformer architecture</em>, or{" "}
                            <em>climate modeling</em>.
                        </p>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 dark:bg-gray-950/80 z-20">
                    <div className="text-center">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                            Fetching papers...
                        </p>
                    </div>
                </div>
            )}

            {/* Graph */}
            {filteredGraphData && !loading && (
                <ForceGraph2D
                    ref={graphRef}
                    graphData={filteredGraphData}
                    nodeLabel={(node: any) =>
                        `${node.metadata?.title || node.label} (${node.metadata?.domain || "Unknown"})`
                    }
                    nodeVal={(node: any) => getNodeSize(node)}
                    nodeColor={(node: any) => getNodeColor(node)}
                    nodeRelSize={1}
                    linkColor={() => "rgba(255,255,255,0.25)"}
                    linkWidth={1.2}
                    linkDirectionalArrowLength={2}
                    linkDirectionalArrowRelPos={1}
                    onNodeClick={handleNodeClick}
                    onBackgroundClick={() => setSelected(null)}
                    cooldownTicks={200}
                    nodeCanvasObject={(node: any, ctx, globalScale) => {
                        const size = getNodeSize(node);
                        const color = getNodeColor(node);

                        // Glow for high in-degree
                        if (node.inDegree > maxInDegree.current * 0.3) {
                            ctx.beginPath();
                            ctx.arc(node.x!, node.y!, size + 3, 0, 2 * Math.PI);
                            ctx.fillStyle = `${color}33`;
                            ctx.fill();
                        }

                        ctx.beginPath();
                        ctx.arc(node.x!, node.y!, size, 0, 2 * Math.PI);
                        ctx.fillStyle = color;
                        ctx.fill();

                        // Border
                        ctx.strokeStyle = "rgba(255,255,255,0.15)";
                        ctx.lineWidth = 0.5;
                        ctx.stroke();

                        // Labels when zoomed in
                        if (globalScale > 1.5 && node.inDegree > 0) {
                            const label =
                                (node.metadata?.title || node.label)?.substring(0, 35) || "";
                            const fontSize = Math.max(3, 10 / globalScale);
                            ctx.font = `${fontSize}px Sans-Serif`;
                            ctx.fillStyle = "rgba(255,255,255,0.85)";
                            ctx.textAlign = "center";
                            ctx.fillText(label, node.x!, node.y! + size + fontSize + 1);
                        }
                    }}
                    d3VelocityDecay={0.3}
                    warmupTicks={50}
                />
            )}

            {/* Stats bar */}
            {filteredGraphData && !loading && (
                <div className="absolute top-14 right-4 z-10 bg-white/90 dark:bg-gray-900/90 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {filteredGraphData.nodes.length} papers · {filteredGraphData.links.length} edges
                    {graphData && filteredGraphData.nodes.length < graphNodes.length && (
                        <span className="text-gray-500"> (filtered from {graphNodes.length})</span>
                    )}
                </div>
            )}

            {/* Detail panel */}
            {selected && (
                <div className="absolute bottom-4 left-4 z-10 w-[420px] max-h-[60vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-5 text-gray-900 dark:text-white shadow-2xl">
                    <button
                        onClick={() => setSelected(null)}
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-900 dark:hover:text-white text-lg"
                    >
                        ✕
                    </button>

                    <h2 className="text-base font-semibold pr-6 mb-3 leading-snug">
                        {selected.metadata.title || selected.label}
                    </h2>

                    <div className="flex gap-2 flex-wrap mb-3">
                        {selected.metadata.publication_year && (
                            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                                {selected.metadata.publication_year}
                            </span>
                        )}
                        <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                                backgroundColor: `${getDomainColor(selected.metadata.field || "Unknown", domainsRef.current)}22`,
                                border: `1px solid ${getDomainColor(selected.metadata.field || "Unknown", domainsRef.current)}`,
                                color: getDomainColor(
                                    selected.metadata.field || "Unknown",
                                    domainsRef.current,
                                ),
                            }}
                        >
                            {selected.metadata.field || "Unknown"}
                        </span>
                        {selected.metadata.primary_topic && (
                            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                                {selected.metadata.primary_topic}
                            </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                            {(selected.metadata.cited_by_count || 0).toLocaleString()} global
                            citations
                        </span>
                        <span className="px-2 py-0.5 bg-blue-900/50 border border-blue-700 rounded text-xs">
                            In-degree: {selected.inDegree}
                        </span>
                    </div>

                    {selected.metadata.authorships?.length > 0 && (
                        <div className="mb-3 text-xs text-gray-400">
                            {selected.metadata.authorships.map((a, i) => (
                                <span key={i}>
                                    <span className="text-gray-300">{a}</span>
                                    {i < selected.metadata.authorships.length - 1 && " · "}
                                </span>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        {selected.metadata.doi && (
                            <a
                                href={selected.metadata.doi}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                            >
                                DOI →
                            </a>
                        )}
                        {selected.metadata.open_alex_id && (
                            <a
                                href={selected.metadata.open_alex_id}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                            >
                                OpenAlex →
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-4 right-4 z-10 bg-white/80 dark:bg-gray-900/80 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs text-gray-500 dark:text-gray-400 space-y-1 max-h-[50vh] overflow-y-auto">
                <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">Domains</p>
                {legendEntries.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-2">
                        <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: entry.color }}
                        />
                        {entry.label}
                    </div>
                ))}
                <p className="pt-1 text-gray-500">Node size = in-degree</p>
            </div>
        </div>
    );
}
