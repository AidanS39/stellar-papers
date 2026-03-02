"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { HiX, HiPaperAirplane } from "react-icons/hi";

interface Message {
    role: "user" | "ai";
    content: string;
}

interface AiChatPanelProps {
    open: boolean;
    onClose: () => void;
    graphContext: {
        nodes: any[];
        links: any[];
        fields: string[];
    };
}

export default function AiChatPanel({ open, onClose, graphContext }: AiChatPanelProps) {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [streaming, setStreaming] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    const sendMessage = async () => {
        const trimmed = input.trim();
        if (!trimmed || streaming) return;

        const userMsg: Message = { role: "user", content: trimmed };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setStreaming(true);

        setMessages((prev) => [...prev, { role: "ai", content: "" }]);

        try {
            const res = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: trimmed, graphContext }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Unknown error" }));
                setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                        role: "ai",
                        content: "I'm sorry, I am unable to respond.",
                    };
                    return updated;
                });
                setStreaming(false);
                return;
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value, { stream: true });
                    setMessages((prev) => {
                        const updated = [...prev];
                        const last = updated[updated.length - 1];
                        updated[updated.length - 1] = { ...last, content: last.content + text };
                        return updated;
                    });
                }
            }
        } catch (err: any) {
            setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                    role: "ai",
                    content: "I'm sorry, I am unable to respond.",
                };
                return updated;
            });
        }

        setStreaming(false);
    };

    const quickPrompts = [
        "Analyze the high-density research areas",
        "Find knowledge gaps and untapped areas",
        "What are the most influential papers?",
        "Show cross-field connections",
    ];

    if (!open) return null;

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 400,
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
                    <span style={{ fontSize: 16 }}>✦</span>
                    <span
                        style={{
                            fontFamily: '"Orbitron", monospace',
                            fontSize: 13,
                            fontWeight: 700,
                            color: isDark ? "#4fc3f7" : "#0284c7",
                            letterSpacing: "0.1em",
                        }}
                    >
                        AI ANALYST
                    </span>
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
                    gap: 12,
                }}
            >
                {messages.length === 0 && (
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 16,
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                color: isDark ? "rgba(200,222,255,0.35)" : "rgba(51,65,85,0.4)",
                                textAlign: "center",
                                lineHeight: 1.8,
                            }}
                        >
                            {graphContext.nodes.length > 0
                                ? `${graphContext.nodes.length} papers loaded. Ask me anything about the graph.`
                                : "Load some papers first, then ask me to analyze them."}
                        </div>
                        {graphContext.nodes.length > 0 && (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                    width: "100%",
                                }}
                            >
                                {quickPrompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => {
                                            setInput(prompt);
                                            setTimeout(() => inputRef.current?.focus(), 50);
                                        }}
                                        style={{
                                            padding: "8px 12px",
                                            fontSize: 10,
                                            border: `1px solid ${isDark ? "rgba(79,195,247,0.2)" : "rgba(2,132,199,0.15)"}`,
                                            borderRadius: 6,
                                            background: isDark
                                                ? "rgba(79,195,247,0.06)"
                                                : "rgba(2,132,199,0.04)",
                                            color: isDark
                                                ? "rgba(200,222,255,0.6)"
                                                : "rgba(51,65,85,0.6)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                            fontFamily: '"Space Mono", monospace',
                                        }}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        style={{
                            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                            maxWidth: "85%",
                            padding: "10px 14px",
                            borderRadius:
                                msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                            background:
                                msg.role === "user"
                                    ? isDark
                                        ? "rgba(79,195,247,0.15)"
                                        : "rgba(2,132,199,0.1)"
                                    : isDark
                                      ? "rgba(30,40,60,0.6)"
                                      : "rgba(241,245,249,0.8)",
                            border: `1px solid ${
                                msg.role === "user"
                                    ? isDark
                                        ? "rgba(79,195,247,0.25)"
                                        : "rgba(2,132,199,0.15)"
                                    : isDark
                                      ? "rgba(79,195,247,0.1)"
                                      : "rgba(2,132,199,0.08)"
                            }`,
                            fontSize: 11,
                            lineHeight: 1.7,
                            color: isDark ? "#c8deff" : "#334155",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                        }}
                    >
                        {msg.content || (streaming && i === messages.length - 1 ? "●" : "")}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div
                style={{
                    padding: "12px 16px",
                    borderTop: `1px solid ${isDark ? "rgba(79,195,247,0.15)" : "rgba(2,132,199,0.1)"}`,
                    display: "flex",
                    gap: 8,
                }}
            >
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                    placeholder="Ask about the graph…"
                    disabled={streaming}
                    style={{
                        flex: 1,
                        padding: "9px 12px",
                        background: isDark ? "rgba(6,14,50,0.85)" : "rgba(255,255,255,0.9)",
                        border: `1px solid ${isDark ? "rgba(79,195,247,0.25)" : "rgba(2,132,199,0.2)"}`,
                        borderRadius: 8,
                        color: isDark ? "#c8deff" : "#334155",
                        fontSize: 11,
                        fontFamily: '"Space Mono", monospace',
                        outline: "none",
                    }}
                />
                <button
                    onClick={sendMessage}
                    disabled={streaming || !input.trim()}
                    style={{
                        padding: "8px 12px",
                        background: isDark ? "rgba(79,195,247,0.14)" : "rgba(2,132,199,0.1)",
                        border: `1px solid ${isDark ? "rgba(79,195,247,0.3)" : "rgba(2,132,199,0.25)"}`,
                        borderRadius: 8,
                        color: isDark ? "#4fc3f7" : "#0284c7",
                        cursor: streaming || !input.trim() ? "default" : "pointer",
                        opacity: streaming || !input.trim() ? 0.4 : 1,
                        display: "flex",
                        alignItems: "center",
                    }}
                >
                    <HiPaperAirplane size={14} />
                </button>
            </div>
        </div>
    );
}
