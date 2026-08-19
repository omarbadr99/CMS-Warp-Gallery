import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useMemo, useRef } from "react"

/**
 * CMS Warp Gallery
 *
 * A finite, row-based image grid with a WebGL warp driven by scroll velocity.
 * The page behaves as if wrapped around a horizontal cylinder seen from the
 * inside: the middle band of the viewport recedes and pinches narrower, the top
 * and bottom edges come forward at full width.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 900
 * @framerDisableUnlink
 */
export default function WarpGallery(props) {
    const {
        rows = [],
        columns = 6,
        gapX = 14,
        gapY = 64,
        padding = 56,
        imageSize = 1.9,
        font = 'ui-monospace, "SF Mono", Menlo, monospace',
        textColor = "#8a8f97",
        showIndex = true,
        textGap = 10,
        hover = "title",
        warpOn = true,
        scrollSpeed = 0.11,
        intensity = 1.3,
        background = "#ffffff",
        style,
    } = props

    const wrapRef = useRef<HTMLDivElement>(null)
    const stickyRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const labelsRef = useRef<HTMLDivElement>(null)

    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    /* ---------------------------------------------------------------
       Flatten the row array into drawable cells. The pattern decides
       which columns are filled; images fill those slots in order.
       --------------------------------------------------------------- */
    const items = useMemo(() => {
        const out: any[] = []
        let index = 0
        ;(rows || []).forEach((row, r) => {
            const imgs = (row?.images || []).filter((i) => i && i.image)
            const pat = (row?.pattern || "").replace(/[^0*]/g, "")
            const slots: number[] = []
            if (pat) {
                for (let c = 0; c < columns; c++)
                    if (pat[c] && pat[c] !== "*") slots.push(c)
            } else {
                for (let c = 0; c < Math.min(imgs.length, columns); c++)
                    slots.push(c)
            }
            slots.forEach((col, i) => {
                const it = imgs[i]
                if (!it) return
                out.push({
                    col,
                    slotIndex: i,
                    slots,
                    src: typeof it.image === "string" ? it.image : it.image?.src,
                    title: it.title || "",
                    link: row?.link || "",
                    newTab: row?.newTab !== false,
                    row: r,
                    index: ++index,
                })
            })
        })
        return out
    }, [rows, columns])

    /* Live values the animation loop reads without re-running its effect. */
    const cfg = useRef({} as any)
    cfg.current = {
        columns,
        gapX,
        gapY,
        padding,
        imageSize,
        hover,
        warpOn,
        scrollSpeed,
        intensity,
        showIndex,
        textGap,
        font,
        textColor,
        items,
        isCanvas,
    }

    /* Content height drives the wrapper, so the page scrolls naturally. */
    const heightRef = useRef(0)
    /* Set by the WebGL effect so prop changes can force a relayout. */
    const relayoutRef = useRef<null | (() => void)>(null)

    useEffect(() => {
        const wrap = wrapRef.current
        const sticky = stickyRef.current
        const canvas = canvasRef.current
        const labelsEl = labelsRef.current
        if (!wrap || !canvas || !sticky) return

        const opts: WebGLContextAttributes = {
            alpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            powerPreference: "high-performance",
        }
        let gl: any =
            canvas.getContext("webgl2", opts) || canvas.getContext("webgl", opts)
        if (!gl) return
        const isGL2 = typeof WebGL2RenderingContext !== "undefined" &&
            gl instanceof WebGL2RenderingContext

        /* ---------------- shaders ---------------- */
        const VERT_300 = `#version 300 es
in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uWarp;
out vec2 vUv;
void main(){
  vUv = aPos;
  vec2 p = (uRect.xy + aPos * uRect.zw) / uRes;
  vec2 d = p - 0.5;
  float u = clamp(2.0 * d.y, -1.0, 1.0);
  float c = 1.0 - u * u;
  float sx = max(1.0 - uWarp * 1.05 * c, 0.34);
  float kv = min(uWarp * 1.15, 0.44);
  float uv = u / (1.0 + kv * u * u);
  p = 0.5 + vec2(d.x * sx, uv * 0.5);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`
        const FRAG_300 = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uGray;
uniform float uAlpha;
out vec4 frag;
void main(){
  vec4 c = texture(uTex, vUv);
  float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  frag = vec4(mix(c.rgb, vec3(g), uGray), c.a) * uAlpha;
}`
        const VERT_100 = `
attribute vec2 aPos;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uWarp;
varying vec2 vUv;
void main(){
  vUv = aPos;
  vec2 p = (uRect.xy + aPos * uRect.zw) / uRes;
  vec2 d = p - 0.5;
  float u = clamp(2.0 * d.y, -1.0, 1.0);
  float c = 1.0 - u * u;
  float sx = max(1.0 - uWarp * 1.05 * c, 0.34);
  float kv = min(uWarp * 1.15, 0.44);
  float uv = u / (1.0 + kv * u * u);
  p = 0.5 + vec2(d.x * sx, uv * 0.5);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`
        const FRAG_100 = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uGray;
uniform float uAlpha;
void main(){
  vec4 c = texture2D(uTex, vUv);
  float g = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(c.rgb, vec3(g), uGray), c.a) * uAlpha;
}`

        function compile(src: string, type: number) {
            const sh = gl.createShader(type)
            gl.shaderSource(sh, src)
            gl.compileShader(sh)
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                console.warn("WarpGallery shader:", gl.getShaderInfoLog(sh))
                gl.deleteShader(sh)
                return null
            }
            return sh
        }

        const vs = compile(isGL2 ? VERT_300 : VERT_100, gl.VERTEX_SHADER)
        const fs = compile(isGL2 ? FRAG_300 : FRAG_100, gl.FRAGMENT_SHADER)
        if (!vs || !fs) return
        const prog = gl.createProgram()
        gl.attachShader(prog, vs)
        gl.attachShader(prog, fs)
        gl.bindAttribLocation(prog, 0, "aPos")
        gl.linkProgram(prog)
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.warn("WarpGallery link:", gl.getProgramInfoLog(prog))
            return
        }
        gl.deleteShader(vs)
        gl.deleteShader(fs)
        gl.useProgram(prog)

        const uni: any = {}
        ;["uRect", "uRes", "uWarp", "uTex", "uGray", "uAlpha"].forEach(
            (n) => (uni[n] = gl.getUniformLocation(prog, n))
        )
        gl.uniform1i(uni.uTex, 0)

        /* subdivided quad so the curve bends smoothly */
        const SEG = 14
        const verts: number[] = []
        for (let j = 0; j <= SEG; j++)
            for (let i = 0; i <= SEG; i++) verts.push(i / SEG, j / SEG)
        const idx: number[] = []
        for (let j = 0; j < SEG; j++)
            for (let i = 0; i < SEG; i++) {
                const a = j * (SEG + 1) + i,
                    b = a + 1,
                    c = a + SEG + 1,
                    d = c + 1
                idx.push(a, c, b, b, c, d)
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
        gl.bufferData(
            gl.ELEMENT_ARRAY_BUFFER,
            new Uint16Array(idx),
            gl.STATIC_DRAW
        )

        gl.disable(gl.DEPTH_TEST)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

        /* ---------------- textures ---------------- */
        const texCache = new Map<string, any>()
        const pending = new Set<string>()

        function textureFor(src: string) {
            if (!src) return null
            const hit = texCache.get(src)
            if (hit) return hit
            if (pending.has(src)) return null
            pending.add(src)
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            img.onload = () => {
                const t = gl.createTexture()
                gl.bindTexture(gl.TEXTURE_2D, t)
                gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    img
                )
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
                if (isGL2) {
                    gl.generateMipmap(gl.TEXTURE_2D)
                    gl.texParameteri(
                        gl.TEXTURE_2D,
                        gl.TEXTURE_MIN_FILTER,
                        gl.LINEAR_MIPMAP_LINEAR
                    )
                } else {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                }
                texCache.set(src, { tex: t, aspect: img.width / img.height })
                pending.delete(src)
            }
            img.onerror = () => pending.delete(src)
            img.src = src
            return null
        }

        /* ---------------- layout ---------------- */
        let stageW = 0
        let stageH = 0
        let dpr = 1
        let cells: any[] = []

        function computeLayout() {
            const c = cfg.current
            const cols = Math.max(1, c.columns)
            const inner = Math.max(40, stageW - c.padding * 2)
            const colW = (inner - c.gapX * (cols - 1)) / cols
            cells = []
            let y = c.padding

            const byRow = new Map<number, any[]>()
            c.items.forEach((it) => {
                if (!byRow.has(it.row)) byRow.set(it.row, [])
                byRow.get(it.row).push(it)
            })

            const rowKeys = [...byRow.keys()].sort((a, b) => a - b)
            rowKeys.forEach((rk, ri) => {
                const list = byRow.get(rk)
                let rowH = 0
                list.forEach((it, i) => {
                    const t = texCache.get(it.src)
                    const aspect = t ? t.aspect : 1
                    // grow into the empty cells beside it, never into the next image
                    const nextCol = i + 1 < list.length ? list[i + 1].col : cols
                    const room = (nextCol - it.col) * (colW + c.gapX) - c.gapX
                    const w = Math.min(colW * c.imageSize, room)
                    const h = w / aspect
                    cells.push({
                        ...it,
                        x: c.padding + it.col * (colW + c.gapX),
                        y,
                        w,
                        h,
                        gray: 0,
                    })
                    rowH = Math.max(rowH, h)
                })
                y += rowH + (ri < rowKeys.length - 1 ? c.gapY : 0)
            })

            const total = Math.max(1, Math.round(y + c.padding))
            heightRef.current = total
            wrap.style.height = total + "px"
            buildLabels()
        }

        /* ---------------- hover labels ---------------- */
        let labelEls: HTMLElement[] = []
        function buildLabels() {
            if (!labelsEl) return
            labelsEl.textContent = ""
            labelEls = []
            const c = cfg.current
            if (c.hover !== "title") return
            const frag = document.createDocumentFragment()
            cells.forEach((cell) => {
                const el = document.createElement("div")
                el.style.cssText =
                    "position:absolute;opacity:0;transition:opacity .28s ease;" +
                    "white-space:nowrap;line-height:1.35;pointer-events:none"
                el.style.fontFamily = c.font
                el.style.color = c.textColor
                el.style.fontSize = "11px"
                if (c.showIndex) {
                    const ix = document.createElement("span")
                    ix.style.cssText =
                        "display:block;opacity:.55;font-variant-numeric:tabular-nums"
                    ix.textContent = String(cell.index).padStart(2, "0")
                    el.appendChild(ix)
                }
                el.appendChild(document.createTextNode(cell.title))
                el.style.left = cell.x + "px"
                el.style.top = cell.y + "px"
                el.style.transform = "translateY(-100%)"
                el.style.marginTop = -c.textGap + "px"
                frag.appendChild(el)
                labelEls.push(el)
            })
            labelsEl.appendChild(frag)
        }

        /* ---------------- sizing ---------------- */
        function resize() {
            const r = sticky.getBoundingClientRect()
            stageW = Math.max(1, Math.round(r.width))
            stageH = Math.max(1, Math.round(r.height))
            dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.round(stageW * dpr)
            canvas.height = Math.round(stageH * dpr)
            gl.viewport(0, 0, canvas.width, canvas.height)
            computeLayout()
        }

        relayoutRef.current = computeLayout

        const ro = new ResizeObserver(resize)
        ro.observe(sticky)
        resize()

        /* ---------------- interaction ---------------- */
        let hovered = -1
        const pointer = { x: -1, y: -1, inside: false }

        function onMove(e: PointerEvent) {
            const r = sticky.getBoundingClientRect()
            pointer.x = e.clientX - r.left
            pointer.y = e.clientY - r.top
            pointer.inside = true
        }
        function onLeave() {
            pointer.inside = false
        }
        function onClick() {
            if (hovered < 0) return
            const cell = cells[hovered]
            if (!cell?.link) return
            if (cell.newTab) window.open(cell.link, "_blank", "noopener")
            else window.location.href = cell.link
        }
        sticky.addEventListener("pointermove", onMove)
        sticky.addEventListener("pointerleave", onLeave)
        sticky.addEventListener("click", onClick)

        /* ---------------- frame loop ---------------- */
        let raf = 0
        let renderScroll = window.scrollY
        let prevScroll = renderScroll
        let warp = 0
        let last = performance.now()

        function baseGray() {
            return cfg.current.hover === "gray2color" ? 1 : 0
        }
        function hoverGray() {
            const h = cfg.current.hover
            if (h === "gray2color") return 0
            if (h === "color2gray") return 1
            return baseGray()
        }

        function frame(now: number) {
            raf = requestAnimationFrame(frame)
            const c = cfg.current

            let dt = (now - last) / 1000
            last = now
            dt = Math.min(dt, 1 / 20)
            const step = Math.min(1, dt * 60)

            const target = window.scrollY
            if (c.isCanvas) {
                renderScroll = target
            } else {
                const damp = 1 - Math.pow(1 - c.scrollSpeed, step)
                renderScroll += (target - renderScroll) * damp
                if (Math.abs(target - renderScroll) < 0.05) renderScroll = target
            }
            const vel = (renderScroll - prevScroll) / Math.max(step, 0.0001)
            prevScroll = renderScroll

            const raw =
                c.warpOn && !c.isCanvas
                    ? Math.min(
                          (1 - Math.exp(-Math.abs(vel) / 70)) * c.intensity * 0.37,
                          0.5
                      )
                    : 0
            warp += (raw - warp) * Math.min(1, step * (raw > warp ? 0.38 : 0.13))
            if (warp < 0.0004) warp = 0

            /* content lags behind the real scroll; that lag is the warp signal */
            const lag = target - renderScroll
            const wrapTop = wrap.getBoundingClientRect().top - sticky.getBoundingClientRect().top

            if (labelsEl)
                labelsEl.style.transform = `translate3d(0, ${wrapTop + lag}px, 0)`

            /* hover */
            const prevHover = hovered
            if (pointer.inside && c.hover !== "none" && warp < 0.02) {
                hovered = -1
                for (let i = cells.length - 1; i >= 0; i--) {
                    const cell = cells[i]
                    const sy = cell.y + wrapTop + lag
                    if (
                        pointer.x >= cell.x &&
                        pointer.x <= cell.x + cell.w &&
                        pointer.y >= sy &&
                        pointer.y <= sy + cell.h
                    ) {
                        hovered = i
                        break
                    }
                }
            } else if (!pointer.inside) hovered = -1

            if (hovered !== prevHover) {
                sticky.style.cursor = hovered >= 0 && cells[hovered]?.link ? "pointer" : ""
                if (labelEls.length) {
                    if (prevHover >= 0 && labelEls[prevHover])
                        labelEls[prevHover].style.opacity = "0"
                    if (hovered >= 0 && labelEls[hovered])
                        labelEls[hovered].style.opacity = "1"
                }
            }

            /* draw */
            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.useProgram(prog)
            if (isGL2 && vao) gl.bindVertexArray(vao)
            gl.uniform2f(uni.uRes, stageW, stageH)
            gl.uniform1f(uni.uWarp, warp)
            gl.uniform1f(uni.uAlpha, 1)
            gl.activeTexture(gl.TEXTURE0)

            const bg = baseGray()
            const hg = hoverGray()
            const margin = stageH * 0.9
            let needsLayout = false

            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i]
                const y = cell.y + wrapTop + lag
                if (y + cell.h < -margin || y > stageH + margin) continue

                const t = textureFor(cell.src)
                if (!t) {
                    if (texCache.has(cell.src)) needsLayout = true
                    continue
                }
                cell.gray +=
                    ((i === hovered ? hg : bg) - cell.gray) * Math.min(1, step * 0.16)

                gl.bindTexture(gl.TEXTURE_2D, t.tex)
                gl.uniform4f(uni.uRect, cell.x, y, cell.w, cell.h)
                gl.uniform1f(uni.uGray, cell.gray)
                gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
            }

            /* a texture arrived after layout was computed with a guessed aspect */
            if (needsLayout) computeLayout()
        }

        /* recompute once images land so real aspect ratios are used */
        const settle = setInterval(() => {
            if (pending.size === 0) {
                computeLayout()
                clearInterval(settle)
            }
        }, 250)

        raf = requestAnimationFrame((t) => {
            last = t
            frame(t)
        })

        return () => {
            cancelAnimationFrame(raf)
            clearInterval(settle)
            ro.disconnect()
            sticky.removeEventListener("pointermove", onMove)
            sticky.removeEventListener("pointerleave", onLeave)
            sticky.removeEventListener("click", onClick)
            relayoutRef.current = null
            texCache.forEach((t) => gl.deleteTexture(t.tex))
            texCache.clear()
            gl.deleteBuffer(vb)
            gl.deleteBuffer(ib)
            if (vao) gl.deleteVertexArray(vao)
            gl.deleteProgram(prog)
        }
    }, [items, isCanvas])

    /* Layout-affecting props re-run the layout without rebuilding WebGL. */
    useEffect(() => {
        relayoutRef.current?.()
    }, [columns, gapX, gapY, padding, imageSize, hover, showIndex, textGap, font, textColor])

    const empty = items.length === 0

    return (
        <div
            ref={wrapRef}
            style={{
                ...style,
                position: "relative",
                width: "100%",
                background,
                minHeight: empty ? 240 : undefined,
            }}
        >
            <div
                ref={stickyRef}
                style={{
                    position: "sticky",
                    top: 0,
                    height: "100vh",
                    overflow: "hidden",
                    width: "100%",
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
                />
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
                        }}
                    >
                        Add a row, then add images to it.
                        <br />
                        Pattern: 0 places an image, * leaves the cell empty.
                    </div>
                )}
            </div>
        </div>
    )
}

