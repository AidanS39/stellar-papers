"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HiEye, HiEyeOff } from "react-icons/hi";

export default function SignUpForm() {
    const router = useRouter();

    const [passwordVisible, setPasswordVisible] = useState(false);
    const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [handle, setHandle] = useState("");
    const [handleError, setHandleError] = useState<string | null>(null);
    const [password, setPassword] = useState("");

    const pwRequirements = [
        { label: "At least 8 characters", met: password.length >= 8 },
        { label: "At least 2 numbers", met: (password.match(/\d/g) || []).length >= 2 },
        { label: "At least 1 special character", met: /[^a-zA-Z0-9]/.test(password) },
    ];
    const allMet = pwRequirements.every((r) => r.met);
    const metCount = pwRequirements.filter((r) => r.met).length;
    const strengthPercent = password.length === 0 ? 0 : (metCount / pwRequirements.length) * 100;
    const strengthColor =
        strengthPercent <= 66
            ? "bg-red-500"
            : strengthPercent < 100
              ? "bg-yellow-500"
              : "bg-green-500";
    const strengthLabel =
        password.length === 0
            ? ""
            : strengthPercent <= 33
              ? "Weak"
              : strengthPercent <= 66
                ? "Fair"
                : strengthPercent < 100
                  ? "Good"
                  : "Strong";

    const sanitizeHandle = (value: string) => {
        const cleaned = value.toLowerCase().replace(/\s+/g, "-");

        if (!/^[a-z0-9-]*$/.test(cleaned)) {
            setHandleError("Can only contain letters, numbers, and dashes");
        } else {
            setHandleError(null);
        }

        setHandle(cleaned);
    };

    const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);

        if (!allMet) {
            setError("Password does not meet all requirements");
            return;
        }

        setSubmitting(true);

        const form = new FormData(e.currentTarget);
        const payload = {
            username: String(form.get("username")),
            handle: String(form.get("handle")),
            email: String(form.get("email")),
            password: String(form.get("password")),
            confirmPassword: String(form.get("confirmPassword")),
        };

        const gre = window.grecaptcha;
        if (!gre) {
            setError("reCAPTCHA not loaded yet. Please try again in a moment");
            setSubmitting(false);
            return;
        }

        gre.ready(async () => {
            try {
                const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

                if (!siteKey) {
                    throw new Error("NEXT_PUBLIC_RECAPTCHA_SITE_KEY is not defined.");
                }

                const token = await gre.execute(siteKey, {
                    action: "signup",
                });

                const res = await fetch("/api/auth/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ...payload, recaptchaToken: token }),
                });

                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || "Signup failed");
                    setSubmitting(false);
                    return;
                }

                const loginRes = await signIn("credentials", {
                    redirect: false,
                    handleOrEmail: payload.email,
                    password: payload.password,
                });

                if (loginRes?.ok) {
                    router.replace("/");
                    router.refresh();
                } else {
                    setError("Signed up, but auto-login failed. Please sign in");
                    setSubmitting(false);
                }
            } catch (e) {
                console.error(e);
                setError("Could not run reCAPTCHA");
                setSubmitting(false);
            }
        });
    };

    useEffect(() => {
        const script = document.createElement("script");
        script.src = `https://www.google.com/recaptcha/api.js?render=${process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}`;
        script.async = true;
        document.body.appendChild(script);

        return () => {
            script.remove();
            document.querySelector(".grecaptcha-badge")?.remove();
            const w = window as Window & { grecaptcha?: unknown };
            try {
                delete w.grecaptcha;
            } catch (err) {
                if (process.env.NODE_ENV === "development") {
                    console.error("Failed to delete grecaptcha:", err);
                }
            }
        };
    }, []);

    return (
        <div className="flex justify-center pt-8 h-full overflow-y-auto pb-8">
            <div className="max-w-md w-full p-8 border-2 rounded-2xl h-fit">
                <h1 className={`text-2xl font-bold text-center ${error ? "mb-3" : "mb-8"}`}>
                    Sign Up
                </h1>

                {error && (
                    <div className="mb-6 rounded px-4 py-3 bg-red-100 border-red-400 text-red-700 dark:bg-red-900 border dark:border-red-500 dark:text-red-300">
                        <span className="font-bold">Error: </span>
                        {error}
                    </div>
                )}

                <form className="space-y-4" onSubmit={handleSignup}>
                    <input
                        name="username"
                        type="text"
                        placeholder="Username"
                        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300 dark:focus:border-blue-700 dark:focus:ring-blue-600"
                        required
                    />

                    <div className="relative">
                        <span className="absolute inset-y-0 left-3 flex items-center font-bold pointer-events-none">
                            @
                        </span>
                        <input
                            name="handle"
                            type="text"
                            placeholder="handle"
                            value={handle}
                            onChange={(e) => sanitizeHandle(e.target.value)}
                            className={`w-full border rounded px-3 py-2 pl-8 focus:outline-none focus:ring ${
                                handleError
                                    ? "focus:border-red-300 dark:focus:border-red-700 dark:focus:ring-red-600"
                                    : "focus:border-blue-300 dark:focus:border-blue-700 dark:focus:ring-blue-600"
                            }`}
                            required
                        />
                    </div>
                    {handleError && (
                        <p className="text-red-600 dark:text-red-400 text-sm text-center">
                            {handleError}
                        </p>
                    )}

                    <input
                        name="email"
                        type="email"
                        placeholder="Email Address"
                        className="w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300 dark:focus:border-blue-700 dark:focus:ring-blue-600"
                        required
                        autoComplete="email"
                    />

                    <div className="relative">
                        <input
                            name="password"
                            type={passwordVisible ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300 dark:focus:border-blue-700 dark:focus:ring-blue-600"
                            required
                        />
                        <button
                            type="button"
                            className="absolute inset-y-0 right-3 flex items-center text-zinc-500"
                            onClick={() => setPasswordVisible(!passwordVisible)}
                            aria-label={passwordVisible ? "Hide password" : "Show password"}
                        >
                            {passwordVisible ? <HiEyeOff size={20} /> : <HiEye size={20} />}
                        </button>
                    </div>

                    {password.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                                        style={{ width: `${strengthPercent}%` }}
                                    />
                                </div>
                                <span className="text-xs font-medium w-10">{strengthLabel}</span>
                            </div>
                            <ul className="space-y-1">
                                {pwRequirements.map((r) => (
                                    <li
                                        key={r.label}
                                        className={`flex items-center gap-2 text-sm transition-colors ${
                                            r.met
                                                ? "text-green-600 dark:text-green-400"
                                                : "text-zinc-400 dark:text-zinc-500"
                                        }`}
                                    >
                                        <span className="text-xs">{r.met ? "✓" : "○"}</span>
                                        {r.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="relative">
                        <input
                            name="confirmPassword"
                            type={confirmPasswordVisible ? "text" : "password"}
                            placeholder="Confirm Password"
                            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300 dark:focus:border-blue-700 dark:focus:ring-blue-600"
                            required
                        />
                        <button
                            type="button"
                            className="absolute inset-y-0 right-3 flex items-center text-zinc-500"
                            onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                            aria-label={confirmPasswordVisible ? "Hide password" : "Show password"}
                        >
                            {confirmPasswordVisible ? <HiEyeOff size={20} /> : <HiEye size={20} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className={`w-full py-2 rounded ${submitting ? "cursor-not-allowed bg-zinc-200 dark:bg-zinc-800" : "bg-blue-500 hover:cursor-pointer text-white hover:bg-blue-600"}`}
                    >
                        {submitting ? "Signing Up..." : "Sign Up"}
                    </button>
                </form>

                <p className="pt-4 text-center text-zinc-500">
                    Already have an account?{" "}
                    <Link
                        href="/signin"
                        className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-400"
                    >
                        Sign in
                    </Link>
                </p>
                <p className="pt-4 text-center">Or you can sign up with:</p>
                <div className="pt-4">
                    <button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/" })}
                        className="w-full flex items-center justify-center gap-2 border rounded py-2 hover:cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                        <span className="w-5 h-5">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 48 48"
                                className="w-5 h-5"
                            >
                                <path
                                    fill="#4285F4"
                                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.84-6.84C35.9 2.7 30.34 0 24 0 14.64 0 6.4 5.84 2.54 14.22l7.98 6.19C12.3 13.32 17.74 9.5 24 9.5z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M46.5 24c0-1.61-.15-3.15-.43-4.63H24v9.1h12.65c-.54 2.92-2.14 5.4-4.55 7.06l7.02 5.46C43.72 37.14 46.5 30.96 46.5 24z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M10.52 28.41c-.62-1.86-.98-3.84-.98-5.91s.36-4.05.98-5.91l-7.98-6.19C.9 13.93 0 18.82 0 24s.9 10.07 2.54 14.22l7.98-6.19z"
                                />
                                <path
                                    fill="#EA4335"
                                    d="M24 48c6.48 0 11.91-2.15 15.88-5.84l-7.02-5.46c-2.03 1.36-4.65 2.15-8.86 2.15-6.26 0-11.7-3.82-13.48-9.06l-7.98 6.19C6.4 42.16 14.64 48 24 48z"
                                />
                                <path fill="none" d="M0 0h48v48H0z" />
                            </svg>
                        </span>
                        Google
                    </button>
                    <button
                        type="button"
                        onClick={() => signIn("github", { callbackUrl: "/" })}
                        className="w-full flex items-center justify-center gap-2 border rounded py-2 hover:cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900 mt-3"
                    >
                        <span className="w-5 h-5">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                                <path
                                    fillRule="evenodd"
                                    clipRule="evenodd"
                                    d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.379.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"
                                />
                            </svg>
                        </span>
                        GitHub
                    </button>
                </div>
            </div>
        </div>
    );
}
