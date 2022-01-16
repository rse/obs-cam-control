--[[
**
**  OBS Cam Control ~ Camera Control for OBS Studio
**  Copyright (c) 2021-2022 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Distributed under GPL 3.0 license <https://spdx.org/licenses/GPL-3.0-only.html>
**
--]]

--  global OBS API
local obs = obslua

--  global Lua APIs
local bit = require("bit")

--  send information to camera control UI
local function camControl (control, activate, preset)
    --  locate control UI source
    local controlSource = obs.obs_get_source_by_name(control)
	if controlSource == nil then
        obs.script_log(obs.LOG_ERROR,
            string.format("no such camera control UI source named \"%s\" found", control))
        return false
	end

    --  send keyboard events to source
    if activate == "yes" then
        local event = obs.obs_key_event()
        event.native_vkey      = 0
        event.modifiers        = 0
        event.native_scancode  = 0
        event.native_modifiers = 0
        event.text             = "a"
        obs.obs_source_send_key_click(controlSource, event, false)
        obs.obs_source_send_key_click(controlSource, event, true)
    end
    if preset ~= "none" then
        local event = obs.obs_key_event()
        event.native_vkey      = 0
        event.modifiers        = 0
        event.native_scancode  = 0
        event.native_modifiers = 0
        event.text             = preset
        obs.obs_source_send_key_click(controlSource, event, false)
        obs.obs_source_send_key_click(controlSource, event, true)
    end

    --  release resource
	obs.obs_source_release(controlSource)
    return true
end

--  create obs_source_info structure
local info = {}
info.id           = "obs_cam_control"
info.type         = obs.OBS_SOURCE_TYPE_FILTER
info.output_flags = bit.bor(obs.OBS_SOURCE_VIDEO)

--  hook: provide name of filter
info.get_name = function ()
    return "Camera Control"
end

--  hook: provide default settings (initialization before create)
info.get_defaults = function (settings)
    --  provide default values
    obs.obs_data_set_default_string(settings, "cameraControl", "")
    obs.obs_data_set_default_string(settings, "activateOnPreview", "no")
    obs.obs_data_set_default_string(settings, "presetOnPreview",   "none")
    obs.obs_data_set_default_string(settings, "activateOnProgram", "no")
    obs.obs_data_set_default_string(settings, "presetOnProgram",   "none")
end

--  hook: create filter context
info.create = function (_settings, source)
    --  create new filter context object
    local ctx = {}
    ctx.filter = source
    ctx.source = nil
    ctx.scene  = nil
    ctx.cfg    = {
        cameraControl     = "",
        activateOnPreview = "no",
        presetOnPreview   = "none",
        activateOnProgram = "no",
        presetOnProgram   = "none",
    }
    return ctx
end

--  hook: destroy filter context
info.destroy = function (ctx)
    --  free resources only (notice: no more logging possible)
    ctx.filter = nil
    ctx.source = nil
    ctx.scene  = nil
    ctx.cfg    = nil
end

--  helper function for finding own scene
local function findMyScene (ctx)
    local myScene = nil
    if ctx.source ~= nil then
        local sourceName = obs.obs_source_get_name(ctx.source)
        local scenes = obs.obs_frontend_get_scenes()
        for _, source in ipairs(scenes) do
            local scene = obs.obs_scene_from_source(source)
            local sceneItem = obs.obs_scene_find_source_recursive(scene, sourceName)
            if sceneItem then
                myScene = source
                break
            end
        end
        obs.source_list_release(scenes)
    end
    return myScene
end

--  hook: after loading settings
info.load = function (ctx, settings)
    --  take current parameters
    ctx.cfg.cameraControl     = obs.obs_data_get_string(settings, "cameraControl")
    ctx.cfg.activateOnPreview = obs.obs_data_get_string(settings, "activateOnPreview")
    ctx.cfg.presetOnPreview   = obs.obs_data_get_string(settings, "presetOnPreview")
    ctx.cfg.activateOnProgram = obs.obs_data_get_string(settings, "activateOnProgram")
    ctx.cfg.presetOnProgram   = obs.obs_data_get_string(settings, "presetOnProgram")

    --  find own scene
    ctx.scene = findMyScene(ctx)

    --  hook: activate (preview)
    obs.obs_frontend_add_event_callback(function (ev)
        if ctx.scene == nil then
            ctx.scene = findMyScene(ctx)
        end
        if ev == obs.OBS_FRONTEND_EVENT_PREVIEW_SCENE_CHANGED then
            if ctx.scene ~= nil and ctx.source ~= nil and
                (ctx.cfg.activateOnPreview ~= "no" or ctx.cfg.presetOnPreview ~= "none") then
                local previewScene     = obs.obs_frontend_get_current_preview_scene()
                local previewSceneName = obs.obs_source_get_name(previewScene)
                obs.obs_source_release(previewScene)
                local sceneName = obs.obs_source_get_name(ctx.scene)
                if previewSceneName == sceneName then
                    local sourceName = obs.obs_source_get_name(ctx.source)
                    local filterName = obs.obs_source_get_name(ctx.filter)
                    obs.script_log(obs.LOG_INFO, string.format(
                        "scene \"%s\" with source \"%s\" and filter \"%s\" went into PREVIEW: " ..
                        "controlling camera on control source \"%s\" (activate: %s, preset: %s)",
                        sceneName, sourceName, filterName,
                        ctx.cfg.cameraControl, ctx.cfg.activateOnPreview, ctx.cfg.presetOnPreview))
                    camControl(ctx.cfg.cameraControl, ctx.cfg.activateOnPreview, ctx.cfg.presetOnPreview)
                end
            end
        end
    end)
