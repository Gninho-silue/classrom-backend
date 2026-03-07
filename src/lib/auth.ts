import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js";
import * as schema from "../db/schema/auth.js";

const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;
const BACKEND_URL = process.env.NODE_ENV === "development"
    ? (process.env.BACKEND_URL ?? "http://localhost:8000")
    : process.env.BACKEND_URL;

if (!BETTER_AUTH_SECRET) {
    throw new Error('Missing required env var: BETTER_AUTH_SECRET');
}
if (!FRONTEND_URL) {
    throw new Error('Missing required env var: FRONTEND_URL');
}
if (!BACKEND_URL) {
    throw new Error('Missing required env var: BACKEND_URL');
}

export const auth = betterAuth({
    baseURL: BACKEND_URL,
    secret: BETTER_AUTH_SECRET,
    trustedOrigins: [FRONTEND_URL],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),

    emailAndPassword: {
        enabled: true,
    },

    user: {
        additionalFields: {
            role: {
                type: "string",
                required: true,
                defaultValue: "student",
                allowedValues: ["student", "teacher", "admin"],
                input: true
            },
            imageCldPubId: {
                type: "string",
                required: false,
                input: true
            },
        }
    },
});