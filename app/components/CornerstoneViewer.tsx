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

const CornerstoneViewer = ({ pack }) => {
  console.log("pack", pack);
  const [selectedSeriesIndex, setSelectedSeriesIndex] = useState(0);
  const [study, setStudy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeToolName, setActiveToolName] = useState("WindowLevel");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seriesCollapsed, setSeriesCollapsed] = useState(false);

  // New state for caching images by series index
  const [cachedImages, setCachedImages] = useState({});
  const [loadingSeriesIndex, setLoadingSeriesIndex] = useState(null);

  const [prefetchState, setPrefetchState] = useState({
    isActive: false,
    current: 0,
    total: 0,
    failed: 0,
    progress: 0,
  });
  const [prefetchQueue, setPrefetchQueue] = useState([]);
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
      const data = await fetch("/api/getStudyData/light", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyId: studyId,
        }),
      });
      const response = await data.json();
      console.log("rsponse", response.series);
      setStudy(response.series);
      setSelectedSeriesIndex(0);

      // Initialize with the first series
      if (response.series.length > 0) {
        const firstSeries = response.series[0].Instances;
        console.log("first series", firstSeries);
        await initializeWithSeries(firstSeries, 0);

        // Start background prefetching for other series
        if (response.series.length > 1) {
          const otherSeriesIndices = response.series
            .map((_, index) => index)
            .filter((index) => index !== 0); // Exclude the first series we just loaded

          setPrefetchQueue(otherSeriesIndices);
          setPrefetchState({
            isActive: true,
            current: 0,
            total: otherSeriesIndices.length,
            failed: 0,
            progress: 0,
          });

          // Start prefetching
          prefetchSeries(response.series, otherSeriesIndices);
        }
      }
    } catch (error) {
      console.error("Error fetching study:", error);
    } finally {
      setLoading(false);
    }
  };

  // Background prefetch function
  const prefetchSeries = async (allSeries, seriesIndices) => {
    console.log(
      `Starting background prefetch for ${seriesIndices.length} series`
    );

    for (let i = 0; i < seriesIndices.length; i++) {
      const seriesIndex = seriesIndices[i];

      // Check if component is still mounted
      if (!isMountedRef.current) {
        console.log("Component unmounted, stopping prefetch");
        break;
      }

      // Check if already cached (in case user manually clicked it)
      if (cachedImages[seriesIndex]) {
        console.log(`Series ${seriesIndex} already cached, skipping`);
        setPrefetchState((prev) => ({
          ...prev,
          current: i + 1,
          progress: ((i + 1) / prev.total) * 100,
        }));
        continue;
      }

      try {
        console.log(
          `Prefetching series ${seriesIndex} (${i + 1}/${seriesIndices.length})`
        );

        const series = allSeries[seriesIndex];
        const instanceIds = series.Instances;

        // Fetch images from Go server
        const fetchedImages = await fetch(
          "http://localhost:8080/fetch-instances",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              instanceIds: instanceIds,
            }),
          }
        );

        const data = await fetchedImages.json();
        console.log(
          `Prefetched series ${seriesIndex}: ${data.successful}/${data.total_instances} images`
        );

        // Transform and cache the images
        const imageResults = data.images.map((image) => ({
          instanceId: image.instanceId,
          success: image.success,
          data: image.data,
          contentType: image.contentType,
          error: image.error,
        }));

        // Update cache
        setCachedImages((prev) => ({
          ...prev,
          [seriesIndex]: imageResults,
        }));

        // Update prefetch state
        setPrefetchState((prev) => ({
          ...prev,
          current: i + 1,
          progress: ((i + 1) / prev.total) * 100,
        }));

        // Small delay to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error prefetching series ${seriesIndex}:`, error);
        setPrefetchState((prev) => ({
          ...prev,
          current: i + 1,
          failed: prev.failed + 1,
          progress: ((i + 1) / prev.total) * 100,
        }));
      }
    }

    // Prefetch complete
    setPrefetchState((prev) => ({
      ...prev,
      isActive: false,
    }));
    setPrefetchQueue([]);
    console.log("Background prefetch complete");
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

  const initializeWithSeries = async (series, seriesIndex) => {
    if (!series || series.length === 0) {
      console.error("No instances available in series");
      return;
    }

    await initializeCornerstone(series, seriesIndex);
  };

  const initializeCornerstone = async (instanceIds, seriesIndex) => {
    if (typeof window === "undefined" || !element1Ref.current) return;

    try {
      let imageResults;

      // Check if we have cached images for this series
      if (cachedImages[seriesIndex]) {
        console.log(`Using cached images for series ${seriesIndex}`);
        imageResults = cachedImages[seriesIndex];
      } else {
        console.log(`Fetching images for series ${seriesIndex}`);
        setLoadingSeriesIndex(seriesIndex);

        // Fetch images from Go server
        const fetchedImages = await fetch(
          "http://localhost:8080/fetch-instances",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              instanceIds: instanceIds,
            }),
          }
        );

        const data = await fetchedImages.json();
        console.log("Fetched data from Go server:", data);

        // Transform the response to match the expected structure
        imageResults = data.images.map((image) => ({
          instanceId: image.instanceId,
          success: image.success,
          data: image.data,
          contentType: image.contentType,
          error: image.error,
        }));

        // Cache the images for this series
        setCachedImages((prev) => ({
          ...prev,
          [seriesIndex]: imageResults,
        }));

        console.log(
          `Successfully loaded and cached ${data.successful}/${data.total_instances} images in ${data.processing_time}s`
        );

        setLoadingSeriesIndex(null);
      }

      // Create imageStack from the fetched/cached data
      const imageStack = imageResults
        .filter((result) => result.success)
        .map((result, index) => `base64image:${result.instanceId}:${index}`);

      if (imageStack.length === 0) {
        console.error("No images successfully fetched");
        return;
      }

      // Initialize Cornerstone only if not already initialized
      if (!cornerstone.getRenderingEngine(renderingEngineId)) {
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
      }

      // Register base64 image loader with transformed results
      registerBase64ImageLoader(cornerstone.imageLoader, imageResults);

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

      // Set stack for viewport
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
        console.error("Error loading stack images:", error);
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
      setLoadingSeriesIndex(null);
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
    fetchStudy(pack.dicomUrl);

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
    console.log(seriesIndex);
    console.log(study);
    console.log(study[seriesIndex]);
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

      // Reinitialize with new series (passing the series index)
      setIsInitialized(false);
      await initializeWithSeries(selectedSeries.Instances, seriesIndex);
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
    if (!instanceUrl) return null;
    // Use local proxy for thumbnails too
    return `/api/dicom-proxy?instanceId=${instanceUrl}`;
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
          {/* Prefetch Progress Bar */}
          {prefetchState.isActive && (
            <div className="w-full max-w-[700px] mx-auto mb-2">
              <div className="bg-gray-800 rounded-lg p-2">
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                  <span>Preloading series in background...</span>
                  <span>
                    {prefetchState.current}/{prefetchState.total}
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${prefetchState.progress}%` }}
                  />
                </div>
                {prefetchState.failed > 0 && (
                  <div className="text-xs text-red-400 mt-1">
                    {prefetchState.failed} series failed to load
                  </div>
                )}
              </div>
            </div>
          )}

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
                          const isLoading = loadingSeriesIndex === index;
                          const isCached = cachedImages[index] !== undefined;
                          const isPrefetching = prefetchQueue.includes(index);
                          const firstInstance = series.Instances[0];
                          console.log("firstinstance", firstInstance);
                          const previewUrl = firstInstance
                            ? createPreviewUrl(firstInstance)
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
                              {isCached && !selected && (
                                <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-2 py-1 rounded-full shadow-md z-10">
                                  Cached
                                </div>
                              )}
                              {isPrefetching && !isCached && (
                                <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full shadow-md z-10 animate-pulse">
                                  Queued
                                </div>
                              )}
                              {isLoading && (
                                <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
                                  <div className="text-white text-sm">
                                    Loading...
                                  </div>
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
                                  {series.Instances.length} images
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
