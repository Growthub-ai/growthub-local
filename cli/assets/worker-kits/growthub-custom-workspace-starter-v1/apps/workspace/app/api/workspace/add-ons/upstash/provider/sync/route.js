import { POST as syncMarketplaceProvider } from "../../../providers/[providerId]/sync/route.js";

function POST(request) {
  return syncMarketplaceProvider(request, { params: { providerId: "upstash" } });
}

export { POST };
