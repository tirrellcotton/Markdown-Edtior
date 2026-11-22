/** Finds a required element and verifies its browser element type. */
export function element<T extends Element>(selector: string, type: { new (): T }, root: ParentNode = document): T {
  const found = root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`Missing editor element: ${selector}`);
  return found;
}

