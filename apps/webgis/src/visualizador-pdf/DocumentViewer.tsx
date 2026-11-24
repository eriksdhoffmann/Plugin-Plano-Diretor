import { useEffect, useState } from 'react';
import { ExternalLink, FileText, Search, Upload } from 'lucide-react';
import { apiClient } from '../api/client';
import type { ChunkDocumental, DocumentoMunicipal, MunicipioDetalhe } from '../types/domain';

interface DocumentViewerProps {
  municipio: MunicipioDetalhe;
  onRefreshMunicipio: () => void;
}

export function DocumentViewer({ municipio, onRefreshMunicipio }: DocumentViewerProps) {
  const [docs, setDocs] = useState<DocumentoMunicipal[]>(municipio.documentos);
  const [chunks, setChunks] = useState<ChunkDocumental[]>([]);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [selectedUrl, setSelectedUrl] = useState<string | null>(
    municipio.url_pdf || municipio.documentos.find((d) => d.url)?.url || null
  );
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  useEffect(() => {
    setDocs(municipio.documentos);
    setSelectedUrl(municipio.url_pdf || municipio.documentos.find((d) => d.url)?.url || null);
    apiClient
      .obterDocumentosMunicipio(municipio.codigo_ibge)
      .then((res) => {
        setDocs(res.documentos);
        setChunks(res.trechos_indexados);
      })
      .catch(() => setChunks([]));
  }, [municipio.codigo_ibge, municipio.documentos, municipio.url_pdf]);

  const chunksFiltrados = chunks.filter((c) => {
    if (!filtroTexto.trim()) return true;
    const q = filtroTexto.toLowerCase();
    return (
      c.texto_literal.toLowerCase().includes(q) ||
      (c.lei || '').toLowerCase().includes(q) ||
      (c.artigo || '').toLowerCase().includes(q)
    );
  });

  const handleUploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await apiClient.processarPDF(
        municipio.codigo_ibge,
        file,
        file.name.replace(/\.pdf$/i, ''),
        municipio.lei_principal ?? undefined
      );
      setUploadResult(
        `PDF processado: ${res.total_paginas} página(s), ${res.chunks_indexados} trecho(s) indexado(s), confiança média ${res.confianca_media}.`
      );
      const refreshed = await apiClient.obterDocumentosMunicipio(municipio.codigo_ibge);
      setDocs(refreshed.documentos);
      setChunks(refreshed.trechos_indexados);
      onRefreshMunicipio();
    } catch (err) {
      setUploadResult(`Falha no processamento: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      {/* Barra superior de documentos e upload/extração */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Documentação Legal e Extração — {municipio.nome}/{municipio.uf}
          </h3>
          <p className="text-xs text-slate-500">
            {municipio.lei_principal || 'Plano Diretor não localizado nas fontes consultadas.'}
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <Upload className="h-3.5 w-3.5 text-sky-700" />
          {uploading ? 'Processando PDF...' : 'Processar PDF do Plano Diretor'}
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUploadPdf}
            className="hidden"
            disabled={uploading}
          />
        </label>
      </div>

      {uploadResult && (
        <div className="border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-900">
          {uploadResult}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Lista de atos + visualizador de fonte/PDF */}
        <div className="flex min-h-0 flex-col border-b border-slate-200 lg:border-r lg:border-b-0">
          <div className="max-h-52 space-y-2 overflow-y-auto border-b border-slate-200 bg-white p-3">
            {docs.length === 0 ? (
              <p className="text-xs text-slate-500">
                Plano Diretor não localizado nas fontes consultadas. Você pode anexar um PDF oficial
                acima para extração e consulta imediata.
              </p>
            ) : (
              docs.map((doc, idx) => (
                <div
                  key={`${doc.titulo}-${idx}`}
                  className={`rounded-lg border p-2.5 text-xs transition ${
                    selectedUrl && doc.url === selectedUrl
                      ? 'border-sky-500 bg-sky-50/50'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-slate-900">{doc.titulo}</div>
                    {doc.url && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedUrl(doc.url || null)}
                          className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-800 hover:bg-slate-300"
                        >
                          Pré-visualizar
                        </button>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-sky-700 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-sky-800"
                        >
                          Abrir <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                    {doc.lei_numero && <span>Lei: {doc.lei_numero}</span>}
                    {doc.fonte_oficial && <span>Fonte: {doc.fonte_oficial}</span>}
                    {doc.data_verificacao && <span>Verificado: {doc.data_verificacao}</span>}
                    {doc.confianca_extracao !== null && doc.confianca_extracao !== undefined && (
                      <span>Confiança extração: {Math.round(doc.confianca_extracao * 100)}%</span>
                    )}
                  </div>
                  {doc.observacao && <p className="mt-1 text-[11px] text-slate-600">{doc.observacao}</p>}
                </div>
              ))
            )}
          </div>

          <div className="relative min-h-[260px] flex-1 bg-slate-200">
            {selectedUrl ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200">
                  <span className="truncate">Visualizador externo/integrado: {selectedUrl}</span>
                  <a
                    href={selectedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 shrink-0 text-sky-300 hover:underline"
                  >
                    Abrir em nova aba ↗
                  </a>
                </div>
                <iframe
                  src={selectedUrl}
                  title="Visualizador de Documento Legal"
                  className="h-full w-full flex-1 bg-white"
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-xs text-slate-500">
                Selecione um documento com URL ou envie um PDF oficial para pré-visualização.
              </div>
            )}
          </div>
        </div>

        {/* Texto literal e trechos indexados com rastreabilidade */}
        <div className="flex min-h-0 flex-col bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 p-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              placeholder="Pesquisar artigos, zonas ou dispositivos indexados..."
              className="w-full text-xs text-slate-800 outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
            {chunksFiltrados.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                <FileText className="mx-auto mb-1.5 h-5 w-5 text-slate-400" />
                Nenhum trecho indexado encontrado para o filtro atual.
              </div>
            ) : (
              chunksFiltrados.map((chunk) => (
                <div
                  key={chunk.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {chunk.lei} {chunk.artigo ? `• ${chunk.artigo}` : ''}
                    </span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Texto Literal • Conf. {Math.round(chunk.confianca * 100)}%
                    </span>
                  </div>
                  {(chunk.anexo || chunk.pagina) && (
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {chunk.anexo ? `${chunk.anexo} ` : ''}
                      {chunk.pagina ? `• Página ${chunk.pagina}` : ''}
                    </div>
                  )}
                  <p className="mt-2 leading-relaxed text-slate-700">{chunk.texto_literal}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
