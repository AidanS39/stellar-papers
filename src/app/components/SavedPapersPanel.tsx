"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "./ThemeProvider";
import { useSession } from "next-auth/react";
import { HiX, HiTrash, HiBookmark } from "react-icons/hi";

interface SavedPaper {
    paperId: string;
    title: string;
    savedAt: string;
    field?: string;
    open_alex_id?: string;
}

interface SavedPapersPanelProps {
    open: boolean;
    onClose: () => void;
    refreshKey?: number;
}

export default function SavedPapersPanel({ open, onClose, refreshKey = 0 }: SavedPapersPanelProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { data: session } = useSession();
    const [papers, setPapers] = useState<SavedPaper[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchPapers = useCallback(async () => {
        if (!session?.user) return;
        setLoading(true);
        try {
            const res = await fetch("/api/saved");
            const data = await res.json();
            setPapers(data.saved || []);
        } catch (err) {
            console.error("Failed to fetch saved papers:", err);
        }
        setLoading(false);
    }, [session?.user]);

    useEffect(() => {
        if (open && session?.user) fetchPapers();
    }, [open, session?.user, refreshKey, fetchPapers]);

    const removePaper = async (paperId: string) => {
        try {
            await fetch(`/api/saved/${encodeURIComponent(paperId)}`, {
                method: "DELETE",
            });
            setPapers((prev) => prev.filter((p) => p.paperId !== paperId));
        } catch (err) {
            console.error("Failed to delete paper:", err);
        }
    };

    if (!open) return null;

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 380,
                height: "100%",
                zIndex: 25,
                display: "flex",
                flexDirection: "column",
                background: isDark ? "rgba(2,5,22,0.97)" : "rgba(255,255,255,0.97)",
                borderLeft: `1px solid ${isDark ? "rgba(79,195,247,0.2)" : "rgba(2,132,199,0.15)"}`,
                fontFamily: '"Space Mono", monospace',
                backdropFilter: "blur(12px)",
            }}
        >
            <div
                style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: `1px solid ${isDark ? "rgba(79,195,247,0.15)" : "rgba(2,132,199,0.1)"}`,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <HiBookmark size={15} style={{ color: isDark ? "#4fc3f7" : "#0284c7" }} />
                    <span
                        style={{
                            fontFamily: '"Orbitron", monospace',
                            fontSize: 13,
                            fontWeight: 700,
                            color: isDark ? "#4fc3f7" : "#0284c7",
                            letterSpacing: "0.1em",
                        }}
                    >
                        SAVED PAPERS
                    </span>
                    {papers.length > 0 && (
                        <span
                            style={{
                                fontSize: 10,
                                color: isDark ? "rgba(200,222,255,0.4)" : "rgba(51,65,85,0.4)",
                                marginLeft: 4,
                            }}
                        >
                            ({papers.length})
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: "none",
                        border: "none",
                        color: isDark ? "rgba(200,222,255,0.5)" : "rgba(51,65,85,0.5)",
                        cursor: "pointer",
                        padding: 4,
                        display: "flex",
                    }}
                >
                    <HiX size={18} />
                </button>
            </div>

            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                {!session?.user && (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            color: isDark ? "rgba(200,222,255,0.35)" : "rgba(51,65,85,0.4)",
                            textAlign: "center",
                            lineHeight: 1.8,
                        }}
                    >
                        Sign in to save and manage papers.
                    </div>
                )}

                {session?.user && loading && (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 11,
                            color: isDark ? "rgba(200,222,255,0.35)" : "rgba(51,65,85,0.4)",
                        }}
                    >
                        Loading…
                    </div>
                )}

                {session?.user && !loading && papers.length === 0 && (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            fontSize: 11,
                            color: isDark ? "rgba(200,222,255,0.35)" : "rgba(51,65,85,0.4)",
                            textAlign: "center",
                            lineHeight: 1.8,
                        }}
                    >
                        <HiBookmark size={24} style={{ opacity: 0.3 }} />
                        No saved papers yet.
                        <br />
                        Hover a node and click "Save" to add papers here.
                    </div>
                )}

                {papers.map((paper) => (
                    <div
                        key={paper.paperId}
                        style={{
                            padding: "12px 14px",
                            borderRadius: 8,
                            background: isDark ? "rgba(30,40,60,0.5)" : "rgba(241,245,249,0.8)",
                            border: `1px solid ${isDark ? "rgba(79,195,247,0.12)" : "rgba(2,132,199,0.08)"}`,
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: isDark ? "#c8deff" : "#334155",
                                    lineHeight: 1.5,
                                    marginBottom: 4,
                                }}
                            >
                                {paper.title}
                            </div>
                            {paper.field && (
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: isDark
                                            ? "rgba(79,195,247,0.8)"
                                            : "rgba(2,132,199,0.8)",
                                        marginBottom: 4,
                                    }}
                                >
                                    Topic: {paper.field}
                                </div>
                            )}
                            {paper.open_alex_id && (
                                <a
                                    href={
                                        paper.open_alex_id.startsWith("http")
                                            ? paper.open_alex_id
                                            : `https://openalex.org/${paper.open_alex_id}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        fontSize: 10,
                                        color: isDark ? "#a78bfa" : "#7c3aed",
                                        textDecoration: "underline",
                                        display: "inline-block",
                                        marginBottom: 4,
                                    }}
                                >
                                    Open Link
                                </a>
                            )}
                            <div
                                style={{
                                    fontSize: 9,
                                    color: isDark ? "rgba(200,222,255,0.3)" : "rgba(51,65,85,0.35)",
                                }}
                            >
                                Saved {new Date(paper.savedAt).toLocaleDateString()}
                            </div>
                        </div>
                        <button
                            onClick={() => removePaper(paper.paperId)}
                            title="Remove paper"
                            style={{
                                background: "none",
                                border: "none",
                                color: isDark ? "rgba(200,222,255,0.3)" : "rgba(51,65,85,0.3)",
                                cursor: "pointer",
                                padding: 4,
                                flexShrink: 0,
                                display: "flex",
                                marginTop: 2,
                            }}
                        >
                            <HiTrash size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
