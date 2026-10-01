/** Spreadsheet text must never be interpreted as a formula. Numbers stay numeric. */
export function escapeCsvCell(value: string | number): string {
  let text=String(value)
  if(typeof value==='string' && (/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))) text="'"+text
  return `"${text.replace(/"/g,'""')}"`
}
