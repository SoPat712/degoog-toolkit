# OIDC / SSO

Gates the Degoog settings area behind any OpenID Connect provider (Authentik, Keycloak, Authelia, Okta, Google, Azure, ...) and shows an avatar for the signed-in user on the home page.

This is a request middleware plus a small set of plugin routes. It does not modify the main Degoog app.

## What it does

- Selectable as the settings auth gate. When active, opening settings starts an OIDC login instead of the password prompt.
- Authorization Code flow with PKCE, `state`, and `nonce`.
- Verifies the `id_token` signature against the provider JWKS (RS256/384/512), plus `iss`, `aud`, `exp`, and `nonce`.
- Optional allowlists by email, group, or role. When none are set, any successful login unlocks settings.
- Falls back to the userinfo endpoint when identity or group/role claims are missing from the `id_token`.
- Signs a separate, HttpOnly avatar cookie so the home page can show the current user without exposing the settings session.

## Setup

1. Register a confidential client at your provider.
2. Set the redirect URI to `<App URL>/api/settings/auth/callback`.
3. Fill in Issuer URL, Client ID, and Client Secret in the plugin settings.
4. Set App URL when behind a reverse proxy or on a subpath. Leave blank to derive it from the request.
5. In Settings -> Plugins, enable `Use as settings gate` for this plugin and save.

## Notes and limitations

- The gate protects the settings and admin area. It does not put a login wall in front of search itself.
- The avatar cookie is signed with a per-process secret by default, so avatars sign out on restart. Set a stable Avatar cookie secret to persist them or to run multiple instances.
- Only RSA-signed `id_token`s are verified today. EC (ES256) support is a possible future upgrade.
- Sign out clears the avatar cookie and the settings session cookie in the browser.
