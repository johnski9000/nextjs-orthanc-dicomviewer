"use client"

import { useEffect, useRef } from "react"
import createImageIdsAndCacheMetaData from "../../lib/createImageIdsAndCacheMetaData"
import {
  RenderingEngine,
  Enums,
  CONSTANTS,
  type Types,
  volumeLoader,
  setVolumesForViewports,
  utilities,
} from "@cornerstonejs/core"
import { init as csRenderInit } from "@cornerstonejs/core"
import {
  init as csToolsInit,
  addTool,
  BrushTool,
  ToolGroupManager,
  segmentation,
  Enums as csToolsEnums,
} from "@cornerstonejs/tools"
import { init as dicomImageLoaderInit } from "@cornerstonejs/dicom-image-loader"

const { ViewportType } = Enums
const { MouseBindings } = csToolsEnums

const toolGroupId = "ToolGroup_MPR"
const toolGroupId2 = "ToolGroup_3D"
let toolGroup1, toolGroup2
let renderingEngine
// Create the viewports
const viewportId1 = "CT_AXIAL"
const viewportId2 = "CT_SAGITTAL"
const viewportId3 = "CT_3D"
const segmentationId = "Segmentation_1"
const volumeId = "Volume_1"


function App() {
  const elementRef1 = useRef<HTMLDivElement>(null)
  const elementRef2 = useRef<HTMLDivElement>(null)
  const elementRef3 = useRef<HTMLDivElement>(null)
  const running = useRef(false)

  useEffect(() => {
    const setup = async () => {
      if (running.current) {
        return
      }
      running.current = true

      await csRenderInit()
      await csToolsInit()
      dicomImageLoaderInit({ maxWebWorkers: 1 })
      // Add tools to Cornerstone3D
      addTool(BrushTool)

      // Define tool groups to add the segmentation display tool to
      toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId)
      toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2)

      // Segmentation Tools
      toolGroup1.addToolInstance("SphereBrush", BrushTool.toolName, {
        activeStrategy: "FILL_INSIDE_SPHERE",
      })
      toolGroup1.addToolInstance("EraserBrush", BrushTool.toolName, {
        activeStrategy: "ERASE_INSIDE_SPHERE",
      })

      toolGroup1.setToolActive("SphereBrush", {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Middle Click
          },
        ],
      })

      // Get Cornerstone imageIds for the source data and fetch metadata into RAM
      const imageIds = await createImageIdsAndCacheMetaData({
        StudyInstanceUID:
          "1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463",
        SeriesInstanceUID:
          "1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561",
        wadoRsRoot: "https://d14fa38qiwhyfd.cloudfront.net/dicomweb",
      })

      // Define a volume in memory
      const volume = await volumeLoader.createAndCacheVolume(volumeId, {
        imageIds,
      })

      // Instantiate a rendering engine
      const renderingEngineId = "myRenderingEngine"
      renderingEngine = new RenderingEngine(renderingEngineId)

      const viewportInputArray = [
        {
          viewportId: viewportId1,
          type: ViewportType.ORTHOGRAPHIC,
          element: elementRef1.current,
          defaultOptions: {
            orientation: Enums.OrientationAxis.AXIAL,
          },
        },
        {
          viewportId: viewportId2,
          type: ViewportType.ORTHOGRAPHIC,
          element: elementRef2.current,
          defaultOptions: {
            orientation: Enums.OrientationAxis.SAGITTAL,
          },
        },
        {
          viewportId: viewportId3,
          type: ViewportType.VOLUME_3D,
          element: elementRef3.current,
          defaultOptions: {
            background: CONSTANTS.BACKGROUND_COLORS.slicer3D,
          },
        },
      ]

      renderingEngine.setViewports(viewportInputArray)

      toolGroup1.addViewport(viewportId1, renderingEngineId)
      toolGroup1.addViewport(viewportId2, renderingEngineId)
      toolGroup2.addViewport(viewportId3, renderingEngineId)

      // Set the volume to load
      await volume.load()

      // Set volumes on the viewports
      await setVolumesForViewports(
        renderingEngine,
        [{ volumeId }],
        [viewportId1, viewportId2, viewportId3]
      )

      // set the anatomy at first invisible
      const volumeActor = renderingEngine
        .getViewport(viewportId3)
        .getDefaultActor().actor as Types.VolumeActor
      utilities.applyPreset(
        volumeActor,
        CONSTANTS.VIEWPORT_PRESETS.find((preset) => preset.name === "CT-Bone")
      )
      volumeActor.setVisibility(false)

      // Add some segmentations based on the source data volume
      // Create a segmentation of the same resolution as the source data
      await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
        volumeId: segmentationId,
      })

      // Add the segmentations to state
      await segmentation.addSegmentations([
        {
          segmentationId,
          representation: {
            // The type of segmentation
            type: csToolsEnums.SegmentationRepresentations.Labelmap,
            // The actual segmentation data, in the case of labelmap this is a
            // reference to the source volume of the segmentation.
            data: {
              volumeId: segmentationId,
            },
          },
        },
      ])

      // Add the segmentation representation to the viewports
      const segmentationRepresentation = {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      }

      await segmentation.addLabelmapRepresentationToViewportMap({
        [viewportId1]: [segmentationRepresentation],
        [viewportId2]: [segmentationRepresentation],
      })

      // Render the image
      renderingEngine.render()
    }

    setup()

    // Create a stack viewport
  }, [elementRef1, elementRef2, elementRef3, running])

  return (
    <div>
      <button
        onClick={() => {
          // add the 3d representation to the 3d toolgroup
          segmentation.addSegmentationRepresentations(viewportId3, [
            {
              segmentationId,
              type: csToolsEnums.SegmentationRepresentations.Surface,
            },
          ])
        }}
      >
        Convert to 3D
      </button>
      <div className="flex flex-row">
        <div
          ref={elementRef1}
          style={{
            width: "512px",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
        <div
          ref={elementRef2}
          style={{
            width: "512px",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
        <div
          ref={elementRef3}
          style={{
            width: "512px",
            height: "512px",
            backgroundColor: "#000",
          }}
        ></div>
      </div>
    </div>
  )
}

export default App
