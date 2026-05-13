import { Router, type IRouter } from "express";
import { LookupIpParams, LookupIpResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function countryCodeToEmoji(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

function parseAsn(asField: string | undefined): { asn: number | null; asName: string | null } {
  if (!asField) return { asn: null, asName: null };
  const match = asField.match(/^AS(\d+)\s*(.*)$/);
  if (!match) return { asn: null, asName: asField };
  return { asn: parseInt(match[1], 10), asName: match[2] || null };
}

function deriveThreatLevel(proxy: boolean, hosting: boolean): string {
  if (proxy) return "medium";
  if (hosting) return "low";
  return "none";
}

router.get("/ip/:address", async (req, res): Promise<void> => {
  const params = LookupIpParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { address } = params.data;

  function isPrivateOrReserved(ip: string): boolean {
    if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("192.168.")) return true;
    if (ip.startsWith("172.")) {
      const second = parseInt(ip.split(".")[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    if (ip.startsWith("169.254.")) return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
    return false;
  }

  let resolvedIp: string;
  if (address === "me") {
    const forwarded = req.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const candidate = raw
      ? raw.split(",")[0].trim().replace(/^::ffff:/, "")
      : (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");

    if (!candidate || isPrivateOrReserved(candidate)) {
      try {
        const ipifyRes = await fetch("https://api.ipify.org?format=json");
        const { ip: publicIp } = (await ipifyRes.json()) as { ip: string };
        resolvedIp = publicIp;
      } catch {
        res.status(502).json({ error: "Could not determine public IP address" });
        return;
      }
    } else {
      resolvedIp = candidate;
    }
  } else {
    resolvedIp = address;
  }

  const fields =
    "status,message,continent,continentCode,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,proxy,hosting,query";

  let upstreamData: Record<string, unknown>;
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(resolvedIp)}?fields=${fields}`,
    );
    if (!response.ok) {
      res.status(502).json({ error: "Upstream lookup failed" });
      return;
    }
    upstreamData = (await response.json()) as Record<string, unknown>;
  } catch (err) {
    req.log.error({ err }, "Failed to fetch from ip-api.com");
    res.status(502).json({ error: "Upstream lookup failed" });
    return;
  }

  if (upstreamData["status"] !== "success") {
    const msg = typeof upstreamData["message"] === "string" ? upstreamData["message"] : "IP not found";
    res.status(404).json({ error: msg });
    return;
  }

  const countryCode = typeof upstreamData["countryCode"] === "string" ? upstreamData["countryCode"] : null;
  const proxy = upstreamData["proxy"] === true;
  const hosting = upstreamData["hosting"] === true;
  const { asn, asName } = parseAsn(
    typeof upstreamData["as"] === "string" ? upstreamData["as"] : undefined,
  );

  const parsed = LookupIpResponse.safeParse({
    ip: upstreamData["query"],
    type: typeof upstreamData["query"] === "string" && upstreamData["query"].includes(":") ? "IPv6" : "IPv4",
    continent: upstreamData["continent"],
    continent_code: upstreamData["continentCode"],
    country: upstreamData["country"],
    country_code: countryCode,
    region: upstreamData["regionName"],
    region_code: upstreamData["region"],
    city: upstreamData["city"],
    latitude: upstreamData["lat"],
    longitude: upstreamData["lon"],
    is_eu: null,
    postal: upstreamData["zip"],
    calling_code: null,
    capital: null,
    flag_emoji: countryCode ? countryCodeToEmoji(countryCode) : null,
    flag_img: null,
    timezone: upstreamData["timezone"],
    connection: {
      asn,
      org: typeof upstreamData["org"] === "string" ? upstreamData["org"] : null,
      isp: typeof upstreamData["isp"] === "string" ? upstreamData["isp"] : null,
      domain: typeof upstreamData["asname"] === "string" ? upstreamData["asname"] : asName,
    },
    security: {
      is_vpn: proxy,
      is_proxy: proxy,
      is_datacenter: hosting,
      is_tor: null,
      threat_level: deriveThreatLevel(proxy, hosting),
    },
  });

  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Failed to parse IP response");
    res.status(502).json({ error: "Invalid upstream response" });
    return;
  }

  res.json(parsed.data);
});

export default router;
