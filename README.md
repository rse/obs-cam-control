
OBS Cam Control
===============

**Camera Control for OBS Studio**

About
-----

This is a small software solution for controlling the view of multiple
[Birddog P400](https://bird-dog.tv/p400-overview/) cameras (providing
4K resolution and Pan-Tilt-Zoom (PTZ) functionality) from within the
audio/video mixing software [OBS Studio](https://obsproject.com). It
provides a physical and virtual camera view for each device.

The physical camera views use the [Birddog REST
API](https://bird-dog.tv/SW/API/index.html) of the camera to
recall presets, either previously created with a [Birddog PTZ
Keyboard](https://bird-dog.tv/ptzkeyboard-overview/) or with the [OBS
PTZ Controls](https://github.com/glikely/obs-ptz) plugin. The physical
camera view is intended for regular PTZ uses on non-greenscreen
backgrounds.

The virtual camera views are intended for virtualized PTZ uses
on greenscreen backgrounds where you cannot use the camera PTZ
functionality, because different angles and zoom-levels would require
the background to adjust simultanously. Instead, we use the OBS Studio
*Crop/Pad* filter to carve out a Full-HD area from the *Chroma Key*
filtered camera video and a companion background source. In case of
multiple cameras, each camera view usually has to get its own dedicated
background, usually an angle-consistent pre-rendered view from a 3D scene.

The solution technically consists of two parts: a HTML5
Single-Page-Application (SPA) and a companion OBS Studio source
filter. The SPA is intended to be running inside a *Browser Source*
which has to be part of a special "control scene", docked into
the [OBS Studio](https://obsproject.com) user interface through
[OBS Source Dock](https://github.com/exeldro/obs-source-dock)
and communicating with OBS Studio via [OBS
WebSocket](https://github.com/obsproject/obs-websocket).

Setup
-----

The particular, original setup is the following:

- You are producing your live-event with
  [OBS Studio](https://obsproject.com) as your free video streaming software.

- You have the [OBS WebSocket](https://github.com/obsproject/obs-websocket),
  [OBS Source Dock](https://github.com/exeldro/obs-source-dock),
  and [StreamFX](https://github.com/Xaymar/obs-StreamFX) extension plugins
  installed and activated in [OBS Studio](https://obsproject.com).

- You have [OBS Studio](https://obsproject.com) configured for Full-HD
  (1920x1080px) video output (see *Settings* &rarr; *Video* &rarr; *Base (Canvas) Resolution*).

- You have a Birddog 4K PTZ camera like Birddog P400 as the physical camera,
  connected through SDI or NDI.

- You have a scene collection in [OBS Studio](https://obsproject.com) configured,
  which contains at least the following additional scenes for your camera (here named `CAM1` as an example):

  - scene `Shared-CAM1-Full`:<br/>
    (rationale: scene for "full/total" camera view)
      - source `CAM1-Full` of type *Video Capture Device*:
          - attached to your physical 4K camera device<br/>
            (rationale: single source for physical camera)
          - transform of *Stretch to Screen* applied<br/>
            (rationale: provide "full/total" camera view in 1080p of `Shared-CAM1-Full`)
  - scene `Shared-CAM1-Zoom`:<br/>
    (rationale: scene for "zoomed" camera view)
      - source `CAM1-Zoom-FG` of type *Source Mirror*:
          - attached to source `CAM1-Full`
            (rationale: single source for physical camera)
          - filter *Chrome Key* applied
            (rationale: single filter for chroma-key)
          - filter *Crop/Pad* applied<br/>
            (rationale: the zoom to be applied and controlled)
          - filter *Scaling/Aspect Ratio* applied (for 1920x1080px)
            (rationale: ensure result is still Full-HD, even on arbitrary crop areas)
      - source `CAM1-Zoom-BG` of type *Image*:
          - attached to your 4K background image<br/>
            (rationale: single source for virtual background)
          - filter *Scaling/Aspect Ratio* applied (for 3820x2160)
            (rationale: ensure the background starts as 4K)
          - filter *Crop/Pad* applied<br/>
            (rationale: the zoom to be applied and controlled)
          - filter *Scaling/Aspect Ratio* applied (for 1920x1080px)
            (rationale: ensure result is still Full-HD, even on arbitrary crop areas)
  - scene `Shared-CAM1-Control`:<br/>
    (rationale: scene for cam control dock)
      - source `CAM1-Control-CC` of type *Browser Source*:
          - loading the OBS Cam Control SPA according to the URL below<br/>
            (rationale: running the SPA)
      - source `Shared-CAM1-Full` of type *Scene*:<br/>
        (rationale: show physical camera in background)
  - scene `Shared-CAM-Full`:<br/>
    (rationale: view of all full physical cameras)
      - source `Shared-CAM1-Full` of type *Scene*
      - source `Shared-CAM2-Full` of type *Scene*
      - source `Shared-CAM3-Full` of type *Scene*
  - scene `Shared-CAM-Zoom`:<br/>
    (rationale: view of all zoomed virtual cameras)
      - source `Shared-CAM1-Zoom` of type *Scene*
      - source `Shared-CAM2-Zoom` of type *Scene*
      - source `Shared-CAM3-Zoom` of type *Scene*
  - scene `Scene-01`:<br/>
    (rationale: particular event scene based on the full physical camera view)
      - source `Shared-CAM-Full` of type *Scene*<br/>
        (rationale: include full camera view)
  - scene `Scene-02`:<br/>
    (rationale: particular event scene based on the zoomed virtual camera view)
      - source `Shared-CAM1-Zoom` of type *Source Mirror*<br/>
        (rationale: include zoomed camera view)
          - filter *Camera Control* applied<br/>
            (rationale: automatically control camera)
             - parameter *Source Name of Control UI* set to `CAM1-Control-CC`
             - parameter *Activate Camera on PROGRAM* set to `no`

- The URL (show-casing all parameters) for the SPA is like the following
  (descriptions at the end of each line):<br/>

  `file://[...]/obs-cam-control.html` (path to SPA)<br/>
  `?transparent=true` (make background transparent)<br/>
  `&debug=true` (log debug information)<br/>
  `&websocket-address=localhost:4444` (endpoint of OBS WebSocket)<br/>
  `&websocket-password=XXX` (authentication for endpoint of OBS WebSocket)<br/>
  `&camera-name=CAM1` (title of the camera)<br/>
  `&camera-physical-activate=Shared-CAM-Full:Shared-CAM1-Full` (the scene source of the physical camera for activation)<br/>
  `&camera-physical-preview=Shared-CAM1-Full:10` (the source and FPS of the physical camera for preview)<br/>
  `&camera-physical-sources=CAM1-Full` (the sources of the physical camera for active checking)<br/>
  `&camera-physical-canvas=3840x2160` (size of original physical camera view)<br/>
  `&camera-physical-device=192.168.0.1` (IP address of the physical camera API)<br/>
  `&camera-physical-presets=1,2,3,4` (pre-defined physical presets)<br/>
  `&camera-virtual-activate=Shared-CAM-Zoom:Shared-CAM1-Zoom` (the scene source of the virtual camera for activation)<br/>
  `&camera-virtual-sources=CAM1-Zoom-FG,CAM1-Zoom-BG` (the sources of the *Crop/Pad* filters of the virtual camera)<br/>
  `&camera-virtual-duration=1000,4000,7000` (transition durations in milliseconds of the virtual camera)<br/>
  `&camera-virtual-fps=30,` (transition smoothness in frames per second of the virtual camera)<br/>
  `&camera-virtual-presets=1:0+0/3860x2160,` (pre-defined total 4K area)<br/>
  `2:0+540/1920x1080,` (pre-defined Full-HD area middle/left)<br/>
  `3:960+540/1920x1080,` (pre-defined Full-HD area middle/center)<br/>
  `4:1920+540/1920x1080` (pre-defined Full-HD area middle/right)

License
-------

Copyright &copy; 2021-2022 [Dr. Ralf S. Engelschall](http://engelschall.com/)<br/>
Distributed under [GPL 3.0 license](https://spdx.org/licenses/GPL-3.0-only.html)

