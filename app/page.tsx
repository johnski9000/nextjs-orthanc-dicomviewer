// pages/viewer.js or app/viewer/page.js (for App Router)
import dynamic from "next/dynamic";

const CornerstoneViewer = dynamic(
  () => import("./components/CornerstoneViewer"),
  {
    ssr: false,
    loading: () => <div>Loading viewer...</div>,
  }
);

const questionPackExample = [
  {
    questionStem: "Question Stem Title",
    notes: "Notes",
    markingScheme: "<p>marking scheme</p>",
    answers: [
      {
        label: "Observations",
        placeholder: "List your observations",
        id: "47da1138-b8ec-4e80-bf7c-a48557f1ce24",
        answer: "",
        order: 1,
      },
      {
        label: "Interpretation",
        placeholder: "Provide your interpretation",
        id: "9f87bb80-44cb-468e-ad17-cb1e8885d92b",
        answer: "",
        order: 2,
      },
      {
        label: "Main Diagnosis",
        placeholder: "State the main diagnosis",
        id: "4dabbc0d-9be8-410a-ad23-a5cb436b27cb",
        answer: "",
        order: 3,
      },
      {
        label: "Differential Diagnosis",
        placeholder: "List differential diagnoses",
        id: "7bdeb39d-5893-435b-895a-dd1cbf6d2db1",
        answer: "",
        order: 4,
      },
      {
        label: "Management",
        placeholder: "Suggest management steps",
        id: "e93b8edc-7a29-4271-a27d-72b67d75e9de",
        answer: "",
        order: 5,
      },
    ],
    imageSets: [
      {
        dicomUrl: "f3090d9f-93e336e1-17fb4890-52b4fdd6-0f33a470",
        id: "e4ef6423-d29e-4e7f-8855-78f2b856aaec",
        visibleTitle: "mr",
        order: 1,
      },
      {
        dicomUrl: "e38b2cea-2661291f-46d12e11-02438677-890941a4",
        id: "5fe067ad-dd73-4c40-9f77-0138479084b9",
        visibleTitle: "another set",
        order: 2,
      },
    ],
    id: "54d0f218-23b1-46bb-a06d-20dd57aa6b31",
    order: 1,
  },
  {
    questionStem: "Question Stem Title",
    notes: "Notes",
    markingScheme: "<p>marking scheme</p>",
    answers: [
      {
        label: "Observations",
        placeholder: "List your observations",
        id: "47da1138-b8ec-4e80-bf7c-a48557f1ce24",
        answer: "",
        order: 1,
      },
      {
        label: "Interpretation",
        placeholder: "Provide your interpretation",
        id: "9f87bb80-44cb-468e-ad17-cb1e8885d92b",
        answer: "",
        order: 2,
      },
      {
        label: "Main Diagnosis",
        placeholder: "State the main diagnosis",
        id: "4dabbc0d-9be8-410a-ad23-a5cb436b27cb",
        answer: "",
        order: 3,
      },
      {
        label: "Differential Diagnosis",
        placeholder: "List differential diagnoses",
        id: "7bdeb39d-5893-435b-895a-dd1cbf6d2db1",
        answer: "",
        order: 4,
      },
      {
        label: "Management",
        placeholder: "Suggest management steps",
        id: "e93b8edc-7a29-4271-a27d-72b67d75e9de",
        answer: "",
        order: 5,
      },
    ],
    imageSets: [
      {
        dicomUrl: "f3090d9f-93e336e1-17fb4890-52b4fdd6-0f33a470",
        id: "e4ef6423-d29e-4e7f-8855-78f2b856aaec",
        visibleTitle: "mr",
        order: 1,
      },
      {
        dicomUrl: "e38b2cea-2661291f-46d12e11-02438677-890941a4",
        id: "5fe067ad-dd73-4c40-9f77-0138479084b9",
        visibleTitle: "another set",
        order: 2,
      },
    ],
    id: "54d0f218-23b1-46bb-a06d-20dd57aa6b31",
    order: 1,
  },
];

// Helper to track ongoing requests to prevent duplicates
const ongoingRequests = new Map();

async function fetchStudyWithDeduplication(studyId, visibleTitle) {
  // Check if request is already in progress
  if (ongoingRequests.has(studyId)) {
    console.log(
      `Study ${visibleTitle} already loading, waiting for existing request...`
    );
    return await ongoingRequests.get(studyId);
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      console.log(`Starting fresh request for study: ${visibleTitle}`);

      const response = await fetch("http://localhost:8080/fetch-study", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyId: studyId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Go service error: ${response.status}`);
      }

      const studyResult = await response.json();
      const cacheStatus = response.headers.get("X-Cache-Status") || "UNKNOWN";

      console.log(
        `Study ${visibleTitle} completed (${cacheStatus}): ${
          studyResult.successful
        }/${
          studyResult.total_instances
        } images in ${studyResult.processing_time.toFixed(2)}s`
      );

      return {
        studyId,
        images: studyResult.images,
        totalInstances: studyResult.total_instances,
        loadedInstances: studyResult.successful,
        processingTime: studyResult.processing_time,
        cacheStatus,
      };
    } catch (error) {
      console.error(`Error processing study ${visibleTitle}:`, error.message);
      throw error;
    } finally {
      // Clean up the ongoing request tracker
      ongoingRequests.delete(studyId);
    }
  })();

  // Store the promise to prevent duplicate requests
  ongoingRequests.set(studyId, requestPromise);

  return await requestPromise;
}

async function loadImageSets() {
  const imageSetsArray = questionPackExample.map((question) => {
    return question.imageSets;
  });

  let loadedImageSetsArray = [];

  for (let i = 0; i < imageSetsArray.length; i++) {
    const set = imageSetsArray[i];
    console.log("Processing set", i + 1, "of", imageSetsArray.length);

    // Process all studies in this set concurrently with deduplication
    const studyPromises = set.map(async (study, j) => {
      const { dicomUrl } = study;

      try {
        const studyData = await fetchStudyWithDeduplication(
          dicomUrl,
          study.visibleTitle
        );

        return {
          ...study,
          ...studyData,
        };
      } catch (studyError) {
        return {
          ...study,
          images: [],
          error: studyError.message,
        };
      }
    });

    // Wait for all studies in this set to complete concurrently
    const newSet = await Promise.all(studyPromises);
    loadedImageSetsArray.push(newSet);
  }

  return loadedImageSetsArray;
}

export default async function ViewerPage() {
  // Load image sets with all the DICOM images
  const loadedImageSets = await loadImageSets();

  // Update the question pack with the loaded images
  const questionPackWithImages = questionPackExample.map((question, index) => ({
    ...question,
    imageSets: loadedImageSets[index] || question.imageSets,
  }));

  return <CornerstoneViewer pack={questionPackWithImages} />;
}
