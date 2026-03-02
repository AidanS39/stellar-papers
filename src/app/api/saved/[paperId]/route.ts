import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/authOptions";
import { getDb } from "../../../../lib/db";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ paperId: string }> },
) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { paperId } = await params;
        const decodedPaperId = decodeURIComponent(paperId);

        const db = await getDb();
        const result = await db.collection("saved_papers").deleteOne({
            userId: session.user.id,
            paperId: decodedPaperId,
        });

        if (result.deletedCount === 0) {
            return NextResponse.json({ error: "Paper not found in saved list" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("DELETE /api/saved error:", error);
        return NextResponse.json({ error: "Failed to remove saved paper" }, { status: 500 });
    }
}
