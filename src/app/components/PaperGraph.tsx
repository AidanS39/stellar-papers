"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import AuthButtons from "./AuthButtons";
import AiChatPanel from "./AiChatPanel";
import SavedPapersPanel from "./SavedPapersPanel";
import { useTheme } from "./ThemeProvider";
import { useSession } from "next-auth/react";
import { HiBookmark, HiX } from "react-icons/hi";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
    ssr: false,
    loading: () => (
        <div
            style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "400px",
            }}
        >
            <p>Loading Graph...</p>
        </div>
    ),
});

const USE_MOCK = false;

interface Paper {
    paperId: string;
    title: string;
    year: number | null;
    citationCount: number;
    fieldsOfStudy: string[];
    abstract: string;
    _score?: number;
}

interface GraphNode {
    id: string;
    title: string;
    year: number | null;
    citations: number;
    fields: string[];
    abstract: string;
    doi?: string;
    authors?: string[];
    institution?: string;
    topic?: string;
    percentile?: number;
    publishedDate?: string;
    openAlexId?: string;
    color: string;
    isPrimary: boolean;
    degree?: number;
    x?: number;
    y?: number;
}

interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

interface MockRef {
    sourceId: string;
    targets: string[];
}

const FIELD_COLORS: Record<string, string> = {
    "Computer Science": "#4fc3f7",
    Mathematics: "#a78bfa",
    Physics: "#fb923c",
    Biology: "#34d399",
    Medicine: "#f472b6",
    Chemistry: "#fbbf24",
    Engineering: "#22d3ee",
    Economics: "#f97316",
    Psychology: "#e879f9",
    Sociology: "#2dd4bf",
    "Political Science": "#fb7185",
    History: "#ff6e40",
    Philosophy: "#94a3b8",
    Art: "#e879f9",
    Linguistics: "#818cf8",
    "Environmental Science": "#4ade80",
};

const DYNAMIC_PALETTE = [
    "#ef4444",
    "#f97316",
    "#f59e0b",
    "#84cc16",
    "#22c55e",
    "#10b981",
    "#14b8a6",
    "#06b6d4",
    "#0ea5e9",
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#a855f7",
    "#d946ef",
    "#ec4899",
    "#f43f5e",
];

const dynamicFieldColors = new Map<string, string>();
const DEFAULT_COLOR = "#7dd3fc";

