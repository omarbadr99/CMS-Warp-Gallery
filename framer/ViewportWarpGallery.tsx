import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useMemo, useRef, useState } from "react"

/**
 * Viewport Warp Gallery — CMS edition
 *
 * Drop one of these inside a Collection List and bind Image, Title and Link to
 * CMS fields. Every instance sharing a Gallery ID registers itself into one
 * shared list; the first instance in document order draws the whole gallery and
 * the rest collapse to nothing.
 *
 * The warp only happens at the top and bottom lips of the viewport. A tile is
 * pristine while it is in the middle band and curls over as it reaches an edge,
 * scaled by how hard you are scrolling.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 1400
 * @framerDisableUnlink
 */

/* ------------------------------------------------------------------
   Shared registry. Instances inside a Collection List cannot see each
   other through props, so they meet here, keyed by Gallery ID.
   ------------------------------------------------------------------ */
type Entry = {
    id: number
    el: HTMLElement | null
    src: string
    title: string
    link: string
    newTab: boolean
}
type Store = { entries: Map<number, Entry>; listeners: Set<() => void> }

const registries: Map<string, Store> = new Map()
let nextId = 1

function storeFor(gallery: string): Store {
    let st = registries.get(gallery)
    if (!st) {
        st = { entries: new Map(), listeners: new Set() }
        registries.set(gallery, st)
    }
    return st
}
function publish(st: Store) {
    st.listeners.forEach((fn) => fn())
}
/** Document order, so the gallery follows the Collection List's own order. */
function ordered(st: Store): Entry[] {
    const list = [...st.entries.values()].filter((e) => e.el && e.el.isConnected)
    list.sort((a, b) => {
        const rel = a.el!.compareDocumentPosition(b.el!)
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return a.id - b.id
    })
    return list
}

