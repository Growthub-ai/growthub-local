import { NextResponse } from "next/server";
import { listKnowledgeTables, queryKnowledgeTable } from "@/lib/adapters/knowledge";

async function GET(request) {
  const url = new URL(request.url);
  const tableId = url.searchParams.get("tableId");
  try {
    if (tableId) {
      const result = await queryKnowledgeTable(tableId);
      return NextResponse.json(result);
    }
    const result = await listKnowledgeTables();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message || "knowledge lookup failed" }, { status: 500 });
  }
}

export { GET };
