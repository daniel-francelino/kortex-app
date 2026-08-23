// Zero-dependency export helpers — Markdown via Blob + <a download>, PDF via
// o diálogo de impressão nativo do navegador ("Salvar como PDF"), evitando
// puxar uma lib de geração de PDF só pra isso.

export function downloadTextFile(filename: string, content: string, mimeType = 'text/markdown;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// `html` já vem renderizado (ex.: o `.innerHTML` de um NotionEditor
// somente-leitura já montado) — evita reimplementar um gerador de HTML a
// partir do JSON do Tiptap só pra impressão.
export function printHtmlAsPdf(title: string, html: string): void {
  const win = window.open('', '_blank', 'width=820,height=1000')
  if (!win) return

  win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px 60px; line-height: 1.6; color: #111827; }
  h1.export-title { margin-bottom: 0.2em; }
  h1, h2, h3, h4 { margin-top: 1.4em; margin-bottom: 0.4em; }
  p { margin: 0.6em 0; }
  img { max-width: 100%; border-radius: 6px; }
  pre { background: #f4f4f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
  code { background: #f4f4f5; padding: 0.15em 0.35em; border-radius: 4px; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 0; padding-left: 1em; color: #52525b; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  td, th { border: 1px solid #e4e4e7; padding: 6px 10px; text-align: left; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0.5em; }
  @media print { a { color: inherit; text-decoration: none; } }
</style>
</head>
<body>
<h1 class="export-title">${title}</h1>
${html}
</body>
</html>`)
  win.document.close()
  win.focus()
  // Dá tempo do layout assentar (imagens, fontes) antes de abrir o diálogo
  // de impressão — chamar print() cedo demais corta imagem grande no meio.
  setTimeout(() => win.print(), 350)
}
