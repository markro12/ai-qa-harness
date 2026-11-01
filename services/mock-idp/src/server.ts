// Mock identity provider for local runs without Docker.
// It copies the Keycloak endpoints the demo uses: discovery, JWKS and the password grant.
// CI uses real Keycloak. Use this mock only when Keycloak cannot run.
import express from "express";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { config } from "../../shared/config.js";

// Test users. They match keycloak/demo-realm.json.
const USERS: Record<string, { password: string; sub: string; email: string }> = {
  alice: { password: "alice-pass", sub: "7f1d2c3a-0000-4000-8000-00000000a11c", email: "alice@example.test" },
  bob: { password: "bob-pass", sub: "7f1d2c3a-0000-4000-8000-000000000b0b", email: "bob@example.test" },
};

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "mock-key-1", alg: "RS256", use: "sig" };

const issuer = config.issuer;
const base = `/realms/${config.realm}`;

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get(`${base}/.well-known/openid-configuration`, (_req, res) => {
  res.json({
    issuer,
    token_endpoint: `${issuer}/protocol/openid-connect/token`,
    jwks_uri: `${issuer}/protocol/openid-connect/certs`,
    grant_types_supported: ["password"],
  });
});

app.get(`${base}/protocol/openid-connect/certs`, (_req, res) => {
  res.json({ keys: [jwk] });
});

app.post(`${base}/protocol/openid-connect/token`, async (req, res) => {
  const { grant_type, client_id, username, password } = req.body ?? {};
  if (grant_type !== "password") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  if (client_id !== config.clientId) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }
  const user = USERS[String(username)];
  if (!user || user.password !== password) {
    res.status(401).json({ error: "invalid_grant", error_description: "Invalid user credentials" });
    return;
  }
  const expiresIn = 300;
  const accessToken = await new SignJWT({
    preferred_username: username,
    email: user.email,
    azp: client_id,
    typ: "Bearer",
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setSubject(user.sub)
    .setAudience("account")
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(privateKey);

  res.json({ access_token: accessToken, token_type: "Bearer", expires_in: expiresIn });
});

app.listen(config.ports.mockIdp, () => {
  console.log(`mock-idp listening on http://localhost:${config.ports.mockIdp}${base}`);
});
