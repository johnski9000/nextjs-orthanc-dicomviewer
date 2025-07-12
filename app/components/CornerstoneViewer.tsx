"use client";
import React, { useEffect, useRef, useState } from "react";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

import {
  ActionIcon,
  Group,
  Tooltip,
  Menu,
  Button,
  Collapse,
} from "@mantine/core";
import {
  IconAdjustments,
  IconHandMove,
  IconZoomIn,
  IconRuler,
  IconRotateClockwise,
  IconCircle,
  IconRectangle,
  IconRefresh,
  IconMaximize,
  IconMinimize,
  IconChevronLeft,
  IconChevronRight,
  IconMenu2,
} from "@tabler/icons-react";

// Metadata Provider
const metaDataProvider = (type, imageId, imageIds) => {
  const index = imageIds ? imageIds.indexOf(imageId) : 0;

  if (type === "imagePixelModule") {
    return {
      pixelRepresentation: 0,
      bitsAllocated: 24,
      bitsStored: 24,
      highBit: 24,
      photometricInterpretation: "RGB",
      samplesPerPixel: 3,
    };
  } else if (type === "generalSeriesModule") {
    return {
      modality: "CT",
      seriesNumber: 1,
      seriesDescription: "Medical Image",
      seriesDate: new Date().toISOString().split("T")[0].replace(/-/g, ""),
      seriesTime: new Date()
        .toISOString()
        .split("T")[1]
        .replace(/[:.]/g, "")
        .substr(0, 6),
      seriesInstanceUID: "1.2.276.0.7230010.3.1.4.83233." + Date.now(),
    };
  } else if (type === "imagePlaneModule") {
    return {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, index * 5],
      pixelSpacing: [1, 1],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      frameOfReferenceUID: "FORUID",
      columns: 512,
      rows: 512,
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      usingDefaultValues: true,
    };
  } else if (type === "voiLutModule") {
    return {
      windowWidth: [256],
      windowCenter: [128],
    };
  } else if (type === "modalityLutModule") {
    return {
      rescaleSlope: 1,
      rescaleIntercept: 0,
    };
  }
  return undefined;
};

