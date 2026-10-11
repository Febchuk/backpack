/** The HTML overlay that sits on top of the Phaser canvas, plus a tiny element helper. */

const CSS = `
#ui { position: absolute; inset: 0; pointer-events: none; font: bold 14px/1.35 ui-monospace, "Courier New", monospace;
  color: #fff7e8; z-index: 10; }
#ui .panel { position: absolute; pointer-events: auto; background: #2b2140; border: 4px solid #f4e4c1;
  box-shadow: 4px 4px 0 #000; padding: 10px 12px; }
#ui .hidden { display: none !important; }
#ui h3 { margin: 0 0 6px; font-size: 14px; color: #ffd6a5; text-transform: uppercase; letter-spacing: 1px; }
#ui .small { font-size: 12px; color: #c9b8e8; }
#ui button { font: inherit; background: #ffd6a5; color: #2b2140; border: 3px solid #000; box-shadow: 3px 3px 0 #000;
  padding: 4px 10px; cursor: pointer; }
#ui button:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
#ui input { font: inherit; background: #fff7e8; color: #2b2140; border: 3px solid #000; padding: 4px 6px; outline: none; }

#ui .hud { left: 8px; top: 8px; padding: 6px 10px; }
#ui .keys { right: 8px; bottom: 8px; padding: 4px 8px; }
#ui .skip { position: absolute; right: 8px; top: 8px; pointer-events: auto; }
#ui .dialogue { left: 16px; right: 16px; bottom: 12px; min-height: 84px; }
#ui .dialogue .fr { font-size: 16px; min-height: 22px; }
#ui .dialogue .hint { color: #a5ffd6; font-size: 12px; margin-top: 4px; }
#ui .phone { right: 12px; top: 56px; width: 240px; max-height: 330px; overflow-y: auto; background: #1e1830; }
#ui .phone .msg { background: #3d6b8f; padding: 4px 6px; margin: 4px 0; border: 2px solid #000; }
#ui .backpack { left: 12px; top: 88px; width: 280px; }
#ui .backpack .item { border: 2px solid #000; background: #6b4f2a; padding: 4px 6px; margin: 4px 0; }
#ui .backpack .item.new { background: #a8742f; animation: pop 0.5s ease-out, glow 1s ease-in-out 0.5s 3; }
@keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: none; } }
@keyframes glow { 0%, 100% { box-shadow: 0 0 0 #ffd6a5; } 50% { box-shadow: 0 0 10px 3px #ffd6a5; } }
#ui .phoneform { left: 50%; top: 50%; transform: translate(-50%, -50%); width: 340px; }
#ui .phoneform form { display: flex; gap: 6px; margin-top: 8px; }
#ui .phoneform input { flex: 1; }
#ui .talk { left: 50%; bottom: 120px; transform: translateX(-50%); width: 480px; }
#ui .talk input { width: calc(100% - 18px); margin-top: 6px; }
#ui .toast { position: absolute; left: 50%; top: 56px; transform: translateX(-50%); background: #000; padding: 6px 12px;
  border: 3px solid #ffd6a5; }
#ui .phoneicon { left: 8px; top: 48px; padding: 2px 8px; font-size: 18px; cursor: pointer; }
#ui .banner { position: absolute; left: 50%; top: 96px; transform: translateX(-50%); background: #2f6b4f; padding: 8px 14px;
  border: 3px solid #fff8e7; box-shadow: 4px 4px 0 #000; font-size: 16px; animation: ring 0.9s ease-in-out infinite; }
#ui .rec { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: #000; color: #ff4d4d;
  padding: 4px 12px; border: 3px solid #ff4d4d; letter-spacing: 2px; animation: rec 0.8s ease-in-out infinite; }
@keyframes rec { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes ring { 0%, 100% { transform: translateX(-50%) rotate(0); } 10% { transform: translateX(-50%) rotate(-2deg); }
  20% { transform: translateX(-50%) rotate(2deg); } 30% { transform: translateX(-50%) rotate(0); } }
#ui .buzz { animation: buzz 0.12s linear 0s 5; }
@keyframes buzz { 0% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 100% { transform: none; } }
`;

let root: HTMLElement | null = null;

export function uiRoot(): HTMLElement {
  if (root) return root;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  root = el("div");
  root.id = "ui";
  (document.getElementById("stage") ?? document.body).appendChild(root);
  return root;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function setVisible(node: HTMLElement, visible: boolean) {
  node.classList.toggle("hidden", !visible);
}

export function isVisible(node: HTMLElement): boolean {
  return !node.classList.contains("hidden");
}
