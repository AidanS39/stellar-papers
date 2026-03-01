import { NextResponse } from "next/server";
import { auth } from "./authOptions";

type AuthenticatedHandler = (req: Request, userId: string) => Promise<Response>;

export function withAuth(handler: AuthenticatedHandler) {
    return async (req: Request): Promise<Response> => {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return handler(req, session.user.id);
    };
}
