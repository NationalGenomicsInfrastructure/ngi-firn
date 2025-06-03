import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { useDB } from "./db";

export const auth = betterAuth({
    database: drizzleAdapter(useDB(), {
        provider: "sqlite",
    }),
    plugins: [ 
        username() 
    ],
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
})