import { z } from "zod";
import type { ToolDefinition } from "../types.js";

/**
 * Built-in documentation search tool.
 * Provides curated or simulated documentation lookup.
 */
export const searchDocsTool: ToolDefinition<
  { query: string; limit?: number },
  { query: string; results: Array<{ title: string; snippet: string }> }
> = {
  name: "search_docs",
  description: "Searches official developer documentation and guides for given topics or APIs.",
  inputSchema: z.object({
    query: z.string().describe("Search query for documentation"),
    limit: z.number().optional().default(3).describe("Max results to return"),
  }),
  outputSchema: z.object({
    query: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        snippet: z.string(),
      })
    ),
  }),
  timeoutMs: 4000,
  execute: async ({ query, limit = 3 }) => {
    // Curated snippets database for common agent queries
    const docsDatabase = [
      {
        title: "Node.js Streams Overview",
        snippet: "Streams are collections of data that might not be available all at once. Node.js provides 4 fundamental stream types: Readable, Writable, Duplex, and Transform.",
        keywords: ["node", "stream", "readable", "writable", "pipeline"],
      },
      {
        title: "Node.js stream/promises and pipeline",
        snippet: "import { pipeline } from 'node:stream/promises'. pipeline allows safe piping between streams, properly forwarding errors and cleaning up resources.",
        keywords: ["stream", "pipeline", "promises", "node.js"],
      },
      {
        title: "Node.js Backpressure",
        snippet: "Backpressure occurs when data is written faster than the stream can consume it. Writable.write() returns false when highWaterMark is exceeded, requiring waiting for 'drain'.",
        keywords: ["backpressure", "stream", "drain", "highwatermark"],
      },
      {
        title: "TypeScript NodeNext Module Resolution",
        snippet: "moduleResolution: nodenext enforces exact file extension imports (.js) even for TypeScript files, aligning with ECMAScript specification.",
        keywords: ["typescript", "nodenext", "esm", "module"],
      },
    ];

    const lowerQuery = query.toLowerCase();
    const matched = docsDatabase.filter(
      (doc) =>
        doc.keywords.some((kw) => lowerQuery.includes(kw)) ||
        doc.title.toLowerCase().includes(lowerQuery) ||
        doc.snippet.toLowerCase().includes(lowerQuery)
    );

    const results = (matched.length > 0 ? matched : docsDatabase).slice(0, limit).map((d) => ({
      title: d.title,
      snippet: d.snippet,
    }));

    return { query, results };
  },
};
