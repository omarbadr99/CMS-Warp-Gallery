import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useMemo, useRef, useState } from "react"

/**
 * Viewport Warp Gallery — CMS edition
 *
 * This code file exports TWO components:
 *
 *   • Warp Gallery Item   — put ONE inside your Collection List and bind
 *                           Image / Title / Link to CMS fields. It draws
 *                           nothing; it just reports its CMS row.
 *   • Viewport Warp Gallery — put ONE on the page, OUTSIDE the list, set to
 *                           Fill width. It draws every reported row.
 *
 * They find each other through a shared Gallery ID. The gallery must live
 * outside the list because a component inside a Collection List is trapped in
 * one grid cell — it can only ever be as wide as that cell.
 *
 * The warp only happens at the top and bottom lips of the viewport. A tile is
 * pristine while it is in the middle band and curls over as it reaches an edge,
 * scaled by how hard you are scrolling.
 */

/* ------------------------------------------------------------------
   Shared registry. Items inside a Collection List cannot see the
   gallery through props, so they meet here, keyed by Gallery ID.
   ------------------------------------------------------------------ */
type Entry = {
    key: string
    el: HTMLElement | null
    src: string
    title: string
    link: string
    newTab: boolean
}
type Store = { entries: Map<string, Entry>; listeners: Set<() => void> }

const registries: Map<string, Store> = new Map()
let nextKey = 1

function storeFor(gallery: string): Store {
    const id = gallery || "default"
    let st = registries.get(id)
    if (!st) {
        st = { entries: new Map(), listeners: new Set() }
        registries.set(id, st)
    }
    return st
}
function publish(st: Store) {
    st.listeners.forEach((fn) => fn())
}

/** display:none anywhere up the tree zeroes both of these. A 0-height marker
 *  inside a live subtree still reports an offsetParent, so it survives. */
function isVisible(el: HTMLElement | null): boolean {
    if (!el || !el.isConnected) return false
    return el.offsetParent !== null || el.getClientRects().length > 0
}

/** Steps up from `from` before reaching an ancestor that also contains `to`.
 *  Items in the same breakpoint frame as the gallery score low; the copies
 *  Framer emits for the other breakpoints score high. */
function distance(from: HTMLElement, to: HTMLElement): number {
    let n: HTMLElement | null = from
    let d = 0
    while (n) {
        if (n.contains(to)) return d
        n = n.parentElement
        d++
    }
    return 1e9
}

/**
 * Framer puts a copy of the page in the DOM for every breakpoint — hidden ones
 * on a published site, side-by-side frames on the canvas — so a registry keyed
 * only by Gallery ID collects each CMS row once per breakpoint. Keeping just
 * the rows whose nearest shared ancestor with the gallery is closest picks the
 * one copy that belongs to this gallery, in both cases.
 */
function ordered(st: Store, host: HTMLElement | null): Entry[] {
    let list = [...st.entries.values()].filter((e) => e.el && e.el.isConnected)
    if (list.length === 0) return list

    const shown = list.filter((e) => isVisible(e.el))
    if (shown.length) list = shown

    if (host && host.isConnected) {
        let best = 1e9
        const scored = list.map((e) => {
            const d = distance(host, e.el!)
            if (d < best) best = d
            return { e, d }
        })
        list = scored.filter((s) => s.d === best).map((s) => s.e)
    }

    list.sort((a, b) => {
        const rel = a.el!.compareDocumentPosition(b.el!)
        if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return a.key < b.key ? -1 : 1
    })
    return list
}

/** What is registered elsewhere, so an empty gallery can say why it is empty
 *  instead of only that it is. */
function otherGalleries(mine: string): { id: string; count: number }[] {
    const out: { id: string; count: number }[] = []
    registries.forEach((st, id) => {
        if (id === mine) return
        const n = [...st.entries.values()].filter((e) => e.el?.isConnected).length
        if (n > 0) out.push({ id, count: n })
    })
    return out
}

function sameList(a: Entry[], b: Entry[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        const x = a[i]
        const y = b[i]
        if (
            x.key !== y.key || x.src !== y.src || x.title !== y.title ||
            x.link !== y.link || x.newTab !== y.newTab
        )
            return false
    }
    return true
}

/** Subscribe the gallery to its items. Registrations are coalesced into one
 *  recompute per frame, so a 200-row collection costs one pass, not 200. */