export default function ViewportWarpGallery(props) {
    const {
        gallery = "default",
        image,
        title = "",
        link = "",
        newTab = false,

        columns = 3,
        pattern = "0*0\n**0\n0**",
        gapX = 16,
        gapY = 16,
        padding = 40,
        imageSize = 1,

        font = 'ui-monospace, "SF Mono", Menlo, monospace',
        textColor = "#8a8f97",
        showIndex = true,
        textGap = 10,
        hover = "title",

        warpOn = true,
        edgeBand = 0.15,
        edgeAngle = 0.35,
        edgeScale = "shrink",
        spaceBefore = 0,
        spaceAfter = 0,
        restingCurl = 0.02,
        dispersion = 0.12,
        scrollSpeed = 0.11,
        intensity = 1.3,
        background = "transparent",
        style,
    } = props

    const markerRef = useRef<HTMLDivElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const labelsRef = useRef<HTMLDivElement>(null)
    const labelEls = useRef<(HTMLElement | null)[]>([])

    const target = RenderTarget.current()
    const isCanvas =
        target === RenderTarget.canvas || target === RenderTarget.thumbnail

    const src = typeof image === "string" ? image : image?.src || ""
    const myId = useRef(0)
    if (myId.current === 0) myId.current = nextId++

    /* ---- register this instance, re-render every instance on change ---- */
    const [, bump] = useState(0)
    useEffect(() => {
        const st = storeFor(gallery)
        st.entries.set(myId.current, {
            id: myId.current,
            el: markerRef.current,
            src,
            title,
            link,
            newTab,
        })
        const notify = () => bump((n) => n + 1)
        st.listeners.add(notify)
        publish(st)
        return () => {
            st.entries.delete(myId.current)
            st.listeners.delete(notify)
            publish(st)
        }
    }, [gallery, src, title, link, newTab])

    const st = storeFor(gallery)
    const siblings = ordered(st)
    const isRenderer = siblings.length === 0 || siblings[0]?.id === myId.current

    /* ---- pattern grid -> cells ---- */
    const items = useMemo(() => {
        const cols = Math.max(1, columns)
        const lines = String(pattern || "")
            .split(/[\n,]/)
            .map((l) => l.replace(/[^0*]/g, ""))
            .filter((l) => l.length > 0)
        const slotRows: number[][] = []
        if (lines.length) {
            lines.forEach((line) => {
                const row: number[] = []
                for (let c = 0; c < cols; c++)
                    if (line[c] && line[c] !== "*") row.push(c)
                if (row.length) slotRows.push(row)
            })
        }
        const out: any[] = []
        let ri = 0
        let i = 0
        while (i < siblings.length) {
            const row = slotRows.length
                ? slotRows[ri % slotRows.length]
                : Array.from({ length: cols }, (_, k) => k)
            row.forEach((col) => {
                const e = siblings[i]
                if (!e) return
                out.push({ ...e, col, row: ri, index: i + 1 })
                i++
            })
            ri++
            if (ri > 5000) break
        }
        return out
    }, [siblings.map((e) => e.id + ":" + e.src).join("|"), columns, pattern])

    const [width, setWidth] = useState(0)
    const [vh, setVh] = useState(
        typeof window === "undefined" ? 800 : window.innerHeight
    )
    useEffect(() => {
        const onR = () => setVh(window.innerHeight)
        window.addEventListener("resize", onR)
        return () => window.removeEventListener("resize", onR)
    }, [])
    const [aspects, setAspects] = useState<Record<string, number>>({})

    useEffect(() => {
        const el = wrapRef.current
        if (!el || !isRenderer) return
        const measure = () =>
            setWidth(Math.round(el.getBoundingClientRect().width))
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [isRenderer])

    const srcKey = items.map((i) => i.src).join("|")
    useEffect(() => {
        if (!isRenderer) return
        let alive = true
        const seen = new Set<string>()
        items.forEach((it) => {
            if (!it.src || seen.has(it.src)) return
            seen.add(it.src)
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            img.onload = () => {
                if (!alive || !img.width || !img.height) return
                const a = img.width / img.height
                setAspects((p) => (p[it.src] === a ? p : { ...p, [it.src]: a }))
            }
            img.src = it.src
        })
        return () => {
            alive = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [srcKey, isRenderer])

    const layout = useMemo(() => {
        const cols = Math.max(1, columns)
        const w = width || 1200
        const inner = Math.max(40, w - padding * 2)
        const colW = (inner - gapX * (cols - 1)) / cols

        const byRow = new Map<number, any[]>()
        items.forEach((it) => {
            if (!byRow.has(it.row)) byRow.set(it.row, [])
            byRow.get(it.row)!.push(it)
        })
        const cells: any[] = []
        // Clear viewports before and after, so images can be watched entering
        // from off-frame and leaving completely.
        const lead = Math.round(spaceBefore * vh)
        const tail = Math.round(spaceAfter * vh)
        let y = padding + lead
        const keys = [...byRow.keys()].sort((a, b) => a - b)
        keys.forEach((rk, ri) => {
            const list = byRow.get(rk)!
            let rowH = 0
            list.forEach((it, i) => {
                const aspect = aspects[it.src] || 1
                const nextCol = i + 1 < list.length ? list[i + 1].col : cols
                const room = (nextCol - it.col) * (colW + gapX) - gapX
                const cw = Math.min(colW * imageSize, room)
                const ch = cw / aspect
                cells.push({
                    ...it,
                    x: padding + it.col * (colW + gapX),
                    y,
                    w: cw,
                    h: ch,
                })
                rowH = Math.max(rowH, ch)
            })
            y += rowH + (ri < keys.length - 1 ? gapY : 0)
        })
        return { cells, height: Math.max(1, Math.round(y + padding + tail)) }
    }, [items, aspects, width, vh, columns, gapX, gapY, padding, imageSize, spaceBefore, spaceAfter])

    const live = useRef({} as any)
    live.current = {
        layout,
        hover,
        warpOn,
        scrollSpeed,
        intensity,
        edgeBand,
        edgeAngle,
        edgeScale,
        restingCurl,
        dispersion,
    }

    /* ---------------- WebGL ---------------- */
    useEffect(() => {
        if (isCanvas || !isRenderer) return
        const wrap = wrapRef.current
        const stage = stageRef.current
        const canvas = canvasRef.current
        const labelsEl = labelsRef.current
        if (!wrap || !stage || !canvas) return

        const gl: any =
            canvas.getContext("webgl2", {
                alpha: true,
                antialias: false,
                depth: false,
                stencil: false,
                premultipliedAlpha: true,
                powerPreference: "high-performance",
            }) ||
            canvas.getContext("webgl", {
                alpha: true,
                antialias: false,
                depth: false,
                premultipliedAlpha: true,
            })
        if (!gl) return
        const isGL2 =
            typeof WebGL2RenderingContext !== "undefined" &&
            gl instanceof WebGL2RenderingContext

        /* The whole effect. e is zero through the middle of the viewport and
           rises to one at the very lip, so a tile only distorts once it gets
           there. The curl pushes content further from the horizontal centre
           further inward, which reads as the tile bending over a rim. */
        /* e is 0 outside the band and rises to 1 at the very lip, so a tile is
           pristine through the middle of the screen and only reacts once it
           arrives at the top or bottom.

           Measured off the reference closeup: a card entering from below
           narrows toward the lip, and it narrows about ITS OWN centre, not the
           screen's — its left edge moved +24px right while its right edge moved
           -22px left. So the taper is applied in tile space, which is why it
           reads as the tile tipping away rather than the screen being lensed. */
        /* The page is wrapped on a horizontal cylinder and we sit just inside
           it. Through the middle band the surface is flat; at each lip it rolls
           away from the eye.

           The vertical term is what makes it read as rolling rather than
           pinching. A point's arc length along the surface grows linearly, but
           its PROJECTION grows as sin(phi), so spacing bunches up as the
           surface turns edge-on. Scaling a tile alone only ever looks squashed;
           compressing the spacing is what curves it. */
        const BODY = `
  vec2 p = (uRect.xy + aPos * uRect.zw) / uRes;
  float band = max(uBand, 0.001);
  float m = min(p.y, 1.0 - p.y);
  float amt = uWarp + uRest;
  float phiMax = uAngle * 1.5707963 * clamp(amt * 2.2, 0.0, 1.0);
  if (m < band && phiMax > 0.0005) {
    float u = m / band;                    // 1 at the band edge, 0 at the lip
    float phi = (1.0 - u) * phiMax;
    float roll = sin(phi) / sin(phiMax);   // arc length -> what the eye sees
    float mNew = band * (1.0 - roll);
    float depth = 1.0 - cos(phi);          // how far it has receded
    vEdge = amt * depth / max(1.0 - cos(phiMax), 1e-4);
    float sx = 1.0 / (1.0 + uDir * depth * 0.40);
    vec2 tl = aPos - 0.5;
    p = vec2((uRect.x + (0.5 + tl.x * sx) * uRect.z) / uRes.x,
             (p.y < 0.5) ? mNew : 1.0 - mNew);
  }
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);`

        const VERT = isGL2
            ? `#version 300 es
in vec2 aPos;
uniform vec4 uRect; uniform vec2 uRes;
uniform float uWarp; uniform float uBand; uniform float uRest;
uniform float uAngle; uniform float uDir;
out vec2 vUv; out float vEdge;
void main(){ vUv = aPos; vEdge = 0.0;${BODY} }`
            : `
attribute vec2 aPos;
uniform vec4 uRect; uniform vec2 uRes;
uniform float uWarp; uniform float uBand; uniform float uRest;
uniform float uAngle; uniform float uDir;
varying vec2 vUv; varying float vEdge;
void main(){ vUv = aPos; vEdge = 0.0;${BODY} }`

        const derivs = isGL2 || !!gl.getExtension("OES_standard_derivatives")
        const EDGE = derivs
            ? `
  vec2 dd = min(vUv, 1.0 - vUv);
  vec2 fw = fwidth(vUv) + 1e-6;
  float edge = min(smoothstep(0.0, fw.x, dd.x), smoothstep(0.0, fw.y, dd.y));`
            : `
  float edge = 1.0;`

        const FRAG = isGL2
            ? `#version 300 es
precision highp float;
in vec2 vUv; in float vEdge;
uniform sampler2D uTex; uniform float uGray; uniform float uDisp; out vec4 frag;

vec3 spectrum(float s) {
  return clamp(vec3(1.5 - abs(4.0 * s - 3.0),
                    1.5 - abs(4.0 * s - 2.0),
                    1.5 - abs(4.0 * s - 1.0)), 0.0, 1.0);
}
void main(){
  vec4 c = texture(uTex, vUv);
  float amount = vEdge * uDisp;
  if (amount > 0.0005) {
    /* each sample along the smear takes a wavelength, so it resolves into a
       continuous spectrum rather than a two-tone fringe */
    vec2 off = vec2((vUv.x - 0.5) * 2.0, 0.0) * amount;
    vec3 sum = vec3(0.0); vec3 wsum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float s = float(i) / 7.0;
      vec3 w = spectrum(s);
      sum += texture(uTex, vUv + off * (s - 0.5) * 2.0).rgb * w;
      wsum += w;
    }
    c.rgb = sum / max(wsum, vec3(1e-4));
  }
  float g = dot(c.rgb, vec3(0.2126,0.7152,0.0722));${EDGE}
  frag = vec4(mix(c.rgb, vec3(g), uGray), c.a) * edge; }`
            : `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vUv; varying float vEdge;
uniform sampler2D uTex; uniform float uGray; uniform float uDisp;

vec3 spectrum(float s) {
  return clamp(vec3(1.5 - abs(4.0 * s - 3.0),
                    1.5 - abs(4.0 * s - 2.0),
                    1.5 - abs(4.0 * s - 1.0)), 0.0, 1.0);
}
void main(){
  vec4 c = texture2D(uTex, vUv);
  float amount = vEdge * uDisp;
  if (amount > 0.0005) {
    vec2 off = vec2((vUv.x - 0.5) * 2.0, 0.0) * amount;
    vec3 sum = vec3(0.0); vec3 wsum = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float s = float(i) / 7.0;
      vec3 w = spectrum(s);
      sum += texture2D(uTex, vUv + off * (s - 0.5) * 2.0).rgb * w;
      wsum += w;
    }
    c.rgb = sum / max(wsum, vec3(1e-4));
  }
  float g = dot(c.rgb, vec3(0.2126,0.7152,0.0722));${EDGE}
  gl_FragColor = vec4(mix(c.rgb, vec3(g), uGray), c.a) * edge; }`

        function compile(srcTxt: string, type: number) {
            const sh = gl.createShader(type)
            gl.shaderSource(sh, srcTxt)
            gl.compileShader(sh)
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.warn("ViewportWarpGallery:", gl.getShaderInfoLog(sh))
                gl.deleteShader(sh)
                return null
            }
            return sh
        }
        const vs = compile(VERT, gl.VERTEX_SHADER)
        const fs = compile(FRAG, gl.FRAGMENT_SHADER)
        if (!vs || !fs) return
        const prog = gl.createProgram()
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.bindAttribLocation(prog, 0, "aPos")
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        gl.useProgram(prog)

        const uni: any = {}
        ;["uRect", "uRes", "uWarp", "uBand", "uRest", "uAngle", "uDir", "uDisp", "uTex", "uGray"].forEach(
            (n) => (uni[n] = gl.getUniformLocation(prog, n))
        )
        gl.uniform1i(uni.uTex, 0)

        const SEG = 14
        const verts: number[] = []
        for (let j = 0; j <= SEG; j++)
            for (let i = 0; i <= SEG; i++) verts.push(i / SEG, j / SEG)
        const idx: number[] = []
        for (let j = 0; j < SEG; j++)
            for (let i = 0; i < SEG; i++) {
                const a = j * (SEG + 1) + i
                idx.push(a, a + SEG + 1, a + 1, a + 1, a + SEG + 1, a + SEG + 2)
            }
        const indexCount = idx.length
        let vao: any = null
        if (isGL2) {
            vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
        }
        const vb = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, vb)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
        gl.enableVertexAttribArray(0)
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
        const ib = gl.createBuffer()
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)
        gl.disable(gl.DEPTH_TEST)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        let needsDraw = true
        const texCache = new Map<string, any>()
        const pending = new Set<string>()
        function textureFor(s: string) {
            if (!s) return null
            const hit = texCache.get(s)
            if (hit) return hit
            if (pending.has(s)) return null
            pending.add(s)
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            img.onload = () => {
                const t = gl.createTexture()
                gl.bindTexture(gl.TEXTURE_2D, t)
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                if (isGL2) {
                    gl.generateMipmap(gl.TEXTURE_2D)
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                }
                texCache.set(s, t)
                pending.delete(s)
                needsDraw = true
            }
            img.onerror = () => pending.delete(s)
            img.src = s
            return null
        }

        let stageW = 1, stageH = 1, stageLeft = 0, stageTopVp = 0, sectionTop = 0
        const maxScale = Math.min(window.devicePixelRatio || 1, 2)
        let scale = maxScale
        function resize() {
            const r = stage.getBoundingClientRect()
            stageW = Math.max(1, Math.round(r.width))
            stageH = Math.max(1, Math.round(r.height))
            stageLeft = r.left
            stageTopVp = r.top
            sectionTop = wrap.getBoundingClientRect().top + window.scrollY
            const w = Math.round(stageW * scale)
            const h = Math.round(stageH * scale)
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w
                canvas.height = h
                gl.viewport(0, 0, w, h)
            }
            needsDraw = true
        }
        const ro = new ResizeObserver(resize)
        ro.observe(stage)
        resize()

        let onScreen = true
        const io = new IntersectionObserver(
            (en) => {
                onScreen = en[0]?.isIntersecting ?? true
                if (onScreen) needsDraw = true
            },
            { rootMargin: "200px" }
        )
        io.observe(stage)

        let hovered = -1
        const pointer = { x: -1, y: -1, inside: false }
        const onMove = (e: PointerEvent) => {
            pointer.x = e.clientX - stageLeft
            pointer.y = e.clientY - stageTopVp
            pointer.inside = true
            needsDraw = true
        }
        const onLeave = () => {
            pointer.inside = false
            needsDraw = true
        }
        const onClick = () => {
            const cells = live.current.layout.cells
            const c = cells[hovered]
            if (hovered < 0 || !c?.link) return
            if (c.newTab) window.open(c.link, "_blank", "noopener")
            else window.location.href = c.link
        }
        stage.addEventListener("pointermove", onMove)
        stage.addEventListener("pointerleave", onLeave)
        stage.addEventListener("click", onClick)

        let raf = 0
        let renderScroll = window.scrollY
        let prevScroll = renderScroll
        let warp = 0
        let last = performance.now()
        let lastOffset = NaN
        let graysAnimating = false
        let tick = 0
        const frameMs: number[] = []
        const grays = new Map<number, number>()

        function frame(now: number) {
            raf = requestAnimationFrame(frame)
            if (!onScreen) {
                last = now
                return
            }
            const L = live.current
            const cells = L.layout.cells
            let dt = (now - last) / 1000
            last = now
            dt = Math.min(dt, 1 / 20)
            const step = dt * 60

            const targetScroll = window.scrollY
            const damp = 1 - Math.pow(1 - L.scrollSpeed, step)
            renderScroll += (targetScroll - renderScroll) * damp
            if (Math.abs(targetScroll - renderScroll) < 0.05)
                renderScroll = targetScroll
            const vel = (renderScroll - prevScroll) / Math.max(step, 0.0001)
            prevScroll = renderScroll

            const raw = L.warpOn
                ? Math.min(
                      (1 - Math.exp(-Math.abs(vel) / 70)) * L.intensity * 0.37,
                      0.5
                  )
                : 0
            warp += (raw - warp) * Math.min(1, step * (raw > warp ? 0.38 : 0.13))
            if (warp < 0.0004) warp = 0

            const stickyTop = Math.min(
                Math.max(targetScroll, sectionTop),
                sectionTop + L.layout.height - stageH
            )
            const offset = sectionTop - stickyTop + (targetScroll - renderScroll)

            if (labelsEl && offset !== lastOffset)
                labelsEl.style.transform = `translate3d(0, ${offset}px, 0)`

            const prevHover = hovered
            if (pointer.inside && L.hover !== "none" && warp < 0.02) {
                hovered = -1
                for (let i = cells.length - 1; i >= 0; i--) {
                    const c = cells[i]
                    const sy = c.y + offset
                    if (
                        pointer.x >= c.x && pointer.x <= c.x + c.w &&
                        pointer.y >= sy && pointer.y <= sy + c.h
                    ) { hovered = i; break }
                }
            } else if (!pointer.inside) hovered = -1
            if (hovered !== prevHover) {
                stage.style.cursor =
                    hovered >= 0 && cells[hovered]?.link ? "pointer" : ""
                const els = labelEls.current
                if (prevHover >= 0 && els[prevHover]) els[prevHover]!.style.opacity = "0"
                if (hovered >= 0 && els[hovered]) els[hovered]!.style.opacity = "1"
                needsDraw = true
            }

            if ((tick++ & 31) === 0) {
                const stx = wrap.getBoundingClientRect().top + window.scrollY
                if (Math.abs(stx - sectionTop) > 0.5) {
                    sectionTop = stx
                    needsDraw = true
                }
            }

            const restNow = L.warpOn ? L.restingCurl : 0
            const still =
                warp === 0 && renderScroll === targetScroll &&
                offset === lastOffset && !graysAnimating
            if (still && !needsDraw) { frameMs.length = 0; return }
            lastOffset = offset
            needsDraw = false

            frameMs.push(dt * 1000)
            if (frameMs.length >= 40) {
                let sum = 0
                for (const v of frameMs) sum += v
                const avg = sum / frameMs.length
                frameMs.length = 0
                if (avg > 21 && scale > 1) { scale = Math.max(1, scale - 0.5); resize() }
                else if (avg < 11 && scale < maxScale) { scale = Math.min(maxScale, scale + 0.5); resize() }
            }

            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.useProgram(prog)
            if (isGL2 && vao) gl.bindVertexArray(vao)
            gl.uniform2f(uni.uRes, stageW, stageH)
            gl.uniform1f(uni.uWarp, warp)
            gl.uniform1f(uni.uBand, L.edgeBand)
            gl.uniform1f(uni.uRest, restNow)
            gl.uniform1f(uni.uDisp, L.dispersion)
            gl.uniform1f(uni.uAngle, L.edgeAngle)
            gl.uniform1f(uni.uDir, L.edgeScale === "grow" ? -1 : 1)
            gl.activeTexture(gl.TEXTURE0)

            const bg = L.hover === "gray2color" ? 1 : 0
            const hg = L.hover === "gray2color" ? 0 : L.hover === "color2gray" ? 1 : bg
            const margin = stageH * 0.55
            let anyGray = false

            for (let i = 0; i < cells.length; i++) {
                const c = cells[i]
                const y = c.y + offset
                if (y + c.h < -margin || y > stageH + margin) continue
                const tex = textureFor(c.src)
                if (!tex) continue
                const want = i === hovered ? hg : bg
                const cur = grays.get(i) ?? bg
                let next = cur + (want - cur) * Math.min(1, step * 0.16)
                if (Math.abs(want - next) < 0.002) next = want
                else anyGray = true
                grays.set(i, next)
                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform4f(uni.uRect, c.x, y, c.w, c.h)
                gl.uniform1f(uni.uGray, next)
                gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
            }
            graysAnimating = anyGray
        }
        raf = requestAnimationFrame((t) => { last = t; frame(t) })

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            io.disconnect()
            stage.removeEventListener("pointermove", onMove)
            stage.removeEventListener("pointerleave", onLeave)
            stage.removeEventListener("click", onClick)
            texCache.forEach((t) => gl.deleteTexture(t))
            texCache.clear()
            gl.deleteBuffer(vb)
            gl.deleteBuffer(ib)
            if (vao) gl.deleteVertexArray(vao)
            gl.deleteProgram(prog)
        }
    }, [isCanvas, isRenderer])

    /* ---------------- render ---------------- */
    labelEls.current.length = layout.cells.length
    const showTitles = hover === "title"

    /* Non-renderer instances collapse to nothing but must stay in the DOM so
       document order — and therefore gallery order — can be read from them. */
    if (!isRenderer) {
        return <div ref={markerRef} style={{ width: "100%", height: 0 }} />
    }

    const empty = items.length === 0

    return (
        <div ref={markerRef} style={{ width: "100%" }}>
            <div
                ref={wrapRef}
                style={{ ...style, position: "relative", width: "100%", background }}
            >
                <div
                    style={{
                        position: "relative",
                        width: "100%",
                        height: empty ? 320 : layout.height,
                    }}
                >
                    {empty ? (
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                display: "grid",
                                placeContent: "center",
                                font: '12px ui-monospace, "SF Mono", Menlo, monospace',
                                color: "#8a8f97",
                                textAlign: "center",
                                padding: 24,
                                lineHeight: 1.6,
                            }}
                        >
                            Bind Image and Title to CMS fields, and put this
                            component inside a Collection List.
                        </div>
                    ) : isCanvas ? (
                        layout.cells.map((c, i) => (
                            <img
                                key={i}
                                src={c.src}
                                alt={c.title}
                                style={{
                                    position: "absolute",
                                    left: c.x,
                                    top: c.y,
                                    width: c.w,
                                    height: c.h,
                                    objectFit: "cover",
                                    filter:
                                        hover === "gray2color" ? "grayscale(1)" : undefined,
                                }}
                            />
                        ))
                    ) : (
                        <div
                            ref={stageRef}
                            style={{
                                position: "sticky",
                                top: 0,
                                width: "100%",
                                height: `min(100vh, ${layout.height}px)`,
                                overflow: "hidden",
                            }}
                        >
                            <canvas
                                ref={canvasRef}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    width: "100%",
                                    height: "100%",
                                    display: "block",
                                }}
                            />
                            <div
                                ref={labelsRef}
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    pointerEvents: "none",
                                    willChange: "transform",
                                }}
                            >
                                {showTitles &&
                                    layout.cells.map((c, i) => (
                                        <div
                                            key={i}
                                            ref={(el) => { labelEls.current[i] = el }}
                                            style={{
                                                position: "absolute",
                                                left: c.x,
                                                top: c.y,
                                                transform: "translateY(-100%)",
                                                marginTop: -textGap,
                                                opacity: 0,
                                                transition: "opacity .28s ease",
                                                whiteSpace: "nowrap",
                                                lineHeight: 1.35,
                                                fontFamily: font,
                                                fontSize: 11,
                                                color: textColor,
                                            }}
                                        >
                                            {showIndex && (
                                                <span
                                                    style={{
                                                        display: "block",
                                                        opacity: 0.55,
                                                        fontVariantNumeric: "tabular-nums",
                                                    }}
                                                >
                                                    {String(c.index).padStart(2, "0")}
                                                </span>
                                            )}
                                            {c.title}
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

addPropertyControls(ViewportWarpGallery, {
    gallery: {
        type: ControlType.String,
        title: "Gallery ID",
        defaultValue: "default",
        description:
            "Use the same ID for CMS items in one gallery. Use a different ID for separate galleries.",
    },
    image: {
        type: ControlType.ResponsiveImage,
        title: "Image",
        description:
            "Click the [+] icon next to the property and choose 'Set Variable' to link a CMS image field.",
    },
    title: {
        type: ControlType.String,
        title: "Title",
        defaultValue: "",
        description:
            "Click the [+] icon next to the property and choose 'Set Variable' to link a CMS text field.",
    },
    link: { type: ControlType.Link, title: "Link" },
    newTab: { type: ControlType.Boolean, title: "Open in new tab", defaultValue: false },

    columns: {
        type: ControlType.Number,
        title: "Columns",
        min: 1, max: 6, step: 1, displayStepper: true, defaultValue: 3,
    },
    pattern: {
        type: ControlType.String,
        title: "Pattern",
        displayTextArea: true,
        defaultValue: "0*0\n**0\n0**",
        description:
            "One line per row. Use '0' for items and '*' for empty slots. The grid repeats until every item is placed.",
    },
    imageSize: {
        type: ControlType.Number,
        title: "Image size",
        min: 1, max: 4, step: 0.05, defaultValue: 1,
        description: "In column widths. Images grow into the empty slots beside them.",
    },
    gapX: { type: ControlType.Number, title: "Gap X", min: 0, max: 200, defaultValue: 16 },
    gapY: { type: ControlType.Number, title: "Gap Y", min: 0, max: 320, defaultValue: 16 },
    padding: { type: ControlType.Number, title: "Padding", min: 0, max: 200, defaultValue: 40 },
    background: { type: ControlType.Color, title: "Background", defaultValue: "transparent" },
    spaceBefore: {
        type: ControlType.Number,
        title: "Space before",
        min: 0, max: 2, step: 0.1, defaultValue: 0,
        description: "Clear screens before the first row, in viewport heights.",
    },
    spaceAfter: {
        type: ControlType.Number,
        title: "Space after",
        min: 0, max: 2, step: 0.1, defaultValue: 0,
        description: "Clear screens after the last row, in viewport heights.",
    },

    hover: {
        type: ControlType.Enum,
        title: "Hover Effect",
        options: ["gray2color", "color2gray", "title", "none"],
        optionTitles: ["Grayscale to Color", "Color to Grayscale", "Title Appear", "None"],
        defaultValue: "title",
    },
    font: {
        type: ControlType.String, title: "Font",
        defaultValue: 'ui-monospace, "SF Mono", Menlo, monospace',
        hidden: (p) => p.hover !== "title",
    },
    textColor: {
        type: ControlType.Color, title: "Text color", defaultValue: "#8a8f97",
        hidden: (p) => p.hover !== "title",
    },
    showIndex: {
        type: ControlType.Boolean, title: "Index", defaultValue: true,
        hidden: (p) => p.hover !== "title",
    },
    textGap: {
        type: ControlType.Number, title: "Text gap", min: 0, max: 48, defaultValue: 10,
        hidden: (p) => p.hover !== "title",
    },

    warpOn: { type: ControlType.Boolean, title: "Warp Effect", defaultValue: true },
    edgeBand: {
        type: ControlType.Number,
        title: "Edge band",
        min: 0.05, max: 0.5, step: 0.01, defaultValue: 0.15,
        hidden: (p) => !p.warpOn,
        description:
            "How far in from the top and bottom the curl reaches. Everything between stays flat.",
    },
    edgeAngle: {
        type: ControlType.Number,
        title: "Angle",
        min: 0, max: 1, step: 0.01, defaultValue: 0.35,
        hidden: (p) => !p.warpOn,
        description: "How far the surface rolls at the lip. 1 is a full quarter turn.",
    },
    edgeScale: {
        type: ControlType.Enum,
        title: "At the lip",
        options: ["shrink", "grow"],
        optionTitles: ["Shrink", "Grow"],
        defaultValue: "shrink",
        hidden: (p) => !p.warpOn,
        description:
            "Shrink: tiles are smallest at the edge and open up as they reach the middle. Grow: the reverse.",
    },
    restingCurl: {
        type: ControlType.Number,
        title: "Resting curl",
        min: 0, max: 0.5, step: 0.01, defaultValue: 0.02,
        hidden: (p) => !p.warpOn,
        description: "Curl that remains when the scroll stops. Set to 0 for velocity only.",
    },
    scrollSpeed: {
        type: ControlType.Number,
        title: "Scroll speed",
        min: 0.03, max: 0.4, step: 0.005, defaultValue: 0.11,
        hidden: (p) => !p.warpOn,
    },
    dispersion: {
        type: ControlType.Number,
        title: "Dispersion",
        min: 0, max: 0.6, step: 0.005, defaultValue: 0.12,
        hidden: (p) => !p.warpOn,
        description:
            "Prismatic spread on the rolled edges. Eight samples across the smear each take a wavelength, so it resolves into a spectrum. Push past 0.3 for a heavy prism.",
    },
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        min: 0, max: 3, step: 0.05, defaultValue: 1.3,
        hidden: (p) => !p.warpOn,
    },
})
