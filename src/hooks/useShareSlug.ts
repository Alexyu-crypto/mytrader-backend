import { createContext, useContext } from 'react';

export const ShareSlugContext = createContext<string | null>(null);

export function useShareSlug(): string | null {
  return useContext(ShareSlugContext);
}
