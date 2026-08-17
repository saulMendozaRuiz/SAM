export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No se encontró el elemento #${id}`);
  return element as T;
}

export function query<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`No se encontró el elemento ${selector}`);
  return element as T;
}

export function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null;
}
