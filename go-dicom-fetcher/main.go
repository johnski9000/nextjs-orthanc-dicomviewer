package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/joho/godotenv"
)

type DicomFetcher struct {
	BaseURL   string
	AuthToken string
	Client    *http.Client
}

type ImageResult struct {
	InstanceID  string `json:"instanceId"`
	Success     bool   `json:"success"`
	Data        string `json:"data,omitempty"`
	ContentType string `json:"contentType,omitempty"`
	Error       string `json:"error,omitempty"`
}

type StudyResult struct {
	StudyID        string        `json:"study_id"`
	Images         []ImageResult `json:"images"`
	TotalInstances int           `json:"total_instances"`
	Successful     int           `json:"successful"`
	Failed         int           `json:"failed"`
	ProcessingTime float64       `json:"processing_time"`
}

type FetchRequest struct {
	StudyID     string   `json:"studyId,omitempty"`
	InstanceIDs []string `json:"instanceIds"`
}

func NewDicomFetcher(baseURL, authToken string) *DicomFetcher {
	return &DicomFetcher{
		BaseURL:   baseURL,
		AuthToken: authToken,
		Client: &http.Client{
			Timeout: time.Second * 120, // Increased timeout
			Transport: &http.Transport{
				MaxIdleConns:        200,  // Increased from 100
				MaxIdleConnsPerHost: 100,  // Increased from 50
				IdleConnTimeout:     120 * time.Second,
				DisableKeepAlives:   false, // Keep connections alive
				MaxConnsPerHost:     100,   // Allow more connections per host
			},
		},
	}
}

func (d *DicomFetcher) fetchImage(instanceID string) ImageResult {
	url := fmt.Sprintf("%s/instances/%s/preview", d.BaseURL, instanceID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ImageResult{InstanceID: instanceID, Success: false, Error: err.Error()}
	}

	req.Header.Set("Authorization", "Basic "+d.AuthToken)

	resp, err := d.Client.Do(req)
	if err != nil {
		return ImageResult{InstanceID: instanceID, Success: false, Error: err.Error()}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ImageResult{InstanceID: instanceID, Success: false, Error: fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return ImageResult{InstanceID: instanceID, Success: false, Error: err.Error()}
	}

	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/png"
	}

	return ImageResult{
		InstanceID:  instanceID,
		Success:     true,
		Data:        base64.StdEncoding.EncodeToString(data),
		ContentType: contentType,
	}
}

func (d *DicomFetcher) fetchAllImages(instanceIDs []string, maxConcurrent int) []ImageResult {
	results := make([]ImageResult, len(instanceIDs))
	semaphore := make(chan struct{}, maxConcurrent)
	var wg sync.WaitGroup

	// Progress tracking
	var completed int32
	total := int32(len(instanceIDs))

	for i, instanceID := range instanceIDs {
		wg.Add(1)
		go func(index int, id string) {
			defer wg.Done()
			semaphore <- struct{}{} // Acquire semaphore
			defer func() { <-semaphore }() // Release semaphore

			results[index] = d.fetchImage(id)
			
			// Atomic increment for thread safety
			current := atomic.AddInt32(&completed, 1)
			if current%100 == 0 || current == total {
				fmt.Printf("Progress: %d/%d images processed (%.1f%%)\n", current, total, float64(current)/float64(total)*100)
			}
		}(i, instanceID)
	}

	wg.Wait()
	return results
}

func (d *DicomFetcher) ProcessInstances(instanceIDs []string, studyID string) (*StudyResult, error) {
	startTime := time.Now()

	fmt.Printf("Processing %d instances\n", len(instanceIDs))

	// Adaptive concurrency based on instance count
	adaptiveConcurrency := 50 // Start higher
	if len(instanceIDs) > 1000 {
		adaptiveConcurrency = 100 // Even more for large studies
	} else if len(instanceIDs) < 100 {
		adaptiveConcurrency = 25  // Conservative for small studies
	}

	fmt.Printf("Using %d concurrent workers for %d instances\n", adaptiveConcurrency, len(instanceIDs))

	// Fetch all images concurrently
	results := d.fetchAllImages(instanceIDs, adaptiveConcurrency)

	// Filter successful images
	var successfulImages []ImageResult
	var failedCount int
	for _, result := range results {
		if result.Success {
			successfulImages = append(successfulImages, result)
		} else {
			failedCount++
		}
	}

	processingTime := time.Since(startTime).Seconds()

	return &StudyResult{
		StudyID:        studyID,
		Images:         successfulImages,
		TotalInstances: len(instanceIDs),
		Successful:     len(successfulImages),
		Failed:         failedCount,
		ProcessingTime: processingTime,
	}, nil
}

// HTTP Handlers
func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
	(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
}

func handleFetchInstances(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request FetchRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if len(request.InstanceIDs) == 0 {
		log.Printf("Error: No instance IDs provided")
		http.Error(w, "No instance IDs provided", http.StatusBadRequest)
		return
	}

	log.Printf("Processing %d instance IDs", len(request.InstanceIDs))

	authToken := os.Getenv("ORTHANC_TOKEN")
	if authToken == "" {
		log.Printf("Error: ORTHANC_TOKEN environment variable not set")
		http.Error(w, "ORTHANC_TOKEN environment variable not set", http.StatusInternalServerError)
		return
	}

	fetcher := NewDicomFetcher(
		"https://poc-orthanc.myfrcr.com/orthanc",
		authToken,
	)

	log.Printf("Starting to process %d instances", len(request.InstanceIDs))
	result, err := fetcher.ProcessInstances(request.InstanceIDs, request.StudyID)
	if err != nil {
		log.Printf("Error processing instances: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully processed instances: %d/%d images in %.2fs", 
		result.Successful, result.TotalInstances, result.ProcessingTime)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	// Verify ORTHANC_TOKEN is set
	authToken := os.Getenv("ORTHANC_TOKEN")
	if authToken == "" {
		log.Fatal("ORTHANC_TOKEN environment variable must be set")
	}
	log.Printf("ORTHANC_TOKEN loaded successfully (length: %d)", len(authToken))

	http.HandleFunc("/fetch-instances", handleFetchInstances)
	http.HandleFunc("/health", handleHealth)
	
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("DICOM Fetcher server starting on port %s...\n", port)
	fmt.Println("Endpoints:")
	fmt.Println("  POST /fetch-instances  - Fetch DICOM images for instance IDs")
	fmt.Println("  GET  /health          - Health check")
	
	log.Fatal(http.ListenAndServe(":"+port, nil))
}