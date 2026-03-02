import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/db";
import bcrypt from "bcrypt";

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const { username, email, password, confirmPassword, recaptchaToken } = payload;

        if (!username || !email || !password || !confirmPassword || !recaptchaToken) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (password !== confirmPassword) {
            return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
        }

        const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`,
        });

        const verifyData = await verifyRes.json();
        if (!verifyData.success || verifyData.score < 0.5) {
            return NextResponse.json({ error: "reCAPTCHA verification failed" }, { status: 400 });
        }

        const db = await getDb();
        const usersCol = db.collection("users");

        const existing = await usersCol.findOne({
            $or: [{ email }, { username }],
        });

        if (existing) {
            if (existing.email === email) {
                return NextResponse.json({ error: "Email already in use" }, { status: 400 });
            }
            if (existing.username === username) {
                return NextResponse.json({ error: "Username already in use" }, { status: 400 });
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await usersCol.insertOne({
            username,
            email,
            password: hashedPassword,
            provider: "credentials",
            email_verified: false,
            settings: {},
            createdAt: new Date(),
        });

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (error) {
        console.error("Signup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