addPropertyControls(WarpGallery, {
    rows: {
        type: ControlType.Array,
        title: "Rows",
        control: {
            type: ControlType.Object,
            title: "Row",
            controls: {
                images: {
                    type: ControlType.Array,
                    title: "Images",
                    control: {
                        type: ControlType.Object,
                        title: "Image",
                        controls: {
                            image: {
                                type: ControlType.ResponsiveImage,
                                title: "Image",
                            },
                            title: {
                                type: ControlType.String,
                                title: "Title",
                                defaultValue: "Untitled",
                            },
                        },
                    },
                },
                pattern: {
                    type: ControlType.String,
                    title: "Pattern",
                    defaultValue: "0*0*0*",
                    description:
                        "One character per column. 0 places an image, * leaves the cell empty.",
                },
                link: { type: ControlType.Link, title: "Link" },
                newTab: {
                    type: ControlType.Boolean,
                    title: "New tab",
                    defaultValue: true,
                },
            },
        },
    },

    columns: {
        type: ControlType.Number,
        title: "Columns",
        min: 1,
        max: 6,
        step: 1,
        displayStepper: true,
        defaultValue: 6,
    },
    imageSize: {
        type: ControlType.Number,
        title: "Image size",
        min: 1,
        max: 4,
        step: 0.05,
        defaultValue: 1.9,
        description:
            "In column widths. Images grow into the empty cells beside them, never into the next image.",
    },
    gapX: { type: ControlType.Number, title: "Gap X", min: 0, max: 120, defaultValue: 14 },
    gapY: { type: ControlType.Number, title: "Gap Y", min: 0, max: 320, defaultValue: 64 },
    padding: { type: ControlType.Number, title: "Padding", min: 0, max: 200, defaultValue: 56 },
    background: { type: ControlType.Color, title: "Background", defaultValue: "#ffffff" },

    hover: {
        type: ControlType.Enum,
        title: "Hover",
        options: ["gray2color", "color2gray", "title", "none"],
        optionTitles: [
            "Grayscale to Color",
            "Color to Grayscale",
            "Title Appear",
            "None",
        ],
        defaultValue: "title",
    },

    font: {
        type: ControlType.String,
        title: "Font",
        defaultValue: 'ui-monospace, "SF Mono", Menlo, monospace',
        hidden: (p) => p.hover !== "title",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text color",
        defaultValue: "#8a8f97",
        hidden: (p) => p.hover !== "title",
    },
    showIndex: {
        type: ControlType.Boolean,
        title: "Index",
        defaultValue: true,
        hidden: (p) => p.hover !== "title",
    },
    textGap: {
        type: ControlType.Number,
        title: "Text gap",
        min: 0,
        max: 48,
        defaultValue: 10,
        hidden: (p) => p.hover !== "title",
    },

    warpOn: { type: ControlType.Boolean, title: "Warp", defaultValue: true },
    scrollSpeed: {
        type: ControlType.Number,
        title: "Scroll speed",
        min: 0.03,
        max: 0.4,
        step: 0.005,
        defaultValue: 0.11,
        hidden: (p) => !p.warpOn,
        description: "Lower trails further behind the scroll, so the curve runs deeper.",
    },
    intensity: {
        type: ControlType.Number,
        title: "Intensity",
        min: 0,
        max: 3,
        step: 0.05,
        defaultValue: 1.3,
        hidden: (p) => !p.warpOn,
    },
})
