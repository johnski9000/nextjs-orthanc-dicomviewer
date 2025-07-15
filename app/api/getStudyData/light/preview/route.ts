import { NextRequest, NextResponse } from "next/server";

// api/orthanc/dicom-data-light.js
export async function POST(request: NextRequest) {
  try {
    const { studyId } = await request.json();

    // First, get just the series list (fast)
    const seriesResponse = await fetch(
      `https://poc-orthanc.myfrcr.com/orthanc/studies/${studyId}/series`,
      {
        headers: { Authorization: `Basic ${process.env.ORTHANC_TOKEN}` },
      }
    );

    const seriesIds = await seriesResponse.json();
    const previewUrl = seriesIds[0].Instances[0];
    const response = await fetch(
      `https://poc-orthanc.myfrcr.com/orthanc/instances/${previewUrl}/preview`,
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
    console.error("Error:", error);
    return new NextResponse("Failed", { status: 500 });
  }
}
