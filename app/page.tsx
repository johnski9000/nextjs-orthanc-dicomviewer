// pages/viewer.js or app/viewer/page.js (for App Router)
import dynamic from "next/dynamic";

const CornerstoneViewer = dynamic(
  () => import("./components/CornerstoneViewer"),
  {
    ssr: false,
    loading: () => <div>Loading viewer...</div>,
  }
);

export default function ViewerPage() {
  return <CornerstoneViewer />;
}
