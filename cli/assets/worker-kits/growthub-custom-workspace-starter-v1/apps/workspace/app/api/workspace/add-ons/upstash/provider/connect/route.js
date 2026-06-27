import { POST as connectMarketplaceProvider } from "../../../providers/[providerId]/connect/route.js";

function POST(request) {
  return connectMarketplaceProvider(request, { params: { providerId: "upstash" } });
}

export { POST };
