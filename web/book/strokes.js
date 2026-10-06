// 글자 획순 (100×100 상자, 획마다 path). 쓰기 쪽의 획순 움직임에 쓴다. 아직 1유닛 글자(A a B b C c)만.
// 획 순서 = 배열 순서. 시작점은 path 의 M 좌표.
const STROKES = {
  A: ['M50,10 L15,90', 'M50,10 L85,90', 'M30,62 L70,62'],
  a: ['M70,55 C70,40 58,32 45,32 C30,32 20,43 20,60 C20,77 30,88 45,88 C58,88 70,80 70,65', 'M70,32 L70,88'],
  B: ['M20,10 L20,90', 'M20,10 L55,10 C75,10 75,48 55,48 L20,48', 'M20,48 L58,48 C82,48 82,90 58,90 L20,90'],
  b: ['M22,5 L22,88', 'M22,60 C22,42 35,34 47,34 C62,34 72,46 72,61 C72,77 62,88 47,88 C35,88 22,80 22,66'],
  C: ['M80,25 C70,10 55,8 45,8 C25,8 12,30 12,50 C12,70 25,92 45,92 C58,92 72,88 80,75'],
  c: ['M70,42 C65,34 57,32 48,32 C32,32 22,45 22,60 C22,75 32,88 48,88 C57,88 65,85 70,78'],
};

// 획순 SVG 한 글자. 회색 바탕 획 + 그려지는 획 + 번호.
function strokeSvg(ch) {
  const ps = STROKES[ch];
  if (!ps) return `<svg viewBox="0 0 100 100"><text x="50" y="72" text-anchor="middle" style="font-size:70px;fill:#ccc;font-family:Andika">${ch}</text></svg>`;
  const base = ps.map((d) => `<path d="${d}"/>`).join('');
  const draw = ps.map((d) => `<path class="draw" d="${d}"/>`).join('');
  const nums = ps.map((d, i) => { const m = d.match(/M([\d.]+),([\d.]+)/); return `<text x="${+m[1] - 10}" y="${+m[2] - 4}">${i + 1}</text>`; }).join('');
  return `<svg viewBox="0 0 100 100">${base}${draw}${nums}</svg>`;
}
