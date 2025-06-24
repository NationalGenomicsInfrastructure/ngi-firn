import { betterAuth } from "better-auth";
import { anonymous, admin, username } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { useDB } from "./db";

let _auth: ReturnType<typeof betterAuth>
export function serverAuth() {
    if (!_auth) {
        _auth = betterAuth({
        database: drizzleAdapter(useDB(), {
            provider: "sqlite",
        }),
        secondaryStorage: {
            get: key => hubKV().getItemRaw(`_auth:${key}`),
            set: (key, value, ttl) => {
            return hubKV().set(`_auth:${key}`, value, { ttl })
            },
            delete: key => hubKV().del(`_auth:${key}`),
        },
        baseURL: getBaseURL(),
        emailAndPassword: {
            enabled: true,
        },
        socialProviders: {
            github: {
                clientId: process.env.NUXT_OAUTH_GITHUB_CLIENT_ID as string,
                clientSecret: process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET as string,
            },
            google: {
                clientId: process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID as string,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
            },
        },
        account: {
            accountLinking: {
            enabled: true,
            },
        },
        plugins: [anonymous(), admin(), username()],
        })
    }
    return _auth
}

function getBaseURL() {
    let baseURL = process.env.BETTER_AUTH_URL
    if (!baseURL) {
        try {
        baseURL = getRequestURL(useEvent()).origin
        }
        catch (e) {}
    }
return baseURL
}