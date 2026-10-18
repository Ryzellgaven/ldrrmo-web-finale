import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getAllReports, getEvacuationCenters, getIotDevices } from '@/lib/api';
import { diplomahanBoundaries, DIPLAHAN_BOUNDS, DIPLAHAN_CENTER } from '@/data/diplahan-boundary';
import type { EmergencyReport, EvacuationCenter, IotDevice } from '@/types/index';
import { Button } from '@/components/ui/button';
import { RefreshCw, Layers, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function markerIcon(color: string, iconPath: string, pulse = false) {
  return L.divIcon({
    html: `<div style="width:28px;height:34px;display:grid;place-items:center;position:relative"><span style="position:absolute;bottom:0;width:20px;height:20px;transform:rotate(-45deg);border-radius:50% 50% 50% 0;background:${color};border:2px solid white;box-shadow:0 1px 5px #0f172a88;${pulse ? 'animation:incident-marker-pulse 1s ease-in-out infinite' : ''}"></span><svg viewBox="0 0 24 24" aria-hidden="true" style="position:relative;z-index:1;width:13px;height:13px;margin-top:-7px;fill:none;stroke:white;stroke-width:2;stroke-linecap:round;stroke-linejoin:round">${iconPath}</svg></div>`,
    className: '', iconSize: [28, 34], iconAnchor: [14, 34],
  });
}
const sensorIcon = markerIcon('#1672c4', '<path d="M12 22s8-4.5 8-12a8 8 0 1 0-16 0c0 7.5 8 12 8 12Z"/><circle cx="12" cy="10" r="2.5"/>');
const shelterIcon = markerIcon('#64748b', '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>');

interface SelectedReport extends EmergencyReport { _selected?: boolean }

export default function DashboardMap({ embedded = false }: { embedded?: boolean }) {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.GeoJSON | null>(null);
  const [reports, setReports] = useState<EmergencyReport[]>([]);
  const [centers, setCenters] = useState<EvacuationCenter[]>([]);
  const [devices, setDevices] = useState<IotDevice[]>([]);
  const [selected, setSelected] = useState<SelectedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const seenReportIdsRef = useRef<Set<string> | null>(null);
  const pulsingReportsRef = useRef<Map<string, number>>(new Map());
  const [pulsingReportIds, setPulsingReportIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [rRes, cData, deviceData] = await Promise.all([
      getAllReports(0, 200, {}),
      getEvacuationCenters(),
      getIotDevices(),
    ]);
    const currentIds = new Set(rRes.data.map(report => report.id));
    if (seenReportIdsRef.current) {
      const newReports = rRes.data.filter(report => !seenReportIdsRef.current?.has(report.id));
      newReports.forEach(report => {
        pulsingReportsRef.current.set(report.id, Date.now() + 90000);
        const location = report.latitude !== null && report.longitude !== null
          ? ` Location: ${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}.`
          : report.address_text ? ` Location: ${report.address_text}.` : '';
        toast.error(`New ${report.emergency_type} report`, {
          description: `${report.severity} severity.${location}`,
          duration: 10000,
        });
      });
    }
    seenReportIdsRef.current = currentIds;
    const now = Date.now();
    pulsingReportsRef.current.forEach((expiresAt, id) => {
      if (expiresAt <= now) pulsingReportsRef.current.delete(id);
    });
    setPulsingReportIds(new Set(pulsingReportsRef.current.keys()));
    setReports(rRes.data);
    setCenters(cData);
    setDevices(deviceData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    mapRef.current = L.map(mapDivRef.current, { center: DIPLAHAN_CENTER, zoom: 12, zoomControl: false });
    L.control.zoom({ position: 'topleft' }).addTo(mapRef.current);
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', maxZoom: 19 },
    ).addTo(mapRef.current);
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    });
    const placeLabels = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Place names and boundaries © Esri', maxZoom: 19 },
    ).addTo(mapRef.current);
    layerRef.current = L.layerGroup().addTo(mapRef.current);

    // This outline is the published municipal ADM3 polygon, not synthetic barangay shapes.
    boundaryRef.current = L.geoJSON(diplomahanBoundaries as never, {
      attribution: '<a href="https://www.geoboundaries.org/">Municipal boundary: geoBoundaries, from NAMRIA / PSA / OCHA Philippines (CC BY 3.0 IGO)</a>',
      style: {
        color: '#fff',
        weight: 2,
        opacity: 0.95,
        fillColor: '#38bdf8',
        fillOpacity: 0.035,
        dashArray: '5 5',
      },
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.name, {
          permanent: false,
          direction: 'center',
          className: 'barangay-label',
        });
      },
    }).addTo(mapRef.current);

    L.control.layers({ Satellite: satellite, Streets: streets }, {
      'Place labels': placeLabels,
      'Municipal boundary': boundaryRef.current,
    }, {
      collapsed: true, position: 'topright',
    }).addTo(mapRef.current);
    L.control.scale({ imperial: false, metric: true, maxWidth: 100, position: 'bottomright' }).addTo(mapRef.current);
    mapRef.current.fitBounds(DIPLAHAN_BOUNDS, { padding: [16, 16] });

    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.clearLayers();
    reports.forEach(r => {
      if (r.latitude === null || r.longitude === null) return;
      L.marker([r.latitude, r.longitude], {
        icon: markerIcon(
          '#c62828',
          '<path d="M12 8v4m0 4h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/>',
          pulsingReportIds.has(r.id),
        ),
      })
        .bindTooltip(`${pulsingReportIds.has(r.id) ? 'NEW · ' : ''}${r.emergency_type.toUpperCase()} · ${r.severity.toUpperCase()}`, { direction: 'top' })
        .on('click', () => setSelected(r))
        .addTo(layerRef.current!);
    });
    devices.filter(device => device.status === 'active').forEach(device => {
      L.marker([device.latitude, device.longitude], { icon: sensorIcon })
        .bindTooltip(`${device.name} · ${device.last_reading === null ? 'No reading' : `${device.last_reading} ${device.alert_unit}`}`, { direction: 'top' })
        .addTo(layerRef.current!);
    });
    centers.filter(c => c.status === 'active').forEach(c => {
      L.marker([c.latitude, c.longitude], { icon: shelterIcon })
        .bindTooltip(c.name, { direction: 'top' })
        .addTo(layerRef.current!);
    });
  }, [reports, centers, devices, pulsingReportIds]);

  useEffect(() => {
    const timer = window.setInterval(() => void loadData(), 15000);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const openCount = reports.filter(r => r.status === 'open').length;
  const inProgressCount = reports.filter(r => r.status === 'in_progress').length;

  return (
    <div className={embedded
      ? 'flex h-full min-h-[390px] flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm'
      : 'flex h-[calc(100vh-56px)] flex-col'}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0 gap-3">
        <div>
          <h1 className="text-sm font-bold">{embedded ? 'Incident & Flood Monitoring Map' : 'Live Incident Map'}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] text-muted-foreground">
              <span className="text-[hsl(var(--severity-critical))] font-medium">{openCount}</span> open ·{' '}
              <span className="text-[hsl(var(--severity-high))] font-medium">{inProgressCount}</span> in progress
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setShowLegend(v => !v)}>
            <Layers className="h-3.5 w-3.5 mr-1" />Legend
          </Button>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <div ref={mapDivRef} className="absolute inset-0" />

        {/* Legend */}
        {showLegend && (
          <div className="absolute bottom-4 left-3 z-[1000] min-w-[160px] rounded border border-slate-200 bg-white/95 p-3 text-slate-700 shadow-lg backdrop-blur">
            <p className="text-xs font-semibold mb-2">Legend</p>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-red-700 ring-2 ring-red-100" />Emergency report</div>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-blue-100" />Flood sensor</div>
            <div className="mb-1 flex items-center gap-2 text-xs"><span className="h-3 w-3 rounded-full bg-slate-500 ring-2 ring-slate-100" />Evacuation center</div>
            <div className="flex items-center gap-2 text-xs"><span className="h-0 w-5 border-t-2 border-dashed border-slate-500" />Municipal boundary</div>
          </div>
        )}

        {/* Selected report panel */}
        {selected && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-[1000] bg-card/95 backdrop-blur border border-border rounded p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold capitalize">{selected.emergency_type} Emergency</h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Severity</span>
                <span className={`severity-${selected.severity} font-medium capitalize`}>{selected.severity}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Status</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium status-${selected.status}`}>{selected.status.replace('_',' ')}</span>
              </div>
              {selected.description && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-16 shrink-0">Details</span>
                  <span className="text-muted-foreground line-clamp-2">{selected.description}</span>
                </div>
              )}
              {selected.latitude !== null && selected.longitude !== null && (
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-16 shrink-0">GPS</span>
                  <span>{selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-muted-foreground w-16 shrink-0">Reported</span>
                <span>{format(new Date(selected.created_at), 'MMM d, h:mm a')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
