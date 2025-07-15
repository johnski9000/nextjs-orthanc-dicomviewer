"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  Container,
  Grid,
  Text,
  Button,
  Image,
  Badge,
} from "@mantine/core";

const CornerstoneViewer = dynamic(() => import("./CornerstoneViewer"), {
  ssr: false,
  loading: () => <div>Loading viewer...</div>,
});

// Import the progress overlay component
const DicomProgressOverlay = dynamic(() => import("./DicomProgressOverlay"), {
  ssr: false,
});

// Component for individual image set card
function ImageSetCard({ imageSet, onSelect }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPreview = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/getStudyData/light/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ studyId: imageSet.dicomUrl }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err) {
        console.error("Error fetching preview:", err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreview();

    // Cleanup function to revoke object URL when component unmounts
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [imageSet.dicomUrl]);

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{ position: "relative" }}
    >
      <Card.Section>
        <div
          style={{
            position: "relative",
            height: 160,
            backgroundColor: "#f5f5f5",
          }}
        >
          {isLoading && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
            >
              Loading preview...
            </div>
          )}
          {error && (
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                color: "red",
                textAlign: "center",
                zIndex: 1,
              }}
            >
              Error loading preview
            </div>
          )}
          {previewUrl && (
            <Image
              src={previewUrl}
              alt={`Preview for ${imageSet.visibleTitle}`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          )}
        </div>
      </Card.Section>

      <Badge
        fw={500}
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 2,
        }}
      >
        {imageSet.visibleTitle}
      </Badge>

      <Button
        variant="light"
        color="blue"
        fullWidth
        mt="md"
        radius="md"
        onClick={() => onSelect(imageSet)}
        disabled={isLoading || error}
      >
        View Study
      </Button>
    </Card>
  );
}

export default function DicomViewerClient({ questionPackData }) {
  const [selectedImageSet, setSelectedImageSet] = useState(null);
  const [packData, setPackData] = useState(questionPackData || []);
  const [questionPackDataIndex, setQuestionPackDataIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const handleImageSetSelect = (imageSet) => {
    setSelectedImageSet(imageSet);
  };

  const handleBackToGrid = () => {
    setSelectedImageSet(null);
  };

  return (
    <>
      {!selectedImageSet ? (
        <Container p={8}>
          {packData.map((pack, packIndex) => (
            <div key={packIndex} style={{ marginBottom: "2rem" }}>
              <Text size="xl" fw={500} mb="md">
                {pack.questionStem}
              </Text>
              <Grid>
                {pack.imageSets
                  .sort((a, b) => a.order - b.order)
                  .map((imageSet) => (
                    <Grid.Col
                      key={imageSet.id}
                      span={{ base: 12, sm: 6, md: 4 }}
                    >
                      <ImageSetCard
                        imageSet={imageSet}
                        onSelect={handleImageSetSelect}
                      />
                    </Grid.Col>
                  ))}
              </Grid>
            </div>
          ))}
        </Container>
      ) : (
        <div>
          <Button onClick={handleBackToGrid} mb="md" variant="outline">
            ← Back to Grid
          </Button>
          <CornerstoneViewer pack={selectedImageSet} />
        </div>
      )}
    </>
  );
}
