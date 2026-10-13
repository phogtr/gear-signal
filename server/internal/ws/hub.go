package ws

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"github.com/phogtr/gear-signal/internal/sim"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = pongWait * 9 / 10
	// 16 ticks, 16s, queue of 16 msgs
	// when full, mean client might be slow, drop the client
	msgBuffer = 16
)

var upgrader = websocket.Upgrader{ReadBufferSize: 1024, WriteBufferSize: 4096}

// Hub fans each tick out to every connected client. Each client gets a buffered
// channel and its own writer goroutine, so one slow connection never blocks the engine
type Hub struct {
	mu      sync.Mutex
	clients map[*client]struct{}
	last    []byte
}

type client struct {
	conn *websocket.Conn
	msgs chan []byte
}

func NewHub() *Hub {
	return &Hub{clients: map[*client]struct{}{}}
}

// encodes the tick once and queues it for every client without blocking
func (h *Hub) Send(now time.Time, states []sim.State) {
	msg, err := json.Marshal(NewTick(now, states))
	if err != nil {
		slog.Error("ws: encode tick", "err", err)
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	h.last = msg
	for c := range h.clients {
		select {
		case c.msgs <- msg:

		default:
			slog.Warn("ws: dropping slow client")
			h.removeLocked(c)
		}
	}
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already wrote the HTTP error
	}
	c := &client{conn: conn, msgs: make(chan []byte, msgBuffer)}

	h.mu.Lock()
	h.clients[c] = struct{}{}
	if h.last != nil {
		c.msgs <- h.last
	}
	h.mu.Unlock()

	go h.write(c)
	h.read(c)
}

// for server shutdown since http.Server.Shutdown doesn't track upgraded connections
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		h.removeLocked(c)
	}
}

// make sure mu.Lock() and Unlock() before calling this function
func (h *Hub) removeLocked(c *client) {
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.msgs)
	}
}

func (h *Hub) write(c *client) {
	ping := time.NewTicker(pingPeriod)
	defer func() {
		ping.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.msgs:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ping.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) read(c *client) {
	defer func() {
		h.mu.Lock()
		h.removeLocked(c)
		h.mu.Unlock()
	}()

	c.conn.SetReadLimit(512)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (h *Hub) clientCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}
