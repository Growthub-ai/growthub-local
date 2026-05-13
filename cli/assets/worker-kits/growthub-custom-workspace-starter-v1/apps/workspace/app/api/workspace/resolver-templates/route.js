/**
 * GET /api/workspace/resolver-templates
 *
 * Lists built-in resolver / connector templates (metadata only).
 */

import { NextResponse } from "next/server";
import { listResolverTemplates, getResolverTemplate } from "@/lib/adapters/integrations/templates/template-registry";

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("templateId");
  if (id) {
    const one = getResolverTemplate(id);
    if (!one) {
      return NextResponse.json({ ok: false, error: "template not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, template: one });
  }
  return NextResponse.json({ ok: true, templates: listResolverTemplates() });
}

export { GET };