const CornerstoneViewer = (pack) => {
  console.log("pack", pack);
  const [selectedSeriesIndex, setSelectedSeriesIndex] = useState(0);
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeToolName, setActiveToolName] = useState("WindowLevel");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seriesCollapsed, setSeriesCollapsed] = useState(false);
  const [prefetchState, setPrefetchState] = useState({
    isActive: false,
    current: 0,
    total: 0,
    failed: 0,
    progress: 0,
  });
  const imageCache = useRef(new Map());
  const prefetchAbortController = useRef(null);
  const element1Ref = useRef(null);
  const renderingEngineRef = useRef(null);
  const toolGroupRef = useRef(null);
  const isMountedRef = useRef(false);
  const fullscreenContainerRef = useRef(null);

  const renderingEngineId = "myRenderingEngine";
  const viewportId = "COLOR_STACK";

  // Fullscreen functions
  const enterFullscreen = () => {
    const element = fullscreenContainerRef.current;
    if (element) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
      setIsFullscreen(true);

      // Resize the rendering engine after entering fullscreen
      setTimeout(() => {
        if (renderingEngineRef.current) {
          renderingEngineRef.current.resize();
          renderingEngineRef.current.render();
        }
      }, 100);
    }
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    setIsFullscreen(false);

    // Resize the rendering engine after exiting fullscreen
    setTimeout(() => {
      if (renderingEngineRef.current) {
        renderingEngineRef.current.resize();
        renderingEngineRef.current.render();
      }
    }, 100);
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      );

      if (isCurrentlyFullscreen !== isFullscreen) {
        setIsFullscreen(isCurrentlyFullscreen);

        // Resize the rendering engine when fullscreen state changes
        setTimeout(() => {
          if (renderingEngineRef.current) {
            renderingEngineRef.current.resize();
            renderingEngineRef.current.render();
          }
        }, 100);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("msfullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullscreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullscreenChange
      );
    };
  }, [isFullscreen]);

  // Helper function to extract instance ID from URL
  const extractInstanceId = (url) => {
    const match = url.match(/instances\/([a-f0-9-]+)\//);
    return match ? match[1] : null;
  };

  // Debug mouse events
  useEffect(() => {
    const element = element1Ref.current;
    if (!element) return;

    const handleMouseDown = (e) => {
      console.log("Mouse down event:", {
        button: e.button,
        activeTool: activeToolName,
      });
    };

    element.addEventListener("mousedown", handleMouseDown);
    return () => {
      element.removeEventListener("mousedown", handleMouseDown);
    };
  }, [activeToolName]);

  const fetchStudy = async (studyId) => {
    try {
      setLoading(true);
      const data = await fetch("/api/getStudyData", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyId: studyId,
        }),
      });
      const response = await data.json();
      setStudy(response.studies[0].series);
      setSelectedSeriesIndex(0);

      // Initialize with the first series
      if (response.studies[0].series.length > 0) {
        const firstSeries = response.studies[0].series[0];
        await initializeWithSeries(firstSeries);
      }
    } catch (error) {
      console.error("Error fetching study:", error);
    } finally {
      setLoading(false);
    }
  };

  const initializeTools = () => {
    try {
      console.log("Initializing tools...");
      // Add minimal set of tools
      cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
      cornerstoneTools.addTool(cornerstoneTools.PanTool);
      cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
      cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
      cornerstoneTools.addTool(cornerstoneTools.LengthTool);
      cornerstoneTools.addTool(cornerstoneTools.PlanarRotateTool);
      cornerstoneTools.addTool(cornerstoneTools.EllipticalROITool);
      cornerstoneTools.addTool(cornerstoneTools.RectangleROITool);
      console.log("Tools added to cornerstoneTools");

      const toolGroupId = "myToolGroup";
      const toolGroup =
        cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
      if (!toolGroup) {
        throw new Error("Failed to create tool group");
      }
      toolGroupRef.current = toolGroup;
      console.log("Tool group created:", toolGroupId);

      // Add tools to the tool group
      if (!cornerstoneTools.WindowLevelTool.toolName)
        throw new Error("WindowLevelTool.toolName undefined");
      if (!cornerstoneTools.PanTool.toolName)
        throw new Error("PanTool.toolName undefined");
      if (!cornerstoneTools.ZoomTool.toolName)
        throw new Error("ZoomTool.toolName undefined");
      if (!cornerstoneTools.StackScrollTool.toolName)
        throw new Error("StackScrollTool.toolName undefined");
      if (!cornerstoneTools.LengthTool.toolName)
        throw new Error("LengthTool.toolName undefined");
      if (!cornerstoneTools.PlanarRotateTool.toolName)
        throw new Error("PlanarRotateTool.toolName undefined");
      if (!cornerstoneTools.EllipticalROITool.toolName)
        throw new Error("EllipticalROITool.toolName undefined");
      if (!cornerstoneTools.RectangleROITool.toolName)
        throw new Error("RectangleROITool.toolName undefined");
      toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName);
      toolGroup.addTool(cornerstoneTools.PanTool.toolName);
      toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
      toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
      toolGroup.addTool(cornerstoneTools.LengthTool.toolName);
      toolGroup.addTool(cornerstoneTools.PlanarRotateTool.toolName);
      toolGroup.addTool(cornerstoneTools.EllipticalROITool.toolName);
      toolGroup.addTool(cornerstoneTools.RectangleROITool.toolName);
      console.log("Tools added to tool group");

      // Add viewport to the tool group
      toolGroup.addViewport(viewportId, renderingEngineRef.current.id);
      console.log("Viewport added to tool group:", viewportId);

      // Set initial tool modes
      toolGroup.setToolActive(cornerstoneTools.WindowLevelTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ],
      });
      toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary },
        ],
      });
      toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
      toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
        bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel }],
      });
      toolGroup.setToolPassive(cornerstoneTools.LengthTool.toolName);
      toolGroup.setToolPassive(cornerstoneTools.PlanarRotateTool.toolName);
      toolGroup.setToolPassive(cornerstoneTools.EllipticalROITool.toolName);
      toolGroup.setToolPassive(cornerstoneTools.RectangleROITool.toolName);
      console.log("Initial tool modes set");

      console.log("Tools initialized successfully");
    } catch (error) {
      console.error("Error initializing tools:", error);
      toolGroupRef.current = null;
    }
  };

  const initializeWithSeries = async (series) => {
    if (!series || !series.instances || series.instances.length === 0) {
      console.error("No instances available in series");
      return;
    }
    console.log(series.instances);
    // Create image IDs from the series instances
    const imageIds = series.instances
      .map((instance) => extractInstanceId(instance.url))
      .filter((url) => url !== null);
    console.log(imageIds);
    if (imageIds.length === 0) {
      console.error("No valid image IDs created");
      return;
    }

    await initializeCornerstone(imageIds);
  };

  const initializeCornerstone = async (instanceIds) => {
    if (typeof window === "undefined" || !element1Ref.current) return;

    try {
      // Fetch initial batch of images
      const fetchedImages = await fetch("/api/dicom-proxy", {
        method: "POST",
        body: JSON.stringify(instanceIds),
      });
      const data = await fetchedImages.json();
      console.log("Initial batch data:", data);

      // Create imageStack from the fetched data
      const imageStack = data.results
        .filter((result) => result.success)
        .map((result, index) => `base64image:${result.instanceId}:${index}`);

      if (imageStack.length === 0) {
        console.error("No images successfully fetched in initial batch");
        return;
      }

      // Initialize Cornerstone
      await cornerstone.init();
      await cornerstoneTools.init();

      // Debug: Log available tools
      const availableTools = Object.keys(cornerstoneTools).filter((key) =>
        key.endsWith("Tool")
      );
      availableTools.forEach((toolKey) => {
        const tool = cornerstoneTools[toolKey];
        console.log(`${toolKey}.toolName:`, tool?.toolName || "undefined");
      });

      // Register base64 image loader with initial batch
      registerBase64ImageLoader(cornerstone.imageLoader, data.results);

      // Add metadata provider
      cornerstone.metaData.addProvider(
        (type, imageId) => metaDataProvider(type, imageId, instanceIds),
        10000
      );

      // Create rendering engine
      const renderingEngine = new cornerstone.RenderingEngine(
        renderingEngineId
      );
      renderingEngineRef.current = renderingEngine;
      console.log("Rendering engine created:", renderingEngineId);

      // Set up stack viewport
      const viewportInputArray = [
        {
          viewportId: "COLOR_STACK",
          type: cornerstone.Enums.ViewportType.STACK,
          element: element1Ref.current,
        },
      ];

      renderingEngine.setViewports(viewportInputArray);
      console.log("Viewport set:", viewportId);

      // Set stack for viewport with initial batch
      const stackViewport = renderingEngine.getStackViewports()[0];
      if (!stackViewport) {
        throw new Error("Stack viewport not found");
      }

      try {
        await stackViewport.setStack(imageStack, 0);
        stackViewport.render();

        const viewport = renderingEngine.getViewport(viewportId);
        if (viewport) {
          viewport.setProperties({
            voiRange: { lower: 0, upper: 255 },
            interpolationType: cornerstone.Enums.InterpolationType.LINEAR,
            invert: false,
          });
          viewport.resetCamera();
          viewport.render();
        }
      } catch (error) {
        console.error("Error loading initial stack images:", error);
        return;
      }

      // Initialize tools
      initializeTools();

      // Force re-render
      setTimeout(() => {
        renderingEngine.resize();
        renderingEngine.render();
        console.log("Viewport re-rendered");
      }, 100);

      setIsInitialized(true);
      console.log("Initialization complete, isInitialized set to true");
    } catch (error) {
      console.error("Error initializing Cornerstone:", error);
      isMountedRef.current = false;
    }
  };

  // DICOM Image Loader (unchanged)
  const registerBase64ImageLoader = (imageLoader, imageResults) => {
    const imageDataMap = new Map();
    imageResults.forEach((result, index) => {
      if (result.success) {
        const imageId = `base64image:${result.instanceId}:${index}`;
        imageDataMap.set(imageId, result);
      }
    });

    const loadImage = (imageId) => {
      const canvas = document.createElement("canvas");

      const promise = new Promise((resolve, reject) => {
        const imageResult = imageDataMap.get(imageId);

        if (!imageResult) {
          reject(new Error(`Image not found for ID: ${imageId}`));
          return;
        }

        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = function () {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(
            0,
            0,
            img.naturalWidth,
            img.naturalHeight
          );

          function getPixelData() {
            const pixelData = new Uint8Array(
              img.naturalWidth * img.naturalHeight * 3
            );
            const data = imageData.data;
            let j = 0;
            for (let i = 0; i < data.length; i += 4) {
              pixelData[j++] = data[i];
              pixelData[j++] = data[i + 1];
              pixelData[j++] = data[i + 2];
            }
            return pixelData;
          }

          const image = {
            imageId: imageId,
            minPixelValue: 0,
            maxPixelValue: 255,
            slope: 1,
            intercept: 0,
            windowCenter: 128,
            windowWidth: 255,
            getPixelData,
            getCanvas: () => canvas,
            getImage: () => img,
            rows: img.naturalHeight,
            columns: img.naturalWidth,
            height: img.naturalHeight,
            width: img.naturalWidth,
            color: true,
            rgba: false,
            columnPixelSpacing: 1,
            rowPixelSpacing: 1,
            invert: false,
            sizeInBytes: img.naturalWidth * img.naturalHeight * 3,
            numberOfComponents: 3,
          };

          resolve(image);
        };

        img.onerror = function (error) {
          reject(new Error(`Failed to load image: ${error.message}`));
        };

        const mimeType = imageResult.contentType || "image/png";
        img.src = `data:${mimeType};base64,${imageResult.data}`;
      });

      return {
        promise,
        cancelFn: () => {},
      };
    };

    imageLoader.registerImageLoader("base64image", loadImage);
  };

  const resetViewport = () => {
    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport(viewportId);
      if (viewport) {
        // Remove all annotations
        cornerstoneTools.annotation.state.removeAllAnnotations();

        // Reset camera to original position/zoom
        viewport.resetCamera();

        // Re-render to update the display
        viewport.render();
      }
    }
  };

  useEffect(() => {
    if (isMountedRef.current) return;
    isMountedRef.current = true;

    fetchStudy("e38b2cea-2661291f-46d12e11-02438677-890941a4");

    return () => {
      console.log("Cleaning up Cornerstone...");
      isMountedRef.current = false;
      if (toolGroupRef.current) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(
          toolGroupRef.current.id
        );
        toolGroupRef.current = null;
      }
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
      }
    };
  }, []);

  const handleSeriesClick = async (seriesIndex) => {
    setSelectedSeriesIndex(seriesIndex);

    const selectedSeries = study[seriesIndex];
    if (selectedSeries) {
      // Destroy existing tool group
      if (toolGroupRef.current) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(
          toolGroupRef.current.id
        );
        toolGroupRef.current = null;
      }

      // Destroy existing rendering engine
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
      }

      // Reinitialize with new series
      setIsInitialized(false);
      await initializeWithSeries(selectedSeries);
    }
  };

  const setActiveTool = (toolName) => {
    if (!isInitialized) {
      console.error("Cannot set active tool: Cornerstone not initialized");
      return;
    }
    if (!toolGroupRef.current) {
      console.error("Tool group not initialized");
      return;
    }

    const toolGroup = toolGroupRef.current;

    // Map of button names to actual tool names
    const toolNameMap = {
      WindowLevel: cornerstoneTools.WindowLevelTool.toolName,
      Pan: cornerstoneTools.PanTool.toolName,
      Zoom: cornerstoneTools.ZoomTool.toolName,
      Length: cornerstoneTools.LengthTool.toolName,
      Rotate: cornerstoneTools.PlanarRotateTool.toolName,
      Elliptical: cornerstoneTools.EllipticalROITool.toolName,
      Rectangle: cornerstoneTools.RectangleROITool.toolName,
    };

    const actualToolName = toolNameMap[toolName];
    if (!actualToolName) {
      console.error(`Tool ${toolName} not found in toolNameMap`);
      return;
    }

    console.log(`Attempting to activate tool: ${toolName} (${actualToolName})`);

    // Cancel any active manipulations
    const cancelledAnnotation = cornerstoneTools.cancelActiveManipulations(
      element1Ref.current
    );
    console.log("Cancelled annotation:", cancelledAnnotation);

    // Disable all tools
    const allTools = [
      cornerstoneTools.WindowLevelTool.toolName,
      cornerstoneTools.PanTool.toolName,
      cornerstoneTools.ZoomTool.toolName,
      cornerstoneTools.LengthTool.toolName,
      cornerstoneTools.PlanarRotateTool.toolName,
      cornerstoneTools.EllipticalROITool.toolName,
      cornerstoneTools.RectangleROITool.toolName,
    ];

    allTools.forEach((tool) => {
      try {
        if (tool) {
          toolGroup.setToolDisabled(tool);
          console.log(`Disabled tool: ${tool}`);
        }
      } catch (error) {
        console.error(`Error disabling tool ${tool}:`, error);
      }
    });

    // Activate the selected tool
    try {
      toolGroup.setToolActive(actualToolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Primary },
        ],
      });
      console.log(`Successfully activated tool: ${actualToolName}`);
    } catch (error) {
      console.error(`Error activating tool ${actualToolName}:`, error);
    }

    // Re-activate Pan, Zoom, and StackScrollTool
    try {
      toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Auxiliary },
        ],
      });
      toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
        bindings: [
          { mouseButton: cornerstoneTools.Enums.MouseBindings.Secondary },
        ],
      });
      toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
        bindings: [{ mouseButton: cornerstoneTools.Enums.MouseBindings.Wheel }],
      });
      console.log("Pan, Zoom, and StackScrollTool re-activated");
    } catch (error) {
      console.error("Error re-activating Pan/Zoom/StackScrollTool:", error);
    }

    setActiveToolName(toolName);
    // Force viewport render
    if (renderingEngineRef.current) {
      renderingEngineRef.current.render();
      console.log("Viewport rendered after tool change");
    }
  };

  // Helper to create preview URL for thumbnails
  const createPreviewUrl = (instanceUrl) => {
    const instanceId = extractInstanceId(instanceUrl);
    if (!instanceId) return null;
    // Use local proxy for thumbnails too
    return `/api/dicom-proxy?instanceId=${instanceId}`;
  };

  // Hardcoded array of tool keys
  const toolKeys = [
    "WindowLevel",
    "Pan",
    "Zoom",
    "Length",
    "Rotate",
    "Elliptical",
    "Rectangle",
  ];

  // Tool configuration with icons and labels
  const toolConfig = {
    WindowLevel: { icon: IconAdjustments, label: "Window/Level" },
    Pan: { icon: IconHandMove, label: "Pan" },
    Zoom: { icon: IconZoomIn, label: "Zoom" },
    Length: { icon: IconRuler, label: "Length" },
    Rotate: { icon: IconRotateClockwise, label: "Planar Rotate Tool" },
    Elliptical: { icon: IconCircle, label: "Elliptical ROI Tool" },
    Rectangle: { icon: IconRectangle, label: "Rectangle ROI Tool" },
  };

  return (
    <div
      ref={fullscreenContainerRef}
      className={`${
        isFullscreen
          ? "fixed inset-0 z-50 bg-black"
          : "p-8 bg-gray-100 min-h-screen"
      }`}
    >
      <div className={`${isFullscreen ? "h-full" : "max-w-7xl mx-auto"}`}>
        {!isFullscreen && (
          <>
            <h1 className="text-3xl font-bold mb-2">DICOM Viewer</h1>
            <p className="text-gray-600 mb-6">
              Medical imaging viewer using Cornerstone.js
            </p>

            <div className="mb-6 space-y-4">
              <div className="bg-white p-4 rounded-lg shadow">
                <div className="text-xs text-gray-600">
                  <p>Mouse controls:</p>
                  <ul className="mt-1 space-y-1">
                    <li>• Left click: Active tool</li>
                    <li>• Middle click: Pan (always)</li>
                    <li>• Right click: Zoom (always)</li>
                    <li>• Scroll wheel: Change slice</li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col items-center h-full">
          {/* Toolbar */}
          <div
            className={`flex items-center justify-between px-4 gap-4 ${
              isFullscreen
                ? "absolute top-4 left-1/2 transform -translate-x-1/2 z-10"
                : "w-full max-w-[700px] mx-auto bg-[#050513]"
            }`}
          >
            {/* Tools Menu for smaller screens / fullscreen */}
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon
                  variant="filled"
                  color="dark"
                  size="lg"
                  className="md:hidden"
                >
                  <IconMenu2 size={18} />
                </ActionIcon>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Tools</Menu.Label>
                {toolKeys.map((toolKey) => {
                  const { label } = toolConfig[toolKey];
                  const isActive = activeToolName === toolKey;

                  return (
                    <Menu.Item
                      key={toolKey}
                      onClick={() => setActiveTool(toolKey)}
                      color={isActive ? "blue" : undefined}
                      disabled={!isInitialized}
                    >
                      {label}
                    </Menu.Item>
                  );
                })}
                <Menu.Divider />
                <Menu.Item
                  onClick={() => resetViewport()}
                  disabled={!isInitialized}
                >
                  Reset
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {/* Desktop toolbar */}
            <Group
              className={`h-[50px] bg-[#050615] rounded-lg px-4 hidden md:flex ${
                isFullscreen ? "bg-opacity-90" : ""
              }`}
              gap="xs"
            >
              {toolKeys.map((toolKey) => {
                const { icon: Icon, label } = toolConfig[toolKey];
                const isActive = activeToolName === toolKey;

                return (
                  <Tooltip key={toolKey} label={label}>
                    <ActionIcon
                      onClick={() => setActiveTool(toolKey)}
                      variant={isActive ? "filled" : "default"}
                      color={isActive ? "blue" : "gray"}
                      disabled={!isInitialized}
                      size="md"
                    >
                      <Icon size={16} />
                    </ActionIcon>
                  </Tooltip>
                );
              })}

              <div className="w-px h-6 bg-gray-600 mx-2" />

              <Tooltip label="Reset">
                <ActionIcon
                  onClick={() => resetViewport()}
                  variant="default"
                  color="gray"
                  disabled={!isInitialized}
                  size="md"
                >
                  <IconRefresh size={16} />
                </ActionIcon>
              </Tooltip>

              <Tooltip
                label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              >
                <ActionIcon
                  onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                  variant="default"
                  color="gray"
                  disabled={!isInitialized}
                  size="md"
                >
                  {isFullscreen ? (
                    <IconMinimize size={16} />
                  ) : (
                    <IconMaximize size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Mobile fullscreen button */}
            <Tooltip
              label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              <ActionIcon
                onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                variant="filled"
                color="dark"
                disabled={!isInitialized}
                size="lg"
                className="md:hidden"
              >
                {isFullscreen ? (
                  <IconMinimize size={18} />
                ) : (
                  <IconMaximize size={18} />
                )}
              </ActionIcon>
            </Tooltip>
          </div>

          {/* Main viewer area */}
          <div
            className={`flex ${
              isFullscreen
                ? "h-full w-full"
                : "justify-center min-h-[400px] max-h-[500px]"
            }`}
          >
            {/* Series panel */}
            <div
              className={`${
                isFullscreen ? "absolute left-0 top-0 h-full z-10" : "relative "
              }`}
            >
              <div
                className={`h-full bg-[#050615] transition-all duration-300 flex flex-col ${
                  seriesCollapsed ? "w-12" : "w-[200px]"
                } ${isFullscreen ? "bg-opacity-90" : ""}`}
              >
                {/* Toggle button */}
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  className="absolute top-4 -right-3 z-20 rounded-full w-6 h-6 p-0 shadow-md"
                  onClick={() => setSeriesCollapsed(!seriesCollapsed)}
                >
                  {seriesCollapsed ? (
                    <IconChevronRight size={14} />
                  ) : (
                    <IconChevronLeft size={14} />
                  )}
                </Button>

                <Collapse in={!seriesCollapsed} className="!h-full">
                  <div className="flex flex-col h-full">
                    <div className="p-4 pb-2 flex-shrink-0">
                      <p className="text-gray-300 text-sm font-medium">
                        Series
                      </p>
                    </div>
                    {/* Scrollable container */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 px-4 pb-4">
                      <div className="space-y-3 pr-2">
                        {study?.map((series, index) => {
                          const selected = index === selectedSeriesIndex;
                          const firstInstance = series.instances[0];
                          const previewUrl = firstInstance
                            ? createPreviewUrl(firstInstance.url)
                            : null;

                          return (
                            <div
                              onClick={() => handleSeriesClick(index)}
                              key={index}
                              className={`bg-gray-900 w-full aspect-square flex-shrink-0 cursor-pointer hover:scale-105 transition-all relative overflow-hidden rounded-lg ${
                                selected
                                  ? "border-2 border-blue-400 shadow-lg shadow-cyan-400/30"
                                  : "border border-gray-700 hover:border-gray-500"
                              }`}
                            >
                              {selected && (
                                <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs font-medium px-2 py-1 rounded-full shadow-md z-10">
                                  Selected
                                </div>
                              )}
                              {previewUrl && (
                                <img
                                  src={previewUrl}
                                  alt={`Series ${index + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-2">
                                <p className="font-medium">{series.Modality}</p>
                                <p className="text-gray-300">
                                  {series.instances.length} images
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Collapse>
              </div>
            </div>

            {/* Viewport */}
            <div
              ref={element1Ref}
              className={`relative bg-gray-900 ${
                isFullscreen
                  ? `w-full h-full ${seriesCollapsed ? "ml-12" : "ml-[200px]"}`
                  : "w-[500px] h-[500px] rounded-r-lg"
              } ${!isFullscreen && !seriesCollapsed ? "border-l-0" : ""}`}
            />
          </div>
        </div>
      </div>

      {(loading || !isInitialized) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl">
            <p className="text-lg">
              {loading ? "Loading study..." : "Initializing viewer..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CornerstoneViewer;
