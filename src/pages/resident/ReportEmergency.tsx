import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { submitReport } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { MapPin, Upload, Loader2, AlertTriangle, X, CheckCircle2, ArrowLeft, ArrowRight, LocateFixed } from 'lucide-react';

const EMERGENCY_TYPES = [
  { value: 'fire', label: 'Fire' },
  { value: 'flood', label: 'Flood' },
  { value: 'medical', label: 'Medical Emergency' },
  { value: 'accident', label: 'Accident' },
  { value: 'landslide', label: 'Landslide' },
  { value: 'earthquake', label: 'Earthquake' },
  { value: 'other', label: 'Other' },
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: 'text-[hsl(var(--severity-low))]' },
  { value: 'moderate', label: 'Moderate', color: 'text-[hsl(var(--severity-moderate))]' },
  { value: 'high', label: 'High', color: 'text-[hsl(var(--severity-high))]' },
  { value: 'critical', label: 'Critical', color: 'text-[hsl(var(--severity-critical))]' },
];

const schema = z.object({
  emergency_type: z.string().min(1, 'Select emergency type'),
  severity: z.string().min(1, 'Select severity level'),
  description: z.string().min(5, 'Describe the emergency'),
  address_text: z.string().optional(),
});
type FormData = z.infer<typeof schema>;
type LocationMethod = 'gps' | 'manual';

