// pdfjs-dist nécessite un worker dédié — chargé en asset Vite, jamais dans le bundle principal
// (ce module n'est importé que par les 2 parseurs PDF grossiste, eux-mêmes chargés à la demande).
import { GlobalWorkerOptions } from 'pdfjs-dist'
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl
