// Tiny DOM helpers shared by the UI screens.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const LOGO = (cls = '') =>
  `<div class="logo ${cls}" aria-label="Cars x Aura"><span class="l-cars">CARS</span><span class="l-x">x</span><span class="l-aura">AURA</span></div>`;

/** Pakistan flag (inline SVG via CSS — flag emoji don't render on Windows). */
export const PK = '<i class="pk-flag" role="img" aria-label="Pakistan flag"></i>';

export const CREDIT_HTML = `
  <p class="credit-title">Cars x Aura</p>
  <p>Created and developed by <b>Saif Ur Rehman</b><br>Student and aspiring game developer from Pakistan ${PK}</p>
  <p class="muted">Passionate about game development, 3D graphics, animation, and interactive web experiences.</p>`;

/** Segmented control: options [{value, label}] -> element with onChange(value). */
export function segmented(options, value, onChange) {
  const wrap = el('<div class="seg" role="radiogroup"></div>');
  for (const o of options) {
    const b = el(`<button type="button" role="radio" data-v="${esc(o.value)}">${esc(o.label)}</button>`);
    if (o.value === value) b.classList.add('on');
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      onChange(o.value);
    });
    wrap.appendChild(b);
  }
  wrap.set = (v) => wrap.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === String(v)));
  return wrap;
}

/** Number stepper. */
export function stepper(min, max, value, onChange, fmt = (v) => v) {
  const wrap = el(`<div class="stepper"><button type="button" aria-label="decrease">−</button><span></span><button type="button" aria-label="increase">+</button></div>`);
  const [dec, inc] = wrap.querySelectorAll('button');
  const span = wrap.querySelector('span');
  let v = value;
  const render = () => {
    span.textContent = fmt(v);
    dec.disabled = v <= min;
    inc.disabled = v >= max;
  };
  dec.addEventListener('click', () => {
    v = Math.max(min, v - 1);
    render();
    onChange(v);
  });
  inc.addEventListener('click', () => {
    v = Math.min(max, v + 1);
    render();
    onChange(v);
  });
  render();
  wrap.set = (n) => {
    v = n;
    render();
  };
  return wrap;
}
