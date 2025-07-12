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

// Add cache structure
type CacheEntry struct {
	Result    *StudyResult
	Timestamp time.Time
}

type StudyCache struct {
	cache map[string]*CacheEntry
	mutex sync.RWMutex
	ttl   time.Duration
}

func NewStudyCache(ttl time.Duration) *StudyCache {
	return &StudyCache{
		cache: make(map[string]*CacheEntry),
		ttl:   ttl,
	}
}

func (sc *StudyCache) Get(studyID string) (*StudyResult, bool) {
	sc.mutex.RLock()
	defer sc.mutex.RUnlock()
	
	entry, exists := sc.cache[studyID]
	if !exists {
		return nil, false
	}
	
	// Check if cache entry is still valid
	if time.Since(entry.Timestamp) > sc.ttl {
		return nil, false
	}
	
	return entry.Result, true
}

func (sc *StudyCache) Set(studyID string, result *StudyResult) {
	sc.mutex.Lock()
	defer sc.mutex.Unlock()
	
	sc.cache[studyID] = &CacheEntry{
		Result:    result,
		Timestamp: time.Now(),
	}
	
	log.Printf("Cached study %s (%d images)", studyID, result.Successful)
}

func (sc *StudyCache) Clear() {
	sc.mutex.Lock()
	defer sc.mutex.Unlock()
	
	sc.cache = make(map[string]*CacheEntry)
	log.Printf("Cache cleared")
}

func (sc *StudyCache) Stats() (int, int) {
	sc.mutex.RLock()
	defer sc.mutex.RUnlock()
	
	total := len(sc.cache)
	valid := 0
	
	for _, entry := range sc.cache {
		if time.Since(entry.Timestamp) <= sc.ttl {
			valid++
		}
	}
	
	return total, valid
}

// Global cache instance
var studyCache *StudyCache

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

type SeriesData struct {
	Instances []string `json:"Instances"`
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
	StudyID string `json:"studyId"`
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

func (d *DicomFetcher) fetchSeriesData(studyID string) ([]SeriesData, error) {
	url := fmt.Sprintf("%s/studies/%s/series", d.BaseURL, studyID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Basic "+d.AuthToken)

	resp, err := d.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch series: %d", resp.StatusCode)
	}

	var series []SeriesData
	if err := json.NewDecoder(resp.Body).Decode(&series); err != nil {
		return nil, err
	}

	return series, nil
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

func (d *DicomFetcher) ProcessStudy(studyID string) (*StudyResult, error) {
	startTime := time.Now()

	// Fetch series data
	series, err := d.fetchSeriesData(studyID)
	if err != nil {
		return nil, err
	}

	// Extract all instance IDs
	var allInstanceIDs []string
	for _, s := range series {
		allInstanceIDs = append(allInstanceIDs, s.Instances...)
	}

	fmt.Printf("Found %d instances for study %s\n", len(allInstanceIDs), studyID)

	// Adaptive concurrency based on instance count
	adaptiveConcurrency := 50 // Start higher
	if len(allInstanceIDs) > 1000 {
		adaptiveConcurrency = 100 // Even more for large studies
	} else if len(allInstanceIDs) < 100 {
		adaptiveConcurrency = 25  // Conservative for small studies
	}

	fmt.Printf("Using %d concurrent workers for %d instances\n", adaptiveConcurrency, len(allInstanceIDs))

	// Fetch all images concurrently
	results := d.fetchAllImages(allInstanceIDs, adaptiveConcurrency)

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
		TotalInstances: len(allInstanceIDs),
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

func handleFetchStudy(w http.ResponseWriter, r *http.Request) {
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

	log.Printf("Received request for study ID: %s", request.StudyID)

	// Check cache first
	if cachedResult, found := studyCache.Get(request.StudyID); found {
		log.Printf("Cache HIT for study %s - returning cached data (%d images)", request.StudyID, cachedResult.Successful)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache-Status", "HIT")
		json.NewEncoder(w).Encode(cachedResult)
		return
	}

	log.Printf("Cache MISS for study %s - fetching from server", request.StudyID)

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

	// Start with adaptive concurrency based on study size
	log.Printf("Starting to process study: %s", request.StudyID)
	result, err := fetcher.ProcessStudy(request.StudyID)
	if err != nil {
		log.Printf("Error processing study %s: %v", request.StudyID, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Cache the result
	studyCache.Set(request.StudyID, result)

	log.Printf("Successfully processed study %s: %d/%d images", request.StudyID, result.Successful, result.TotalInstances)

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache-Status", "MISS")
	json.NewEncoder(w).Encode(result)
}

func handleCacheStats(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	total, valid := studyCache.Stats()
	
	stats := map[string]interface{}{
		"total_entries": total,
		"valid_entries": valid,
		"cache_ttl_hours": 24,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func handleClearCache(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	studyCache.Clear()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cache cleared"})
}

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: Could not load .env file: %v", err)
	}

	// Initialize cache with 24-hour TTL
	studyCache = NewStudyCache(24 * time.Hour)

	// Verify ORTHANC_TOKEN is set
	authToken := os.Getenv("ORTHANC_TOKEN")
	if authToken == "" {
		log.Fatal("ORTHANC_TOKEN environment variable must be set")
	}
	log.Printf("ORTHANC_TOKEN loaded successfully (length: %d)", len(authToken))

	http.HandleFunc("/fetch-study", handleFetchStudy)
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/cache-stats", handleCacheStats)
	http.HandleFunc("/clear-cache", handleClearCache)
	
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("DICOM Fetcher server starting on port %s...\n", port)
	fmt.Println("Endpoints:")
	fmt.Println("  POST /fetch-study  - Fetch DICOM images for a study")
	fmt.Println("  GET  /health       - Health check")
	fmt.Println("  GET  /cache-stats  - Cache statistics")
	fmt.Println("  POST /clear-cache  - Clear cache")
	
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}