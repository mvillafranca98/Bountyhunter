// Minimal .docx generator — no npm dependencies
// A .docx is a ZIP file containing XML files

export function markdownToOOXML(markdown, name, email, location) {
  const lines = markdown.split('\n')
  const paragraphs = []

  // Header with name
  paragraphs.push({
    text: name,
    style: 'title',
  })

  // Contact info
  if (email || location) {
    paragraphs.push({
      text: [email, location].filter(Boolean).join(' \u00B7 '),
      style: 'subtitle',
    })
  }

  paragraphs.push({ text: '', style: 'normal' }) // spacer

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      paragraphs.push({ text: '', style: 'normal' })
      continue
    }

    // Skip name/contact if already in header (first few lines of resume often repeat these)
    if (trimmed === name || trimmed === email) continue

    if (trimmed.startsWith('# ')) {
      paragraphs.push({ text: trimmed.slice(2), style: 'heading1' })
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push({ text: trimmed.slice(3), style: 'heading2' })
    } else if (trimmed.startsWith('### ')) {
      paragraphs.push({ text: trimmed.slice(4), style: 'heading3' })
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('\u2022 ') || trimmed.startsWith('* ')) {
      paragraphs.push({ text: trimmed.slice(2), style: 'bullet' })
    } else if (trimmed.startsWith('---')) {
      paragraphs.push({ text: '', style: 'rule' })
    } else {
      paragraphs.push({ text: trimmed, style: 'normal' })
    }
  }

  return paragraphs
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function paragraphToXml(p) {
  const text = escapeXml(p.text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1'))
  const bold = p.text.includes('**')

  switch (p.style) {
    case 'title':
      return `<w:p><w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="48"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'subtitle':
      return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'heading1':
      return `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="2B579A"/></w:pBdr></w:pPr><w:r><w:rPr><w:b/><w:color w:val="2B579A"/><w:sz w:val="28"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'heading2':
      return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'heading3':
      return `<w:p><w:pPr><w:pStyle w:val="Heading3"/></w:pPr><w:r><w:rPr><w:b/><w:i/><w:sz w:val="22"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'bullet':
      return `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`
    case 'rule':
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="AAAAAA"/></w:pBdr></w:pPr></w:p>`
    default:
      return `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
  }
}

export async function buildDocx(paragraphs) {
  const bodyXml = paragraphs.map(paragraphToXml).join('\n')

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

  const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="\u2022"/>
      <w:lvlJc w:val="left"/>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`

  const files = [
    { path: '[Content_Types].xml', content: contentTypesXml },
    { path: '_rels/.rels', content: relsXml },
    { path: 'word/document.xml', content: documentXml },
    { path: 'word/_rels/document.xml.rels', content: wordRelsXml },
    { path: 'word/numbering.xml', content: numberingXml },
  ]

  return createZip(files)
}

// Minimal ZIP file creator for Cloudflare Workers (no external dependencies)
function createZip(files) {
  const encoder = new TextEncoder()
  const entries = files.map(f => ({
    path: encoder.encode(f.path),
    data: encoder.encode(f.content),
  }))

  const localHeaders = []
  const centralHeaders = []
  let offset = 0

  for (const entry of entries) {
    // Local file header (30 bytes + path + data)
    const localHeader = new Uint8Array(30 + entry.path.length)
    const view = new DataView(localHeader.buffer)
    view.setUint32(0, 0x04034b50, true) // signature
    view.setUint16(4, 20, true) // version needed
    view.setUint16(6, 0, true) // flags
    view.setUint16(8, 0, true) // compression (store)
    view.setUint16(10, 0, true) // mod time
    view.setUint16(12, 0, true) // mod date
    view.setUint32(14, crc32(entry.data), true) // crc32
    view.setUint32(18, entry.data.length, true) // compressed size
    view.setUint32(22, entry.data.length, true) // uncompressed size
    view.setUint16(26, entry.path.length, true) // file name length
    view.setUint16(28, 0, true) // extra field length
    localHeader.set(entry.path, 30)

    localHeaders.push(localHeader)

    // Central directory header (46 bytes + path)
    const centralHeader = new Uint8Array(46 + entry.path.length)
    const cView = new DataView(centralHeader.buffer)
    cView.setUint32(0, 0x02014b50, true) // signature
    cView.setUint16(4, 20, true) // version made by
    cView.setUint16(6, 20, true) // version needed
    cView.setUint16(8, 0, true) // flags
    cView.setUint16(10, 0, true) // compression
    cView.setUint16(12, 0, true) // mod time
    cView.setUint16(14, 0, true) // mod date
    cView.setUint32(16, crc32(entry.data), true) // crc32
    cView.setUint32(20, entry.data.length, true) // compressed size
    cView.setUint32(24, entry.data.length, true) // uncompressed size
    cView.setUint16(28, entry.path.length, true) // file name length
    cView.setUint16(30, 0, true) // extra field length
    cView.setUint16(32, 0, true) // comment length
    cView.setUint16(34, 0, true) // disk start
    cView.setUint16(36, 0, true) // internal attrs
    cView.setUint32(38, 0, true) // external attrs
    cView.setUint32(42, offset, true) // relative offset
    centralHeader.set(entry.path, 46)

    centralHeaders.push(centralHeader)
    offset += localHeader.length + entry.data.length
  }

  // End of central directory (22 bytes)
  const centralDirOffset = offset
  const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0)

  const eocd = new Uint8Array(22)
  const eView = new DataView(eocd.buffer)
  eView.setUint32(0, 0x06054b50, true) // signature
  eView.setUint16(4, 0, true) // disk number
  eView.setUint16(6, 0, true) // central dir disk
  eView.setUint16(8, entries.length, true) // entries on disk
  eView.setUint16(10, entries.length, true) // total entries
  eView.setUint32(12, centralDirSize, true) // central dir size
  eView.setUint32(16, centralDirOffset, true) // central dir offset
  eView.setUint16(20, 0, true) // comment length

  // Concatenate all parts
  const totalSize = offset + centralDirSize + 22
  const result = new Uint8Array(totalSize)
  let pos = 0

  for (let i = 0; i < entries.length; i++) {
    result.set(localHeaders[i], pos)
    pos += localHeaders[i].length
    result.set(entries[i].data, pos)
    pos += entries[i].data.length
  }

  for (const ch of centralHeaders) {
    result.set(ch, pos)
    pos += ch.length
  }

  result.set(eocd, pos)

  return result.buffer
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
