# Authentication and authorization

> 💡  An excellent, comprehensive resource covering the fundamentals is [Auth Boss](https://github.com/teesloane/Auth-Boss).

## Authentication

Since SciLifeLab uses Google accounts for the organization and all NGI developmental work happens on GitHub, we decided to reply on [OAuth](https://www.loginradius.com/blog/engineering/oauth2/) [client authentication](https://oauth.net/2/client-authentication/) provided by those organizations for the Firn application. 

Both methods are available and can be used depending on personal choice. When creating the user, both should ideally directly be linked to the same user account to prevent the accidental creation of two independent accounts (which would happen if the primary e-mail address on GitHub for example differs from the work e-mail). For this reason, an explicit registration procedure is required.

Firn furthermore allows for a token-based authorization, which is not yet implemented. The respective method is, however, already included in the `User type defined in `types/auth.d.ts`.

### JWT tokens

[Jose](https://medium.com/@hasindusithmin64/creating-and-verifying-jwts-using-npm-jose-a-step-by-step-guide-e07c4fdb3346) is used for JWT handling.

### Creating and configuring OAuth apps

> 🛂 OAuth aps for development purposes have already been created. To use them for logging into your development instance, configure the respective secrets and IDs in the environment. If you wish, you can of course create your own OAuth apps as well.

This application uses the [Nuxt Auth Utils](https://github.com/atinux/nuxt-auth-utils) to add OAuth authentication easily. For now, GitHub and Google have been added, but [many other providers](https://github.com/atinux/nuxt-auth-utils?tab=readme-ov-file#supported-oauth-providers) could be enabled as well. To create sealed session cookies, you need to add `NUXT_SESSION_PASSWORD` in the `.env` with at least 32 characters. This can (and should) be specific to your instance:

```bash
NUXT_SESSION_PASSWORD="your-super-random-secret-for-session-encryption"
```

#### GitHub

You can [create a GitHub Oauth Application on this page](https://github.com/settings/applications/new). Since production and development should never be mixed, it is perfectly fine to have separate OAuth apps for both.

For the development OAuth app, you need to set in the GitHub UI:

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/github`

Add the displayed variables in the `.env` file:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID="my-github-oauth-app-id"
NUXT_OAUTH_GITHUB_CLIENT_SECRET="my-github-oauth-app-secret"
```

#### Google

Please follow [the manual on how to configure your Google OAuth app](https://developers.google.com/identity/protocols/oauth2) here.You can [create a Google Oauth project on the developers' console](https://console.developers.google.com). In contrast to GitHub, Google allows to specify multiple URLs for the home page and callback. Hence, the same app could be used for the development and production instance. Nonetheless, it is advisable to separate the two.

For the development OAuth app, you need to set in the Google developers' console:

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/google`

Add the displayed variables in the `.env` file:

```bash
NUXT_OAUTH_GOOGLE_CLIENT_ID="my-google-oauth-app-id"
NUXT_OAUTH_GOOGLE_CLIENT_SECRET="my-google-oauth-app-secret"
```

## Authorization

To be decided. The [Nuxt authorization module](https://github.com/Barbapapazes/nuxt-authorization) looks interesting, also see [the accompanying blog post](https://soubiran.dev/posts/nuxt-going-full-stack-how-to-handle-authorization). We will probably combine it with [Permask](https://github.com/dschewchenko/permask) for fine-grained permissions.
