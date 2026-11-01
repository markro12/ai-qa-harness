// Shared token check for the demo services.
// Each service checks the bearer token against the identity provider's public keys (JWKS).
import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";

const jwks = createRemoteJWKSet(new URL(`${config.issuer}/protocol/openid-connect/certs`));

export interface AuthUser {
  sub: string;
  username: string;
  token: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, jwks, { issuer: config.issuer });
  return payload;
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      res.status(401).json({ error: "missing_token" });
      return;
    }
    try {
      const payload = await verifyToken(token);
      if (!payload.sub) {
        res.status(401).json({ error: "invalid_token" });
        return;
      }
      req.user = {
        sub: payload.sub,
        username: String(payload.preferred_username ?? payload.sub),
        token,
      };
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };
}
