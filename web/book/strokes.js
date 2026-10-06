// 글자 획순 (100×100 상자). 획마다 path 와 번호 자리(l). 쓰기 쪽·수업 슬라이드의 획순 움직임에 쓴다. 아직 1유닛 글자(A a B b C c)만.
// 획 순서 = 배열 순서. 번호는 획이 시작하는 곳 옆에 둔다 (같은 점에서 시작하는 획은 겹치지 않게 자리를 따로 정한다).
const STROKES = {
  A: [{ d: 'M50,10 L15,90', l: [36, 14] }, { d: 'M50,10 L85,90', l: [58, 14] }, { d: 'M30,62 L70,62', l: [18, 56] }],
  a: [{ d: 'M70,55 C70,40 58,32 45,32 C30,32 20,43 20,60 C20,77 30,88 45,88 C58,88 70,80 70,65', l: [76, 46] }, { d: 'M70,32 L70,88', l: [78, 26] }],
  B: [{ d: 'M20,10 L20,90', l: [8, 14] }, { d: 'M20,10 L55,10 C75,10 75,48 55,48 L20,48', l: [38, 7] }, { d: 'M20,48 L58,48 C82,48 82,90 58,90 L20,90', l: [38, 60] }],
  b: [{ d: 'M22,5 L22,88', l: [10, 10] }, { d: 'M22,60 C22,42 35,34 47,34 C62,34 72,46 72,61 C72,77 62,88 47,88 C35,88 22,80 22,66', l: [32, 52] }],
  C: [{ d: 'M80,25 C70,10 55,8 45,8 C25,8 12,30 12,50 C12,70 25,92 45,92 C58,92 72,88 80,75', l: [84, 14] }],
  c: [{ d: 'M70,42 C65,34 57,32 48,32 C32,32 22,45 22,60 C22,75 32,88 48,88 C57,88 65,85 70,78', l: [74, 32] }],
};

// 획순 SVG 한 글자: 회색 바탕 획 + 순서대로 그려지는 획(pathLength=100 으로 길이와 무관하게 1초씩) + 번호.
function strokeSvg(ch) {
  const ps = STROKES[ch];
  if (!ps) return `<svg viewBox="0 0 100 100"><text x="50" y="72" text-anchor="middle" style="font-size:70px;fill:#ccc;font-family:Andika">${ch}</text></svg>`;
  const base = ps.map((s) => `<path d="${s.d}"/>`).join('');
  const draw = ps.map((s, i) => `<path class="draw" pathLength="100" d="${s.d}" style="animation-delay:${i}s"/>`).join('');
  const nums = ps.map((s, i) => `<text x="${s.l[0]}" y="${s.l[1]}" text-anchor="middle">${i + 1}</text>`).join('');
  return `<svg viewBox="-4 -4 108 108"><g class="base">${base}</g><g class="ink">${draw}</g>${nums}</svg>`;
}
