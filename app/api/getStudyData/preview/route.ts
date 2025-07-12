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
