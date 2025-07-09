"use client";
import React, { useEffect, useRef, useState } from "react";
import * as cornerstone from "@cornerstonejs/core";
import * as cornerstoneTools from "@cornerstonejs/tools";

// Web Image Loader
const registerWebImageLoader = (imageLoader) => {
  const canvas = document.createElement("canvas");
  let lastImageIdDrawn;

  function createImage(image, imageId) {
    const rows = image.naturalHeight;
    const columns = image.naturalWidth;

    function getPixelData(targetBuffer) {
      const imageData = getImageData();
      let targetArray;

      if (targetBuffer) {
        targetArray = new Uint8Array(
          targetBuffer.arrayBuffer,
          targetBuffer.offset,
          targetBuffer.length
        );
      } else {
        targetArray = new Uint8Array(imageData.width * imageData.height * 3);
      }

      convertImageDataToRGB(imageData, targetArray);
      return targetArray;
    }

    function convertImageDataToRGB(imageData, targetArray) {
      for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
        targetArray[j] = imageData.data[i];
        targetArray[j + 1] = imageData.data[i + 1];
        targetArray[j + 2] = imageData.data[i + 2];
      }
    }

    function getImageData() {
      let context;
      if (lastImageIdDrawn === imageId) {
        context = canvas.getContext("2d", { willReadFrequently: true });
      } else {
        canvas.height = image.naturalHeight;
        canvas.width = image.naturalWidth;
        context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        lastImageIdDrawn = imageId;
      }
      return context.getImageData(
        0,
        0,
        image.naturalWidth,
        image.naturalHeight
      );
    }

    function getCanvas() {
      if (lastImageIdDrawn === imageId) {
        return canvas;
      }
      canvas.height = image.naturalHeight;
      canvas.width = image.naturalWidth;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      lastImageIdDrawn = imageId;
      return canvas;
    }

    return {
      imageId,
      minPixelValue: 0,
      maxPixelValue: 255,
      slope: 1,
      intercept: 0,
      windowCenter: 128,
      windowWidth: 255,
      getPixelData,
      getCanvas,
      getImage: () => image,
      rows,
      columns,
      height: rows,
      width: columns,
      color: true,
      rgba: false,
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      invert: false,
      sizeInBytes: rows * columns * 3,
      numberOfComponents: 3,
    };
  }

  function arrayBufferToImage(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const arrayBufferView = new Uint8Array(arrayBuffer);
      const blob = new Blob([arrayBufferView]);
      const urlCreator = window.URL || window.webkitURL;
      const imageUrl = urlCreator.createObjectURL(blob);

      image.src = imageUrl;
      image.onload = () => {
        resolve(image);
        urlCreator.revokeObjectURL(imageUrl);
      };
      image.onerror = (error) => {
        urlCreator.revokeObjectURL(imageUrl);
        reject(error);
      };
    });
  }

  function loadImage(uri, imageId) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", uri, true);
    xhr.responseType = "arraybuffer";

    xhr.onprogress = function (oProgress) {
      if (oProgress.lengthComputable) {
        const loaded = oProgress.loaded;
        const total = oProgress.total;
        const percentComplete = Math.round((loaded / total) * 100);

        const eventDetail = {
          imageId,
          loaded,
          total,
          percentComplete,
        };

        cornerstone.triggerEvent(
          cornerstone.eventTarget,
          "cornerstoneimageloadprogress",
          eventDetail
        );
      }
    };

    const promise = new Promise((resolve, reject) => {
      xhr.onload = function () {
        const imagePromise = arrayBufferToImage(this.response);
        imagePromise
          .then((image) => {
            const imageObject = createImage(image, imageId);
            resolve(imageObject);
          }, reject)
          .catch((error) => {
            console.error(error);
          });
      };
      xhr.onerror = function (error) {
        reject(error);
      };
      xhr.send();
    });

    const cancelFn = () => {
      xhr.abort();
    };

    return { promise, cancelFn };
  }

  function _loadImageIntoBuffer(imageId, options) {
    const uri = imageId.replace("web:", "");
    const promise = new Promise((resolve, reject) => {
      loadImage(uri, imageId)
        .promise.then(
          (image) => {
            if (
              !options?.targetBuffer?.length ||
              !options?.targetBuffer?.offset
            ) {
              resolve(image);
              return;
            }
            image.getPixelData(options.targetBuffer);
            resolve(true);
          },
          (error) => {
            reject(error);
          }
        )
        .catch((error) => {
          reject(error);
        });
    });

    return { promise, cancelFn: undefined };
  }

  imageLoader.registerImageLoader("web", _loadImageIntoBuffer);
};