export default function ReportEmergency() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [locationMethod, setLocationMethod] = useState<LocationMethod | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const captureGPS = useCallback(() => new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  }), []);

  const detectGPS = useCallback(async () => {
    setLocationMethod('gps');
    setCoords(null);
    setGpsError('');
    setGpsLoading(true);
    try {
      const pos = await captureGPS();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      toast.success('Location captured');
    } catch {
      setGpsError('Could not access your location. Check browser permission and try again, or choose manual address.');
    } finally {
      setGpsLoading(false);
    }
  }, [captureGPS]);

  const continueToDetails = () => {
    if (!locationMethod) {
      toast.error('Choose how you want to provide the incident location.');
      return;
    }
    if (locationMethod === 'gps' && !coords) {
      toast.error('Track your location before continuing.');
      return;
    }
    if (locationMethod === 'manual' && (form.getValues('address_text') ?? '').trim().length < 5) {
      form.setError('address_text', { type: 'manual', message: 'Enter an address or nearby landmark.' });
      return;
    }
    form.clearErrors('address_text');
    setStep(2);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const onSubmit = async (values: FormData) => {
    if (!locationMethod) {
      toast.error('Choose how you want to provide the incident location.');
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      let location = coords;
      if (locationMethod === 'gps') {
        try {
          const position = await captureGPS();
          location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setCoords(location);
        } catch {
          toast.error('Could not refresh your GPS location. Retry tracking or choose a manual address.');
          setStep(1);
          return;
        }
      }
      setUploading(Boolean(photoFile));
      const { error } = await submitReport({
        emergency_type: values.emergency_type as never,
        severity: values.severity as never,
        description: values.description,
        latitude: location?.lat ?? null,
        longitude: location?.lng ?? null,
        address_text: locationMethod === 'manual' ? (values.address_text ?? '').trim() : '',
        photo_url: null,
        photo: photoFile,
      });

      if (error) { toast.error(error.message); return; }
      toast.success('Emergency report submitted. LDRRMO has been notified.');
      navigate('/resident/my-reports');
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#f2f4f5] px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <p className="mb-1 text-xs uppercase tracking-widest text-slate-700">Resident Portal</p>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[hsl(var(--severity-critical))] shrink-0" />
          Report Emergency
        </h1>
        <p className="mt-1 text-sm text-slate-700">
          LDRRMO responders will be notified immediately upon submission.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={event => {
            if (step === 1) {
              event.preventDefault();
              continueToDetails();
              return;
            }
            void form.handleSubmit(onSubmit)(event);
          }}
          className="space-y-5"
        >
          <div className="mb-6 flex items-center gap-3" aria-label={`Step ${step} of 2`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? 'bg-[#89151f] text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {step === 1 ? '1' : <CheckCircle2 className="h-4 w-4" />}
            </span>
            <span className={`h-0.5 flex-1 ${step === 2 ? 'bg-[#89151f]' : 'bg-slate-200'}`} />
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
            <span className={`text-xs font-medium ${step === 2 ? 'text-slate-900' : 'text-slate-600'}`}>
              {step === 1 ? 'Location' : 'Emergency details'}
            </span>
          </div>

          {step === 1 ? (
            <section className="space-y-4" aria-labelledby="location-step-heading">
              <div>
                <h2 id="location-step-heading" className="text-lg font-bold text-slate-900">Where is the emergency?</h2>
                <p className="mt-1 text-sm text-slate-700">Choose how you want to share the incident location.</p>
              </div>

              <button
                type="button"
                aria-pressed={locationMethod === 'gps'}
                onClick={() => { setLocationMethod('gps'); setCoords(null); setGpsError(''); }}
                className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${locationMethod === 'gps' ? 'border-[#89151f] bg-[#89151f]/5 ring-1 ring-[#89151f]' : 'border-slate-300 bg-white hover:border-[#89151f]/60'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${locationMethod === 'gps' ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <LocateFixed className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Use my current location</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-700">Use your device GPS to include coordinates for responders.</span>
                </span>
              </button>

              <button
                type="button"
                aria-pressed={locationMethod === 'manual'}
                onClick={() => { setLocationMethod('manual'); setCoords(null); setGpsError(''); }}
                className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${locationMethod === 'manual' ? 'border-[#89151f] bg-[#89151f]/5 ring-1 ring-[#89151f]' : 'border-slate-300 bg-white hover:border-[#89151f]/60'}`}
              >
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${locationMethod === 'manual' ? 'bg-[#89151f] text-white' : 'bg-slate-100 text-slate-700'}`}>
                  <MapPin className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Enter a location manually</span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-700">Add a barangay, street, or nearby landmark.</span>
                </span>
              </button>

              {locationMethod === 'gps' && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  {coords ? (
                    <div className="flex items-start gap-2 text-sm text-slate-900">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div>
                        <p className="font-semibold">Location captured</p>
                        <p className="mt-1 break-all text-xs text-slate-700">
                          {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} · accuracy about {Math.round(coords.accuracy)} m
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700">
                      GPS accuracy depends on your device and surroundings. Allow location access when prompted.
                    </p>
                  )}
                  <Button type="button" onClick={() => void detectGPS()} disabled={gpsLoading} className="h-10 w-full bg-[#89151f] text-white hover:bg-[#70111a]">
                    {gpsLoading
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finding your location…</>
                      : <><LocateFixed className="mr-2 h-4 w-4" />{coords ? 'Update my location' : 'Track my location'}</>
                    }
                  </Button>
                  {gpsError && <p role="alert" className="text-xs font-medium text-red-700">{gpsError}</p>}
                </div>
              )}

              {locationMethod === 'manual' && (
                <FormField control={form.control} name="address_text" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-slate-900">Incident location or landmark</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Brgy. Poblacion, near the school" className="h-11 border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 border-slate-300 bg-white text-slate-900 hover:bg-slate-100" onClick={() => navigate('/resident')}>
                  Cancel
                </Button>
                <Button type="button" className="flex-1 bg-[#89151f] text-white hover:bg-[#70111a]" disabled={gpsLoading || (locationMethod === 'gps' && !coords)} onClick={continueToDetails}>
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </section>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex min-w-0 items-start gap-2 text-sm text-slate-900">
                  {locationMethod === 'gps' ? <LocateFixed className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />}
                  <div className="min-w-0">
                    <p className="font-semibold">{locationMethod === 'gps' ? 'GPS location selected' : 'Manual location selected'}</p>
                    <p className="break-all text-xs text-slate-700">
                      {locationMethod === 'gps' && coords
                        ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} · accuracy about ${Math.round(coords.accuracy)} m`
                        : locationMethod === 'manual' ? form.getValues('address_text') : ''}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs text-[#89151f]" onClick={() => setStep(1)}>Change</Button>
              </div>

              <FormField control={form.control} name="emergency_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Emergency Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl><SelectTrigger className="border-slate-300 bg-white text-slate-900"><SelectValue placeholder="Select type…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {EMERGENCY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="severity" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Severity Level</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl><SelectTrigger className="border-slate-300 bg-white text-slate-900"><SelectValue placeholder="Select severity…" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {SEVERITY_LEVELS.map(s => (
                        <SelectItem key={s.value} value={s.value}>
                          <span className={s.color}>{s.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-slate-900">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the emergency situation, number of people affected, and any other relevant details…"
                      className="min-h-[100px] resize-none border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div>
                <p className="mb-2 text-sm font-medium text-slate-900">Photo Evidence <span className="font-normal text-slate-700">(optional)</span></p>
                {photoPreview ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded border border-slate-300 bg-slate-100">
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-slate-900 hover:bg-white">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded border border-dashed border-slate-300 p-8 text-slate-800 transition-colors hover:border-[#89151f]/50 hover:bg-[#89151f]/5">
                    <Upload className="h-5 w-5" />
                    <span className="text-xs">Click to attach photo (max 5MB)</span>
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>

              {uploading && (
                <div className="flex items-center gap-2 text-xs text-slate-800">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading photo…
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 border-slate-300 bg-white text-slate-900 hover:bg-slate-100" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />Back
                </Button>
                <Button type="submit" className="flex-1 bg-[#89151f] text-white hover:bg-[#70111a]" disabled={submitting || uploading}>
                  {submitting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><AlertTriangle className="mr-2 h-4 w-4" />Submit Report</>
                  }
                </Button>
              </div>
            </>
          )}
        </form>
      </Form>

      {/* Offline notice */}
      <p className="mt-6 text-center text-xs text-slate-700">
        Reports are stored offline and auto-submitted when connectivity is restored.
      </p>
      </div>
    </div>
  );
}
