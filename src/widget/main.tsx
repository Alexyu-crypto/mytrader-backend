import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SignalWidget } from '@/widget/SignalWidget';
import { parseWidgetOptions } from '@/widget/widgetConfig';
import '@/index.css';

const options = parseWidgetOptions(window.location.search);
document.documentElement.lang = options.lang === 'en' ? 'en' : options.lang === 'zh-cn' ? 'zh-CN' : 'zh-HK';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SignalWidget options={options} />
  </StrictMode>
);
