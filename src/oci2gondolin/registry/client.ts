import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { CliUsageError } from "../../shared/cli-errors";
import { MANIFEST_ACCEPT_HEADER } from "../oci-media-types";
import type { OciDescriptor } from "../types";
import { parseDigest } from "../utils/digest";
import type { ParsedImageReference } from "./image-reference";

export interface RegistryClient {
  fetchManifest(reference: string): Promise<{ descriptor: OciDescriptor; body: Buffer; mediaType: string }>;
  fetchBlobToFile(digest: string, destinationPath: string): Promise<void>;
}

type AuthChallenge = {
  scheme: string;
  realm: string;
  service?: string;
  scope?: string;
};

export function createRegistryClient(parsed: ParsedImageReference): RegistryClient {
  let bearerToken: string | null = null;

  async function authenticatedFetch(
    requestPath: string,
    init: RequestInit & { expectedStatus?: number[] } = {},
  ): Promise<Response> {
    const expectedStatus = init.expectedStatus ?? [200];
    const headers = new Headers(init.headers);

    if (bearerToken) {
      headers.set("authorization", `Bearer ${bearerToken}`);
    }

    const firstResponse = await fetch(buildRegistryUrl(parsed.registryApiHost, requestPath), {
      ...init,
      headers,
      redirect: "follow",
    });

    if (expectedStatus.includes(firstResponse.status)) {
      return firstResponse;
    }

    if (firstResponse.status !== 401) {
      throw await buildHttpError(firstResponse, requestPath);
    }

    const challengeHeader = firstResponse.headers.get("www-authenticate");
    const challenge = parseAuthChallenge(challengeHeader);
    if (!challenge || challenge.scheme.toLowerCase() !== "bearer") {
      throw await buildHttpError(firstResponse, requestPath, [
        "Registry requested authentication, but no supported Bearer challenge was provided.",
      ]);
    }

    bearerToken = await requestBearerToken(challenge, parsed.repository);

    const retryHeaders = new Headers(init.headers);
    retryHeaders.set("authorization", `Bearer ${bearerToken}`);

    const retryResponse = await fetch(buildRegistryUrl(parsed.registryApiHost, requestPath), {
      ...init,
      headers: retryHeaders,
      redirect: "follow",
    });

    if (!expectedStatus.includes(retryResponse.status)) {
      throw await buildHttpError(retryResponse, requestPath);
    }

    return retryResponse;
  }

  return {
    async fetchManifest(reference: string): Promise<{ descriptor: OciDescriptor; body: Buffer; mediaType: string }> {
      const response = await authenticatedFetch(`/v2/${parsed.repository}/manifests/${encodeReference(reference)}`, {
        headers: {
          accept: MANIFEST_ACCEPT_HEADER,
        },
      });

      const mediaType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
      const body = Buffer.from(await response.arrayBuffer());

      const digestFromHeader = response.headers.get("docker-content-digest");
      const digest = digestFromHeader ?? `sha256:${crypto.createHash("sha256").update(body).digest("hex")}`;

      const parsedDigest = parseDigest(digest);
      const descriptor: OciDescriptor = {
        mediaType,
        digest: `${parsedDigest.algorithm}:${parsedDigest.hex}`,
        size: body.length,
      };

      return {
        descriptor,
        body,
        mediaType,
      };
    },

    async fetchBlobToFile(digest: string, destinationPath: string): Promise<void> {
      const parsedDigest = parseDigest(digest);

      const response = await authenticatedFetch(`/v2/${parsed.repository}/blobs/${encodeReference(digest)}`, {
        expectedStatus: [200],
      });

      const body = Buffer.from(await response.arrayBuffer());
      const actualHex = crypto.createHash("sha256").update(body).digest("hex");

      if (actualHex !== parsedDigest.hex) {
        throw new CliUsageError(`Digest mismatch while downloading blob ${digest}.`, [
          `Expected sha256:${parsedDigest.hex}`,
          `Actual   sha256:${actualHex}`,
          "Retry the command. If it persists, check upstream registry consistency.",
        ]);
      }

      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, body);
    },
  };
}

function buildRegistryUrl(host: string, requestPath: string): string {
  return `https://${host}${requestPath}`;
}

function encodeReference(reference: string): string {
  return encodeURIComponent(reference).replace(/%2F/g, "/");
}

function parseAuthChallenge(headerValue: string | null): AuthChallenge | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, ...parts] = headerValue.split(" ");
  if (!scheme || parts.length === 0) {
    return null;
  }

  const paramsRaw = parts.join(" ");
  const params: Record<string, string> = {};

  for (const part of paramsRaw.split(",")) {
    const trimmed = part.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    params[key] = value;
  }

  if (!params.realm) {
    return null;
  }

  return {
    scheme,
    realm: params.realm,
    service: params.service,
    scope: params.scope,
  };
}

async function requestBearerToken(challenge: AuthChallenge, repository: string): Promise<string> {
  const tokenUrl = new URL(challenge.realm);

  if (challenge.service) {
    tokenUrl.searchParams.set("service", challenge.service);
  }

  if (challenge.scope) {
    tokenUrl.searchParams.set("scope", challenge.scope);
  } else {
    tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
  }

  const response = await fetch(tokenUrl, {
    method: "GET",
    redirect: "follow",
  });

  if (!response.ok) {
    throw await buildHttpError(response, tokenUrl.toString(), [
      "Unable to obtain Bearer token for registry access.",
    ]);
  }

  const payload = (await response.json()) as { token?: string; access_token?: string };
  const token = payload.token ?? payload.access_token;

  if (!token) {
    throw new CliUsageError("Registry token response did not include a token.", [
      "Check registry authentication endpoint behavior.",
    ]);
  }

  return token;
}

async function buildHttpError(
  response: Response,
  requestPath: string,
  extraHints: string[] = [],
): Promise<CliUsageError> {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    // ignore
  }

  const hints = [
    `HTTP ${response.status} ${response.statusText} while requesting ${requestPath}`,
  ];

  if (bodyText) {
    hints.push(`Registry response: ${truncate(bodyText, 220)}`);
  }

  hints.push(...extraHints);

  return new CliUsageError("Registry request failed.", hints);
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
