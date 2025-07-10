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

    return NextResponse.json({
      series: seriesIds,
      totalSeries: seriesIds.length,
    });
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse("Failed", { status: 500 });
  }
}
