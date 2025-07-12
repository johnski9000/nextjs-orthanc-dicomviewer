export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");

  if (!instanceId) {
    return new Response(JSON.stringify({ error: "Instance ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(
      `https://poc-orthanc.myfrcr.com/orthanc/instances/${instanceId}/preview`,
      {
        headers: {
          Authorization: `Basic ${process.env.ORTHANC_TOKEN}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching DICOM image:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch image" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const instanceIds = body.instanceIds || body; // Support both {instanceIds: []} and direct array

    if (!Array.isArray(instanceIds) || instanceIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Array of instance IDs required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Batch fetch all images
    const imagePromises = instanceIds.map(async (instanceId) => {
      try {
        const response = await fetch(
          `https://poc-orthanc.myfrcr.com/orthanc/instances/${instanceId}/preview`,
          {
            headers: {
              Authorization: `Basic ${process.env.ORTHANC_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "image/png";

        return {
          instanceId,
          success: true,
          data: Buffer.from(buffer).toString("base64"),
          contentType,
        };
      } catch (error) {
        console.error(
          `Error fetching image for instance ${instanceId}:`,
          error
        );
        return {
          instanceId,
          success: false,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(imagePromises);

    return new Response(
      JSON.stringify({
        results,
        total: instanceIds.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (error) {
    console.error("Error processing batch request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process batch request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