function useGalleryItems(
    gallery: string,
    hostRef: { current: HTMLElement | null }
): Entry[] {
    const [items, setItems] = useState<Entry[]>([])
    useEffect(() => {
        const st = storeFor(gallery)
        let raf = 0
        const recompute = () => {
            cancelAnimationFrame(raf)
            raf = requestAnimationFrame(() => {
                const next = ordered(st, hostRef.current)
                setItems((prev) => (sameList(prev, next) ? prev : next))
            })
        }
        st.listeners.add(recompute)
        recompute()
        // a breakpoint switch changes which copy of the page is the visible one
        window.addEventListener("resize", recompute)
        return () => {
            cancelAnimationFrame(raf)
            st.listeners.delete(recompute)
            window.removeEventListener("resize", recompute)
        }
    }, [gallery, hostRef])
    return items
}

/* ==================================================================
   1. The item. Goes INSIDE the Collection List.
   ================================================================== */

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 160
 * @framerIntrinsicHeight 28
 * @framerDisableUnlink
 */
export function WarpGalleryItem(props) {
    const {
        gallery = "default",
        image,
        title = "",
        link = "",
        newTab = false,
    } = props

    const ref = useRef<HTMLDivElement>(null)
    const keyRef = useRef("")
    if (!keyRef.current) keyRef.current = "k" + nextKey++

    const src = typeof image === "string" ? image : image?.src || ""
    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    useEffect(() => {
        const st = storeFor(gallery)
        st.entries.set(keyRef.current, {
            key: keyRef.current,
            el: ref.current,
            src,
            title,
            link,
            newTab,
        })
        publish(st)
        return () => {
            st.entries.delete(keyRef.current)
            publish(st)
        }
    }, [gallery, src, title, link, newTab])

    // On the canvas it shows a chip so you can see and select it. On a live
    // page it takes no space at all.
    if (!isCanvas) return <div ref={ref} style={{ width: "100%", height: 0 }} />
    return (
        <div
            ref={ref}
            style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                background: "rgba(0,153,255,.08)",
                border: "1px solid rgba(0,153,255,.35)",
                font: '10px ui-monospace, "SF Mono", Menlo, monospace',
                color: "#0077cc",
                overflow: "hidden",
                whiteSpace: "nowrap",
            }}
        >
            {src ? (
                <img
                    src={src}
                    alt=""
                    style={{
                        width: 18, height: 18, objectFit: "cover",
                        borderRadius: 3, flex: "none",
                    }}
                />
            ) : null}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {title || "(bind Title)"}
            </span>
        </div>
    )
}

addPropertyControls(WarpGalleryItem, {
    gallery: {
        type: ControlType.String,
        title: "Gallery ID",
        defaultValue: "default",
        description:
            "Must match the Gallery ID on the Viewport Warp Gallery you placed on the page.",
    },
    image: {
        type: ControlType.ResponsiveImage,
        title: "Image",
        description:
            "Click the [+] next to the property and choose 'Set Variable' to link a CMS image field.",
    },
    title: { type: ControlType.String, title: "Title", defaultValue: "" },
    link: { type: ControlType.Link, title: "Link" },
    newTab: { type: ControlType.Boolean, title: "New Tab", defaultValue: false },
})

/* ==================================================================
   2. The gallery. Goes on the PAGE, outside the list.
   ================================================================== */

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 1400
 * @framerDisableUnlink
 */
