// Simple HTML-table -> Excel/Word compatible .xls download.
// Opens in Excel and Word for editing.

export function escXls(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function downloadXls(title: string, bodyHtml: string) {
  const now = new Date();
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escXls(title)}</title>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escXls(title).slice(0,31)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body style="font-family:Calibri,Arial,sans-serif">
<h1 style="font-size:18px;margin:0 0 4px">${escXls(title)}</h1>
<p style="color:#555;font-size:11px;margin:0 0 12px">${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
${bodyHtml}
</body></html>`;
  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\w\-]+/g, "_")}_${now.toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function xlsTable(headers: string[], rows: (string | number | null | undefined)[][]) {
  const th = headers.map((h) => `<th style="padding:6px;border:1px solid #000;background:#f3f4f6;text-align:left">${escXls(h)}</th>`).join("");
  const trs = rows.length === 0
    ? `<tr><td colspan="${headers.length}" style="padding:6px;border:1px solid #999;color:#666;font-style:italic">Nenhum item</td></tr>`
    : rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px;border:1px solid #999">${escXls(c)}</td>`).join("")}</tr>`).join("");
  return `<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:12px;margin-bottom:14px"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

export function xlsSectionHeader(title: string) {
  return `<h2 style="margin:14px 0 6px;font-size:14px;background:#1f2937;color:#fff;padding:6px 10px">${escXls(title)}</h2>`;
}
