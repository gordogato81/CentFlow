export function renderTooltipLines(
  container: HTMLElement | null,
  lines: Array<string | number>,
) {
  if (!container) {
    return;
  }

  container.replaceChildren();

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    const row = document.createElement('div');
    row.textContent = String(line);
    fragment.appendChild(row);
  }

  container.appendChild(fragment);
}