end

--  hook: provide filter properties (for dialog)
info.get_properties = function (_ctx)
    --  create properties
    local props = obs.obs_properties_create()
    obs.obs_properties_add_text(props, "cameraControl",
        "Source Name of Control UI:", obs.OBS_TEXT_DEFAULT)
    local function addListActivate (prop)
        obs.obs_property_list_add_string(prop, "no",  "no")
        obs.obs_property_list_add_string(prop, "yes", "yes")
    end
    local function addListPreset (prop)
        obs.obs_property_list_add_string(prop, "none", "none")
        obs.obs_property_list_add_string(prop, "1", "1")
        obs.obs_property_list_add_string(prop, "2", "2")
        obs.obs_property_list_add_string(prop, "3", "3")
        obs.obs_property_list_add_string(prop, "4", "4")
        obs.obs_property_list_add_string(prop, "5", "5")
        obs.obs_property_list_add_string(prop, "6", "6")
        obs.obs_property_list_add_string(prop, "7", "7")
        obs.obs_property_list_add_string(prop, "8", "8")
        obs.obs_property_list_add_string(prop, "9", "9")
    end
    local activateOnPreview = obs.obs_properties_add_list(props,
        "activateOnPreview", "Activate Camera on PREVIEW:",
        obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    addListActivate(activateOnPreview)
    local presetOnPreview = obs.obs_properties_add_list(props,
        "presetOnPreview", "Preset Camera on PREVIEW:",
        obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    addListPreset(presetOnPreview)
    local activateOnProgram = obs.obs_properties_add_list(props,
        "activateOnProgram", "Activate Camera on PROGRAM:",
        obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    addListActivate(activateOnProgram)
    local presetOnProgram = obs.obs_properties_add_list(props,
        "presetOnProgram", "Preset Camera on PROGRAM:",
        obs.OBS_COMBO_TYPE_LIST, obs.OBS_COMBO_FORMAT_STRING)
    addListPreset(presetOnProgram)
    return props
end

--  hook: react on filter property update (during dialog)
info.update = function (ctx, settings)
    ctx.cfg.cameraControl     = obs.obs_data_get_string(settings, "cameraControl")
    ctx.cfg.activateOnPreview = obs.obs_data_get_string(settings, "activateOnPreview")
    ctx.cfg.presetOnPreview   = obs.obs_data_get_string(settings, "presetOnPreview")
    ctx.cfg.activateOnProgram = obs.obs_data_get_string(settings, "activateOnProgram")
    ctx.cfg.presetOnProgram   = obs.obs_data_get_string(settings, "presetOnProgram")
end

--  hook: activate (program)
info.activate = function (ctx)
    if ctx.scene == nil then
        ctx.scene = findMyScene(ctx)
    end
    if ctx.scene ~= nil and ctx.source ~= nil and
        (ctx.cfg.activateOnProgram ~= "no" or ctx.cfg.presetOnProgram ~= "none") then
        local sceneName  = obs.obs_source_get_name(ctx.scene)
        local sourceName = obs.obs_source_get_name(ctx.source)
        local filterName = obs.obs_source_get_name(ctx.filter)
        obs.script_log(obs.LOG_INFO, string.format(
            "scene \"%s\" with source \"%s\" and filter \"%s\" went into PROGRAM: " ..
            "controlling camera on control source \"%s\" (activate: %s, preset: %s)",
            sceneName, sourceName, filterName,
            ctx.cfg.cameraControl, ctx.cfg.activateOnProgram, ctx.cfg.presetOnProgram))
        camControl(ctx.cfg.cameraControl, ctx.cfg.activateOnProgram, ctx.cfg.presetOnProgram)
    end
end

--  hook: render video
info.video_render = function (ctx, _effect)
    if ctx.source == nil then
        ctx.source = obs.obs_filter_get_parent(ctx.filter)
    end
    obs.obs_source_skip_video_filter(ctx.filter)
end

--  hook: provide size
info.get_width = function (_ctx)
    return 0
end
info.get_height = function (_ctx)
    return 0
end

--  register the filter
obs.obs_register_source(info)

--  script hook: description displayed on script window
function script_description ()
    return [[
        <h2>Camera Control</h2>

        Copyright &copy; 2021-2022 <a style="color: #ffffff; text-decoration: none;"
        href="http://engelschall.com">Dr. Ralf S. Engelschall</a><br/>
        Distributed under <a style="color: #ffffff; text-decoration: none;"
        href="https://spdx.org/licenses/GPL-3.0-only.html">GPL 3.0 license</a>

        <p>
        Control a Camera by activating the camera and/or recalling a
        camera preset when the scene with the source of the filter
        <b>Cam Control</b> becomes visible in the PREVIEW (for enabled
        studio mode only) and/or in the PROGRAM.
        </p>
    ]]
end

