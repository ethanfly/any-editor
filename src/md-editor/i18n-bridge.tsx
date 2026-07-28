import React, { useState } from 'react';
import { I18nProvider } from './i18n.jsx';

/** Always-zh provider so horseMD Editor can call useI18n without App wiring. */
export function MdEditorI18n({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState('zh');
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      {children}
    </I18nProvider>
  );
}
