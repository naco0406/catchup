/* 연결선 도우미 — 쓰는 법: afterLayout(() => { const a = box('#a'), b = box('#b'); wire([[a.r + 6, a.cy], [b.l - 6, b.cy]]) })
    — 레이아웃이 끝난 뒤 요소의 실제 상자에서 좌표를 읽어 선을 긋는다.
   선과 화살촉은 같은 색·같은 굵기의 한 path 로 그린다(머리와 줄기가 따로 놀지 않게). */
function box(el) {
  const f = document.getElementById('fig').getBoundingClientRect()
  const r = (typeof el === 'string' ? document.querySelector(el) : el).getBoundingClientRect()
  return { l: r.left - f.left, t: r.top - f.top, r: r.right - f.left, b: r.bottom - f.top, cx: (r.left + r.right) / 2 - f.left, cy: (r.top + r.bottom) / 2 - f.top, w: r.width, h: r.height }
}
function overlay() {
  let svg = document.getElementById('wires')
  if (!svg) {
    const fig = document.getElementById('fig')
    fig.style.position = 'relative'
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.id = 'wires'
    const f = fig.getBoundingClientRect()
    svg.setAttribute('width', f.width)
    svg.setAttribute('height', f.height)
    svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible'
    fig.appendChild(svg)
  }
  return svg
}
/* pts: [[x,y],...] 직교 경로. r: 모서리 반경. head: 끝 화살촉 */
function wire(pts, { color = '#686871', width = 1.5, dash = null, head = true, r = 8, headSize = 6 } = {}) {
  const svg = overlay()
  // render.cjs 가 선이 글자를 가로지르는지 검사할 때 읽는다
  ;(window.__wires = window.__wires || []).push(pts.map(p => [p[0], p[1]]))
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i]
    if (i < pts.length - 1) {
      const [px, py] = pts[i - 1]
      const [nx, ny] = pts[i + 1]
      const d1 = Math.hypot(x - px, y - py), d2 = Math.hypot(nx - x, ny - y)
      const rr = Math.min(r, d1 / 2, d2 / 2)
      const ax = x - ((x - px) / d1) * rr, ay = y - ((y - py) / d1) * rr
      const bx = x + ((nx - x) / d2) * rr, by = y + ((ny - y) / d2) * rr
      d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`
    } else {
      // 화살촉 길이만큼 줄기를 줄여 촉 끝이 정확히 목표점에 닿게
      const [px, py] = pts[i - 1]
      const len = Math.hypot(x - px, y - py)
      const ux = (x - px) / len, uy = (y - py) / len
      const ex = head ? x - ux * (headSize - 0.5) : x, ey = head ? y - uy * (headSize - 0.5) : y
      d += ` L${ex},${ey}`
      if (head) {
        const hx = x - ux * headSize, hy = y - uy * headSize
        const nx = -uy, ny = ux
        const tri = `M${x},${y} L${hx + nx * headSize * 0.62},${hy + ny * headSize * 0.62} L${hx - nx * headSize * 0.62},${hy - ny * headSize * 0.62} Z`
        const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        p2.setAttribute('d', tri)
        p2.setAttribute('fill', color)
        p2.setAttribute('stroke', color)
        p2.setAttribute('stroke-width', '1')
        p2.setAttribute('stroke-linejoin', 'round')
        svg.appendChild(p2)
      }
    }
  }
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  p.setAttribute('fill', 'none')
  p.setAttribute('stroke', color)
  p.setAttribute('stroke-width', width)
  p.setAttribute('stroke-linecap', 'round')
  p.setAttribute('stroke-linejoin', 'round')
  if (dash) p.setAttribute('stroke-dasharray', dash)
  svg.insertBefore(p, svg.firstChild)
}
function afterLayout(fn) {
  document.addEventListener('DOMContentLoaded', async () => {
    await document.fonts.ready
    requestAnimationFrame(() => requestAnimationFrame(fn))
  })
}
