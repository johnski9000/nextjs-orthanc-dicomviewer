import React, { useState, useEffect } from "react";
import {
  Overlay,
  Paper,
  Progress,
  Text,
  Stack,
  Group,
  Button,
  Badge,
  ScrollArea,
  Divider,
  ActionIcon,
} from "@mantine/core";
import { IconX, IconCheck, IconAlertCircle } from "@tabler/icons-react";

export default function DicomProgressOverlay({
  visible,
  onClose,
  studies = [],
  onComplete,
  studyProgress = {}, // Receive progress from parent
}) {
  const [overallProgress, setOverallProgress] = useState(0);

  // Calculate overall progress - mix of study completion and image totals
  useEffect(() => {
    console.log("Overlay - studyProgress updated:", studyProgress); // Debug log
    console.log("Overlay - studies:", studies); // Debug log

    if (studies.length === 0) return;

    let totalImages = 0;
    let loadedImages = 0;
    let completedStudies = 0;
    let startedStudies = 0;

    studies.forEach((study) => {
      const progress = studyProgress[study.id];
      console.log(`Study ${study.id} progress:`, progress); // Debug log

      if (progress) {
        startedStudies++;

        if (progress.status === "completed" && progress.total > 0) {
          totalImages += progress.total;
          loadedImages += progress.loaded || 0;
          completedStudies++;
        } else if (progress.status === "starting") {
          // For studies that are starting, we don't know the total yet
          // So we'll use study completion percentage instead
        }
      }
    });

    console.log(
      `Total images: ${totalImages}, Loaded: ${loadedImages}, Completed studies: ${completedStudies}/${studies.length}`
    ); // Debug log

    // If we have actual image data, use that for progress
    if (totalImages > 0) {
      const imageProgress = (loadedImages / totalImages) * 100;
      setOverallProgress(imageProgress);
    } else {
      // Otherwise, use study completion as progress
      const studyProgress = (completedStudies / studies.length) * 100;
      setOverallProgress(studyProgress);
    }

    // Auto-close when all studies are complete
    if (
      completedStudies === studies.length &&
      completedStudies > 0 &&
      onComplete
    ) {
      setTimeout(() => {
        onComplete(
          Object.keys(studyProgress).filter(
            (id) => studyProgress[id].status === "completed"
          ),
          Object.keys(studyProgress).filter(
            (id) => studyProgress[id].status === "failed"
          )
        );
      }, 1000);
    }
  }, [studyProgress, studies.length, onComplete]);

  // Calculate totals for display
  const getTotals = () => {
    let totalImages = 0;
    let loadedImages = 0;
    let completedStudies = 0;
    let processingStudies = 0;

    studies.forEach((study) => {
      const progress = studyProgress[study.id];
      if (progress) {
        if (progress.status === "completed" && progress.total > 0) {
          totalImages += progress.total;
          loadedImages += progress.loaded || 0;
          completedStudies++;
        } else if (progress.status === "starting") {
          processingStudies++;
        }
      }
    });

    return { totalImages, loadedImages, completedStudies, processingStudies };
  };

  const { totalImages, loadedImages, completedStudies, processingStudies } =
    getTotals();

  const getStudyStatus = (studyId) => {
    const progress = studyProgress[studyId];
    if (!progress) return "pending";
    return progress.status || "pending";
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return <IconCheck size={16} color="green" />;
      case "failed":
        return <IconAlertCircle size={16} color="red" />;
      case "processing":
      case "starting":
        return (
          <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        );
      default:
        return (
          <div className="w-4 h-4 border-2 border-gray-300 rounded-full" />
        );
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "green";
      case "failed":
        return "red";
      case "processing":
      case "starting":
        return "blue";
      default:
        return "gray";
    }
  };

  if (!visible) return null;

  return (
    <Overlay
      opacity={0.7}
      color="#000"
      zIndex={1000}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Paper
        shadow="xl"
        p="xl"
        radius="md"
        style={{
          width: "90%",
          maxWidth: 600,
          maxHeight: "80vh",
          position: "relative",
        }}
      >
        <Group justify="space-between" mb="md">
          <Text size="lg" fw={700}>
            Loading DICOM Studies
          </Text>
          <ActionIcon
            variant="subtle"
            onClick={onClose}
            disabled={overallProgress < 100}
          >
            <IconX size={18} />
          </ActionIcon>
        </Group>

        <Stack gap="md">
          {/* Overall Progress */}
          <div>
            <Group justify="space-between" mb={5}>
              <Text size="sm" fw={500}>
                Overall Progress
              </Text>
              <Text size="sm" c="dimmed">
                {totalImages > 0
                  ? `${loadedImages} / ${totalImages} images`
                  : `${completedStudies} / ${studies.length} studies`}
              </Text>
            </Group>
            <Progress
              value={overallProgress}
              size="lg"
              radius="sm"
              striped={overallProgress < 100}
              animated={overallProgress < 100}
            />
            <Text size="xs" c="dimmed" mt={5}>
              {overallProgress.toFixed(1)}% complete
              {processingStudies > 0 && (
                <span> • {processingStudies} processing</span>
              )}
            </Text>
          </div>

          <Divider />

          {/* Study List */}
          <ScrollArea style={{ height: 300 }}>
            <Stack gap="sm">
              {studies.map((study) => {
                const status = getStudyStatus(study.id);
                const progress = studyProgress[study.id];

                return (
                  <Paper key={study.id} p="sm" withBorder radius="sm">
                    <Group justify="space-between" mb="xs">
                      <Group gap="sm">
                        {getStatusIcon(status)}
                        <Text size="sm" fw={500}>
                          {study.visibleTitle}
                        </Text>
                      </Group>
                      <Badge
                        size="sm"
                        color={getStatusColor(status)}
                        variant="light"
                      >
                        {status}
                      </Badge>
                    </Group>

                    {progress && progress.total > 0 && (
                      <>
                        <Progress
                          value={(progress.loaded / progress.total) * 100}
                          size="sm"
                          mb="xs"
                          color={status === "completed" ? "green" : "blue"}
                        />
                        <Group justify="space-between">
                          <Text size="xs" c="dimmed">
                            {progress.loaded} / {progress.total} images
                          </Text>
                          {progress.processingTime && (
                            <Text size="xs" c="dimmed">
                              {progress.processingTime.toFixed(1)}s
                            </Text>
                          )}
                        </Group>
                      </>
                    )}

                    {status === "failed" && (
                      <Text size="xs" c="red" mt="xs">
                        {progress?.error || "Failed to load study"}
                      </Text>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          </ScrollArea>

          {/* Summary */}
          <Group justify="space-between" pt="md">
            <Group gap="lg">
              <Group gap="xs">
                <IconCheck size={16} color="green" />
                <Text size="sm">{completedStudies} studies completed</Text>
              </Group>
              <Text size="sm" c="dimmed">
                {loadedImages}/{totalImages} images total
              </Text>
            </Group>

            {overallProgress === 100 && (
              <Button onClick={onClose} size="sm">
                Continue
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
    </Overlay>
  );
}
