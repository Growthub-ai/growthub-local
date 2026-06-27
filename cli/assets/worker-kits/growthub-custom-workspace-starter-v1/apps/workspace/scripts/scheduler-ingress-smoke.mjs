#!/usr/bin/env node

const baseUrl = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

const routes = [
  "/api/workspace/workflows/upstash",
  "/api/workspace/add-ons/upstash/callback",
  "/api/workspace/add-ons/upstash/failure",
];

const methods = ["HEAD", "OPTIONS"];

let failed = false;

for (const route of routes) {
  for (const method of methods) {
    const response = await fetch(`${baseUrl}${route}`, { method, redirect: "manual" });
    const ok = method === "HEAD"
      ? response.status === 200
      : response.status === 204 && String(response.headers.get("allow") || "").includes("POST");
    console.log(`${method} ${route} -> ${response.status}${ok ? "" : " FAIL"}`);
    if (!ok) failed = true;
  }
}

if (failed) process.exit(1);
