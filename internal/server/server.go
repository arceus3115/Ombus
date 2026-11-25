package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"

	"ombus/internal/intake"
	"ombus/internal/store"
)

type api struct {
	schema intake.Schema
	store  store.Files
}

func New(schema intake.Schema, cases store.Files, assets string) http.Handler {
	a := api{schema: schema, store: cases}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/cases", a.create)
	mux.HandleFunc("POST /api/routing/preview", a.previewRouting)
	mux.HandleFunc("GET /api/routing/coverage", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, a.schema.Coverage())
	})
	mux.HandleFunc("GET /api/cases", a.list)
	mux.HandleFunc("GET /api/cases/{id}", a.detail)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "That API route does not exist.")
	})
	page := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, filepath.Join(assets, "index.html"))
	}
	mux.HandleFunc("GET /{$}", page)
	mux.HandleFunc("GET /cases", page)
	mux.Handle("GET /assets/", http.FileServer(http.Dir(assets)))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil || (host != "127.0.0.1" && host != "localhost") {
			writeError(w, http.StatusForbidden, "Use the local Ombus address.")
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Scheme != "http" || parsed.Host != r.Host {
				writeError(w, http.StatusForbidden, "This request must come from the Ombus workspace.")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}

func (a api) create(w http.ResponseWriter, r *http.Request) {
	record, ok := a.prepare(w, r)
	if !ok {
		return
	}
	record, created, err := a.store.Create(record)
	if errors.Is(err, store.ErrConflict) {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ombus could not save this intake.")
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	w.Header().Set("Location", fmt.Sprintf("/api/cases/%s", record.ID))
	writeJSON(w, status, a.schema.Details(record))
}

func (a api) previewRouting(w http.ResponseWriter, r *http.Request) {
	record, ok := a.prepare(w, r)
	if ok {
		writeJSON(w, http.StatusOK, a.schema.PreviewRouting(record))
	}
}

func (a api) prepare(w http.ResponseWriter, r *http.Request) (intake.Record, bool) {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || contentType != "application/json" {
		writeError(w, http.StatusUnsupportedMediaType, "Send an application/json intake.")
		return intake.Record{}, false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 48*1024))
	decoder.DisallowUnknownFields()
	var input intake.Input
	if err := decoder.Decode(&input); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, "This intake is too large.")
		} else {
			writeError(w, http.StatusBadRequest, "The intake must be a valid JSON record.")
		}
		return intake.Record{}, false
	}
	if err := decoder.Decode(new(json.RawMessage)); err != io.EOF {
		writeError(w, http.StatusBadRequest, "Send a single JSON intake.")
		return intake.Record{}, false
	}
	record, err := a.schema.Prepare(input, time.Now())
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, err.Error())
		return intake.Record{}, false
	}
	return record, true
}

func (a api) list(w http.ResponseWriter, r *http.Request) {
	records, err := a.store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ombus could not load the case list.")
		return
	}
	summaries := make([]intake.Summary, 0, len(records))
	for _, record := range records {
		summaries = append(summaries, a.schema.Summary(record))
	}
	writeJSON(w, http.StatusOK, summaries)
}

func (a api) detail(w http.ResponseWriter, r *http.Request) {
	record, err := a.store.Get(r.PathValue("id"))
	if errors.Is(err, os.ErrNotExist) {
		writeError(w, http.StatusNotFound, "This case could not be found.")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ombus could not load this case.")
		return
	}
	writeJSON(w, http.StatusOK, a.schema.Details(record))
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