// Metadata Provider
const hardcodedMetaDataProvider = (type, imageId, imageIds) => {
  const colonIndex = imageId.indexOf(":");
  const scheme = imageId.substring(0, colonIndex);
  if (scheme !== "web") {
    return;
  }

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
      modality: "SC",
      seriesNumber: 1,
      seriesDescription: "Color",
      seriesDate: "20190201",
      seriesTime: "120000",
      seriesInstanceUID: "1.2.276.0.7230010.3.1.4.83233.20190201120000.1",
    };
  } else if (type === "imagePlaneModule") {
    const index = imageIds.indexOf(imageId);
    return {
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [0, 0, index * 5],
      pixelSpacing: [1, 1],
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      frameOfReferenceUID: "FORUID",
      columns: 2048,
      rows: 1216,
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

const CornerstoneViewer = () => {
  const [sliceIndex, setSliceIndex] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeToolName, setActiveToolName] = useState("WindowLevel");
  const element1Ref = useRef(null);
  const renderingEngineRef = useRef(null);
  const toolGroupRef = useRef(null);
  const isMountedRef = useRef(false);

  const renderingEngineId = "myRenderingEngine";
  const viewportId = "COLOR_STACK";

  const imageIds = [
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1460.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1461.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1462.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1463.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1464.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1465.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1466.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1467.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1468.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1469.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1470.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1471.png",
    "web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1472.png",
  ];

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

  const initializeTools = () => {
    try {
      console.log("Initializing tools...");
      // Add minimal set of tools
      cornerstoneTools.addTool(cornerstoneTools.WindowLevelTool);
      cornerstoneTools.addTool(cornerstoneTools.PanTool);
      cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
      cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
      cornerstoneTools.addTool(cornerstoneTools.LengthTool);
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

      toolGroup.addTool(cornerstoneTools.WindowLevelTool.toolName);
      toolGroup.addTool(cornerstoneTools.PanTool.toolName);
      toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
      toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
      toolGroup.addTool(cornerstoneTools.LengthTool.toolName);
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
      console.log("Initial tool modes set");

      console.log("Tools initialized successfully");
    } catch (error) {
      console.error("Error initializing tools:", error);
      toolGroupRef.current = null;
    }
  };

  useEffect(() => {
    if (isMountedRef.current) return; // Prevent double initialization
    isMountedRef.current = true;

    const initializeCornerstone = async () => {
      if (typeof window === "undefined" || !element1Ref.current) return;

      try {
        console.log("Starting Cornerstone initialization...");
        // Initialize Cornerstone
        await cornerstone.init();
        console.log("Cornerstone initialized");

        // Initialize Cornerstone Tools
        await cornerstoneTools.init();
        console.log("Cornerstone Tools initialized");

        // Debug: Log available tools and their toolName properties
        const availableTools = Object.keys(cornerstoneTools).filter((key) =>
          key.endsWith("Tool")
        );
        console.log("Available tools:", availableTools);
        availableTools.forEach((toolKey) => {
          const tool = cornerstoneTools[toolKey];
          console.log(`${toolKey}.toolName:`, tool?.toolName || "undefined");
        });

        // Register web image loader
        registerWebImageLoader(cornerstone.imageLoader);
        console.log("Web image loader registered");

        // Add metadata provider
        cornerstone.metaData.addProvider(
          (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
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
          await stackViewport.setStack(imageIds, 0);
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

          console.log("Stack viewport initialized:", {
            imageIds: imageIds.length,
            currentImageId: stackViewport.getCurrentImageId(),
            properties: stackViewport.getProperties(),
          });
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
      }
    };

    initializeCornerstone();

    return () => {
      console.log("Cleaning up Cornerstone...");
      isMountedRef.current = false;
      if (toolGroupRef.current) {
        cornerstoneTools.ToolGroupManager.destroyToolGroup(
          toolGroupRef.current.id
        );
        toolGroupRef.current = null;
        console.log("Tool group destroyed");
      }
      if (renderingEngineRef.current) {
        renderingEngineRef.current.destroy();
        renderingEngineRef.current = null;
        console.log("Rendering engine destroyed");
      }
    };
  }, []);

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

  const handleSliceChange = (e) => {
    const newIndex = parseInt(e.target.value);
    setSliceIndex(newIndex);

    if (renderingEngineRef.current) {
      const viewport = renderingEngineRef.current.getViewport(viewportId);
      if (viewport && viewport.setImageIdIndex) {
        viewport.setImageIdIndex(newIndex);
        viewport.render();
      }
    }
  };

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Web Color Images Viewer</h1>
        <p className="text-gray-600 mb-6">
          Demonstrates how to render web color images in JPG or PNG format using
          Cornerstone.js
        </p>

        <div className="mb-6 space-y-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slice Index: {sliceIndex}
            </label>
            <input
              type="range"
              min="0"
              max="12"
              value={sliceIndex}
              onChange={handleSliceChange}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              disabled={!isInitialized}
            />
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Tools</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={() => setActiveTool("WindowLevel")}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  activeToolName === "WindowLevel"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } ${!isInitialized ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!isInitialized}
              >
                Window/Level
              </button>
              <button
                onClick={() => setActiveTool("Pan")}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  activeToolName === "Pan"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } ${!isInitialized ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!isInitialized}
              >
                Pan
              </button>
              <button
                onClick={() => setActiveTool("Zoom")}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  activeToolName === "Zoom"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } ${!isInitialized ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!isInitialized}
              >
                Zoom
              </button>
              <button
                onClick={() => setActiveTool("Length")}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  activeToolName === "Length"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } ${!isInitialized ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!isInitialized}
              >
                Length
              </button>
            </div>
            <div className="mt-3 text-xs text-gray-600">
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

        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-2">Stack Viewport</h2>
            <div
              ref={element1Ref}
              style={{ width: "500px", height: "500px" }}
              className="border border-gray-300 mx-auto"
            />
          </div>
        </div>

        {!isInitialized && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg">
              <p className="text-lg">Loading Cornerstone.js...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CornerstoneViewer;
