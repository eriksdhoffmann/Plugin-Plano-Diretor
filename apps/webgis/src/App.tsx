import { useEffect, useState } from 'react';
import { HomeView } from './componentes/HomeView';
import { MunicipalityWorkspace } from './componentes/MunicipalityWorkspace';

function readIbgeFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  const match = hash.match(/^municipio\/(\d{7})$/);
  return match ? match[1] : null;
}

export default function App() {
  const [selectedIbge, setSelectedIbge] = useState<string | null>(() => readIbgeFromHash());

  useEffect(() => {
    const onHashChange = () => setSelectedIbge(readIbgeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigateToMunicipio = (codigoIbge: string) => {
    window.location.hash = `municipio/${codigoIbge}`;
    setSelectedIbge(codigoIbge);
  };

  const navigateHome = () => {
    window.location.hash = '';
    setSelectedIbge(null);
  };

  if (selectedIbge) {
    return (
      <MunicipalityWorkspace
        codigoIbge={selectedIbge}
        onBackHome={navigateHome}
        onChangeMunicipio={navigateToMunicipio}
      />
    );
  }

  return <HomeView onSelectMunicipio={navigateToMunicipio} />;
}