function fieldColor(fields: string[]): string {
    if (!fields || !fields.length) return DEFAULT_COLOR;
    const primaryField = fields[0];

    const matchKey = Object.keys(FIELD_COLORS).find(
        (k) => k.toLowerCase() === primaryField.toLowerCase(),
    );
    if (matchKey) return FIELD_COLORS[matchKey];

    const normalizedDynamic = primaryField.toLowerCase();
    if (!dynamicFieldColors.has(normalizedDynamic)) {
        const nextColor = DYNAMIC_PALETTE[dynamicFieldColors.size % DYNAMIC_PALETTE.length];
        dynamicFieldColors.set(normalizedDynamic, nextColor);
    }

    return dynamicFieldColors.get(normalizedDynamic)!;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    if (!hex || hex.length < 7) return { r: 125, g: 200, b: 255 };
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

function getNodeRadius(degree: number, isHovered = false): number {
    const base = Math.max(3, Math.min(22, 2.5 + Math.sqrt(degree) * 1.8));
    return isHovered ? base * 1.5 : base;
}

async function fetchGraph(
    query: string,
    maxNodes: number,
    minYear: number,
    maxYear: number,
    minCitations: number,
    authorFilter: string,
    fieldFilter: string,
): Promise<GraphData> {
    return fetchNeo4jGraph(
        query,
        maxNodes,
        minYear,
        maxYear,
        minCitations,
        authorFilter,
        fieldFilter,
    );
}

async function fetchNeo4jGraph(
    query: string,
    maxNodes: number,
    minYear: number,
    maxYear: number,
    minCitations: number,
    authorFilter: string,
    fieldFilter: string,
): Promise<GraphData> {
    const params = new URLSearchParams({
        limit: String(maxNodes),
    });
    if (query.trim()) params.set("keyword", query.trim());
    if (minYear > 0) params.set("publication_year_start", String(minYear));
    if (maxYear > 0) params.set("publication_year_end", String(maxYear));
    if (authorFilter.trim()) params.set("author", authorFilter.trim());
    if (fieldFilter.trim()) params.set("field", fieldFilter.trim());
    const res = await fetch(`/api/graph?${params}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((err as { error: string }).error || `Server error ${res.status}`);
    }
    const data = await res.json();

    const nodes: GraphNode[] = (data.nodes || []).map((n: any) => ({
        id: n.id,
        title: n.metadata?.title || n.label || "Untitled",
        year: n.metadata?.publication_year ?? null,
        citations: n.metadata?.cited_by_count ?? 0,
        fields: n.metadata?.field ? [n.metadata.field] : [],
        abstract: n.metadata?.keywords?.join(", ") || "",
        authors: n.metadata?.authorships || [],
        institution: n.metadata?.institution || undefined,
        topic: n.metadata?.primary_topic || undefined,
        percentile: n.metadata?.citation_normalized_percentile ?? undefined,
        publishedDate: n.metadata?.publication_date || undefined,
        doi: n.metadata?.doi ?? undefined,
        openAlexId: n.metadata?.open_alex_id || n.id,
        color: fieldColor(n.metadata?.field ? [n.metadata.field] : []),
        isPrimary: true,
    }));
    const links: GraphLink[] = (data.edges || []).map((e: any) => ({
        source: e.source,
        target: e.target,
    }));
    return { nodes, links };
}

function buildGraph(primaries: Paper[], allRefs: MockRef[], allPapers: Paper[]): GraphData {
    const nodeMap = new Map<string, GraphNode>();

    primaries.forEach((p) => {
        nodeMap.set(p.paperId, {
            id: p.paperId,
            title: p.title,
            year: p.year,
            citations: p.citationCount,
            fields: p.fieldsOfStudy,
            abstract: p.abstract,
            color: fieldColor(p.fieldsOfStudy),
            isPrimary: true,
        });
    });

    const links: GraphLink[] = [];
    const primaryIds = new Set(nodeMap.keys());

    allRefs.forEach(({ sourceId, targets }) => {
        if (!primaryIds.has(sourceId)) return;
        targets.forEach((tid) => {
            const ref = allPapers.find((p) => p.paperId === tid);
            if (!ref) return;
            if (!nodeMap.has(tid)) {
                nodeMap.set(tid, {
                    id: ref.paperId,
                    title: ref.title,
                    year: ref.year,
                    citations: ref.citationCount,
                    fields: ref.fieldsOfStudy,
                    abstract: ref.abstract,
                    color: fieldColor(ref.fieldsOfStudy),
                    isPrimary: false,
                });
            }
            links.push({ source: sourceId, target: tid });
        });
    });

    return { nodes: Array.from(nodeMap.values()), links };
}

interface StarFieldProps {
    width: number;
    height: number;
}

function StarField({ width, height }: StarFieldProps) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas || !width || !height) return;
        const ctx = canvas.getContext("2d")!;

        const layers = [
            Array.from({ length: 180 }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 0.6 + 0.1,
                phase: Math.random() * Math.PI * 2,
                spd: Math.random() * 0.003 + 0.001,
                cr: 190,
                cg: 210,
                cb: 255,
                maxA: 0.45,
            })),
            Array.from({ length: 90 }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                r: Math.random() * 0.9 + 0.3,
                phase: Math.random() * Math.PI * 2,
                spd: Math.random() * 0.005 + 0.002,
                cr: 220,
                cg: 225,
                cb: 255,
                maxA: 0.65,
            })),
            Array.from({ length: 30 }, () => {
                const w = Math.random() > 0.6;
                return {
                    x: Math.random() * width,
                    y: Math.random() * height,
                    r: Math.random() * 1.4 + 0.6,
                    phase: Math.random() * Math.PI * 2,
                    spd: Math.random() * 0.007 + 0.003,
                    cr: w ? 255 : 200,
                    cg: w ? 230 : 220,
                    cb: w ? 190 : 255,
                    maxA: 0.85,
                };
            }),
        ].flat();

        const nebulae = [
            {
                x: width * 0.72,
                y: height * 0.22,
                rx: width * 0.28,
                ry: height * 0.22,
                r: 60,
                g: 80,
                b: 160,
                a: 0.045,
            },
            {
                x: width * 0.15,
                y: height * 0.65,
                rx: width * 0.22,
                ry: height * 0.28,
                r: 80,
                g: 40,
                b: 140,
                a: 0.038,
            },
            {
                x: width * 0.55,
                y: height * 0.78,
                rx: width * 0.2,
                ry: height * 0.18,
                r: 20,
                g: 80,
                b: 120,
                a: 0.032,
            },
            {
                x: width * 0.88,
                y: height * 0.55,
                rx: width * 0.16,
                ry: height * 0.22,
                r: 100,
                g: 50,
                b: 160,
                a: 0.028,
            },
        ];

        interface Shooter {
            x: number;
            y: number;
            len: number;
            speed: number;
            angle: number;
            life: number;
            maxLife: number;
            active: boolean;
            nextAt: number;
        }
        const makeShooter = (): Shooter => ({
            x: Math.random() * width,
            y: Math.random() * height * 0.6,
            len: Math.random() * 90 + 40,
            speed: Math.random() * 8 + 5,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
            life: 0,
            maxLife: Math.random() * 40 + 25,
            active: false,
            nextAt: Math.random() * 400 + 100,
        });
        const shooters: Shooter[] = Array.from({ length: 4 }, makeShooter);

        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const octx = offscreen.getContext("2d")!;
        nebulae.forEach((n) => {
            const maxR = Math.max(n.rx, n.ry);
            const grd = octx.createRadialGradient(n.x, n.y, 0, n.x, n.y, maxR);
            grd.addColorStop(0, `rgba(${n.r},${n.g},${n.b},${n.a})`);
            grd.addColorStop(0.5, `rgba(${n.r},${n.g},${n.b},${(n.a * 0.4).toFixed(3)})`);
            grd.addColorStop(1, `rgba(${n.r},${n.g},${n.b},0)`);
            octx.save();
            octx.scale(n.rx / maxR, n.ry / maxR);
            octx.beginPath();
            octx.arc((n.x * maxR) / n.rx, (n.y * maxR) / n.ry, maxR, 0, Math.PI * 2);
            octx.fillStyle = grd;
            octx.fill();
            octx.restore();
        });

        let t = 0;
        let raf: number;

        const draw = () => {
            t += 0.016;
            ctx.fillStyle = "#01020d";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(offscreen, 0, 0);

            shooters.forEach((s) => {
                if (!s.active) {
                    s.nextAt--;
                    if (s.nextAt <= 0) {
                        Object.assign(s, makeShooter(), { active: true, life: 0 });
                    }
                    return;
                }
                s.life++;
                const progress = s.life / s.maxLife;
                const alpha = progress < 0.3 ? progress / 0.3 : (1 - progress) / 0.7;
                const tx = s.x + Math.cos(s.angle) * s.speed * s.life;
                const ty = s.y + Math.sin(s.angle) * s.speed * s.life;
                const tailX = tx - Math.cos(s.angle) * s.len * alpha;
                const tailY = ty - Math.sin(s.angle) * s.len * alpha;
                const grd = ctx.createLinearGradient(tailX, tailY, tx, ty);
                grd.addColorStop(0, "rgba(255,255,255,0)");
                grd.addColorStop(1, `rgba(220,235,255,${(alpha * 0.7).toFixed(2)})`);
                ctx.beginPath();
                ctx.moveTo(tailX, tailY);
                ctx.lineTo(tx, ty);
                ctx.strokeStyle = grd;
                ctx.lineWidth = 1.2;
                ctx.stroke();
                if (s.life >= s.maxLife) {
                    s.active = false;
                    s.nextAt = Math.random() * 500 + 200;
                }
            });

            raf = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(raf);
    }, [width, height]);

    return (
        <canvas
            ref={ref}
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
    );
}

export default function PaperGraph() {
    const containerRef = useRef<HTMLDivElement>(null);
    const hoveredRef = useRef<GraphNode | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);
    const { theme } = useTheme();
    const isDark = theme === "dark";

    const t = useMemo(
        () =>
            isDark
                ? {
                      bg: "#01020d",
                      sidebarBg: "linear-gradient(to right, rgba(1,2,13,0.97) 78%, transparent)",
                      accent: "#4fc3f7",
                      accentMuted: "rgba(79,195,247,0.5)",
                      accentBorder: "rgba(79,195,247,0.3)",
                      accentBorderStrong: "rgba(79,195,247,0.4)",
                      accentBg: "rgba(79,195,247,0.14)",
                      accentBgMuted: "rgba(79,195,247,0.06)",
                      divider: "rgba(79,195,247,0.18)",
                      textPrimary: "#fff",
                      textSecondary: "#c8deff",
                      textMuted: "rgba(200,222,255,0.45)",
                      textFaint: "rgba(200,222,255,0.28)",
                      textField: "rgba(200,222,255,0.7)",
                      inputBg: "rgba(6,14,50,0.85)",
                      tooltipBg: "rgba(2,5,22,0.96)",
                      statBg: "rgba(2,5,22,0.9)",
                      statusColor: "rgba(79,195,247,0.65)",
                      titleShadow: "0 0 28px rgba(79,195,247,0.85)",
                      accentShadow: "0 0 10px rgba(79,195,247,0.65)",
                      tooltipBorder: "rgba(255,255,255,0.06)",
                  }
                : {
                      bg: "#f0f4f8",
                      sidebarBg:
                          "linear-gradient(to right, rgba(241,245,249,0.97) 78%, transparent)",
                      accent: "#0284c7",
                      accentMuted: "rgba(2,132,199,0.5)",
                      accentBorder: "rgba(2,132,199,0.25)",
                      accentBorderStrong: "rgba(2,132,199,0.4)",
                      accentBg: "rgba(2,132,199,0.1)",
                      accentBgMuted: "rgba(2,132,199,0.04)",
                      divider: "rgba(2,132,199,0.15)",
                      textPrimary: "#1e293b",
                      textSecondary: "#334155",
                      textMuted: "rgba(51,65,85,0.6)",
                      textFaint: "rgba(51,65,85,0.35)",
                      textField: "rgba(51,65,85,0.8)",
                      inputBg: "rgba(255,255,255,0.9)",
                      tooltipBg: "rgba(255,255,255,0.96)",
                      statBg: "rgba(255,255,255,0.92)",
                      statusColor: "rgba(2,132,199,0.65)",
                      titleShadow: "none",
                      accentShadow: "none",
                      tooltipBorder: "rgba(0,0,0,0.06)",
                  },
        [isDark],
    );

    const [dims, setDims] = useState({ w: 1200, h: 800 });
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(
        USE_MOCK
            ? 'Mock mode — try "transformer", "diffusion", "biology"'
            : "Connected to Neo4j — enter a topic to explore",
    );
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
    const adjacencyList = useMemo(() => {
        const adj = new Map<string, Set<string>>();
        graphData.nodes.forEach((n) => adj.set(n.id, new Set()));
        graphData.links.forEach((l) => {
            const sourceId = typeof l.source === "string" ? l.source : l.source.id;
            const targetId = typeof l.target === "string" ? l.target : l.target.id;
            adj.get(sourceId)?.add(targetId);
            adj.get(targetId)?.add(sourceId);
        });

        graphData.nodes.forEach((n) => {
            n.degree = adj.get(n.id)?.size || 0;
        });

        return adj;
    }, [graphData]);

    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [fieldsPresent, setFieldsPresent] = useState<string[]>([]);
    const [maxNodes, setMaxNodes] = useState(50);
    const [minYear, setMinYear] = useState(1980);
    const [maxYear, setMaxYear] = useState(new Date().getFullYear());
    const [minCitations, setMinCitations] = useState(0);
    const [authorFilter, setAuthorFilter] = useState("");
    const [fieldFilter, setFieldFilter] = useState("");
    const [aiOpen, setAiOpen] = useState(false);
    const [savedOpen, setSavedOpen] = useState(false);
    const [savedRefreshKey, setSavedRefreshKey] = useState(0);
    const { data: session } = useSession();

    useEffect(() => {
        setDims({ w: window.innerWidth, h: window.innerHeight });
        const obs = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setDims({ w: width, h: height });
        });
        if (containerRef.current) obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!fgRef.current || graphData.nodes.length === 0) return;

        const ATTRACT_STRENGTH = 0.005;
        const REPEL_STRENGTH = 1.5;
        const REPEL_RADIUS = 100;

        function colorClusterForce(alpha: number) {
            const nodes = graphData.nodes as Array<GraphNode & { vx?: number; vy?: number }>;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i];
                    const b = nodes[j];
                    if (a.x == null || a.y == null || b.x == null || b.y == null) continue;

                    const dx = b.x - a.x || 0.001;
                    const dy = b.y - a.y || 0.001;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    const minDist =
                        getNodeRadius(a.degree ?? 0, false) +
                        getNodeRadius(b.degree ?? 0, false) +
                        2;
                    if (dist < minDist) {
                        const overlap = ((minDist - dist) / dist) * 1.2;
                        a.vx = (a.vx ?? 0) - nx * overlap;
                        a.vy = (a.vy ?? 0) - ny * overlap;
                        b.vx = (b.vx ?? 0) + nx * overlap;
                        b.vy = (b.vy ?? 0) + ny * overlap;
                        continue;
                    }

                    let fx = 0;
                    let fy = 0;

                    if (a.color === b.color) {
                        const pull = ATTRACT_STRENGTH * alpha * (dist / 200);
                        fx = nx * pull;
                        fy = ny * pull;
                    } else if (dist < REPEL_RADIUS) {
                        const push =
                            REPEL_STRENGTH * alpha * ((REPEL_RADIUS - dist) / REPEL_RADIUS);
                        fx = -nx * push;
                        fy = -ny * push;
                    }

                    a.vx = (a.vx ?? 0) + fx;
                    a.vy = (a.vy ?? 0) + fy;
                    b.vx = (b.vx ?? 0) - fx;
                    b.vy = (b.vy ?? 0) - fy;
                }
            }
        }

        fgRef.current.d3Force("color-clustering", colorClusterForce);

        fgRef.current.d3Force("collision", null);

        fgRef.current.d3ReheatSimulation();
    }, [graphData]);

    const onMouseMove = useCallback((e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    }, []);

    const onNodeHover = useCallback((node: object | null) => {
        hoveredRef.current = (node as GraphNode) || null;
        setHoveredNode((node as GraphNode) || null);
    }, []);

    const onNodeClick = useCallback((node: object) => {
        setSelectedNode(node as GraphNode);
    }, []);

    const handleSavePaper = async () => {
        if (!selectedNode || !session?.user) return;
        try {
            const res = await fetch("/api/saved", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    paperId: selectedNode.id,
                    title: selectedNode.title,
                    field: selectedNode.fields?.[0] ?? null,
                    publication_year: selectedNode.year ?? null,
                    cited_by_count: selectedNode.citations ?? null,
                    open_alex_id: selectedNode.id ?? null,
                }),
            });
            if (res.ok) {
                setSavedRefreshKey((prev) => prev + 1);
                setSavedOpen(true);
            }
        } catch (err) {
            console.error("Failed to save paper", err);
        }
    };

    const runSearch = useCallback(async () => {
        if (loading) return;
        setLoading(true);
        setSelectedNode(null);
        setStatus(
            query.trim() || authorFilter.trim() || fieldFilter.trim()
                ? "Scanning the cosmos…"
                : "Loading papers…",
        );
        setGraphData({ nodes: [], links: [] });
        try {
            const data = await fetchGraph(
                query,
                maxNodes,
                minYear,
                maxYear,
                minCitations,
                authorFilter,
                fieldFilter,
            );
            if (data.nodes.length === 0) {
                setStatus("No results found. Try a different query.");
                setLoading(false);
                return;
            }
            const fields = [...new Set(data.nodes.flatMap((n) => n.fields))].filter(Boolean);
            setFieldsPresent(fields);
            setTimeout(() => {
                setGraphData(data);
                setStatus(`${data.nodes.length} papers · ${data.links.length} connections`);
                setLoading(false);
            }, 60);
        } catch (e) {
            setStatus(`Error: ${(e as Error).message}`);
            setLoading(false);
        }
    }, [query, maxNodes, minYear, maxYear, minCitations, authorFilter, fieldFilter, loading]);

    useEffect(() => {
        runSearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const drawNode = useCallback(
        (node: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
            try {
                const n = node as GraphNode;
                if (n.x == null || n.y == null) return;
                const { x, y, color = DEFAULT_COLOR, citations = 0, isPrimary = false } = n;
                const isHov = hoveredRef.current?.id === n.id;
                const isSelected = selectedNode?.id === n.id;
                let isConnectedToSelected = false;
                if (selectedNode) {
                    isConnectedToSelected = adjacencyList.get(selectedNode.id)?.has(n.id) || false;
                }

                const opacity = selectedNode && !isSelected && !isConnectedToSelected ? 0.2 : 1;
                const radius = getNodeRadius(n.degree ?? 0, isHov || isSelected);
                const { r, g, b } = hexToRgb(color);

                const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
                gradient.addColorStop(
                    0,
                    `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(
                        255,
                        b + 40,
                    )},${1 * opacity})`,
                );
                gradient.addColorStop(0.7, `rgba(${r},${g},${b},${1 * opacity})`);
                gradient.addColorStop(
                    1,
                    `rgba(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(
                        0,
                        b - 30,
                    )},${1 * opacity})`,
                );

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                ctx.lineWidth = 0.5 * (isSelected ? 2 : 1);
                ctx.strokeStyle = `rgba(${r},${g},${b},${opacity})`;
                ctx.stroke();

                if (isSelected) return;
            } catch (_) {
                /* swallow */
            }
        },
        [adjacencyList, selectedNode],
    );

    const paintNodePointerArea = useCallback(
        (node: object, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as GraphNode;
            if (n.x == null || n.y == null) return;
            const radius = getNodeRadius(n.degree ?? 0, false);
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
        },
        [],
    );

    const drawLink = useCallback(
        (link: object, ctx: CanvasRenderingContext2D) => {
            try {
                const l = link as { source: GraphNode; target: GraphNode };
                const { source: s, target: t } = l;
                if (!s || !t || s.x == null || t.x == null) return;
                const dx = t.x! - s.x!,
                    dy = t.y! - s.y!;
                if (dx * dx + dy * dy < 1) return;
                const snId = selectedNode?.id;
                const isConnectedToSelected = snId && (s.id === snId || t.id === snId);

                const opacity = snId && !isConnectedToSelected ? 0.05 : 0.22;
                const highlightMultiplier = isConnectedToSelected ? 2.5 : 1;
                const lineWidth = 0.7 * highlightMultiplier;

                const { r, g, b } = hexToRgb(s.color || DEFAULT_COLOR);
                ctx.beginPath();
                ctx.moveTo(s.x!, s.y!);
                ctx.lineTo(t.x!, t.y!);
                ctx.strokeStyle = `rgba(${r},${g},${b},${opacity * highlightMultiplier})`;
                ctx.lineWidth = lineWidth;
                ctx.stroke();
            } catch (_) {
                /* swallow */
            }
        },
        [selectedNode],
    );

    const sliders = [
        { label: "Max Papers", val: maxNodes, set: setMaxNodes, min: 1, max: 2000, step: 1 },
        {
            label: "Min Year",
            val: minYear,
            set: setMinYear,
            min: 1900,
            max: new Date().getFullYear(),
            step: 1,
        },
        {
            label: "Max Year",
            val: maxYear,
            set: setMaxYear,
            min: 1900,
            max: new Date().getFullYear(),
            step: 1,
        },
        {
            label: "Min Citations",
            val: minCitations,
            set: setMinCitations,
            min: 0,
            max: 5000,
            step: 100,
        },
    ] as const;

    return (
        <div
            ref={containerRef}
            onMouseMove={onMouseMove}
            style={{
                position: "relative",
                width: "100vw",
                height: "100vh",
                overflow: "hidden",
                background: t.bg,
            }}
        >
            {isDark && <StarField width={dims.w} height={dims.h} />}

            <div
                style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    zIndex: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                }}
            >
                <button
                    onClick={() => setSavedOpen(!savedOpen)}
                    title={session?.user ? "Saved Papers" : "Sign in to use bookmarks"}
                    disabled={!session?.user}
                    style={{
                        height: "36px",
                        padding: "0 10px",
                        borderRadius: 8,
                        border: `1px solid ${session?.user ? (isDark ? "rgba(79,195,247,0.3)" : "rgba(2,132,199,0.25)") : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                        background: !session?.user
                            ? isDark
                                ? "rgba(255,255,255,0.05)"
                                : "rgba(0,0,0,0.05)"
                            : savedOpen
                              ? isDark
                                  ? "rgba(79,195,247,0.2)"
                                  : "rgba(2,132,199,0.15)"
                              : isDark
                                ? "rgba(79,195,247,0.08)"
                                : "rgba(2,132,199,0.05)",
                        color: session?.user
                            ? isDark
                                ? "#4fc3f7"
                                : "#0284c7"
                            : isDark
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(0,0,0,0.3)",
                        cursor: session?.user ? "pointer" : "not-allowed",
                        opacity: session?.user ? 1 : 0.6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                    }}
                >
                    <HiBookmark size={18} />
                </button>
                <button
                    onClick={() => setAiOpen(!aiOpen)}
                    title={session?.user ? "AI Analyst" : "Sign in to use AI Analyst"}
                    disabled={!session?.user}
                    style={{
                        height: "36px",
                        padding: "0 10px",
                        borderRadius: 8,
                        border: `1px solid ${session?.user ? (isDark ? "rgba(79,195,247,0.3)" : "rgba(2,132,199,0.25)") : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                        background: !session?.user
                            ? isDark
                                ? "rgba(255,255,255,0.05)"
                                : "rgba(0,0,0,0.05)"
                            : aiOpen
                              ? isDark
                                  ? "rgba(79,195,247,0.2)"
                                  : "rgba(2,132,199,0.15)"
                              : isDark
                                ? "rgba(79,195,247,0.08)"
                                : "rgba(2,132,199,0.05)",
                        color: session?.user
                            ? isDark
                                ? "#4fc3f7"
                                : "#0284c7"
                            : isDark
                              ? "rgba(255,255,255,0.3)"
                              : "rgba(0,0,0,0.3)",
                        cursor: session?.user ? "pointer" : "not-allowed",
                        opacity: session?.user ? 1 : 0.6,
                        fontFamily: '"Orbitron", monospace',
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                    }}
                >
                    ✦ AI
                </button>
                <AuthButtons />
            </div>

            <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
                <ForceGraph2D
                    ref={fgRef}
                    width={dims.w}
                    height={dims.h}
                    graphData={graphData}
                    backgroundColor={isDark ? "rgba(0,0,0,0)" : t.bg}
                    nodeCanvasObject={drawNode}
                    nodeCanvasObjectMode={() => "replace"}
                    nodePointerAreaPaint={paintNodePointerArea}
                    onNodeClick={onNodeClick}
                    linkCanvasObject={drawLink}
                    linkCanvasObjectMode={() => "replace"}
                    onNodeHover={onNodeHover}
                    nodeLabel=""
                    cooldownTicks={150}
                    d3AlphaDecay={0.025}
                    d3VelocityDecay={0.35}
                    enableNodeDrag
                    enableZoomInteraction
                    onRenderFramePost={(ctx, globalScale) => {
                        if (selectedNode && selectedNode.x != null && selectedNode.y != null) {
                            const n = selectedNode as GraphNode;
                            const { x, y } = n;
                            const label = n.title;
                            const radius = getNodeRadius(n.degree ?? 0, true);
                            const scale = 1.5;
                            const fs = Math.max(2.5, (11 * scale) / globalScale);
                            ctx.font = `700 ${fs}px "Space Mono", monospace`;
                            ctx.textAlign = "center";
                            ctx.textBaseline = "bottom";
                            ctx.fillStyle = theme === "dark" ? "#ffffff" : "#000000";
                            ctx.fillText(label, x, y - radius - 4);
                        }
                    }}
                />
            </div>

            <aside
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: 300,
                    height: "100%",
                    zIndex: 10,
                    background: t.sidebarBg,
                    padding: "24px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    overflowY: "auto",
                    fontFamily: '"Space Mono", monospace',
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        fontFamily: '"Orbitron", monospace',
                        fontSize: 28,
                        textAlign: "center",
                        fontWeight: 900,
                        color: t.textPrimary,
                        lineHeight: 1.1,
                        textShadow: t.titleShadow,
                        marginBottom: 2,
                    }}
                >
                {
                isDark ? <img src="/logo_white.svg" ></img> : <img src="/logo_dark.svg" ></img>
                }
                </div>

                <input
                    style={{
                        width: "100%",
                        padding: "9px 13px",
                        boxSizing: "border-box",
                        background: t.inputBg,
                        border: `1px solid ${t.accentBorder}`,
                        borderRadius: 6,
                        color: t.textSecondary,
                        fontFamily: '"Space Mono", monospace',
                        fontSize: 12,
                        outline: "none",
                    }}
                    placeholder={USE_MOCK ? "Try: transformer, diffusion…" : "Search papers..."}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
                <button
                    onClick={runSearch}
                    disabled={loading}
                    style={{
                        padding: 9,
                        borderRadius: 6,
                        cursor: loading ? "default" : "pointer",
                        background: loading ? t.accentBgMuted : t.accentBg,
                        border: `1px solid ${t.accentBorderStrong}`,
                        color: t.accent,
                        fontFamily: '"Orbitron", monospace',
                        fontSize: 11,
                        letterSpacing: "0.12em",
                    }}
                >
                    {loading ? "◌  SCANNING…" : "⊕  LAUNCH SEARCH"}
                </button>
                <div
                    style={{
                        fontSize: 10,
                        color: t.statusColor,
                        minHeight: 14,
                        lineHeight: 1.5,
                        textAlign: "center",
                        width: "100%",
                    }}
                >
                    {status}
                </div>

                <hr
                    style={{
                        border: "none",
                        borderTop: `1px solid ${t.divider}`,
                        margin: 0,
                    }}
                />

                {sliders.map(({ label, val, set, min, max, step }) => (
                    <div key={label}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: 5,
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 10,
                                    color: t.textMuted,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                }}
                            >
                                {label}
                            </span>
                            <span
                                style={{
                                    fontFamily: '"Orbitron", monospace',
                                    fontSize: 12,
                                    color: t.accent,
                                }}
                            >
                                {val.toLocaleString()}
                            </span>
                        </div>
                        <input
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={val}
                            onChange={(e) => (set as (v: number) => void)(+e.target.value)}
                            style={{
                                width: "100%",
                                accentColor: t.accent,
                                cursor: "pointer",
                                display: "block",
                            }}
                        />
                    </div>
                ))}

                {!USE_MOCK && (
                    <>
                        <div style={{ marginTop: 6 }}>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: t.textMuted,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    marginBottom: 5,
                                }}
                            >
                                Author Filter
                            </div>
                            <input
                                type="text"
                                value={authorFilter}
                                onChange={(e) => setAuthorFilter(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                                placeholder="Author name..."
                                style={{
                                    width: "100%",
                                    background: "rgba(0,0,0,0.1)",
                                    border: `1px solid ${t.divider}`,
                                    borderRadius: 4,
                                    padding: "6px 8px",
                                    color: t.textField,
                                    fontSize: 11,
                                    fontFamily: "inherit",
                                    outline: "none",
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>
                        <div>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: t.textMuted,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                    marginBottom: 5,
                                }}
                            >
                                Field Filter
                            </div>
                            <input
                                type="text"
                                value={fieldFilter}
                                onChange={(e) => setFieldFilter(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                                placeholder="Field name..."
                                style={{
                                    width: "100%",
                                    background: "rgba(0,0,0,0.1)",
                                    border: `1px solid ${t.divider}`,
                                    borderRadius: 4,
                                    padding: "6px 8px",
                                    color: t.textField,
                                    fontSize: 11,
                                    fontFamily: "inherit",
                                    outline: "none",
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>
                    </>
                )}

                {fieldsPresent.length > 0 && (
                    <>
                        <hr
                            style={{
                                border: "none",
                                borderTop: `1px solid ${t.divider}`,
                                margin: 0,
                            }}
                        />
                        <div
                            style={{
                                fontSize: 10,
                                color: "rgba(200,222,255,0.45)",
                                textTransform: "uppercase",
                                letterSpacing: "0.08em",
                            }}
                        >
                            Fields of Study
                        </div>
                        {fieldsPresent.map((f) => {
                            const c = fieldColor([f]);
                            return (
                                <div
                                    key={f}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 10,
                                        color: t.textField,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: "50%",
                                            flexShrink: 0,
                                            background: c,
                                            boxShadow: `0 0 6px ${c}`,
                                        }}
                                    />
                                    {f}
                                </div>
                            );
                        })}
                    </>
                )}

                <hr
                    style={{
                        border: "none",
                        borderTop: `1px solid ${t.divider}`,
                        margin: 0,
                    }}
                />
                <div style={{ fontSize: 12, color: t.textFaint, lineHeight: 1.8 }}>
                    Drag nodes · Scroll to zoom
                    <br />
                    Hover for details · Enter to search
                    {!USE_MOCK && (
                        <>
                            <br />
                        </>
                    )}
                </div>
            </aside>

            {hoveredNode && (
                <div
                    style={{
                        position: "absolute",
                        left: Math.min(mousePos.x + 16, dims.w - 300),
                        top: Math.max(mousePos.y - 10, 8),
                        background: t.tooltipBg,
                        border: `1px solid ${hoveredNode.color}44`,
                        borderRadius: 8,
                        padding: "10px 14px",
                        maxWidth: 270,
                        pointerEvents: "none",
                        zIndex: 30,
                        boxShadow: `0 0 24px ${hoveredNode.color}28`,
                        fontFamily: '"Space Mono", monospace',
                    }}
                >
                    <div
                        style={{
                            fontSize: 11,
                            color: hoveredNode.color,
                            marginBottom: 5,
                            lineHeight: 1.5,
                            textShadow: `0 0 8px ${hoveredNode.color}`,
                        }}
                    >
                        {hoveredNode.title}
                    </div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>
                        {hoveredNode.year ? `📅 ${hoveredNode.year}` : ""}
                        {hoveredNode.citations
                            ? `  ✦ ${hoveredNode.citations.toLocaleString()} citations`
                            : ""}
                    </div>
                    {hoveredNode.fields?.length > 0 && (
                        <div
                            style={{
                                fontSize: 9,
                                color: t.textFaint,
                                marginBottom: hoveredNode.abstract ? 4 : 0,
                            }}
                        >
                            {hoveredNode.fields.join(" · ")}
                        </div>
                    )}
                    {hoveredNode.abstract && (
                        <div
                            style={{
                                fontSize: 9,
                                color: t.textFaint,
                                lineHeight: 1.5,
                                marginTop: 4,
                                borderTop: `1px solid ${t.tooltipBorder}`,
                                paddingTop: 4,
                            }}
                        >
                            {hoveredNode.abstract.length > 120
                                ? hoveredNode.abstract.slice(0, 120) + "…"
                                : hoveredNode.abstract}
                        </div>
                    )}
                </div>
            )}

            {graphData.nodes.length > 0 && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 20,
                        right: 20,
                        display: "flex",
                        gap: 10,
                        zIndex: 10,
                    }}
                >
                    {[
                        { n: graphData.nodes.length, l: "Papers" },
                        { n: graphData.links.length, l: "Links" },
                        { n: fieldsPresent.length, l: "Fields" },
                        { n: graphData.nodes.filter((n) => n.isPrimary).length, l: "Primary" },
                    ].map(({ n, l }) => (
                        <div
                            key={l}
                            style={{
                                background: t.statBg,
                                border: `1px solid ${t.divider}`,
                                borderRadius: 6,
                                padding: "7px 13px",
                                textAlign: "center",
                            }}
                        >
                            <div
                                style={{
                                    fontFamily: '"Orbitron", monospace',
                                    fontSize: 17,
                                    fontWeight: 700,
                                    color: t.accent,
                                    textShadow: t.accentShadow,
                                }}
                            >
                                {n}
                            </div>
                            <div
                                style={{
                                    fontSize: 9,
                                    color: t.textMuted,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                }}
                            >
                                {l}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedNode && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 80,
                        right: 20,
                        borderRadius: 12,
                        padding: "16px",
                        maxWidth: 280,
                        maxHeight: "70vh",
                        overflowY: "auto",
                        zIndex: 20,
                        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 24px ${selectedNode.color}33`,
                        fontFamily: '"Space Mono", monospace',
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <button
                        onClick={() => setSelectedNode(null)}
                        style={{
                            background: "none",
                            border: "none",
                            color: isDark ? "rgba(200,222,255,0.5)" : "rgba(51,65,85,0.5)",
                            cursor: "pointer",
                            padding: 0,
                            marginLeft: 4,
                            marginBottom: 4,
                            display: "flex",
                        }}
                    >
                        <HiX size={18} />
                    </button>
                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: selectedNode.color,
                            marginBottom: 8,
                            lineHeight: 1.4,
                            textShadow: `0 0 12px ${selectedNode.color}88`,
                        }}
                    >
                        {selectedNode.title}
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12 }}>
                        {selectedNode.year ? `📅 ${selectedNode.year}` : ""}
                        {selectedNode.citations
                            ? `  ✦ ${selectedNode.citations.toLocaleString()} citations`
                            : ""}
                    </div>
                    {selectedNode.authors && selectedNode.authors.length > 0 && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textFaint,
                                marginBottom: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            <strong>Authors:</strong> {selectedNode.authors.slice(0, 5).join(", ")}
                            {selectedNode.authors.length > 5 ? " et al." : ""}
                        </div>
                    )}

                    {selectedNode.institution && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textFaint,
                                marginBottom: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            <strong>Institution:</strong> {selectedNode.institution}
                        </div>
                    )}

                    {selectedNode.topic && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textFaint,
                                marginBottom: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            <strong>Topic:</strong> {selectedNode.topic}
                        </div>
                    )}

                    {selectedNode.percentile != null && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textFaint,
                                marginBottom: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            <strong>Citation Percentile:</strong>{" "}
                            {selectedNode.percentile.toFixed(1)}%
                        </div>
                    )}

                    {selectedNode.publishedDate && selectedNode.publishedDate.length > 4 && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textFaint,
                                marginBottom: 8,
                                lineHeight: 1.4,
                            }}
                        >
                            <strong>Published:</strong> {selectedNode.publishedDate}
                        </div>
                    )}

                    {selectedNode.abstract && (
                        <div
                            style={{
                                fontSize: 10,
                                color: t.textMuted,
                                marginBottom: 12,
                                lineHeight: 1.5,
                                fontStyle: "italic",
                                borderLeft: `2px solid ${selectedNode.color}66`,
                                paddingLeft: 8,
                            }}
                        >
                            {selectedNode.abstract.length > 250
                                ? selectedNode.abstract.slice(0, 250) + "…"
                                : selectedNode.abstract}
                        </div>
                    )}

                    {selectedNode.openAlexId && (
                        <a
                            href={
                                selectedNode.openAlexId.startsWith("http")
                                    ? selectedNode.openAlexId
                                    : `https://openalex.org/${selectedNode.openAlexId}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "inline-block",
                                fontSize: 11,
                                color: t.accent,
                                textDecoration: "none",
                                borderBottom: `1px solid ${t.accent}88`,
                                paddingBottom: 2,
                                marginBottom: 12,
                            }}
                        >
                            Open Link
                        </a>
                    )}

                    {selectedNode.doi && (
                        <a
                            href={selectedNode.doi}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "inline-block",
                                fontSize: 11,
                                color: selectedNode.color,
                                textDecoration: "none",
                                borderBottom: `1px dashed ${selectedNode.color}88`,
                                paddingBottom: 2,
                                marginBottom: 12,
                                marginRight: 12,
                            }}
                        >
                            View Source ↗
                        </a>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}> 
                        <button
                            onClick={handleSavePaper}
                            disabled={!session?.user}
                            title={session?.user ? "Save Paper" : "Sign in to save papers"}
                            style={{
                                padding: "6px 12px",
                                borderRadius: 6,
                                background: session?.user
                                    ? `${selectedNode.color}22`
                                    : isDark
                                      ? "rgba(255,255,255,0.05)"
                                      : "rgba(0,0,0,0.05)",
                                border: `1px solid ${session?.user ? `${selectedNode.color}66` : isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                                color: session?.user
                                    ? selectedNode.color
                                    : isDark
                                      ? "rgba(255,255,255,0.3)"
                                      : "rgba(0,0,0,0.3)",
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: session?.user ? "pointer" : "not-allowed",
                                opacity: session?.user ? 1 : 0.6,
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            <HiBookmark size={14} />
                            Save Paper
                        </button>
                    </div>
                    <br />

                    {adjacencyList.get(selectedNode.id)?.size ? (
                        <>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: t.textFaint,
                                    marginBottom: 12,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                }}
                            >
                                <span style={{ color: selectedNode.color, fontWeight: "bold" }}>
                                    {adjacencyList.get(selectedNode.id)?.size}
                                </span>{" "}
                                Connected{" "}
                                {adjacencyList.get(selectedNode.id)?.size === 1 ? "Node" : "Nodes"}
                            </div>

                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                    paddingRight: 4,
                                    marginBottom: 16,
                                }}
                            >
                                {Array.from(adjacencyList.get(selectedNode.id) || []).map(
                                    (connId) => {
                                        const connNode = graphData.nodes.find(
                                            (n) => n.id === connId,
                                        );
                                        if (!connNode) return null;
                                        return (
                                            <div
                                                key={connId}
                                                style={{
                                                    background: "rgba(0,0,0,0.2)",
                                                    padding: 8,
                                                    borderRadius: 6,
                                                    border: `1px solid ${t.divider}`,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        fontSize: 11,
                                                        color: connNode.color,
                                                        fontWeight: "bold",
                                                        marginBottom: 6,
                                                        lineHeight: 1.3,
                                                    }}
                                                >
                                                    {connNode.title}
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <button
                                                        onClick={() => setSelectedNode(connNode)}
                                                        style={{
                                                            padding: "4px 8px",
                                                            borderRadius: 4,
                                                            background: `${connNode.color}22`,
                                                            border: `1px solid ${connNode.color}55`,
                                                            color: connNode.color,
                                                            fontSize: 9,
                                                            cursor: "pointer",
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        Select Node
                                                    </button>
                                                    {connNode.doi && (
                                                        <a
                                                            href={connNode.doi}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                fontSize: 9,
                                                                color: t.textMuted,
                                                                textDecoration: "none",
                                                                borderBottom: `1px dashed ${t.textMuted}`,
                                                            }}
                                                        >
                                                            View Paper ↗
                                                        </a>
                                                    )}
                                                    {connNode.openAlexId && (
                                                        <a
                                                            href={
                                                                connNode.openAlexId.startsWith(
                                                                    "http",
                                                                )
                                                                    ? connNode.openAlexId
                                                                    : `https://openalex.org/${connNode.openAlexId}`
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                fontSize: 9,
                                                                color: t.accent,
                                                                textDecoration: "none",
                                                                borderBottom: `1px solid ${t.accent}88`,
                                                            }}
                                                        >
                                                            Open Link
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    },
                                )}
                            </div>
                        </>
                    ) : null}
                </div>
            )}

            <AiChatPanel
                open={aiOpen}
                onClose={() => setAiOpen(false)}
                graphContext={{
                    nodes: graphData.nodes,
                    links: graphData.links,
                    fields: fieldsPresent,
                }}
            />

            <SavedPapersPanel
                open={savedOpen}
                onClose={() => setSavedOpen(false)}
                refreshKey={savedRefreshKey}
            />
        </div>
    );
}
