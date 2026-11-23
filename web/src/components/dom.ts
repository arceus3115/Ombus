export function byId<Tag extends HTMLElement = HTMLElement>(id: string): Tag {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as Tag;
}

export function node<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  className?: string,
  value?: string,
): HTMLElementTagNameMap[Tag] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  return element;
}

export function headingLink(label: string, href: string, className?: string): HTMLAnchorElement {
  const link = node('a', className, label);
  link.href = href;
  return link;
}
