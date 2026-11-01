import { useState } from 'react';
import { logoUrl, type Brand } from '@/lib/agents';

export function BrandMark({ brand, className = 'h-9 w-9', overridePath }: { brand: Pick<Brand, 'brand_name' | 'brand_color' | 'logo_path'>; className?: string; overridePath?: string | null }) {
  const src = logoUrl(overridePath === undefined ? brand.logo_path : overridePath);
  const [failed, setFailed] = useState<string | null>(null);

  if (src && failed !== src) {
    return <img src={src} alt={brand.brand_name} onError={() => setFailed(src)} className={`${className} shrink-0 rounded-xl object-contain`} />;
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-xl text-base font-bold uppercase text-black shadow-lg`}
      style={{ backgroundColor: brand.brand_color }}
    >
      {brand.brand_name.trim().charAt(0) || '?'}
    </div>
  );
}
