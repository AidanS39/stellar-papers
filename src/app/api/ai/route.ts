import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are an AI research analyst embedded in "Stellar Papers", a citation graph explorer.
You analyze academic paper networks to help researchers understand:

1. **High-density areas (Saturation)**: Topics with many papers and citations, indicating well-explored research.
2. **Knowledge gaps (Untapped areas)**: Fields with few connections, under-explored intersections between domains, or topics lacking recent papers.
3. **Key papers**: The most cited and most connected nodes — influential works.
4. **Cross-field bridges**: Papers that connect different domains (e.g., a paper linking Biology and Computer Science).
5. **Temporal trends**: How research topics evolved over time based on publication years.

When given graph data, analyze it concisely. Use paper titles and specific numbers. Be direct and insightful.
Format responses with markdown: use **bold** for key findings, bullet points for lists, and section headers for organization.
Keep responses focused — aim for 150-300 words unless the user asks for more detail.`;

export async function POST(req: NextRequest) {
    try {
        const { message, graphContext } = await req.json();

        if (!message) {
            return new Response(JSON.stringify({ error: "message is required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

        let contextBlock = "";
        if (graphContext) {
            const { nodes, links, fields } = graphContext;
            contextBlock = `\n\n--- CURRENT GRAPH DATA ---
                Total papers: ${nodes?.length || 0}
                Total connections: ${links?.length || 0}
                Fields present: ${fields?.join(", ") || "none"}

                Papers (title | year | citations | fields):
                ${(nodes || [])
                    .slice(0, 80)
                    .map(
                        (n: any) =>
                            `• ${n.title} | ${n.year || "?"} | ${n.citations?.toLocaleString() || 0} citations | ${n.fields?.join(", ") || "?"}`,
                    )
                    .join("\n")}

                Connections: ${(links || [])
                                .slice(0, 50)
                                .map((l: any) => `${l.source.title} → ${l.target.title}`)
                                .join(", ")}
                --- END GRAPH DATA ---`;
        }

        console.log(contextBlock)

        const fullPrompt = `${SYSTEM_PROMPT}${contextBlock}\n\nUser question: ${message}`;

        const result = await model.generateContentStream(fullPrompt);

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result.stream) {
                        const text = chunk.text();
                        if (text) {
                            controller.enqueue(new TextEncoder().encode(text));
                        }
                    }
                    controller.close();
                } catch (err) {
                    controller.error(err);
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Transfer-Encoding": "chunked",
            },
        });
    } catch (error: any) {
        console.error("Gemini API error:", error);
        return new Response(JSON.stringify({ error: error.message || "Gemini API error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
