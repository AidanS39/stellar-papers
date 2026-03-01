import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcrypt";
import { getDb } from "./db";
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
    trustHost: true,
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
    secret: process.env.NEXTAUTH_SECRET,
    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            profile(p) {
                return {
                    id: p.sub,
                    email: p.email,
                    name: p.name,
                    image: p.picture,
                };
            },
        }),
        GitHub({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            profile(p) {
                return {
                    id: String(p.id),
                    email: p.email ? String(p.email) : undefined,
                    name: p.name ? String(p.name) : undefined,
                    image: p.avatar_url,
                };
            },
        }),
        Credentials({
            name: "Credentials",
            credentials: {
                handleOrEmail: { label: "Email or Handle", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                try {
                    const creds = credentials as
                        | { handleOrEmail: string; password: string }
                        | undefined;

                    if (!creds?.handleOrEmail || !creds?.password) {
                        throw new Error("Missing credentials");
                    }

                    const db = await getDb();
                    const isEmail =
                        creds.handleOrEmail.includes("@") && !creds.handleOrEmail.startsWith("@");

                    const query = isEmail
                        ? { email: creds.handleOrEmail }
                        : { handle: creds.handleOrEmail };

                    const user = await db.collection("users").findOne(query);

                    if (!user || user.provider !== "credentials") {
                        return null;
                    }

                    const ok = await bcrypt.compare(creds.password, user.password);

                    if (!ok) {
                        return null;
                    }

                    return { id: String(user._id) };
                } catch (err) {
                    console.error("Authorization error:", err);
                    return null;
                }
            },
        }),
    ],
    cookies: {
        sessionToken: {
            name:
                process.env.NODE_ENV === "production"
                    ? "__Secure-next-auth.session-token"
                    : "next-auth.session-token",
            options: {
                httpOnly: true,
                sameSite: "lax",
                path: "/",
                secure: process.env.NODE_ENV === "production",
            },
        },
    },
    callbacks: {
        async signIn({ account, profile }) {
            if (!account || account.provider === "credentials") {
                return true;
            }

            if (!profile?.email) {
                console.error("No email in OAuth profile");
                return false;
            }

            try {
                const db = await getDb();
                const username = profile.name || profile.email.split("@")[0];

                await db.collection("users").updateOne(
                    { provider: account.provider, provider_id: account.providerAccountId },
                    {
                        $setOnInsert: {
                            username,
                            email: profile.email,
                            email_verified: true,
                            provider: account.provider,
                            provider_id: account.providerAccountId,
                            settings: {},
                            createdAt: new Date(),
                        },
                    },
                    { upsert: true },
                );

                return true;
            } catch (err) {
                console.error("Error in signIn callback:", err);
                return false;
            }
        },
        async jwt({ token, user, account }) {
            if (token.id) {
                return token;
            }

            if (account?.provider === "credentials" && user?.id) {
                token.id = String(user.id);
                return token;
            }

            if (account?.type !== "credentials" && account?.provider && account.providerAccountId) {
                const db = await getDb();
                const u = await db
                    .collection("users")
                    .findOne(
                        { provider: account.provider, provider_id: account.providerAccountId },
                        { projection: { _id: 1 } },
                    );

                if (u?._id) {
                    token.id = String(u._id);
                    return token;
                }
            }

            return token;
        },
        async session({ session, token }) {
            if (token.id) {
                session.user.id = String(token.id);
            }
            return session;
        },
    },
});
