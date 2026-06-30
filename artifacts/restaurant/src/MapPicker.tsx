import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface PickedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface MapPickerProps {
  onConfirm: (loc: PickedLocation) => void;
  onClose: () => void;
}

export default function MapPicker({ onConfirm, onClose }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current, {
      center: [13.7563, 100.5018],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      placeMarker(map, e.latlng.lat, e.latlng.lng);
    });

    leafletMap.current = map;

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  function placeMarker(map: L.Map, lat: number, lng: number) {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        setPicked({ lat: pos.lat, lng: pos.lng });
        reverseGeocode(pos.lat, pos.lng);
      });
      markerRef.current = marker;
    }
    setPicked({ lat, lng });
    reverseGeocode(lat, lng);
    map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }

  async function reverseGeocode(lat: number, lng: number) {
    setAddress("กำลังค้นหาที่อยู่...");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=th`,
        { headers: { "Accept-Language": "th" } }
      );
      const data = await res.json();
      setAddress(data.display_name ?? `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    } catch {
      setAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setGeoError("เบราว์เซอร์นี้ไม่รองรับ GPS");
      return;
    }
    setGeoLoading(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        if (leafletMap.current) {
          placeMarker(leafletMap.current, pos.coords.latitude, pos.coords.longitude);
        }
      },
      () => {
        setGeoLoading(false);
        setGeoError("ไม่สามารถรับตำแหน่งได้ — กรุณาแตะบนแผนที่แทน");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  function handleConfirm() {
    if (!picked) return;
    onConfirm({ lat: picked.lat, lng: picked.lng, formattedAddress: address });
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="flex flex-col w-full h-full max-w-2xl mx-auto bg-white"
        style={{ maxHeight: "100dvh" }}
      >
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: "hsl(22,90%,50%)", color: "white" }}
        >
          <h2 className="font-bold text-base">📍 เลือกตำแหน่งจัดส่ง</h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none opacity-80 hover:opacity-100 transition"
          >
            ✕
          </button>
        </div>

        {/* GPS button */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0 flex flex-col gap-2">
          <button
            onClick={handleUseMyLocation}
            disabled={geoLoading}
            className="w-full rounded-xl py-2.5 font-semibold text-sm transition active:scale-95 disabled:opacity-60"
            style={{ background: "hsl(200,80%,93%)", color: "hsl(200,80%,30%)", border: "1.5px solid hsl(200,50%,75%)" }}
          >
            {geoLoading ? "⏳ กำลังรับตำแหน่ง..." : "📍 ใช้ตำแหน่งปัจจุบัน"}
          </button>
          {geoError && (
            <p className="text-xs text-red-500 text-center">{geoError}</p>
          )}
          <p className="text-xs text-center" style={{ color: "hsl(20,10%,55%)" }}>
            หรือแตะบนแผนที่เพื่อเลือกตำแหน่ง · ลากหมุดเพื่อปรับ
          </p>
        </div>

        {/* Map */}
        <div
          ref={mapRef}
          className="flex-1 w-full"
          style={{ minHeight: 0 }}
        />

        {/* Bottom panel */}
        <div className="flex-shrink-0 px-4 py-3 border-t" style={{ borderColor: "hsl(30,20%,88%)" }}>
          {picked ? (
            <>
              <div
                className="rounded-xl px-3 py-2 mb-3 text-xs"
                style={{ background: "hsl(36,60%,92%)", border: "1px solid hsl(30,20%,82%)" }}
              >
                <p className="font-semibold text-sm mb-0.5">ตำแหน่งที่เลือก</p>
                <p className="leading-relaxed">{address || `${picked.lat.toFixed(6)}, ${picked.lng.toFixed(6)}`}</p>
                <p className="mt-1 opacity-60">
                  {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
                </p>
              </div>
              <button
                onClick={handleConfirm}
                className="w-full rounded-2xl py-3 font-bold text-white text-base transition active:scale-95"
                style={{ background: "hsl(22,90%,50%)" }}
              >
                ✅ ยืนยันตำแหน่งนี้
              </button>
            </>
          ) : (
            <div className="text-center py-2 text-sm" style={{ color: "hsl(20,10%,55%)" }}>
              แตะบนแผนที่หรือใช้ตำแหน่งปัจจุบันเพื่อเลือกจุดจัดส่ง
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
