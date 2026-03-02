import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../lib/authOptions";
import { getDb } from "../../../lib/db";

export async function GET() {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const db = await getDb();
        const saved = await db
            .collection("saved_papers")
            .find({ userId: session.user.id })
            .sort({ savedAt: -1 })
            .toArray();

        return NextResponse.json({ saved });
    } catch (error) {
        console.error("GET /api/saved error:", error);
        return NextResponse.json({ error: "Failed to fetch saved papers" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { paperId, title, field, publication_year, cited_by_count, open_alex_id } = body;

        if (!paperId) {
            return NextResponse.json({ error: "Missing paperId" }, { status: 400 });
        }

        const db = await getDb();

        const existing = await db.collection("saved_papers").findOne({
            userId: session.user.id,
            paperId,
        });

        if (existing) {
            return NextResponse.json({ error: "Paper is already saved" }, { status: 409 });
        }

        const doc = {
            userId: session.user.id,
            paperId,
            title: title ?? null,
            field: field ?? null,
            publication_year: publication_year ?? null,
            cited_by_count: cited_by_count ?? null,
            open_alex_id: open_alex_id ?? null,
            savedAt: new Date(),
        };

        await db.collection("saved_papers").insertOne(doc);

        return NextResponse.json({ success: true, saved: doc }, { status: 201 });
    } catch (error) {
        console.error("POST /api/saved error:", error);
        return NextResponse.json({ error: "Failed to save paper" }, { status: 500 });
    }
}
