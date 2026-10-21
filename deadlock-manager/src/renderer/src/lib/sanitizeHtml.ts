/** Tag mantenuti nelle descrizioni delle mod; tutti gli altri vengono sostituiti dal loro testo. */
const ALLOWED = new Set([
  'A', 'B', 'BR', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'CODE', 'PRE', 'SPAN', 'DIV', 'HR'
])

/** Elementi il cui contenuto va scartato del tutto. */
const DROPPED = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'TEMPLATE'])

function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '')
  if (!(node instanceof Element) || DROPPED.has(node.tagName)) return null

  const children = [...node.childNodes].map((c) => clean(c, doc)).filter((c): c is Node => !!c)
  if (!ALLOWED.has(node.tagName)) {
    const fragment = doc.createDocumentFragment()
    fragment.append(...children)
    return fragment
  }

  // nessun attributo, tranne un href web per i link (aperti nel browser esterno)
  const el = doc.createElement(node.tagName)
  const href = node.getAttribute('href')
  if (node.tagName === 'A' && href && /^https?:\/\//i.test(href)) {
    el.setAttribute('href', href)
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noreferrer')
  }
  el.append(...children)
  return el
}

/** Rimuove dall'HTML delle descrizioni tutto tranne la formattazione di base e i link. */
export function sanitizeHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, 'text/html')
  const out = document.implementation.createHTMLDocument('')
  const root = out.createElement('div')
  for (const child of source.body.childNodes) {
    const cleaned = clean(child, out)
    if (cleaned) root.append(cleaned)
  }
  return root.innerHTML
}
