import { supabase } from '@/lib/supabase';

// EA timestamps come from the server clock; this offset corrects for a wrong clock on the viewer's computer.
let offsetMs = 0;

export function serverNow(): number {
  return Date.now() + offsetMs;
}

async function measure(): Promise<void> {
  const sent = Date.now();
  const { data, error } = await supabase.rpc('server_time');
  const received = Date.now();
  if (error || typeof data !== 'string') return;
  const server = new Date(data).getTime();
  if (Number.isNaN(server)) return;
  offsetMs = server - (sent + received) / 2;
}

export function startServerClockSync(): () => void {
  measure();
  const id = window.setInterval(measure, 5 * 60 * 1000);
  return () => window.clearInterval(id);
}
