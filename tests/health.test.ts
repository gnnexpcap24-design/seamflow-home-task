import { expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

it("health endpoint reports ok with an ISO time", async () => {
  const body = await GET().json();
  expect(body.status).toBe("ok");
  expect(new Date(body.time).toISOString()).toBe(body.time);
});
