# Authentication and authorization

> 💡  An excellent, comprehensive resource covering the fundamentals is [Auth Boss](https://github.com/teesloane/Auth-Boss).

## Authentication

Authentication is the process of establishing the identity of a user at a system. Since SciLifeLab uses Google accounts for the organization and all NGI developmental work happens on GitHub, we decided to reply on our existing accounts at those sites to prove our identity to Firn via the [OAuth](https://www.loginradius.com/blog/engineering/oauth2/) [client authentication](https://oauth.net/2/client-authentication/) standard.

Additionally, we have implemented a custom token-based authentication for convenience when working in the lab. Please see the [token documentation](./tokens.md) for a detailed description of the implementation.

### Authentication flow

Because SciLifeLab runs on Google's IT infrastructure, the `@scilifelab.se` Google account is the cornerstone of Firn's authentication. Users with a valid SciLifeLab Google account can either self-request access to the system or an administrator can pre-create the account, which gives them instant access after the logged in using Google. In either case, the new user document in the database is populated with information from Google's OAuth login.

After a successful authentication via Google, users can optionally link their GitHub accounts to the new Firn account. Subsequently GitHub instead of Google can be used to authenticate, but both will refer to the same user account.

Inside Firn, users have the option to issue login tokens for their account, which contain all relevant information to log in as this particular user. These tokens should therefore be treated as confidential credentials, yet can be revoked if the information has been lost or was obtained by others.

### OAuth authentication

OAuth is a standard to that allows to establish the identity of a user through another service (the OAuth provider). The OAuth provider then transmits verified
user information to the requesting web application after this application has been approved by both, user and provider. It is important to stress that the OAuth provider only verifies the user, but does not share own session details. Therefore, the OAuth client application does not have access to e.g. your email inbox from GoogleMail after using Google OAuth to authenticate.

The exact user information that an OAuth provider shares varies. For this reason, we maintain our own [`FirnUser` type](types/auth.d.ts) and [convert the user objects from the OAuth flow](server/crud/users.ts). Examples of user objects from [GitHub](server/api/auth/github.get.ts) and [Google](server/api/auth/google.get.ts) are included as comments in the respective API endpoints.

#### OAuth apps

To integrate an OAuth login to a web application, one needs to configure and allow a particular service at the OAuth provider, a process that is typically referred to as _creating an OAuth app_. Please find the detailed manual how to configure one for GitHub and Google below.

> 🛂 OAuth aps for development purposes have already been created. To use them for logging into your development instance, configure the respective secrets and IDs in the environment. If you wish, you can of course create your own OAuth apps as well.

This application uses the [Nuxt Auth Utils](https://github.com/atinux/nuxt-auth-utils) to add OAuth authentication easily. For now, GitHub and Google have been added, but [many other providers](https://github.com/atinux/nuxt-auth-utils?tab=readme-ov-file#supported-oauth-providers) could be enabled as well, provided their objects are converted to FirnUsers as well.

After a successful OAuth flow, we switch to a session-based authentication with session cookies in the browser. To create sealed session cookies with the Firn application, you need to add `NUXT_SESSION_PASSWORD` in the `.env` with at least 32 characters. This can (and should) be specific to your instance:

```bash
NUXT_SESSION_PASSWORD="your-super-random-secret-for-session-encryption"
```

> 💡  Since the session password is also used in our token authentication process, tokens that you issue with your development instance will not be valid for the production system or your another development instance.

#### Creating and configuring GitHub's OAuth app

You can [create a GitHub Oauth Application on this page](https://github.com/settings/applications/new). Since production and development should never be mixed, it is perfectly fine to have separate OAuth apps for both.

For the development OAuth app, you need to set in the GitHub UI:

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/github`

Add the displayed variables in the `.env` file:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID="my-github-oauth-app-id"
NUXT_OAUTH_GITHUB_CLIENT_SECRET="my-github-oauth-app-secret"
```

#### Creating and configuring Google's OAuth app

Please follow [the manual on how to configure your Google OAuth app](https://developers.google.com/identity/protocols/oauth2) here. You can [create a Google Oauth project on the developers' console](https://console.developers.google.com). Unlike GitHub, Google allows to specify multiple URLs for the home page and callback. Hence, the same app could be used for the development and production instance. Nonetheless, it is advisable to separate the two.

For the development OAuth app, you need to set in the Google developers' console:

- Homepage URL: `http://localhost:3000`
- Callback URL: `http://localhost:3000/api/auth/google`

Add the displayed variables in the `.env` file:

```bash
NUXT_OAUTH_GOOGLE_CLIENT_ID="my-google-oauth-app-id"
NUXT_OAUTH_GOOGLE_CLIENT_SECRET="my-google-oauth-app-secret"
```

### Token authentication

To simplify usage on shared computers and tablets specifically in the lab, we provide a custom token-based authentication method as well. All relevant information is contained in a [separate documentation](./tokens.md).

## Authorization

To be decided. The [Nuxt authorization module](https://github.com/Barbapapazes/nuxt-authorization) looks interesting, also see [the accompanying blog post](https://soubiran.dev/posts/nuxt-going-full-stack-how-to-handle-authorization). We will probably combine it with [Permask](https://github.com/dschewchenko/permask) for fine-grained permissions.

[BetterAuth](https://www.better-auth.com/) was unfortunately no option, since there is no adapter for CouchDB. Hard to say whether it is easier to adapt the [MongoDB adapter](https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/mongodb-adapter) to Couch or whip-up a completely custom solution.
