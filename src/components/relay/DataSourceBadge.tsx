import { useEffect, useState } from 'react';
import { FlaskConical, Radio } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { dataSourceLabel, gatewayLive, RELAY_TEST_GROUP, type RelayEngine } from '@/lib/relay';

export function DataSourceBadge() {
  const [engine, setEngine] = useState<RelayEngine | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('relay_groups')
      .select('engine, gateway_seen_at')
      .eq('name', RELAY_TEST_GROUP)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        setEngine(data.engine as RelayEngine);
        setSeenAt(data.gateway_seen_at);
      });
    return () => {
      active = false;
    };
  }, []);

  const relay = engine ? dataSourceLabel(engine, gatewayLive(seenAt)) : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
        <Radio className="h-3 w-3" /> Data source 數據來源: MetaAPI / EA
      </span>
      {relay && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300">
          <FlaskConical className="h-3 w-3" /> Relay Test: {relay.label}
          {relay.ready ? ' · 已接入' : ' · 未接入'}
        </span>
      )}
    </div>
  );
}
