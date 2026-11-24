import { useEffect, useState } from 'react';
import { GeoportalShell } from './componentes/GeoportalShell';
import { HomeView } from './componentes/HomeView';

function readIbgeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const qIbge = params.get('ibge');
  if (qIbge && /^\d{7}$/.test(qIbge)) return qIbge;

  const hash = window.location.hash.replace(/^#/, '');
  const match = hash.match(/^municipio\/(\d{7})$/);
  return match ? match[1] : null;
}

export default function App() {
  const [selectedIbge, setSelectedIbge] = useState<string | null>(() => readIbgeFromUrl());

  useEffect(() => {
    const onHashChange = () => setSelectedIbge(readIbgeFromUrl());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateToMunicipio = (codigoIbge: string) => {
    window.location.hash = `municipio/${codigoIbge}`;
    setSelectedIbge(codigoIbge);
  };

  const navigateHome = () => {
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    window.location.hash = '';
    setSelectedIbge(null);
  };

  if (selectedIbge) {
    return (
      <GeoportalShell
        codigoIbge={selectedIbge}
        onBackHome={navigateHome}
        onChangeMunicipio={navigateToMunicipio}
      />
    );
  }

  return <HomeView onSelectMunicipio={navigateToMunicipio} />;
}
