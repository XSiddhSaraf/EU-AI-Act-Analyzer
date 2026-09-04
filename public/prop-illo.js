(() => {
if (customElements.get('prop-illo')) return;
const INK = '#0b0f19', BLUE = '#0e76ff', PALE = '#ffffff', MUTE = '#c9d0dc', TINT = '#dbe7fb', MONO = "'JetBrains Mono',ui-monospace,monospace", SANS = "'Schibsted Grotesk',system-ui,sans-serif";
const docs = () => `
<svg viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" font-family="${SANS}">
  <defs><filter id="s1" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="${INK}" flood-opacity=".08"/></filter></defs>
  <g class="drift" style="--d:0s">
  <g transform="translate(70 120) rotate(-8)" filter="url(#s1)"><rect width="150" height="200" rx="10" fill="${PALE}"/><rect x="18" y="20" width="60" height="6" rx="3" fill="${MUTE}"/><rect x="18" y="38" width="110" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="50" width="100" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="62" width="112" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="74" width="80" height="4" rx="2" fill="#e3e7ee"/><text x="18" y="180" font-family="${MONO}" font-size="10" fill="${INK}" opacity=".6">OECD</text></g>
  <g transform="translate(120 100) rotate(-3)" filter="url(#s1)"><rect width="150" height="200" rx="10" fill="${PALE}"/><rect x="18" y="20" width="70" height="6" rx="3" fill="${MUTE}"/><rect x="18" y="38" width="110" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="50" width="96" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="62" width="112" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="74" width="60" height="4" rx="2" fill="#e3e7ee"/><text x="18" y="180" font-family="${MONO}" font-size="10" fill="${INK}" opacity=".6">ISO 42001</text></g>
  <g transform="translate(175 85) rotate(3)" filter="url(#s1)"><rect width="150" height="200" rx="10" fill="${PALE}"/><rect x="18" y="20" width="56" height="6" rx="3" fill="${MUTE}"/><rect x="18" y="38" width="110" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="50" width="104" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="62" width="90" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="74" width="112" height="4" rx="2" fill="#e3e7ee"/><text x="18" y="180" font-family="${MONO}" font-size="10" fill="${INK}" opacity=".6">NIST AI RMF</text></g>
  <g transform="translate(235 78) rotate(8)" filter="url(#s1)"><rect width="150" height="200" rx="10" fill="${PALE}"/><rect x="18" y="20" width="64" height="6" rx="3" fill="${INK}"/><rect x="18" y="38" width="110" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="50" width="108" height="4" rx="2" fill="${TINT}"/><rect x="18" y="62" width="112" height="4" rx="2" fill="${TINT}"/><rect x="18" y="74" width="72" height="4" rx="2" fill="#e3e7ee"/><rect x="18" y="86" width="112" height="4" rx="2" fill="#e3e7ee"/><text x="18" y="180" font-family="${MONO}" font-size="10" fill="${INK}">EU AI ACT</text>
    <g transform="translate(96 140)"><circle r="22" fill="${BLUE}"/><circle r="22" fill="none" stroke="${BLUE}" stroke-width="2" class="pulse"/><path d="M-9 0l6 6 12-12" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  </g>
  <g transform="translate(60 320)" font-family="${MONO}" font-size="11" fill="${INK}">
    <rect x="-12" y="-18" width="216" height="30" rx="15" fill="${PALE}"/><circle cx="4" cy="-3" r="4" fill="${BLUE}"/><text x="16" y="1" opacity=".75">sha256 · 9f3a…c21e</text><text x="150" y="1" fill="${BLUE}">fresh</text>
  </g>
  <g transform="translate(300 320)" font-family="${MONO}" font-size="11"><rect x="-12" y="-18" width="150" height="30" rx="15" fill="${PALE}"/><text x="2" y="1" fill="${INK}" opacity=".75">refreshed daily</text></g>
</svg>`;
const layers = () => `
<svg viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" font-family="${SANS}">
  <defs><filter id="s2" x="-10%" y="-20%" width="130%" height="150%"><feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="${INK}" flood-opacity=".08"/></filter></defs>
  <g transform="translate(250 230)">
    <g class="float" style="--d:0s"><path d="M-170 0 0 70 170 0 0-70Z" fill="${PALE}" filter="url(#s2)"/><text x="-150" y="-2" font-family="${MONO}" font-size="10" fill="${INK}" opacity=".55" transform="skewY(-22)">source</text>
      <g transform="translate(-20 -10) scale(1 .42) rotate(0)"><rect x="-70" y="-30" width="140" height="6" rx="3" fill="#e3e7ee"/><rect x="-70" y="-14" width="110" height="6" rx="3" fill="#e3e7ee"/><rect x="-70" y="2" width="130" height="6" rx="3" fill="#e3e7ee"/><rect x="-70" y="18" width="80" height="6" rx="3" fill="#e3e7ee"/></g></g>
    <g class="float" style="--d:-.8s" transform="translate(0 -70)"><path d="M-170 0 0 70 170 0 0-70Z" fill="${TINT}" filter="url(#s2)"/><text x="-150" y="-2" font-family="${MONO}" font-size="10" fill="${INK}" opacity=".7" transform="skewY(-22)">heuristic · &lt;1s</text>
      <g transform="translate(0 0) scale(1 .42)"><rect x="-90" y="-10" width="180" height="20" rx="10" fill="${PALE}"/><rect x="-90" y="-10" width="126" height="20" rx="10" fill="${BLUE}" class="bar"/></g></g>
    <g class="float" style="--d:-1.6s" transform="translate(0 -140)"><path d="M-170 0 0 70 170 0 0-70Z" fill="${INK}" filter="url(#s2)"/><text x="-150" y="-2" font-family="${MONO}" font-size="10" fill="#fff" opacity=".7" transform="skewY(-22)">AI analysis</text>
      <g transform="scale(1 .42)"><circle r="46" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="10"/><circle r="46" fill="none" stroke="${BLUE}" stroke-width="10" stroke-dasharray="289" stroke-dashoffset="80" stroke-linecap="round" transform="rotate(-90)" class="ring"/></g>
      <text y="6" text-anchor="middle" font-size="22" font-weight="600" fill="#fff" letter-spacing="-.03em">72</text></g>
  </g>
  <g stroke="${BLUE}" stroke-width="1.5" stroke-dasharray="3 5" class="dash"><line x1="250" y1="300" x2="250" y2="330"/></g>
  <g transform="translate(250 345)" font-family="${MONO}" font-size="11" text-anchor="middle"><rect x="-70" y="-14" width="140" height="28" rx="14" fill="${PALE}"/><text y="4" fill="${INK}" opacity=".75">same view, upgraded</text></g>
</svg>`;
const cards = () => `
<svg viewBox="0 0 500 400" xmlns="http://www.w3.org/2000/svg" font-family="${SANS}">
  <defs><filter id="s3" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="${INK}" flood-opacity=".08"/></filter></defs>
  <g font-family="${MONO}" font-size="10" fill="${INK}" opacity=".5"><text x="50" y="52">GAP</text><text x="200" y="52">MITIGATION</text><text x="360" y="52">DONE</text></g>
  <g transform="translate(50 70)" filter="url(#s3)"><rect width="120" height="86" rx="12" fill="${PALE}"/><rect x="14" y="14" width="34" height="14" rx="7" fill="#fde7ef"/><text x="20" y="24" font-family="${MONO}" font-size="8" fill="#b4004e">Art. 13</text><rect x="14" y="40" width="88" height="5" rx="2.5" fill="#e3e7ee"/><rect x="14" y="52" width="60" height="5" rx="2.5" fill="#e3e7ee"/></g>
  <g transform="translate(50 170)" filter="url(#s3)"><rect width="120" height="86" rx="12" fill="${PALE}"/><rect x="14" y="14" width="34" height="14" rx="7" fill="#fde7ef"/><text x="20" y="24" font-family="${MONO}" font-size="8" fill="#b4004e">Art. 9</text><rect x="14" y="40" width="80" height="5" rx="2.5" fill="#e3e7ee"/><rect x="14" y="52" width="66" height="5" rx="2.5" fill="#e3e7ee"/></g>
  <g class="slide"><g transform="translate(200 70)" filter="url(#s3)"><rect width="140" height="110" rx="12" fill="${INK}"/><rect x="14" y="14" width="44" height="14" rx="7" fill="${BLUE}"/><text x="19" y="24" font-family="${MONO}" font-size="8" fill="#fff">Art. 13</text><rect x="14" y="40" width="104" height="5" rx="2.5" fill="#fff" opacity=".85"/><rect x="14" y="52" width="76" height="5" rx="2.5" fill="#fff" opacity=".5"/>
    <circle cx="26" cy="86" r="10" fill="${TINT}"/><text x="26" y="90" text-anchor="middle" font-size="9" font-weight="600" fill="${INK}">MK</text><rect x="44" y="78" width="60" height="16" rx="8" fill="#fff" fill-opacity=".14"/><text x="52" y="89" font-family="${MONO}" font-size="8" fill="#fff">due 14 Oct</text></g></g>
  <g transform="translate(200 195)" filter="url(#s3)"><rect width="140" height="98" rx="12" fill="${PALE}"/><rect x="14" y="14" width="34" height="14" rx="7" fill="${TINT}"/><text x="21" y="24" font-family="${MONO}" font-size="8" fill="${BLUE}">Art. 10</text><rect x="14" y="40" width="100" height="5" rx="2.5" fill="#e3e7ee"/><circle cx="26" cy="76" r="10" fill="${INK}"/><text x="26" y="80" text-anchor="middle" font-size="9" font-weight="600" fill="#fff">AR</text><rect x="44" y="68" width="60" height="16" rx="8" fill="#eef1f6"/><text x="52" y="79" font-family="${MONO}" font-size="8" fill="${INK}" opacity=".7">due 21 Oct</text></g>
  <g transform="translate(360 70)" filter="url(#s3)"><rect width="100" height="70" rx="12" fill="${PALE}"/><rect x="14" y="14" width="34" height="14" rx="7" fill="#e3f4ea"/><text x="21" y="24" font-family="${MONO}" font-size="8" fill="#1c7c46">Art. 12</text><rect x="14" y="40" width="60" height="5" rx="2.5" fill="#e3e7ee"/><circle cx="82" cy="52" r="8" fill="${BLUE}"/><path d="M78 52l3 3 5-6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g transform="translate(360 154)" filter="url(#s3)"><rect width="100" height="70" rx="12" fill="${PALE}"/><rect x="14" y="14" width="34" height="14" rx="7" fill="#e3f4ea"/><text x="21" y="24" font-family="${MONO}" font-size="8" fill="#1c7c46">Art. 11</text><rect x="14" y="40" width="70" height="5" rx="2.5" fill="#e3e7ee"/><circle cx="82" cy="52" r="8" fill="${BLUE}"/><path d="M78 52l3 3 5-6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>
  <g stroke="${BLUE}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" class="dash" stroke-dasharray="4 5"><path d="M172 112 C 186 112 186 124 198 124"/></g>
  <g transform="translate(60 345)" font-family="${MONO}" font-size="11"><rect x="-12" y="-18" width="176" height="30" rx="15" fill="${PALE}"/><text x="2" y="1" fill="${INK}" opacity=".75">→ Jira · Linear · CSV</text></g>
</svg>`;
const KINDS = { source: docs, layers, backlog: cards };
class PropIllo extends HTMLElement {
  connectedCallback() {
    const k = this.getAttribute('kind') || 'source';
    this.style.cssText += 'display:block;width:100%;height:100%;border-radius:20px;overflow:hidden;background:radial-gradient(120% 100% at 50% 0%,#f4f6fa 0%,#e7eaf0 100%)';
    const sr = this.shadowRoot || this.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>
      :host{contain:paint} svg{display:block;width:100%;height:100%}
      .drift{animation:drift 7s ease-in-out infinite alternate;transform-origin:250px 200px}
      @keyframes drift{from{transform:translateY(4px) rotate(-.4deg)}to{transform:translateY(-4px) rotate(.4deg)}}
      .float{animation:fl 4.5s ease-in-out infinite alternate;animation-delay:var(--d)}
      @keyframes fl{from{transform:translateY(0)}to{transform:translateY(-8px)}}
      .float:nth-of-type(2){animation-name:fl2}@keyframes fl2{from{transform:translateY(-70px)}to{transform:translateY(-78px)}}
      .float:nth-of-type(3){animation-name:fl3}@keyframes fl3{from{transform:translateY(-140px)}to{transform:translateY(-150px)}}
      .pulse{animation:pulse 2.4s ease-out infinite;transform-origin:center}
      @keyframes pulse{0%{transform:scale(1);opacity:.8}100%{transform:scale(1.9);opacity:0}}
      .bar{animation:bar 3s ease-in-out infinite alternate;transform-origin:-90px 0}
      @keyframes bar{from{transform:scaleX(.55)}to{transform:scaleX(1)}}
      .ring{animation:ring 3s ease-in-out infinite alternate}
      @keyframes ring{from{stroke-dashoffset:150}to{stroke-dashoffset:80}}
      .dash{animation:dash 1.2s linear infinite}@keyframes dash{to{stroke-dashoffset:-9}}
      .slide{animation:slide 5s ease-in-out infinite}
      @keyframes slide{0%,15%{transform:translate(-150px,0)}40%,100%{transform:translate(0,0)}}
    </style>${(KINDS[k] || docs)()}`;
  }
}
customElements.define('prop-illo', PropIllo);
})();
