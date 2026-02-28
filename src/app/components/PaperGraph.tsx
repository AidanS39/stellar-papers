"use client";

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false,
});

interface Author {
    name: string;
    institution: string | null;
}

interface PaperNode {
    id: string;
    title: string;
    year: number;
    citedByCount: number;
    type: string;
    abstract: string | null;
    doi: string | null;
    subject: string;
    subfield: string | null;
    authors: Author[];
    inDegree: number;
    x?: number;
    y?: number;
}

interface GraphData {
    nodes: PaperNode[];
    links: { source: string; target: string }[];
    meta: {
        query: string;
        totalPapers: number;
        totalLinks: number;
        maxInDegree: number;
        subjects: string[];
    };
}

// Curated color palette for subject domains
const SUBJECT_COLORS: Record<string, string> = {
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

function getSubjectColor(subject: string, allSubjects: string[]): string {
    if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
    const idx = allSubjects.indexOf(subject);
    return FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

export default function PaperGraph() {
    const [graphData, setGraphData] = useState<GraphData | null>(null);
    const [selected, setSelected] = useState<PaperNode | null>(null);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState("large language models");
    const [inputVal, setInputVal] = useState("large language models");
    const [target, setTarget] = useState(200);
    const graphRef = useRef<any>(null);
    const maxInDegree = useRef(1);
    const subjectsRef = useRef<string[]>([]);

    // Filter state
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [enabledSubjects, setEnabledSubjects] = useState<Set<string>>(new Set());
    const [yearRange, setYearRange] = useState<[number, number]>([1900, 2030]);
    const [minCitations, setMinCitations] = useState(0);
    const [minInDegree, setMinInDegree] = useState(0);

    const fetchGraph = useCallback(async (q: string, t: number) => {
        setLoading(true);
        setSelected(null);
        try {
            const resp = await fetch(`/api/graph?query=${encodeURIComponent(q)}&target=${t}`);
            const data = await resp.json();
            maxInDegree.current = data.meta.maxInDegree || 1;
            subjectsRef.current = data.meta.subjects || [];
            // Enable all subjects by default on new fetch
            setEnabledSubjects(new Set(data.meta.subjects));
            // Auto-detect year range from data
            const years = data.nodes.map((n: any) => n.year).filter(Boolean);
            if (years.length) {
                setYearRange([Math.min(...years), Math.max(...years)]);
            }
            setMinCitations(0);
            setMinInDegree(0);
            setGraphData(data);
        } catch (e) {
            console.error("Failed to fetch graph:", e);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchGraph(query, target);
    }, [query, target, fetchGraph]);

    // Compute filtered graph data
    const filteredGraphData = useMemo(() => {
        if (!graphData) return null;

        const filteredNodes = graphData.nodes.filter((n) => {
            if (!enabledSubjects.has(n.subject)) return false;
            if (n.year && (n.year < yearRange[0] || n.year > yearRange[1])) return false;
            if ((n.citedByCount || 0) < minCitations) return false;
            if ((n.inDegree || 0) < minInDegree) return false;
            return true;
        });

        const nodeIds = new Set(filteredNodes.map((n) => n.id));
        const filteredLinks = graphData.links.filter(
            (l) => nodeIds.has(l.source as any) && nodeIds.has(l.target as any),
        );

        return { nodes: filteredNodes, links: filteredLinks };
    }, [graphData, enabledSubjects, yearRange, minCitations, minInDegree]);

    // Derived stats for filter display
    const yearBounds = useMemo(() => {
        if (!graphData) return [1900, 2030];
        const years = graphData.nodes.map((n) => n.year).filter(Boolean);
        if (!years.length) return [1900, 2030];
        return [Math.min(...years), Math.max(...years)];
    }, [graphData]);

    const getNodeSize = useCallback((node: PaperNode) => {
        if (maxInDegree.current === 0) return 4;
        const normalized = node.inDegree / maxInDegree.current;
        return 3 + normalized * 20;
    }, []);

    const getNodeColor = useCallback((node: PaperNode) => {
        return getSubjectColor(node.subject, subjectsRef.current);
    }, []);

    const handleNodeClick = useCallback((node: any) => {
        setSelected(node as PaperNode);
        graphRef.current?.centerAt(node.x, node.y, 500);
        graphRef.current?.zoom(3, 500);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setQuery(inputVal);
    };

    const toggleSubject = (subject: string) => {
        setEnabledSubjects((prev) => {
            const next = new Set(prev);
            if (next.has(subject)) next.delete(subject);
            else next.add(subject);
            return next;
        });
    };

    const toggleAllSubjects = () => {
        if (!graphData) return;
        if (enabledSubjects.size === graphData.meta.subjects.length) {
            setEnabledSubjects(new Set());
        } else {
            setEnabledSubjects(new Set(graphData.meta.subjects));
        }
    };

    // Build legend entries from unique subjects
    const legendEntries = useMemo(() => {
        if (!graphData) return [];
        return graphData.meta.subjects.map((s) => ({
            label: s,
            color: getSubjectColor(s, graphData.meta.subjects),
        }));
    }, [graphData]);

    return (
        <div className="relative w-full h-screen bg-gray-950">
            {/* Search bar */}
            <form onSubmit={handleSubmit} className="absolute top-4 left-4 z-10 flex gap-2">
                <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="Search papers..."
                    className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm w-72 focus:outline-none focus:border-blue-500"
                />
                <select
                    value={target}
                    onChange={(e) => setTarget(parseInt(e.target.value))}
                    className="px-2 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none"
                >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={400}>400</option>
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
                            : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500"
                    }`}
                >
                    ⚙ Filters
                </button>
            </form>

            {/* Filter panel */}
            {filtersOpen && graphData && (
                <div className="absolute top-16 left-4 z-10 w-72 bg-gray-900 border border-gray-700 rounded-lg p-4 text-white shadow-2xl space-y-4 max-h-[75vh] overflow-y-auto">
                    {/* Subject toggles */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-medium text-gray-300">Subjects</p>
                            <button
                                onClick={toggleAllSubjects}
                                className="text-xs text-blue-400 hover:underline"
                            >
                                {enabledSubjects.size === graphData.meta.subjects.length
                                    ? "Deselect all"
                                    : "Select all"}
                            </button>
                        </div>
                        <div className="space-y-1">
                            {graphData.meta.subjects.map((s) => (
                                <label
                                    key={s}
                                    className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-200"
                                >
                                    <input
                                        type="checkbox"
                                        checked={enabledSubjects.has(s)}
                                        onChange={() => toggleSubject(s)}
                                        className="accent-blue-500 w-3.5 h-3.5"
                                    />
                                    <span
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{
                                            backgroundColor: getSubjectColor(
                                                s,
                                                graphData.meta.subjects,
                                            ),
                                        }}
                                    />
                                    {s}
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
                            max={Math.max(...graphData.nodes.map((n) => n.citedByCount || 0), 100)}
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
                            max={graphData.meta.maxInDegree}
                            step={1}
                            value={minInDegree}
                            onChange={(e) => setMinInDegree(parseInt(e.target.value))}
                            className="w-full accent-blue-500"
                        />
                    </div>

                    {/* Filter stats */}
                    <p className="text-xs text-gray-500 pt-1 border-t border-gray-700">
                        Showing {filteredGraphData?.nodes.length || 0} of {graphData.nodes.length}{" "}
                        papers
                    </p>
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 z-20">
                    <div className="text-center">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                        <p className="text-gray-300 text-sm">Fetching papers from OpenAlex...</p>
                    </div>
                </div>
            )}

            {/* Graph */}
            {filteredGraphData && !loading && (
                <ForceGraph2D
                    ref={graphRef}
                    graphData={filteredGraphData}
                    nodeLabel={(node: any) => `${node.title} (${node.subject})`}
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
                            const label = node.title?.substring(0, 35) || "";
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
                <div className="absolute top-4 right-4 z-10 bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400">
                    {filteredGraphData.nodes.length} papers · {filteredGraphData.links.length} edges
                    {graphData && filteredGraphData.nodes.length < graphData.nodes.length && (
                        <span className="text-gray-500">
                            {" "}
                            (filtered from {graphData.nodes.length})
                        </span>
                    )}
                </div>
            )}

            {/* Detail panel */}
            {selected && (
                <div className="absolute bottom-4 left-4 z-10 w-[420px] max-h-[60vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg p-5 text-white shadow-2xl">
                    <button
                        onClick={() => setSelected(null)}
                        className="absolute top-3 right-3 text-gray-400 hover:text-white text-lg"
                    >
                        ✕
                    </button>

                    <h2 className="text-base font-semibold pr-6 mb-3 leading-snug">
                        {selected.title}
                    </h2>

                    <div className="flex gap-2 flex-wrap mb-3">
                        {selected.year && (
                            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                                {selected.year}
                            </span>
                        )}
                        <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                                backgroundColor: `${getSubjectColor(selected.subject, subjectsRef.current)}22`,
                                border: `1px solid ${getSubjectColor(selected.subject, subjectsRef.current)}`,
                                color: getSubjectColor(selected.subject, subjectsRef.current),
                            }}
                        >
                            {selected.subject}
                        </span>
                        {selected.subfield && (
                            <span className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                                {selected.subfield}
                            </span>
                        )}
                        <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                            {selected.citedByCount?.toLocaleString()} global citations
                        </span>
                        <span className="px-2 py-0.5 bg-blue-900/50 border border-blue-700 rounded text-xs">
                            In-degree: {selected.inDegree}
                        </span>
                    </div>

                    {selected.authors?.length > 0 && (
                        <div className="mb-3 text-xs text-gray-400">
                            {selected.authors.map((a, i) => (
                                <span key={i}>
                                    <span className="text-gray-300">{a.name}</span>
                                    {a.institution && (
                                        <span className="text-gray-500"> ({a.institution})</span>
                                    )}
                                    {i < selected.authors.length - 1 && " · "}
                                </span>
                            ))}
                        </div>
                    )}

                    {selected.abstract && (
                        <p className="text-xs text-gray-400 leading-relaxed mb-3">
                            {selected.abstract}
                        </p>
                    )}

                    <div className="flex gap-2">
                        {selected.doi && (
                            <a
                                href={selected.doi}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline"
                            >
                                DOI →
                            </a>
                        )}
                        <a
                            href={selected.id}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:underline"
                        >
                            OpenAlex →
                        </a>
                    </div>
                </div>
            )}

            {/* Legend — dynamic by subject */}
            <div className="absolute bottom-4 right-4 z-10 bg-gray-900/80 border border-gray-700 rounded-lg p-3 text-xs text-gray-400 space-y-1 max-h-[50vh] overflow-y-auto">
                <p className="text-gray-300 font-medium mb-1">Subjects</p>
                {legendEntries.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-2">
                        <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
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
