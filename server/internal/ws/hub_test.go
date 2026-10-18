package ws

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/phogtr/gear-signal/internal/sim"
)

var t0 = time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)

var moving = []sim.State{{VehicleID: 7, TripID: 1, RouteID: 3, Distance: 120.5, Lng: -118.2, Lat: 34.0, Degree: 90, Speed: 18, Progress: 0.1}}

func dial(t *testing.T, h *Hub) *websocket.Conn {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(srv.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func readTick(t *testing.T, conn *websocket.Conn) Tick {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var tick Tick
	if err := conn.ReadJSON(&tick); err != nil {
		t.Fatal(err)
	}
	return tick
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); time.Sleep(10 * time.Millisecond) {
		if cond() {
			return
		}
	}
	t.Fatal("condition not met within 2 s")
}

func TestSnapshotOnConnect(t *testing.T) {
	h := NewHub()
	h.Send(t0, moving)

	tick := readTick(t, dial(t, h))
	if tick.Type != "tick" || !tick.TS.Equal(t0) || len(tick.Vehicles) != 1 || tick.Vehicles[0].VehicleID != 7 {
		t.Errorf("snapshot = %+v", tick)
	}
}

func TestPublishReachesEveryClient(t *testing.T) {
	h := NewHub()
	a, b := dial(t, h), dial(t, h)
	waitFor(t, func() bool { return h.clientCount() == 2 })

	h.Send(t0, moving)
	for _, conn := range []*websocket.Conn{a, b} {
		if got := readTick(t, conn); len(got.Vehicles) != 1 {
			t.Errorf("got %+v", got)
		}
	}
}

func TestWireFormatWithUnits(t *testing.T) {
	msg, err := json.Marshal(NewTick(t0, moving))
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"type":"tick"`, `"ts":"2026-10-11T09:00:00Z"`, `"vehicleId":7`, `"distance":120.5`, `"degree":90`, `"speed":18`, `"done":false`} {
		if !strings.Contains(string(msg), key) {
			t.Errorf("missing %s in %s", key, msg)
		}
	}
}

func TestDisconnectRemovesClient(t *testing.T) {
	h := NewHub()
	conn := dial(t, h)
	waitFor(t, func() bool { return h.clientCount() == 1 })

	conn.Close()
	waitFor(t, func() bool { return h.clientCount() == 0 })
}

func TestSlowClientIsDropped(t *testing.T) {
	h := NewHub()
	// no writer goroutine, so nothing drains the buffer
	c := &client{msgs: make(chan []byte, msgBuffer)}
	h.clients[c] = struct{}{}

	for range msgBuffer + 1 {
		h.Send(t0, moving)
	}
	if h.clientCount() != 0 {
		t.Fatal("slow client still registered")
	}
	for range msgBuffer {
		<-c.msgs
	}
	if _, ok := <-c.msgs; ok {
		t.Error("msgs channel not closed")
	}
}

func TestCloseSendsCloseFrame(t *testing.T) {
	h := NewHub()
	conn := dial(t, h)
	waitFor(t, func() bool { return h.clientCount() == 1 })

	h.Close()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err := conn.ReadMessage()
	var closeErr *websocket.CloseError
	if !errors.As(err, &closeErr) {
		t.Errorf("want a close frame, got %v", err)
	}
}
