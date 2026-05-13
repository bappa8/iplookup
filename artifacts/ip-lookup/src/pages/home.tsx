import { useState, useEffect, useRef } from "react";
import { useLookupIp, getLookupIpQueryKey } from "@workspace/api-client-react";
import L from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [ipToLookup, setIpToLookup] = useState<string>("me");

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const { data: ipData, isLoading, error } = useLookupIp(ipToLookup, {
    query: {
      enabled: !!ipToLookup,
      queryKey: getLookupIpQueryKey(ipToLookup),
      retry: false,
    },
  });

  useEffect(() => {
    if (!mapContainerRef.current || leafletMap.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    leafletMap.current = map;

    return () => {
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  useEffect(() => {
    if (!leafletMap.current || !ipData?.latitude || !ipData?.longitude) return;
    const lat = ipData.latitude;
    const lon = ipData.longitude;

    markerRef.current?.remove();
    markerRef.current = L.marker([lat, lon], { icon: defaultIcon }).addTo(leafletMap.current);
    leafletMap.current.setView([lat, lon], 6, { animate: true });
  }, [ipData]);

  const handleLookup = () => {
    const val = inputValue.trim();
    if (val) setIpToLookup(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLookup();
  };

  const displayIp = isLoading ? "Loading..." : error ? "Error" : (ipData?.ip ?? "");

  const infoRows = [
    { label: "City:", value: ipData?.city },
    { label: "Country:", value: ipData?.country },
    { label: "Country Code:", value: ipData?.country_code },
    { label: "Latitude:", value: ipData?.latitude?.toString() },
    { label: "Longitude:", value: ipData?.longitude?.toString() },
    { label: "Postal Code:", value: ipData?.postal },
    { label: "Organization:", value: ipData?.connection?.org },
    { label: "ASN:", value: ipData?.connection?.asn?.toString() },
    { label: "ISP Name:", value: ipData?.connection?.isp },
  ];

  return (
    <div style={{ minHeight: "100vh", padding: "24px 28px" }}>
      {/* Header */}
      <p style={{ color: "#ddd8ff", fontSize: "17px", marginBottom: "10px", fontWeight: 400 }}>
        Your public IP address is:
      </p>

      {/* IP input row */}
      <div style={{ display: "flex", maxWidth: "680px", marginBottom: "20px" }}>
        <input
          data-testid="input-ip"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={displayIp}
          style={{
            flex: 1,
            backgroundColor: "#0e0928",
            border: "1px solid rgba(130,100,220,0.35)",
            borderRight: "none",
            color: "white",
            fontSize: "22px",
            fontWeight: 500,
            padding: "11px 16px",
            outline: "none",
            borderRadius: "4px 0 0 4px",
            fontFamily: "'Courier New', monospace",
          }}
        />
        <button
          data-testid="button-lookup"
          onClick={handleLookup}
          style={{
            backgroundColor: "#00c896",
            color: "white",
            border: "none",
            padding: "11px 30px",
            fontSize: "16px",
            fontWeight: 700,
            cursor: "pointer",
            borderRadius: "0 4px 4px 0",
            whiteSpace: "nowrap",
            letterSpacing: "0.03em",
          }}
        >
          Lookup IP
        </button>
      </div>

      {/* Map + Info panel */}
      <div style={{ display: "flex", gap: "28px", alignItems: "flex-start" }}>
        {/* Map */}
        <div
          style={{
            flex: "0 0 62%",
            height: "420px",
            borderRadius: "4px",
            overflow: "hidden",
            border: "1px solid rgba(130,100,220,0.25)",
          }}
        >
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>

        {/* Info panel */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: "4px" }}>
          {isLoading ? (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "15px" }}>Loading...</p>
          ) : error ? (
            <p style={{ color: "#ff6b6b", fontSize: "15px" }}>
              Could not retrieve data for this IP address.
            </p>
          ) : ipData ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {infoRows
                  .filter((r) => r.value != null && r.value !== "")
                  .map((row) => (
                    <tr key={row.label} style={{ borderBottom: "1px solid rgba(150,120,255,0.1)" }}>
                      <td
                        style={{
                          padding: "9px 18px 9px 0",
                          fontWeight: 700,
                          color: "white",
                          fontSize: "15px",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        }}
                      >
                        {row.label}
                      </td>
                      <td
                        data-testid={`text-${row.label.replace(":", "").replace(/ /g, "-").toLowerCase()}`}
                        style={{
                          padding: "9px 0",
                          color: "white",
                          fontSize: "15px",
                          fontWeight: 400,
                          verticalAlign: "middle",
                        }}
                      >
                        {row.value}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
