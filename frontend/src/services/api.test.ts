import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, authApi, incidentsApi, realtimeUrl, setUnauthorizedHandler, tokenStore } from "./api";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => tokenStore.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("request plumbing", () => {
  it("sends the bearer token when one is stored", async () => {
    tokenStore.set("abc123");
    const fetchMock = mockFetch(200, { items: [], total: 0, page: 1, size: 15 });
    await incidentsApi.list();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc123");
  });

  it("omits empty filters from the query string", async () => {
    const fetchMock = mockFetch(200, { items: [], total: 0, page: 1, size: 15 });
    await incidentsApi.list({ page: 2, status: "", severity: "SEV1", search: "" });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("page=2");
    expect(url).toContain("severity=SEV1");
    expect(url).not.toContain("status=");
    expect(url).not.toContain("search=");
  });

  it("login posts form-encoded credentials with the email in the `username` field", async () => {
    const fetchMock = mockFetch(200, { access_token: "t", token_type: "bearer" });
    await authApi.login("a@b.com", "password123");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(String(init.body)).toBe("username=a%40b.com&password=password123");
  });

  it("builds a ws:// URL with the token for the WebSocket endpoint", () => {
    expect(realtimeUrl("tok en")).toMatch(/^ws:\/\/.+\/ws\/updates\?token=tok%20en$/);
  });

  it("resolves a RELATIVE api base (production behind a proxy) to an absolute ws URL", async () => {
    // The WebSocket constructor throws on relative URLs, so this must never return one.
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "/api/v1");
    const { realtimeUrl: rel } = await import("./api");
    const url = rel("t");
    expect(url).toMatch(/^wss?:\/\//);
    expect(url).toContain("/api/v1/ws/updates?token=t");
    vi.unstubAllEnvs();
  });

  it("uses wss:// when the API is served over https", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.example.com/api/v1");
    const { realtimeUrl: secure } = await import("./api");
    expect(secure("t")).toBe("wss://api.example.com/api/v1/ws/updates?token=t");
    vi.unstubAllEnvs();
  });
});

describe("error handling", () => {
  it("uses the FastAPI string `detail` as the message", async () => {
    mockFetch(400, { detail: "Cannot transition from OPEN to RESOLVED" });
    await expect(incidentsApi.changeStatus("1", "RESOLVED")).rejects.toMatchObject({
      status: 400,
      message: "Cannot transition from OPEN to RESOLVED",
    });
  });

  it("flattens FastAPI 422 validation arrays into readable text", async () => {
    mockFetch(422, {
      detail: [{ loc: ["body", "password"], msg: "String should have at least 8 characters" }],
    });
    await expect(authApi.register("a@b.com", "A", "short")).rejects.toThrow(
      "password: String should have at least 8 characters",
    );
  });

  it("explains a network failure instead of throwing a raw TypeError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(incidentsApi.list()).rejects.toThrow(/Can't reach the DevPulse API/);
  });

  it("any 401 triggers the global logout handler", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { detail: "Could not validate credentials" });
    await expect(incidentsApi.list()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("but a failed LOGIN (401) must not log anyone out or loop", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockFetch(401, { detail: "Incorrect email or password" });
    await expect(authApi.login("a@b.com", "wrong")).rejects.toThrow("Incorrect email or password");
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("a missing postmortem resolves to null, not an error", async () => {
    mockFetch(404, { detail: "Postmortem not found" });
    await expect(incidentsApi.postmortem("inc-1")).resolves.toBeNull();
  });

  it("other postmortem errors still surface", async () => {
    mockFetch(500, { detail: "Internal server error" });
    await expect(incidentsApi.postmortem("inc-1")).rejects.toMatchObject({ status: 500 });
  });

  it("handles 204 No Content without trying to parse a body", async () => {
    mockFetch(204, null);
    await expect(incidentsApi.deleteComment("1", "2")).resolves.toBeUndefined();
  });
});
