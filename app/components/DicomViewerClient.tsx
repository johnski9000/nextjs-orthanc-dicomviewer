"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Card, Container, Grid, Text } from "@mantine/core";
import Image from "next/image";

const CornerstoneViewer = dynamic(() => import("./CornerstoneViewer"), {
  ssr: false,
  loading: () => <div>Loading viewer...</div>,
});

// Import the progress overlay component
const DicomProgressOverlay = dynamic(() => import("./DicomProgressOverlay"), {
  ssr: false,
});

// Helper to track ongoing requests to prevent duplicates (lightweight deduplication)

export default function DicomViewerClient({ questionPackData }) {
  const [selectedImageSet, setSelectedImageSet] = useState(null);
  console.log(questionPackData);
  const [packData, setPackData] = useState(questionPackData || []);
  const [questionPackDataIndex, setQuestionPackDataIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <>
      {!selectedImageSet ? (
        <Container p={8}>
          <Grid>
            {packData.map((pack, index) => {
              console.log(pack);
              return (
                <Grid.Col key={index} span={4}>
                  <Card shadow="sm" padding="lg" radius="md" withBorder>
                    <Card.Section>
                      <Image
                        src="next.svg"
                        width={160}
                        height={160}
                        alt="Description"
                      />
                    </Card.Section>

                    <Text fw={500}>Card title</Text>
                    <Text size="sm" c="dimmed">
                      Card description
                    </Text>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        </Container>
      ) : (
        // <CornerstoneViewer pack={selectedImageSet} />
        <div>selected</div>
      )}
    </>
  );
}
