export interface ShareContent {
  url: string;
  title: string;
  text: string;
  campaign: string;
}

export type Channel = 'whatsapp' | 'telegram' | 'facebook' | 'x' | 'linkedin' | 'line' | 'email';

export function withUtm(url: string, source: string, campaign: string): string {
  const u = new URL(url);
  u.searchParams.set('utm_source', source);
  u.searchParams.set('utm_medium', 'social');
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

export function channelUrl(channel: Channel, content: ShareContent): string {
  const link = withUtm(content.url, channel, content.campaign);
  const url = encodeURIComponent(link);
  const text = encodeURIComponent(content.text);
  switch (channel) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodeURIComponent(`${content.text}\n${link}`)}`;
    case 'telegram':
      return `https://t.me/share/url?url=${url}&text=${text}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    case 'linkedin':
      return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    case 'line':
      return `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
    case 'email':
      return `mailto:?subject=${encodeURIComponent(content.title)}&body=${encodeURIComponent(`${content.text}\n\n${link}`)}`;
  }
}

export function siteUrl(agentSlug?: string | null): string {
  return `${window.location.origin}${agentSlug ? `/a/${agentSlug}` : '/'}`;
}

export function siteShare(campaign: string, agentSlug?: string | null): ShareContent {
  return {
    url: siteUrl(agentSlug),
    campaign,
    title: 'MyTrader Tools · MT4/MT5 copy trading signals',
    text: 'Follow live MT4/MT5 trading signals and copy them automatically across any broker on MyTrader Tools. 即時跟單交易信號，支援 MT4/MT5 及多個經紀商，免費註冊查看。',
  };
}
