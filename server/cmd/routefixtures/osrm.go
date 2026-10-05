package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/phogtr/gear-signal/internal/geo"
)

type osrmResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Routes  []struct {
		Distance float64 `json:"distance"`
		Duration float64 `json:"duration"`
		Geometry struct {
			Coordinates []geo.Point `json:"coordinates"`
		} `json:"geometry"`
	} `json:"routes"`
	Waypoints []struct {
		Name     string  `json:"name"`
		Distance float64 `json:"distance"` // how far the input point was snapped, in meters
	} `json:"waypoints"`
}

type osrmClient struct {
	baseURL string
	http    *http.Client
}

// calls OSRM for the fastest driving route through the given points, in order.
// Note OSRM expects "lng,lat", not "lat,lng".
func (c *osrmClient) route(ctx context.Context, points []geo.Point) (*osrmResponse, error) {
	coords := make([]string, len(points))
	for i, p := range points {
		coords[i] = fmt.Sprintf("%.6f,%.6f", p.Lng(), p.Lat())
	}
	url := fmt.Sprintf("%s/route/v1/driving/%s?overview=full&geometries=geojson",
		c.baseURL, strings.Join(coords, ";"))

	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if attempt > 1 {
			time.Sleep(time.Duration(attempt) * 2 * time.Second)
		}
		resp, err := c.fetch(ctx, url)
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("after 3 attempts: %w", lastErr)
}

func (c *osrmClient) fetch(ctx context.Context, url string) (*osrmResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "gear-signal")
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("osrm: HTTP %d: %s", res.StatusCode, body)
	}

	var out osrmResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("decode osrm response: %w", err)
	}
	if out.Code != "Ok" || len(out.Routes) == 0 {
		return nil, fmt.Errorf("osrm: %s %s", out.Code, out.Message)
	}
	return &out, nil
}
