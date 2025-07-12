import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studyId, preview } = body;
    const response = await fetch(
      `https://poc-orthanc.myfrcr.com/orthanc/studies/${studyId}/ohif-dicom-json`,
      {
        headers: {
          Authorization: `Basic ${process.env.ORTHANC_TOKEN}`,
        },
      }
    );
    console.log("resopnse", response);

    const data = await response.json();
    const studyInstances = data;
    if (!response.ok) {
      throw new Error(`Failed to fetch OHIF data: ${response.status}`);
    }
    return NextResponse.json(studyInstances);
  } catch (error) {
    console.error("Error fetching OHIF data:", error);
    return new NextResponse("Failed to fetch study data", { status: 500 });
  }
}