export default function ViewportWarpGallery(props) {
    const {
        gallery = "default",

        columns = 3,
        columnsTablet = 0,
        columnsPhone = 0,
        pattern = "0*0\n**0\n0**",
        patternTablet = "",
        patternPhone = "",
        gapX = 16,
        gapY = 16,
        padding = 40,
        imageSize = 1,
        fullBleed = false,

        font = 'ui-monospace, "SF Mono", Menlo, monospace',
        textColor = "#8a8f97",
        showIndex = true,
        textGap = 10,
        hover = "title",

        warpOn = true,
        edgeBand = 0.15,
        edgeAngle = 0.7,
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

    const wrapRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const labelsRef = useRef<HTMLDivElement>(null)
    const labelEls = useRef<(HTMLElement | null)[]>([])
    /* lets the component nudge the render loop when layout changes under it */
    const poke = useRef<() => void>(() => {})

    const target = RenderTarget.current()
    const isCanvas =
        target === RenderTarget.canvas || target === RenderTarget.thumbnail

    const entries = useGalleryItems(gallery, wrapRef)

    // If WebGL cannot run — no context, or images the GPU is not allowed to
    // read — the gallery still draws, just without the warp. It must never
    // come out blank on a published page.
    const [glFailed, setGlFailed] = useState(false)
    const domOnly = isCanvas || glFailed

    const [width, setWidth] = useState(0)
    const [vh, setVh] = useState(
        typeof window === "undefined" ? 800 : window.innerHeight
    )
    const [dvh, setDvh] = useState("100vh")
    useEffect(() => {
        const onR = () => setVh(window.innerHeight)
        window.addEventListener("resize", onR)
        if (typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh"))
            setDvh("100dvh")
        return () => window.removeEventListener("resize", onR)
    }, [])

    useEffect(() => {
        const el = wrapRef.current
        if (!el) return
        const measure = () =>
            setWidth(Math.round(el.getBoundingClientRect().width))
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    /* Columns collapse on smaller screens so tiles stay big enough to read.
       A pattern is written against a specific column count — "0*0" means
       nothing at two columns — so each breakpoint carries its own, and an
       empty one just fills every column. */
    const [cols, grid] = useMemo(() => {
        const base = Math.max(1, columns)
        if (width && width < 600 && columnsPhone > 0)
            return [Math.max(1, columnsPhone), patternPhone]
        if (width && width < 1000 && columnsTablet > 0)
            return [Math.max(1, columnsTablet), patternTablet]
        return [base, pattern]
    }, [columns, columnsTablet, columnsPhone, pattern, patternTablet, patternPhone, width])

    /* ---- pattern grid -> cells ---- */
    const items = useMemo(() => {
        const lines = String(grid || "")
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
        while (i < entries.length) {
            const row = slotRows.length
                ? slotRows[ri % slotRows.length]
                : Array.from({ length: cols }, (_, k) => k)
            row.forEach((col) => {
                const e = entries[i]
                if (!e) return
                out.push({ ...e, col, row: ri, index: i + 1 })
                i++
            })
            ri++
            if (ri > 5000) break
        }
        return out
    }, [entries, cols, grid])

    const [aspects, setAspects] = useState<Record<string, number>>({})
    const srcKey = items.map((i) => i.src).join("|")
    useEffect(() => {
        let alive = true
        const seen = new Set<string>()
        items.forEach((it) => {
            if (!it.src || seen.has(it.src)) return
            seen.add(it.src)
            const img = new Image()
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
    }, [srcKey])

    const layout = useMemo(() => {
        const w = width || 1200
        const pad = Math.min(padding, Math.max(0, w / 2 - 20))
        const inner = Math.max(40, w - pad * 2)
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
        let y = pad + lead
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
                    x: pad + it.col * (colW + gapX),
                    y,
                    w: cw,
                    h: ch,
                })
                rowH = Math.max(rowH, ch)
            })
            y += rowH + (ri < keys.length - 1 ? gapY : 0)
        })
        return { cells, height: Math.max(1, Math.round(y + pad + tail)) }
    }, [items, aspects, width, vh, cols, gapX, gapY, padding, imageSize, spaceBefore, spaceAfter])

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
        if (domOnly) return
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
        if (!gl) {
            setGlFailed(true)
            return
        }
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
  float phiMax = uAngle * 1.5707963 * clamp(amt * 6.0, 0.0, 1.0);
  if (m < band && phiMax > 0.0005) {
    float u = m / band;                    // 1 at the band edge, 0 at the lip
    float phi = (1.0 - u) * phiMax;
    float roll = sin(phi) / sin(phiMax);   // arc length -> what the eye sees
    float mNew = band * (1.0 - roll);
    float depth = 1.0 - cos(phi);          // how far it has receded
    vEdge = amt * depth / max(1.0 - cos(phiMax), 1e-4);
    float sx = 1.0 / (1.0 + uDir * depth * 0.90);
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
        poke.current = () => {
            needsDraw = true
        }
        const texCache = new Map<string, any>()
        const pending = new Set<string>()
        let texOK = 0
        let texFail = 0
        const giveUp = () => {
            // nothing has decoded and sources are erroring: show plain images
            if (texOK === 0 && texFail >= 2) setGlFailed(true)
        }
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
                let t: any = null
                try {
                    t = gl.createTexture()
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
                } catch (err) {
                    // a cross-origin image without CORS headers taints the
                    // texture upload and throws here
                    if (t) gl.deleteTexture(t)
                    pending.delete(s)
                    texFail++
                    giveUp()
                    return
                }
                texCache.set(s, t)
                pending.delete(s)
                texOK++
                needsDraw = true
            }
            img.onerror = () => {
                pending.delete(s)
                texFail++
                giveUp()
            }
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
    }, [domOnly])

    /* The loop parks itself when nothing is moving, so it has to be told when
       the layout changes underneath it — new CMS rows, a resize, new aspects. */
    useEffect(() => {
        poke.current()
    }, [layout, hover, showIndex, textGap])

    /* ---------------- render ---------------- */
    labelEls.current.length = layout.cells.length
    const showTitles = hover === "title"
    const empty = items.length === 0
    const elsewhere = empty ? otherGalleries(gallery) : []
    // entries under this gallery's own ID, before any filtering — separates
    // "nothing was ever placed" from "placed, but not on screen"
    const mineRaw = empty ? storeFor(gallery).entries.size : 0

    /* Escapes a padded or max-width parent so the gallery can span the window.
       A component inside a Collection List can never do this — it is bound to
       its grid cell — which is why the gallery lives on the page instead. */
    const bleed: any = fullBleed
        ? {
              width: "100vw",
              maxWidth: "100vw",
              marginLeft: "calc(50% - 50vw)",
              marginRight: "calc(50% - 50vw)",
          }
        : { width: "100%" }

    return (
        <div
            ref={wrapRef}
            style={{ ...style, position: "relative", background, ...bleed }}
        >
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    height: empty ? 320 : layout.height,
                }}
            >
                {domOnly ? (
                    layout.cells.map((c, i) => (
                        <a
                            key={i}
                            href={c.link || undefined}
                            target={c.newTab ? "_blank" : undefined}
                            rel={c.newTab ? "noopener" : undefined}
                            style={{
                                position: "absolute",
                                left: c.x,
                                top: c.y,
                                width: c.w,
                                height: c.h,
                                display: "block",
                            }}
                        >
                            <img
                                src={c.src}
                                alt={c.title}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    filter:
                                        hover === "gray2color"
                                            ? "grayscale(1)"
                                            : undefined,
                                }}
                            />
                        </a>
                    ))
                ) : (
                    /* The stage is always mounted, even with nothing to show
                       yet. CMS rows arrive an effect late, and if the canvas
                       were swapped in only once they landed, the WebGL setup
                       would have already run against a missing element and
                       would never get a second chance. */
                    <div
                        ref={stageRef}
                        style={{
                            position: "sticky",
                            top: 0,
                            width: "100%",
                            height: empty
                                ? 320
                                : `min(${dvh}, ${layout.height}px)`,
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
                                        ref={(el) => {
                                            labelEls.current[i] = el
                                        }}
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
                                                    fontVariantNumeric:
                                                        "tabular-nums",
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

                {empty && (
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
                            pointerEvents: "none",
                        }}
                    >
                        {mineRaw > 0 ? (
                            <>
                                {mineRaw} item{mineRaw === 1 ? "" : "s"} registered
                                under &ldquo;{gallery}&rdquo;, but none are on
                                screen. The Collection List holding them is
                                hidden or has not rendered yet.
                            </>
                        ) : elsewhere.length > 0 ? (
                            <>
                                Nothing under Gallery ID &ldquo;{gallery}&rdquo;.
                                {" "}
                                {elsewhere[0].count} item
                                {elsewhere[0].count === 1 ? " is" : "s are"}{" "}
                                registered under &ldquo;{elsewhere[0].id}&rdquo;
                                {" "}&mdash; make the two IDs match.
                            </>
                        ) : (
                            <>
                                No items yet. Put a <b>Warp Gallery Item</b>{" "}
                                inside your Collection List and give it the
                                Gallery ID &ldquo;{gallery}&rdquo;.
                            </>
                        )}
                        <br />
                        <span style={{ opacity: 0.7 }}>
                            This gallery must sit <b>outside</b> the Collection
                            List, not inside it.
                        </span>
                    </div>
                )}
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
            "Must match the Gallery ID on the Warp Gallery Items inside your Collection List.",
    },

    columns: { type: ControlType.Number, title: "Columns", defaultValue: 3, min: 1, max: 6, step: 1, displayStepper: true },
    columnsTablet: { type: ControlType.Number, title: "· Tablet", defaultValue: 0, min: 0, max: 6, step: 1, displayStepper: true, description: "Columns under 1000px. 0 keeps the desktop count." },
    columnsPhone: { type: ControlType.Number, title: "· Phone", defaultValue: 0, min: 0, max: 6, step: 1, displayStepper: true, description: "Columns under 600px. 0 keeps the desktop count." },
    pattern: {
        type: ControlType.String,
        title: "Pattern",
        defaultValue: "0*0\n**0\n0**",
        displayTextArea: true,
        description:
            "One line per row, one character per column. 0 places an image, * leaves a gap. The pattern repeats until every CMS item is placed.",
    },
    patternTablet: {
        type: ControlType.String,
        title: "· Tablet",
        defaultValue: "",
        displayTextArea: true,
        description: "Pattern used with the tablet column count. Leave empty to fill every column.",
        hidden: (p) => !(p.columnsTablet > 0),
    },
    patternPhone: {
        type: ControlType.String,
        title: "· Phone",
        defaultValue: "",
        displayTextArea: true,
        description: "Pattern used with the phone column count. Leave empty to fill every column.",
        hidden: (p) => !(p.columnsPhone > 0),
    },
    imageSize: { type: ControlType.Number, title: "Image Size", defaultValue: 1, min: 0.2, max: 3, step: 0.05 },
    gapX: { type: ControlType.Number, title: "Gap X", defaultValue: 16, min: 0, max: 200, step: 1 },
    gapY: { type: ControlType.Number, title: "Gap Y", defaultValue: 16, min: 0, max: 400, step: 1 },
    padding: { type: ControlType.Number, title: "Padding", defaultValue: 40, min: 0, max: 300, step: 1 },
    fullBleed: {
        type: ControlType.Boolean,
        title: "Full Bleed",
        defaultValue: false,
        description:
            "Span the whole window, ignoring the padding or max width of the section it sits in.",
    },
    background: { type: ControlType.Color, title: "Background", defaultValue: "transparent" },
    spaceBefore: { type: ControlType.Number, title: "Space Before", defaultValue: 0, min: 0, max: 3, step: 0.1, description: "Empty screens before the first row, in viewport heights." },
    spaceAfter: { type: ControlType.Number, title: "Space After", defaultValue: 0, min: 0, max: 3, step: 0.1 },

    hover: {
        type: ControlType.Enum,
        title: "Hover",
        defaultValue: "title",
        options: ["title", "gray2color", "color2gray", "none"],
        optionTitles: ["Title Appear", "Grayscale to Color", "Color to Grayscale", "None"],
    },
    font: { type: ControlType.String, title: "Font", defaultValue: 'ui-monospace, "SF Mono", Menlo, monospace' },
    textColor: { type: ControlType.Color, title: "Text Color", defaultValue: "#8a8f97" },
    showIndex: { type: ControlType.Boolean, title: "Show Index", defaultValue: true },
    textGap: { type: ControlType.Number, title: "Text Gap", defaultValue: 10, min: 0, max: 80, step: 1 },

    warpOn: { type: ControlType.Boolean, title: "Warp", defaultValue: true },
    edgeBand: { type: ControlType.Number, title: "Edge Band", defaultValue: 0.15, min: 0.02, max: 0.5, step: 0.01, hidden: (p) => !p.warpOn, description: "How far into the screen the curl reaches, as a fraction of the viewport." },
    edgeAngle: { type: ControlType.Number, title: "Angle", defaultValue: 0.7, min: 0.1, max: 1, step: 0.02, hidden: (p) => !p.warpOn, description: "How far the surface rolls away at the lip." },
    edgeScale: {
        type: ControlType.Enum,
        title: "At Edge",
        defaultValue: "shrink",
        options: ["shrink", "grow"],
        optionTitles: ["Scale Down", "Scale Up"],
        hidden: (p) => !p.warpOn,
    },
    restingCurl: { type: ControlType.Number, title: "Resting Curl", defaultValue: 0.02, min: 0, max: 0.3, step: 0.005, hidden: (p) => !p.warpOn, description: "Curl left in place when the page is still." },
    dispersion: { type: ControlType.Number, title: "Dispersion", defaultValue: 0.12, min: 0, max: 0.6, step: 0.005, hidden: (p) => !p.warpOn, description: "Splits the warped edge into a spectrum." },
    scrollSpeed: { type: ControlType.Number, title: "Scroll Speed", defaultValue: 0.11, min: 0.02, max: 0.6, step: 0.01, description: "Lower lags further behind the page, which drives a stronger warp." },
    intensity: { type: ControlType.Number, title: "Intensity", defaultValue: 1.3, min: 0.1, max: 3, step: 0.05, hidden: (p) => !p.warpOn },
})
