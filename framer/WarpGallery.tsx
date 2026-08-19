import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { useEffect, useMemo, useRef, useState } from "react"

/**
 * CMS Warp Gallery
 *
 * A finite, row-based image grid with a WebGL warp driven by scroll velocity.
 * The page behaves as if wrapped around a horizontal cylinder seen from the
 * inside: the middle band of the viewport recedes and pinches narrower, the
 * top and bottom edges come forward at full width.
 *
 * The gallery's height is carried by a real in-flow spacer, not by an explicit
 * height on the root. Framer's Fit Content measures in-flow content, and every
 * drawn element here is absolutely positioned, so without the spacer it would
 * measure zero and collapse.
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 1200
 * @framerIntrinsicHeight 1400
 * @framerDisableUnlink
 */
export default function WarpGallery(props) {
    const {
        rows = [],
        scrollMode = "page",
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
    const scrollerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const labelsRef = useRef<HTMLDivElement>(null)
    const labelEls = useRef<(HTMLElement | null)[]>([])

    const target = RenderTarget.current()
    const isCanvas = target === RenderTarget.canvas || target === RenderTarget.thumbnail

    /* ---------------------------------------------------------------
       1. Rows -> flat item list. The pattern picks the columns.
       --------------------------------------------------------------- */
    const items = useMemo(() => {
        const out: any[] = []
        let index = 0
        ;(rows || []).forEach((row, r) => {
            const imgs = (row?.images || []).filter((i: any) => i && i.image)
            const pat = (row?.pattern || "").replace(/[^0*]/g, "")
            const slots: number[] = []
            if (pat) {
                for (let c = 0; c < columns; c++)
                    if (pat[c] && pat[c] !== "*") slots.push(c)
            } else {
                for (let c = 0; c < Math.min(imgs.length, columns); c++) slots.push(c)
            }
            slots.forEach((col, i) => {
                const it = imgs[i]
                if (!it) return
                const src =
                    typeof it.image === "string" ? it.image : it.image?.src
                if (!src) return
                out.push({
                    col,
                    src,
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

    /* ---------------------------------------------------------------
       2. Measure our own width, and learn each image's aspect ratio.
          Both feed the layout, so both must live in React state.
       --------------------------------------------------------------- */
    const [width, setWidth] = useState(0)
    const [aspects, setAspects] = useState<Record<string, number>>({})

    useEffect(() => {
        const el = wrapRef.current
        if (!el) return
        const measure = () => setWidth(Math.round(el.getBoundingClientRect().width))
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        let alive = true
        const seen = new Set<string>()
        items.forEach((it) => {
            if (seen.has(it.src)) return
            seen.add(it.src)
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.decoding = "async"
            img.onload = () => {
                if (!alive || !img.width || !img.height) return
                const a = img.width / img.height
                setAspects((prev) =>
                    prev[it.src] === a ? prev : { ...prev, [it.src]: a }
                )
            }
            img.src = it.src
        })
        return () => {
            alive = false
        }
    }, [items])

    /* ---------------------------------------------------------------
       3. Layout is a pure function of the above. Height comes straight
          out of it and is rendered, not written imperatively.
       --------------------------------------------------------------- */
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
        let y = padding
        const keys = [...byRow.keys()].sort((a, b) => a - b)

        keys.forEach((rk, ri) => {
            const list = byRow.get(rk)!
            let rowH = 0
            list.forEach((it, i) => {
                const aspect = aspects[it.src] || 1
                // grow into the empty cells beside it, never into the next image
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
                    gray: 0,
                })
                rowH = Math.max(rowH, ch)
            })
            y += rowH + (ri < keys.length - 1 ? gapY : 0)
        })

        return { cells, height: Math.max(1, Math.round(y + padding)) }
    }, [items, aspects, width, columns, gapX, gapY, padding, imageSize])

    /* Live values the render loop reads without re-creating the GL context. */
    const live = useRef({} as any)
    live.current = {
        layout,
        hover,
        warpOn,
        scrollSpeed,
        intensity,
        isCanvas,
    }

    /* ---------------------------------------------------------------
       4. WebGL. Created once; everything dynamic comes from `live`.
       --------------------------------------------------------------- */
    useEffect(() => {
        if (isCanvas) return
        const wrap = wrapRef.current
        const sticky = stickyRef.current
        const canvas = canvasRef.current
        const labelsEl = labelsRef.current
        if (!wrap || !sticky || !canvas) return

        const opts: WebGLContextAttributes = {
            alpha: true,
            antialias: true,
            depth: false,
            stencil: false,
            premultipliedAlpha: true,
            powerPreference: "high-performance",
        }
        const gl: any =
            canvas.getContext("webgl2", opts) || canvas.getContext("webgl", opts)
        if (!gl) return
        const isGL2 =
            typeof WebGL2RenderingContext !== "undefined" &&
            gl instanceof WebGL2RenderingContext

        const BODY = `
  vec2 d = p - 0.5;
  float u = clamp(2.0 * d.y, -1.0, 1.0);
  float c = 1.0 - u * u;
  float sx = max(1.0 - uWarp * 1.05 * c, 0.34);
  float kv = min(uWarp * 1.15, 0.44);
  float uv = u / (1.0 + kv * u * u);
  p = 0.5 + vec2(d.x * sx, uv * 0.5);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);`

        const VERT = isGL2
            ? `#version 300 es
in vec2 aPos;
uniform vec4 uRect; uniform vec2 uRes; uniform float uWarp;
out vec2 vUv;
void main(){ vUv = aPos; vec2 p = (uRect.xy + aPos * uRect.zw) / uRes;${BODY} }`
            : `
attribute vec2 aPos;
uniform vec4 uRect; uniform vec2 uRes; uniform float uWarp;
varying vec2 vUv;
void main(){ vUv = aPos; vec2 p = (uRect.xy + aPos * uRect.zw) / uRes;${BODY} }`

        const FRAG = isGL2
            ? `#version 300 es
precision highp float;
in vec2 vUv; uniform sampler2D uTex; uniform float uGray; out vec4 frag;
void main(){ vec4 c = texture(uTex, vUv);
  float g = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
  frag = vec4(mix(c.rgb, vec3(g), uGray), c.a); }`
            : `
precision highp float;
varying vec2 vUv; uniform sampler2D uTex; uniform float uGray;
void main(){ vec4 c = texture2D(uTex, vUv);
  float g = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
  gl_FragColor = vec4(mix(c.rgb, vec3(g), uGray), c.a); }`

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
        const vs = compile(VERT, gl.VERTEX_SHADER)
        const fs = compile(FRAG, gl.FRAGMENT_SHADER)
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
        ;["uRect", "uRes", "uWarp", "uTex", "uGray"].forEach(
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
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
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
                texCache.set(src, t)
                pending.delete(src)
            }
            img.onerror = () => pending.delete(src)
            img.src = src
            return null
        }

        let stageW = 1
        let stageH = 1
        function resize() {
            const r = sticky.getBoundingClientRect()
            stageW = Math.max(1, Math.round(r.width))
            stageH = Math.max(1, Math.round(r.height))
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.round(stageW * dpr)
            canvas.height = Math.round(stageH * dpr)
            gl.viewport(0, 0, canvas.width, canvas.height)
        }
        const ro = new ResizeObserver(resize)
        ro.observe(sticky)
        resize()

        let hovered = -1
        const pointer = { x: -1, y: -1, inside: false }
        const onMove = (e: PointerEvent) => {
            const r = sticky.getBoundingClientRect()
            pointer.x = e.clientX - r.left
            pointer.y = e.clientY - r.top
            pointer.inside = true
        }
        const onLeave = () => (pointer.inside = false)
        const onClick = () => {
            const cells = live.current.layout.cells
            if (hovered < 0 || !cells[hovered]?.link) return
            const cell = cells[hovered]
            if (cell.newTab) window.open(cell.link, "_blank", "noopener")
            else window.location.href = cell.link
        }
        sticky.addEventListener("pointermove", onMove)
        sticky.addEventListener("pointerleave", onLeave)
        sticky.addEventListener("click", onClick)

        let raf = 0
        let renderScroll = window.scrollY
        let prevScroll = renderScroll
        let warp = 0
        let last = performance.now()
        const grays = new Map<number, number>()

        function frame(now: number) {
            raf = requestAnimationFrame(frame)
            const L = live.current
            const cells = L.layout.cells

            let dt = (now - last) / 1000
            last = now
            dt = Math.min(dt, 1 / 20)
            const step = Math.min(1, dt * 60)

            const scroller = scrollerRef.current
            const targetScroll = scroller ? scroller.scrollTop : window.scrollY
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

            /* Where the content sits relative to the canvas.
               Inside mode: the canvas is the viewport, so the content simply
               slides by the smoothed scroll position.
               Page mode: the canvas is stuck to the viewport while the section
               passes, so track the section's top and add the lag. */
            let offset: number
            if (scroller) {
                offset = -renderScroll
            } else {
                const sizer = sticky.parentElement || wrap
                offset =
                    sizer.getBoundingClientRect().top -
                    sticky.getBoundingClientRect().top +
                    (targetScroll - renderScroll)
            }

            if (labelsEl)
                labelsEl.style.transform = `translate3d(0, ${offset}px, 0)`

            const prevHover = hovered
            if (pointer.inside && L.hover !== "none" && warp < 0.02) {
                hovered = -1
                for (let i = cells.length - 1; i >= 0; i--) {
                    const c = cells[i]
                    const sy = c.y + offset
                    if (
                        pointer.x >= c.x &&
                        pointer.x <= c.x + c.w &&
                        pointer.y >= sy &&
                        pointer.y <= sy + c.h
                    ) {
                        hovered = i
                        break
                    }
                }
            } else if (!pointer.inside) hovered = -1

            if (hovered !== prevHover) {
                sticky.style.cursor =
                    hovered >= 0 && cells[hovered]?.link ? "pointer" : ""
                const els = labelEls.current
                if (prevHover >= 0 && els[prevHover])
                    els[prevHover]!.style.opacity = "0"
                if (hovered >= 0 && els[hovered]) els[hovered]!.style.opacity = "1"
            }

            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.useProgram(prog)
            if (isGL2 && vao) gl.bindVertexArray(vao)
            gl.uniform2f(uni.uRes, stageW, stageH)
            gl.uniform1f(uni.uWarp, warp)
            gl.activeTexture(gl.TEXTURE0)

            const bg = L.hover === "gray2color" ? 1 : 0
            const hg =
                L.hover === "gray2color" ? 0 : L.hover === "color2gray" ? 1 : bg
            const margin = stageH * 0.9

            for (let i = 0; i < cells.length; i++) {
                const c = cells[i]
                const y = c.y + offset
                if (y + c.h < -margin || y > stageH + margin) continue
                const tex = textureFor(c.src)
                if (!tex) continue

                const want = i === hovered ? hg : bg
                const cur = grays.get(i) ?? bg
                const next = cur + (want - cur) * Math.min(1, step * 0.16)
                grays.set(i, next)

                gl.bindTexture(gl.TEXTURE_2D, tex)
                gl.uniform4f(uni.uRect, c.x, y, c.w, c.h)
                gl.uniform1f(uni.uGray, next)
                gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
            }
        }
        raf = requestAnimationFrame((t) => {
            last = t
            frame(t)
        })

        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            sticky.removeEventListener("pointermove", onMove)
            sticky.removeEventListener("pointerleave", onLeave)
            sticky.removeEventListener("click", onClick)
            texCache.forEach((t) => gl.deleteTexture(t))
            texCache.clear()
            gl.deleteBuffer(vb)
            gl.deleteBuffer(ib)
            if (vao) gl.deleteVertexArray(vao)
            gl.deleteProgram(prog)
        }
    }, [isCanvas, scrollMode])

    /* ---------------------------------------------------------------
       5. Render
       --------------------------------------------------------------- */
    const empty = items.length === 0
    const showTitles = hover === "title"
    labelEls.current.length = layout.cells.length

    const contentH = empty ? 320 : layout.height
    const inside = scrollMode === "inside"

    /* The root deliberately has NO height of its own. Framer's Fit Content
       measures in-flow content, so the height must come from a real in-flow
       box — `sizer` below. If the user picks a fixed height instead, Framer's
       own `style` carries it and this stays out of the way. */
    const wrapStyle: any = {
        ...style,
        position: "relative",
        width: "100%",
        background,
    }

    const sizerStyle: any = {
        position: "relative",
        width: "100%",
        height: contentH,
    }

    /* Inside mode: the section is one box that Framer sizes (Viewport, Fixed or
       Fill) and the gallery scrolls within it. Framer's own height comes
       through `style`; fall back to a viewport if it did not set one. */
    const insideWrapStyle: any = {
        ...style,
        position: "relative",
        width: "100%",
        height: (style as any)?.height ?? "100vh",
        minHeight: 200,
        background,
        overflow: "hidden",
    }

    if (empty) {
        return (
            <div ref={wrapRef} style={wrapStyle}>
              <div style={sizerStyle}>
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
                    Add a row, then add images to it.
                    <br />
                    Pattern: 0 places an image, * leaves the cell empty.
                </div>
              </div>
            </div>
        )
    }

    /* On the Framer canvas draw plain images: correct height, no WebGL cost. */
    if (isCanvas) {
        return (
            <div ref={wrapRef} style={inside ? insideWrapStyle : wrapStyle}>
              <div style={inside ? { position: "relative", width: "100%" } : sizerStyle}>
                {layout.cells.map((c, i) => (
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
                            filter: hover === "gray2color" ? "grayscale(1)" : undefined,
                        }}
                    />
                ))}
              </div>
            </div>
        )
    }

    return (
        <div
            ref={wrapRef}
            style={inside ? insideWrapStyle : wrapStyle}
        >
          <div style={inside ? { position: "absolute", inset: 0 } : sizerStyle}>
            <div
                ref={stickyRef}
                style={
                    inside
                        ? {
                              position: "absolute",
                              inset: 0,
                              width: "100%",
                              height: "100%",
                              overflow: "hidden",
                          }
                        : {
                              position: "sticky",
                              top: 0,
                              width: "100%",
                              height: `min(100vh, ${contentH}px)`,
                              overflow: "hidden",
                          }
                }
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
                {inside && (
                    <div
                        ref={scrollerRef}
                        tabIndex={0}
                        aria-label="Gallery, scrollable"
                        style={{
                            position: "absolute",
                            inset: 0,
                            overflowY: "auto",
                            overflowX: "hidden",
                            zIndex: 3,
                            overscrollBehavior: "contain",
                        }}
                    >
                        <div style={{ height: contentH }} />
                    </div>
                )}
            </div>
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

    scrollMode: {
        type: ControlType.Enum,
        title: "Scroll",
        options: ["page", "inside"],
        optionTitles: ["With page", "Inside section"],
        defaultValue: "page",
        description:
            "With page: the section is as tall as the gallery and warps as the page scrolls past — set height to Fit Content. Inside section: the gallery scrolls within a fixed box — set height to Viewport, Fixed or Fill.",
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
        optionTitles: ["Grayscale to Color", "Color to Grayscale", "Title Appear", "None"],
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
