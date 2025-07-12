// pages/viewer.js or app/viewer/page.js (for App Router) - SERVER COMPONENT
import dynamic from "next/dynamic";

// Import the client component that handles the loading logic
const DicomViewerClient = dynamic(
  () => import("./components/DicomViewerClient"),
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
];

// Server component - just passes data to client component
export default function ViewerPage() {
  return <DicomViewerClient questionPackData={questionPackExample} />;
}
