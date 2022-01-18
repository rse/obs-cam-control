/*
**  OBS-Crop-Control ~ Remote Crop-Filter Control for OBS Studio
**  Copyright (c) 2021-2022 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Distributed under GPL 3.0 license <https://spdx.org/licenses/GPL-3.0-only.html>
*/

const app = {
    data () {
        return {
            obs:               null,
            obsStudioMode:     false,
            obsScenePreview:   "",
            obsSceneProgram:   "",
            sourceActive:      false,
            debug:             false,
            transparent:       false,
            canvasW:           0,
            canvasH:           0,
            canvasR:           0,
            sourcesVirtual:    [],
            sourcesPhysical:   [],
            presetsVirtual:    [],
            presetsPhysical:   [],
            recalling:         false,
            recallnext:        null,
            speed:             0,
            title:             "",
            cropX:             0,
            cropY:             0,
            cropW:             0,
            cropH:             0,
            duration:          1,
            durations:         [ 1000, 3000, 5000 ],
            fps:               30,
            previewImg:        "",
            previewShow:       false,
            previewEnabled:    false,
            dispViewportW:     0,
            dispViewportH:     0,
            dispScale:         0,
            dispCanvasW:       0,
            dispCanvasH:       0,
            dispCropCurrX:     0,
            dispCropCurrY:     0,
            dispCropCurrW:     0,
            dispCropCurrH:     0,
            dispCropNextX:     0,
            dispCropNextY:     0,
            dispCropNextW:     0,
            dispCropNextH:     0,
            dispDragPointerX:  0,
            dispDragPointerY:  0,
            dragging:          false,
            progressing:       false,
            activateCamera:    [],
            activatePhysical:  [],
            activateVirtual:   [],
            device:            "192.168.0.1",
            mode:              "virtual"
        }
    },
    async mounted () {
        /*  parse options  */
        const params = {}
        for (const kv of document.location.href.replace(/^.*\?/, "").split(/\&/)) {
            const [ , key, val ] = kv.match(/^(.*?)=(.*)$/)
            const keyCC = key.replace(/-([a-z])/g, (m) => m[1].toUpperCase())
            params[keyCC] = val
        }

        /*  take generic options  */
        if (params.debug !== undefined)
            this.debug = (params.debug === "true")
        if (params.transparent !== undefined)
            this.transparent = (params.transparent === "true")

        /*  take websocket connectivity options  */
        if (params.websocketAddress === undefined)
            params.websocketAddress = "localhost:4444"
        if (params.websocketPassword === undefined)
            params.websocketPassword = ""

        /*  take global camera options  */
        if (params.cameraName === undefined)
            throw new Error("missing \"camera-name\" parameter")
        this.title = params.cameraName
        if (params.cameraActivate === undefined)
            throw new Error("missing \"camera-activate\" parameter")
        this.activateCamera = params.cameraActivate.split(/,/)

        /*  take physical camera options  */
        if (params.cameraPhysicalActivate === undefined)
            throw new Error("missing \"camera-physical-activate\" parameter")
        this.activatePhysical = params.cameraPhysicalActivate.split(/,/)
        if (params.cameraPhysicalCanvas === undefined)
            throw new Error("missing \"camera-physical-canvas\" parameter")
        let m
        if ((m = params.cameraPhysicalCanvas.match(/^(\d+)x(\d+)$/)) === null)
            throw new Error("invalid \"camera-physical-canvas\" parameter")
        this.canvasW = parseInt(m[1])
        this.canvasH = parseInt(m[2])
        this.canvasR = this.canvasW / this.canvasH
        if (params.cameraPhysicalDevice === undefined)
            throw new Error("missing \"camera-physical-device\" parameter")
        this.device = params.cameraPhysicalDevice
        if (params.cameraPhysicalPresets !== undefined)
            this.presetsPhysical = params.cameraPhysicalPresets
                .split(/,/).map((preset) => ({ D: parseInt(preset) }))
        if (params.cameraPhysicalSources === undefined)
            throw new Error("missing \"camera-physical-sources\" parameter")
        this.sourcesPhysical = params.cameraPhysicalSources.split(/,/)

        /*  take virtual camera options  */
        if (params.cameraVirtualActivate === undefined)
            throw new Error("missing \"camera-virtual-activate\" parameter")
        this.activateVirtual = params.cameraVirtualActivate.split(/,/)
        if (params.cameraVirtualSources === undefined)
            throw new Error("missing \"camera-virtual-sources\" parameter")
        this.sourcesVirtual = params.cameraVirtualSources.split(/,/)
        if (params.cameraVirtualDuration !== undefined) {
            this.durations = params.cameraVirtualDuration.split(/,/).map((duration) => parseInt(duration))
            if (this.durations.length !== 3)
                throw new Error("parameter \"camera-virtual-duration\" needs exactly three comma-separated times")
        }
        if (params.cameraVirtualFPS !== undefined)
            this.fps = parseInt(params.cameraVirtualFPS)
        if (params.cameraVirtualPresets !== undefined) {
            this.presetsVirtual = params.cameraVirtualPresets.split(/,/)
            for (let i = 0; i < this.presetsVirtual.length; i++) {
                const m = this.presetsVirtual[i].match(/^([1-9]):(\d+)\+(\d+)\/(\d+)x(\d+)$/)
                if (m === null)
                    throw new Error(`invalid preset specification "${this.presetsVirtual[i]}"`)
                this.presetsVirtual[i] = {
                    D: parseInt(m[1]),
                    X: parseInt(m[2]), Y: parseInt(m[3]),
                    W: parseInt(m[4]), H: parseInt(m[5]),
                    C: false, N: false
                }
            }
        }

        /*  connect to OBS Studio  */
        this.obs = new OBSWebSocket()
        this.obs.on("error", (err) => { console.error(`OBS Studio: ERROR: ${err}`) })
        await this.obs.connect({
            address:  params.websocketAddress,
            password: params.websocketPassword,
            eventSubscriptions: 0
        })
        const version = await this.obs.send("GetVersion")
        console.log(`connected to: OBS Studio ${version.obsStudioVersion} / OBS WebSockets ${version.obsWebsocketVersion}`)

        /*  get initial cropping area  */
        const crop0 = await this.getCrop(this.sourcesVirtual[0])
        this.cropX = crop0.X
        this.cropY = crop0.Y
        this.cropW = crop0.W
        this.cropH = crop0.H
        for (const source of this.sourcesVirtual.slice(1))
            this.getCrop(source)

        /*  determine display viewport size  */
        this.dispViewportW = window.innerWidth
        this.dispViewportH = window.innerHeight
        this.dispScale     = (this.dispViewportW / this.canvasW)

        /*  determine display canvas size  */
        this.dispCanvasW = this.dispViewportW
        this.dispCanvasH = this.canvasH * this.dispScale

        /*  update display crop area  */
        this.dispCropCurrX = this.cropX * this.dispScale
        this.dispCropCurrY = this.cropY * this.dispScale
        this.dispCropCurrW = this.cropW * this.dispScale
        this.dispCropCurrH = this.cropH * this.dispScale

        /*  attach keystroke bindings  */
        for (let i = 1; i < 10; i++) {
            Mousetrap.bind(String(i), async () => {
                this.setPreset(i)
            })
        }
        Mousetrap.bind("a", async () => {
            this.activate("camera")
        })

        /*  recognize changes  */
        this.onCropChange(this.sourcesVirtual[0], (crop) => {
            if (!(this.cropX === crop.X &&
                this.cropY === crop.Y &&
                this.cropW === crop.W &&
                this.cropH === crop.H)) {
                /*  update knowledge about OBS Studio crop area  */
                this.cropX = crop.X
                this.cropY = crop.Y
                this.cropW = crop.W
                this.cropH = crop.H

                /*  update display crop area  */
                this.dispCropCurrX = this.cropX * this.dispScale
                this.dispCropCurrY = this.cropY * this.dispScale
                this.dispCropCurrW = this.cropW * this.dispScale
                this.dispCropCurrH = this.cropH * this.dispScale
            }
        })

        /*  support source preview  */
        if (params.cameraPhysicalPreview) {
            this.previewEnabled = true
            this.previewShow    = true
            const m = params.cameraPhysicalPreview.match(/^(.+):(\d+(?:\.\d+)?)$/)
            if (m === null)
                throw new Error(`invalid "camera-physical-preview" value "${params.preview}"`)
            const [ , sourceName, fps ] = m
            const frequency = 1000 / parseFloat(fps)
            setInterval(async () => {
                if (!this.previewShow)
                    return
                const ss = await this.obs.send("TakeSourceScreenshot", {
                    sourceName: sourceName,
                    embedPictureFormat: "jpeg",
                    compressionQuality: 30,
                    width:  this.dispCanvasW,
                    height: this.dispCanvasH
                })
                this.previewImg = ss.img
            }, frequency)
        }

        /*  initially update preset states  */
        this.updatePresetStates(null)

        /*  determine OBS Studio mode  */
        let result = await this.obs.send("GetStudioModeStatus")
        this.obsStudioMode = result.studioMode
        this.obs.on("StudioModeSwitched", (ev) => {
            this.obsStudioMode = ev.newState
            this.obsScenePreview = this.obsSceneProgram
        })

        /*  determine OBS Studio active scene (in preview or program)  */
        if (this.obsStudioMode) {
            result = await this.obs.send("GetCurrentScene")
            this.obsSceneProgram = result.name
            result = await this.obs.send("GetPreviewScene")
            this.obsScenePreview = result.name
        }
        else {
            result = await this.obs.send("GetCurrentScene")
            this.obsSceneProgram = result.name
            this.obsScenePreview = result.name
        }
        const updateActiveScene = async () => {
            let sourceActive = false
            const sources = this.sourcesVirtual.concat(this.sourcesPhysical)
            for (const source of sources) {
                let result = await this.obs.send("GetSourceActive", { sourceName: source })
                if (result.sourceActive) {
                    sourceActive = true
                    break
                }
            }
            this.sourceActive = sourceActive
        }
        updateActiveScene()
        this.obs.on("SwitchScenes", (ev) => {
            if (this.obsStudioMode)
                this.obsSceneProgram = ev.sceneName
            else {
                this.obsScenePreview = ev.sceneName
                this.obsSceneProgram = ev.sceneName
            }
            setTimeout(() => {
                updateActiveScene()
            }, 100)
        })
        this.obs.on("PreviewSceneChanged", async (ev) => {
            if (this.obsStudioMode)
                this.obsScenePreview = ev.sceneName
        })
        this.obs.on("BroadcastCustomMessage", async (ev) => {
            console.log(ev)
            if (ev.realm === "obs-cam-control-activate-camera")
                updateActiveScene()
        })
        setInterval(() => {
            updateActiveScene()
        }, 5 * 1000)
    },
    methods: {
        /*  callback for mouse left-click  */
        async mouseClickLeft (ev) {
            if (!this.dragging) {
                /*  start dragging  */
                if (!(ev.target === this.$refs.cropCurr || ev.target === this.$refs.cropCurrTitle))
                    return
                this.dragging = true

                /*  make crop-next start at drop-current  */
                this.dispCropNextX = this.dispCropCurrX
                this.dispCropNextY = this.dispCropCurrY
                this.dispCropNextW = this.dispCropCurrW
                this.dispCropNextH = this.dispCropCurrH

                /*  start tracking mouse position  */
                const pointerX = ev.clientX
                const pointerY = ev.clientY
                this.dispDragPointerX = pointerX
                this.dispDragPointerY = pointerY
            }
            else {
                /*  stop dragging  */
                this.dragging = false

                /*  determine old and new crop position  */
                let { x, y } = this.$refs.canvas.getBoundingClientRect()
                const cropOld = {
                    X: this.cropX,
                    Y: this.cropY,
                    W: this.cropW,
                    H: this.cropH
                }
                const cropNew = {
                    X: Math.round((this.dispCropNextX - x) / this.dispScale),
                    Y: Math.round((this.dispCropNextY - y) / this.dispScale),
                    W: Math.round(this.dispCropNextW / this.dispScale),
                    H: Math.round(this.dispCropNextH / this.dispScale)
                }
                if (cropOld.X === cropNew.X &&
                    cropOld.Y === cropNew.Y &&
                    cropOld.W === cropNew.W &&
                    cropOld.H === cropNew.H)
                    return

                /*  progress from old to new position and/or size  */
                await this.progress(cropOld, cropNew)
            }
        },

        /*  callback for mouse right-click  */
        mouseClickRight (ev) {
            if (!this.dragging)
                return
            this.dragging = false
        },

        /*  callback for mouse movement  */
        mouseMove (ev) {
            if (!this.dragging)
                return

            /*  update tracking mouse position  */
            const pointerX = ev.clientX
            const pointerY = ev.clientY
            const deltaX = pointerX - this.dispDragPointerX
            const deltaY = pointerY - this.dispDragPointerY
            this.dispDragPointerX = pointerX
            this.dispDragPointerY = pointerY

            /*  update new control crop position  */
            this.dispCropNextX += deltaX
            this.dispCropNextY += deltaY
            if (this.dispCropNextX < 0)
                this.dispCropNextX = 0
            if (this.dispCropNextX > this.dispCanvasW - this.dispCropNextW)
                this.dispCropNextX = this.dispCanvasW - this.dispCropNextW
            if (this.dispCropNextY < 0)
                this.dispCropNextY = 0
            if (this.dispCropNextY > this.dispCanvasH - this.dispCropNextH)
                this.dispCropNextY = this.dispCanvasH - this.dispCropNextH
        },

        /*  callback for mouse wheel  */
        mouseWheel (ev) {
            if (!this.dragging)
                return

            /*  resize crop  */
            this.dispCropNextH += ev.wheelDelta
            this.dispCropNextW += ev.wheelDelta * this.canvasR

            /*  restrict size to lower/upper bounds  */
            if (this.dispCropNextH < 100)
                this.dispCropNextH = 100
            if (this.dispCropNextH > this.dispCanvasH)
                this.dispCropNextH = this.dispCanvasH
            if (this.dispCropNextW < 100 * this.canvasR)
                this.dispCropNextW = 100 * this.canvasR
            if (this.dispCropNextW > this.dispCanvasW)
                this.dispCropNextW = this.dispCanvasW

            /*  optionally move position to ensure the area is still within the canvas  */
            if (0 <= this.dispCropNextX && this.dispDragPointerX <= this.dispCropNextX)
                this.dispCropNextX = this.dispDragPointerX
            if (0 <= this.dispCropNextY && this.dispDragPointerY <= this.dispCropNextY)
                this.dispCropNextY = this.dispDragPointerY
            if (this.dispCropNextX <= this.dispDragPointerX && this.dispCropNextX <= this.dispCanvasW)
                this.dispCropNextX = this.dispDragPointerX
            if (this.dispCropNextY <= this.dispDragPointerY && this.dispCropNextY <= this.dispCanvasH)
                this.dispCropNextY = this.dispDragPointerY
            if ((this.dispCropNextX + this.dispCropNextW) > this.dispCanvasW)
                this.dispCropNextX = this.dispCanvasW - this.dispCropNextW
            if ((this.dispCropNextY + this.dispCropNextH) > this.dispCanvasH)
                this.dispCropNextY = this.dispCanvasH - this.dispCropNextH
        },

        /*  animate over time  */
        animate (duration, stepper) {
            return new Promise((resolve, reject) => {
                const tick = 1000 / this.fps
                let count = 0
                const countMax = Math.floor(duration / tick)
                stepper(0)
                let timer = setInterval(() => {
                    count++
                    if (count < countMax)
                        stepper((count * tick) / duration)
                    else {
                        stepper(1)
                        clearTimeout(timer)
                        resolve()
                    }
                }, tick)
            })
        },

        /*  progress from old to new position and/or size  */
        async progress (cropOld, cropNew) {
            this.progressing = true
            await this.animate(this.durations[this.duration], async (t) => {
                /*  determine new OBS Studio source crop position  */
                const v = d3.easeCubicInOut(t)
                this.cropX = cropOld.X + Math.round((cropNew.X - cropOld.X) * v)
                this.cropY = cropOld.Y + Math.round((cropNew.Y - cropOld.Y) * v)
                this.cropW = cropOld.W + Math.round((cropNew.W - cropOld.W) * v)
                this.cropH = cropOld.H + Math.round((cropNew.H - cropOld.H) * v)

                /*  determine new control crop position  */
                this.dispCropCurrX = this.cropX * this.dispScale
                this.dispCropCurrY = this.cropY * this.dispScale
                this.dispCropCurrW = this.cropW * this.dispScale
                this.dispCropCurrH = this.cropH * this.dispScale

                /*  update OBS Studio source crop settings  */
                for (const source of this.sourcesVirtual) {
                    const crop = await this.getCrop(source)
                    crop.X = this.cropX
                    crop.Y = this.cropY
                    crop.W = this.cropW
                    crop.H = this.cropH
                    this.setCrop(source, "", crop)
                }

                /*  update preset button states  */
                this.updatePresetStates(cropNew)
            })
            this.updatePresetStates(null)
            this.progressing = false
        },

        /*  progress to a pre-defined position and/or size  */
        async setPreset (num) {
            if (this.progressing)
                return
            if (this.mode === "virtual") {
                const preset = this.presetsVirtual.find((preset) => preset.D === num)
                if (preset === undefined)
                    throw new Error("invalid preset")

                /*  determine old and new position and/or size  */
                const cropOld = { X: this.cropX, Y: this.cropY, W: this.cropW, H: this.cropH }
                if (cropOld.X === preset.X &&
                    cropOld.Y === preset.Y &&
                    cropOld.W === preset.W &&
                    cropOld.H === preset.H)
                    return

                /*  progress from old to new position and/or size  */
                this.dispCropNextX = preset.X * this.dispScale
                this.dispCropNextY = preset.Y * this.dispScale
                this.dispCropNextW = preset.W * this.dispScale
                this.dispCropNextH = preset.H * this.dispScale
                await this.progress(cropOld, preset)
            }
            else if (this.mode === "physical") {
                const preset = this.presetsPhysical.find((preset) => preset.D === num)
                if (preset === undefined)
                    throw new Error("invalid preset")
                if (this.recalling) {
                    /*  queue as next recall and intentionally override
                        already queued next recall (as it makes no
                        sense to temporarily change the positions to
                        any intermediate position) */
                    if (this.recallnext)
                        console.log(`overriding the queueing for recalling PTZ preset #${num} on Birddog camera ${this.device}`)
                    else
                        console.log(`queueing for recalling PTZ preset #${num} on Birddog camera ${this.device}`)
                    this.recallnext = num
                    return
                }
                while (true)  {
                    /*  perform a single recall  */
                    this.recalling = true
                    console.log(`recalling PTZ preset #${num} on Birddog camera ${this.device}`)
                    await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest()
                        xhr.open("POST", `http://${this.device}:8080/recall`, true)
                        xhr.onreadystatechange = () => {
                            if (xhr.readyState === XMLHttpRequest.DONE)
                                resolve()
                        }
                        xhr.setRequestHeader("Content-Type", "application/json")
                        xhr.send(`{ "Preset": "Preset-${num}" }`)
                    })
                    await new Promise((resolve, reject) => {
                        /*  give camera time to really react  */
                        setTimeout(resolve, 1000)
                    })
                    this.recalling = false

                    /*  either stop of take next recall request into account immediately  */
                    if (this.recallnext === null)
                        break
                    num = this.recallnext
                    this.recallnext = null
                }
            }
        },

        /*  determine whether a pre-defined position and/or size is current and/or next one  */
        async updatePresetStates (cropNew) {
            if (this.mode === "virtual") {
                for (const preset of this.presetsVirtual) {
                    preset.C = (
                        this.cropX === preset.X &&
                        this.cropY === preset.Y &&
                        this.cropW === preset.W &&
                        this.cropH === preset.H
                    )
                    preset.N = (cropNew !== null && (
                        cropNew.X === preset.X &&
                        cropNew.Y === preset.Y &&
                        cropNew.W === preset.W &&
                        cropNew.H === preset.H
                    ))
                }
            }
        },

        /*  listen to crop settings change of OBS Studio source  */
        async onCropChange (sourceName, onChange) {
            const filterName = await this.getFilterNameByType(sourceName, "crop_filter")
            let ctx = {}
            ctx.crop = this.getCrop(sourceName, filterName)
            ctx.timer = setInterval(async () => {
                if (this.progressing)
                    return
                const crop = await this.getCrop(sourceName, filterName)
                if (crop.X === ctx.crop.X &&
                    crop.Y === ctx.crop.Y &&
                    crop.W === ctx.crop.W &&
                    crop.H === ctx.crop.H)
                    return
                ctx.crop.X = crop.X
                ctx.crop.Y = crop.Y
                ctx.crop.W = crop.W
                ctx.crop.H = crop.H
                onChange(crop)
            }, 1000)
            ctx.unsubscribe = () => {
                if (ctx.timer !== null) {
                    clearTimeout(ctx.timer)
                    ctx.timer = null
                }
            }
        },

        /*  get crop settings of OBS Studio source  */
        async getFilterNameByType (sourceName, filterType) {
            const list = await this.obs.send("GetSourceFilters", { sourceName: sourceName })
            const filter = list.filters.find((filter) => filter.type === filterType)
            if (filter === undefined)
                throw new Error(`no such filter of type "${filterType}" found on source "${sourceName}"`)
            return filter.name
        },

        /*  get crop settings of OBS Studio source  */
        async getCrop (sourceName, filterName = "") {
            if (filterName === "")
                filterName = await this.getFilterNameByType(sourceName, "crop_filter")
            const info = await this.obs.send("GetSourceFilterInfo", {
                sourceName: sourceName,
                filterName: filterName
            })
            return {
                X: info.settings.left,
                Y: info.settings.top,
                W: info.settings.cx,
                H: info.settings.cy
            }
        },

        /*  set crop settings of OBS Studio source  */
        async setCrop (sourceName, filterName = "", crop) {
            if (filterName === "")
                filterName = await this.getFilterNameByType(sourceName, "crop_filter")
            const info = await this.obs.send("GetSourceFilterInfo", {
                sourceName: sourceName,
                filterName: filterName
            })
            info.settings.left = crop.X
            info.settings.top  = crop.Y
            info.settings.cx   = crop.W
            info.settings.cy   = crop.H
            await this.obs.send("SetSourceFilterSettings", {
                sourceName: sourceName,
                filterName: filterName,
                filterSettings: info.settings
            })
        },

        /*  activate a camera  */
        async activate (mode) {
            const activateSource = async (sceneItems) => {
                let activate = true
                for (const sceneItem of sceneItems) {
                    const m = sceneItem.match(/^(.+):(.+)$/)
                    if (m === null)
                        return
                    const [ , sceneName, itemName ] = m
                    await this.obs.send("SetSceneItemProperties", {
                        "scene-name": sceneName,
                        item: itemName,
                        visible: activate
                    })
                    if (activate)
                        activate = false
                }
                if (mode === "camera") {
                    setTimeout(() => {
                        this.obs.send("BroadcastCustomMessage", {
                            realm: `obs-cam-control-activate-${mode}`,
                            data: {}
                        })
                    }, 500)
                }
            }
            if (mode === "camera")
                await activateSource(this.activateCamera)
            else if (mode === "virtual" || mode === "physical") {
                this.mode = mode
                await activateSource(mode === "virtual" ? this.activateVirtual : this.activatePhysical)
            }
        }
    }
}

Vue.createApp(app).mount("body")

